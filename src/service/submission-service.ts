import { prismaClient } from '../application/database'
import { Prisma, SubmissionStatus } from '@prisma/client'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { SubmissionValidation } from '../validation/submission-validation'
import { CreateSubmissionRequest, UpdateSubmissionRequest, ReviewRequest, RollbackRequest, SubmissionWithRelations, toSubmissionResponse } from '../model/submission-model'
import { UserWithRelations } from '../type/user-request'
import { calcSdgEstimate } from '../config/sdg-scoring'
import { scoringContext } from '../config/config-registry'
import { unwrapTheAnswers } from '../config/the-answer-key'
import { getSettingsService, assertDeletePin } from './settings-service'
import { getSubmissionWindowFromConfig, isWithinWindow, isCutoffPassed, SubmissionWindow } from '../config/submission-window'
import { sanitizeJson, sanitizeString } from '../utils/sanitize'
import { buildReviewerAliases, maskComment, maskLog, shouldMaskReviewers, SYSTEM_NOTE_PREFIXES } from '../model/reviewer-alias'
import { recordAudit, AuditContext } from './audit-log-service'
import { logActivity, SYSTEM_ACTOR } from './activity-log-service'
import { buildChanges, buildSnapshot } from '../model/audit-log-model'

export async function getWindow() {
  const settings = await getSettingsService()
  return getSubmissionWindowFromConfig(settings)
}

// Tahun yang draft/revisi-nya sudah di-auto-submit di proses ini — cegah kerja berulang.
// Aman pakai memori: setelah cutoff, create draft baru sudah diblok, jadi tak ada draft baru.
const cutoffSubmittedYears = new Set<number>()

/**
 * Jamin draft/revision sudah ke-auto-submit begitu cutoff lewat — dipicu lazily saat
 * list submission dibaca (mis. validator buka halaman), tanpa nunggu cron 30 menit.
 * Idempotent & murah: sekali per tahun per proses. Window dibuka lagi → reset.
 */
export async function ensureCutoffAutoSubmit(window?: SubmissionWindow): Promise<void> {
  const win = window ?? (await getWindow())
  if (!isCutoffPassed(win)) {
    cutoffSubmittedYears.delete(win.year) // window dibuka kembali — izinkan jalan lagi nanti
    return
  }
  if (cutoffSubmittedYears.has(win.year)) return
  cutoffSubmittedYears.add(win.year)
  try {
    await autoSubmitAtCutoffService(win.year)
  } catch (err) {
    cutoffSubmittedYears.delete(win.year) // gagal → izinkan retry
    throw err
  }
}

/**
 * `year` WAJIB: skor harus dihitung dengan config tahun submission itu, bukan
 * config tahun berjalan. Tanpa ini, mengganti kerangka THE membuat skor data
 * lama berubah surut.
 */
function computePoints(year: number, sdgId: number, theAnswers: Record<string, unknown>, qsAnswers: Record<string, unknown>): number {
  const ctx = scoringContext(year, sdgId)
  if (!ctx) return 0
  const decoded = unwrapTheAnswers(theAnswers as Record<string, any>)
  return calcSdgEstimate(ctx, decoded as any)
}

const submissionInclude = {
  orgUnit: true,
  submittedBy: { select: { id: true, name: true } }
}

export const getSubmissionsService = async (
  filters: { status?: string; orgUnitId?: string; year?: string; sdgId?: string; submittedByUserId?: string },
  currentUser: UserWithRelations
) => {
  // Pastikan draft/revisi sudah ter-submit kalau cutoff sudah lewat, sebelum daftar dibaca.
  // Validator jadi langsung lihat submission, bukan draft yang tak bisa di-approve.
  await ensureCutoffAutoSubmit()

  const where: any = {}

  // unit_admin: auto-filter to own orgUnit
  if (currentUser.role === 'unit_admin') {
    where.orgUnitId = currentUser.orgUnitId
  } else if (filters.orgUnitId) {
    where.orgUnitId = filters.orgUnitId
  }

  if (filters.status) where.status = filters.status
  if (filters.year) where.year = parseInt(filters.year)
  if (filters.sdgId) where.sdgId = parseInt(filters.sdgId)
  if (filters.submittedByUserId) where.submittedByUserId = filters.submittedByUserId

  const items = await prismaClient.submission.findMany({
    where,
    include: submissionInclude,
    orderBy: { submittedAt: 'desc' }
  })
  return items.map(toSubmissionResponse)
}

export const getSubmissionByIdService = async (
  id: string,
  currentUser: UserWithRelations,
  includeComments = false,
  includeLogs = false
) => {
  const include: any = { ...submissionInclude }
  if (includeComments) include.reviewComments = { include: { user: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } }
  // `role` wajib ikut di-select — dipakai buildReviewerAliases untuk membedakan
  // aktor peninjau dari aktor unit itu sendiri.
  if (includeLogs) include.logs = { include: { actor: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } }

  const item = await prismaClient.submission.findUnique({ where: { id }, include })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')

  if (currentUser.role === 'unit_admin' && item.orgUnitId !== currentUser.orgUnitId) {
    throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')
  }

  // Masking dilakukan SEBELUM serialisasi respons, memakai peta alias yang sama
  // untuk komentar dan log agar "Validator 2" konsisten di kedua daftar.
  if (shouldMaskReviewers(currentUser.role)) {
    const raw = item as any
    const aliases = buildReviewerAliases(raw.reviewComments ?? [], raw.logs ?? [])
    if (raw.reviewComments) raw.reviewComments = raw.reviewComments.map((c: any) => maskComment(c, aliases))
    if (raw.logs) raw.logs = raw.logs.map((l: any) => maskLog(l, aliases))
  }

  return toSubmissionResponse(item as unknown as SubmissionWithRelations)
}

export const createSubmissionService = async (request: CreateSubmissionRequest, currentUser: UserWithRelations) => {
  const req = Validation.validate(SubmissionValidation.CREATE, request)

  // Setelah cutoff window: dilarang bikin submission baru (cegah draft siluman pasca-cutoff).
  if (isCutoffPassed(await getWindow())) {
    throw new ResponseError(400, 'Submission window sudah ditutup', 'WINDOW_CLOSED')
  }

  const existing = await prismaClient.submission.findUnique({
    where: { orgUnitId_sdgId_year: { orgUnitId: currentUser.orgUnitId!, sdgId: req.sdgId, year: req.year } }
  })
  if (existing) throw new ResponseError(409, 'Submission untuk SDG dan tahun ini sudah ada', 'CONFLICT')

  const cleanThe = sanitizeJson(req.theAnswers ?? {})
  const cleanQs = sanitizeJson(req.qsAnswers ?? {})
  const points = computePoints(req.year, req.sdgId, cleanThe as any, cleanQs as any)

  const item = await prismaClient.submission.create({
    data: {
      title: req.title,
      sdgId: req.sdgId,
      year: req.year,
      orgUnitId: currentUser.orgUnitId!,
      submittedByUserId: currentUser.id,
      theAnswers: cleanThe as Prisma.InputJsonValue,
      qsAnswers: cleanQs as Prisma.InputJsonValue,
      points
    },
    include: submissionInclude
  })

  await prismaClient.submissionLog.create({
    data: { submissionId: item.id, event: 'created', toStatus: 'draft', actorUserId: currentUser.id }
  })

  await logActivity({
    category: 'submission',
    action: 'SUBMISSION_DRAFT_CREATED',
    description: `Membuat draft SDG ${item.sdgId} periode ${item.year}`,
    orgUnitName: item.orgUnit.name,
    sdgId: item.sdgId,
    year: item.year,
    targetId: item.id,
    metadata: { points }
  })

  return toSubmissionResponse(item as SubmissionWithRelations)
}

export const updateSubmissionService = async (id: string, request: UpdateSubmissionRequest, currentUser: UserWithRelations) => {
  const req = Validation.validate(SubmissionValidation.UPDATE, request)

  const item = await prismaClient.submission.findUnique({ where: { id }, include: submissionInclude })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')
  if (item.orgUnitId !== currentUser.orgUnitId) throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')
  if (!['draft', 'revision'].includes(item.status)) {
    throw new ResponseError(403, 'Submission tidak dapat diedit pada status saat ini', 'FORBIDDEN')
  }
  // Setelah cutoff: draft/revision tak boleh diedit lagi (sudah/akan auto-disubmit ke validator).
  if (isCutoffPassed(await getWindow())) {
    throw new ResponseError(400, 'Submission window sudah ditutup', 'WINDOW_CLOSED')
  }

  const newTheAnswers = sanitizeJson(req.theAnswers ?? (item.theAnswers as any))
  const newQsAnswers = sanitizeJson(req.qsAnswers ?? (item.qsAnswers as any))
  const points = computePoints(item.year, item.sdgId, newTheAnswers, newQsAnswers)

  const updated = await prismaClient.submission.update({
    where: { id },
    data: {
      title: req.title,
      theAnswers: newTheAnswers as Prisma.InputJsonValue,
      qsAnswers: newQsAnswers as Prisma.InputJsonValue,
      points
    },
    include: submissionInclude
  })

  await prismaClient.submissionLog.create({
    data: { submissionId: id, event: 'updated', fromStatus: item.status as any, toStatus: item.status as any, actorUserId: currentUser.id }
  })

  await logActivity({
    category: 'submission',
    action: 'SUBMISSION_DRAFT_SAVED',
    description:
      item.status === 'revision'
        ? `Menyimpan perbaikan revisi SDG ${item.sdgId} periode ${item.year}`
        : `Menyimpan draft SDG ${item.sdgId} periode ${item.year}`,
    orgUnitName: item.orgUnit.name,
    sdgId: item.sdgId,
    year: item.year,
    targetId: id,
    metadata: { status: item.status, points: { before: item.points, after: points } }
  })

  return toSubmissionResponse(updated as SubmissionWithRelations)
}

export const submitSubmissionService = async (id: string, currentUser: UserWithRelations) => {
  const item = await prismaClient.submission.findUnique({ where: { id }, include: submissionInclude })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')
  if (item.orgUnitId !== currentUser.orgUnitId) throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')

  if (!['draft', 'revision'].includes(item.status)) {
    throw new ResponseError(400, 'Status tidak memungkinkan untuk submit', 'INVALID_STATUS')
  }

  // Validate submission window
  const window = await getWindow()
  if (!isWithinWindow(window)) {
    throw new ResponseError(400, 'Submission window belum/sudah ditutup', 'WINDOW_CLOSED')
  }

  // Validate mandatory SDGs (dinamis dari settings)
  const settings = await getSettingsService()
  if (settings.mandatorySdgs.includes(item.sdgId)) {
    const theAnswers = item.theAnswers as Record<string, unknown>
    if (!theAnswers || Object.keys(theAnswers).length === 0) {
      throw new ResponseError(400, `SDG ${item.sdgId} wajib diisi`, 'MANDATORY_SDG_EMPTY')
    }
  }

  const fromStatus = item.status as any
  const toStatus = fromStatus === 'revision' ? 'resubmitted' : 'submitted'

  const updated = await prismaClient.submission.update({
    where: { id },
    data: { status: toStatus, submittedAt: new Date() },
    include: submissionInclude
  })

  await prismaClient.submissionLog.create({
    data: {
      submissionId: id,
      event: toStatus === 'resubmitted' ? 'resubmitted' : 'submitted',
      fromStatus,
      toStatus,
      actorUserId: currentUser.id,
      snapshot: { theAnswers: item.theAnswers, qsAnswers: item.qsAnswers, points: item.points }
    }
  })

  const resubmit = toStatus === 'resubmitted'
  await logActivity({
    category: 'submission',
    action: resubmit ? 'SUBMISSION_RESUBMITTED' : 'SUBMISSION_SUBMITTED',
    description: resubmit
      ? `Mengirim ulang revisi SDG ${item.sdgId} periode ${item.year} ke validator`
      : `Mengirim SDG ${item.sdgId} periode ${item.year} ke validator`,
    orgUnitName: item.orgUnit.name,
    sdgId: item.sdgId,
    year: item.year,
    targetId: id,
    metadata: { fromStatus, toStatus, points: item.points }
  })

  return toSubmissionResponse(updated as SubmissionWithRelations)
}

export const reviewSubmissionService = async (id: string, request: ReviewRequest, currentUser: UserWithRelations) => {
  const req = Validation.validate(SubmissionValidation.REVIEW, request)

  const item = await prismaClient.submission.findUnique({ where: { id }, include: submissionInclude })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')

  if (!['submitted', 'under_review', 'resubmitted'].includes(item.status)) {
    throw new ResponseError(400, 'Status tidak memungkinkan untuk direview', 'INVALID_STATUS')
  }

  // Setelah cutoff: faculty tak bisa lagi resubmit, jadi validator hanya boleh approve/comment.
  if (isCutoffPassed(await getWindow()) && ['request_revision', 'reject'].includes(req.action)) {
    throw new ResponseError(400, 'Setelah cutoff hanya bisa approve atau memberi catatan', 'CUTOFF_PASSED')
  }

  const fromStatus = item.status as any
  let toStatus = fromStatus
  let event: any = 'review_started'

  // If submitted/resubmitted first action moves to under_review
  if (['submitted', 'resubmitted'].includes(fromStatus)) {
    toStatus = 'under_review'
    event = 'review_started'
  }

  const updateData: any = {}

  // Simpan skor bibliometrik yang diisi validator UNTUK SEMUA aksi (approve,
  // request_revision, comment) — bukan cuma approve. Dulu skor hilang saat
  // validator isi bibliometrik lalu minta revisi.
  if (req.bibliometricScores && Object.keys(req.bibliometricScores).length > 0) {
    const theAnswers = (item.theAnswers as Record<string, any>) || {}
    for (const [code, score] of Object.entries(req.bibliometricScores)) {
      const key = `THE_${code.replace(/\./g, '_')}`
      theAnswers[key] = { score }
    }
    updateData.theAnswers = theAnswers
    updateData.points = computePoints(item.year, item.sdgId, theAnswers, item.qsAnswers as any)
  }

  switch (req.action) {
    case 'approve':
      toStatus = 'approved'
      event = 'approved'
      break
    case 'request_revision':
      toStatus = 'revision'
      event = 'revision_requested'
      updateData.revisionCount = { increment: 1 }
      break
    case 'reject':
      toStatus = 'rejected'
      event = 'rejected'
      break
    case 'comment':
      // status stays under_review (already set above)
      event = 'review_started'
      break
  }

  const updated = await prismaClient.submission.update({
    where: { id },
    data: { status: toStatus, ...updateData },
    include: submissionInclude
  })

  // Catatan validator = teks bebas yang dirender ke admin fakultas — sanitasi
  // sama seperti jawaban submission (sebelumnya jalur ini terlewat).
  const cleanComment = req.comment ? sanitizeString(req.comment) : req.comment

  // Create review comment
  if (req.comment || req.action !== 'approve') {
    await prismaClient.reviewComment.create({
      data: {
        submissionId: id,
        userId: currentUser.id,
        comment: cleanComment ?? '',
        action: req.action as any,
        questionId: req.questionId ?? null
      }
    })
  }

  // Create submission log
  await prismaClient.submissionLog.create({
    data: {
      submissionId: id,
      event,
      fromStatus,
      toStatus,
      actorUserId: currentUser.id,
      note: cleanComment
    }
  })

  // Teks catatan sengaja TIDAK disalin ke activity log — catatan validator bisa
  // dihapus lewat rollback dan tidak boleh tertinggal salinannya di tempat lain.
  const activity = REVIEW_ACTIVITY[req.action]
  await logActivity({
    category: 'review',
    action: activity.action,
    description: `${activity.verb} SDG ${item.sdgId} periode ${item.year}`,
    orgUnitName: item.orgUnit.name,
    sdgId: item.sdgId,
    year: item.year,
    targetId: id,
    metadata: {
      fromStatus,
      toStatus,
      hasComment: !!cleanComment,
      ...(req.questionId ? { questionId: req.questionId } : {}),
      ...(req.bibliometricScores ? { bibliometricScores: req.bibliometricScores } : {})
    }
  })

  return toSubmissionResponse(updated as SubmissionWithRelations)
}

const REVIEW_ACTIVITY = {
  approve: { action: 'REVIEW_APPROVED', verb: 'Menyetujui' },
  request_revision: { action: 'REVIEW_REVISION_REQUESTED', verb: 'Meminta revisi' },
  reject: { action: 'REVIEW_REJECTED', verb: 'Menolak' },
  comment: { action: 'REVIEW_COMMENT', verb: 'Memberi catatan review' }
} as const

export const getSubmissionLogsService = async (id: string, currentUser: UserWithRelations) => {
  const item = await prismaClient.submission.findUnique({ where: { id } })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')

  if (currentUser.role === 'unit_admin' && item.orgUnitId !== currentUser.orgUnitId) {
    throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')
  }

  const logs = await prismaClient.submissionLog.findMany({
    where: { submissionId: id },
    include: { actor: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  })
  if (!shouldMaskReviewers(currentUser.role)) return logs

  // Komentar ikut dibaca agar penomoran identik dengan endpoint /comments.
  const comments = await prismaClient.reviewComment.findMany({
    where: { submissionId: id },
    select: { userId: true, createdAt: true, user: { select: { id: true, name: true, role: true } } }
  })
  const aliases = buildReviewerAliases(comments, logs)
  return logs.map((l) => maskLog(l, aliases))
}

export const getSubmissionCommentsService = async (id: string, currentUser: UserWithRelations) => {
  const item = await prismaClient.submission.findUnique({ where: { id } })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')

  if (currentUser.role === 'unit_admin' && item.orgUnitId !== currentUser.orgUnitId) {
    throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')
  }

  const comments = await prismaClient.reviewComment.findMany({
    where: { submissionId: id },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  })
  if (!shouldMaskReviewers(currentUser.role)) return comments

  const logs = await prismaClient.submissionLog.findMany({
    where: { submissionId: id },
    select: { actorUserId: true, createdAt: true, note: true, actor: { select: { id: true, name: true, role: true } } }
  })
  const aliases = buildReviewerAliases(comments, logs)
  return comments.map((c) => maskComment(c, aliases))
}

export const addCommentService = async (
  submissionId: string,
  data: { comment: string; questionId?: string | null; action?: string },
  currentUser: UserWithRelations
) => {
  const item = await prismaClient.submission.findUnique({ where: { id: submissionId } })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')

  const comment = await prismaClient.reviewComment.create({
    data: {
      submissionId,
      userId: currentUser.id,
      comment: sanitizeString(data.comment ?? ''),
      action: (data.action as any) ?? 'comment',
      questionId: data.questionId ?? null
    },
    include: { user: { select: { id: true, name: true, role: true } } }
  })
  return comment
}

// Status yang diselamatkan year-end (backstop). draft dilewati (auto-submit cutoff yang
// urus). revision tetap diikutkan kalau-kalau cutoff cron kelewat. rejected dihormati —
// penolakan sengaja validator, tak boleh dipaksa approved.
const AUTO_APPROVE_STATUSES = ['submitted', 'under_review', 'resubmitted', 'revision'] as const

/**
 * Auto-approve semua submission tahun `year` yang belum di-approve (semua status
 * kecuali draft & approved). Dipakai oleh cron akhir tahun agar data tetap tersimpan
 * meski validator belum sempat memvalidasi sebelum tahun berganti.
 *
 * Aktor log = super_admin pertama (aksi sistem). Idempotent: jika tak ada yang
 * pending, return count 0.
 */
export const autoApproveYearEndService = async (year: number): Promise<{ approved: number; year: number }> => {
  const pending = await prismaClient.submission.findMany({
    where: { year, status: { in: AUTO_APPROVE_STATUSES as unknown as any[] } },
    include: submissionInclude
  })

  if (pending.length === 0) return { approved: 0, year }

  // Aktor sistem untuk jejak audit (actorUserId wajib). Fallback ke submittedBy bila tak ada super_admin.
  const systemActor = await prismaClient.user.findFirst({
    where: { role: 'super_admin' },
    select: { id: true }
  })

  for (const item of pending) {
    const points = computePoints(item.year, item.sdgId, item.theAnswers as any, item.qsAnswers as any)
    const fromStatus = item.status

    await prismaClient.$transaction([
      prismaClient.submission.update({
        where: { id: item.id },
        data: { status: 'approved', points }
      }),
      prismaClient.submissionLog.create({
        data: {
          submissionId: item.id,
          event: 'approved',
          fromStatus,
          toStatus: 'approved',
          actorUserId: systemActor?.id ?? item.submittedByUserId,
          note: 'Auto-approve akhir tahun (cron 24 Des) — belum divalidasi sebelum tahun berganti'
        }
      })
    ])
  }

  for (const [orgUnitName, sdgIds] of groupSdgsByUnit(pending)) {
    await logActivity({
      ...SYSTEM_ACTIVITY,
      category: 'review',
      action: 'REVIEW_AUTO_APPROVED',
      description: `Auto-approve akhir tahun: ${sdgIds.length} submission periode ${year} disetujui otomatis`,
      orgUnitName,
      year,
      metadata: { sdgIds }
    })
  }

  return { approved: pending.length, year }
}

/**
 * Aksi cron dicatat atas nama Sistem secara EKSPLISIT: auto-submit bisa terpicu
 * lazy di dalam request user (getSubmissionsService), dan tanpa ini aksinya
 * tercatat seolah dilakukan user yang kebetulan membuka halaman.
 */
const SYSTEM_ACTIVITY = { actor: SYSTEM_ACTOR, ip: null, userAgent: null }

/** Aksi massal cron dicatat satu baris per unit kerja, bukan satu per submission. */
function groupSdgsByUnit(items: { sdgId: number; orgUnit: { name: string } }[]): Map<string, number[]> {
  const byUnit = new Map<string, number[]>()
  for (const item of items) {
    const list = byUnit.get(item.orgUnit.name) ?? []
    list.push(item.sdgId)
    byUnit.set(item.orgUnit.name, list)
  }
  for (const list of byUnit.values()) list.sort((a, b) => a - b)
  return byUnit
}

/**
 * Auto-submit saat cutoff window: semua `draft` → `submitted`, `revision` → `resubmitted`,
 * agar masuk antrian validator walau faculty tak sempat klik submit. Sengaja mem-bypass
 * cek mandatory SDG & window — seberapapun lengkapnya, data tetap dikirim.
 *
 * Aktor log = super_admin (aksi sistem). Idempotent: tanpa draft/revision → count 0.
 */
export const autoSubmitAtCutoffService = async (year: number): Promise<{ submitted: number; year: number }> => {
  const pending = await prismaClient.submission.findMany({
    where: { year, status: { in: ['draft', 'revision'] } },
    select: { id: true, status: true, sdgId: true, submittedByUserId: true, orgUnit: { select: { name: true } } }
  })

  if (pending.length === 0) return { submitted: 0, year }

  const systemActor = await prismaClient.user.findFirst({
    where: { role: 'super_admin' },
    select: { id: true }
  })

  const now = new Date()
  for (const item of pending) {
    const fromStatus = item.status
    const toStatus = fromStatus === 'revision' ? 'resubmitted' : 'submitted'

    await prismaClient.$transaction([
      prismaClient.submission.update({
        where: { id: item.id },
        data: { status: toStatus, submittedAt: now }
      }),
      prismaClient.submissionLog.create({
        data: {
          submissionId: item.id,
          event: toStatus === 'resubmitted' ? 'resubmitted' : 'submitted',
          fromStatus,
          toStatus,
          actorUserId: systemActor?.id ?? item.submittedByUserId,
          note: 'Auto-submit cutoff — dikirim otomatis ke validator saat window ditutup'
        }
      })
    ])
  }

  for (const [orgUnitName, sdgIds] of groupSdgsByUnit(pending)) {
    await logActivity({
      ...SYSTEM_ACTIVITY,
      category: 'submission',
      action: 'SUBMISSION_AUTO_SUBMITTED',
      description: `Auto-submit cutoff: ${sdgIds.length} submission periode ${year} dikirim otomatis ke validator`,
      orgUnitName,
      year,
      metadata: { sdgIds }
    })
  }

  return { submitted: pending.length, year }
}

// ─────────────── DELETE (super admin, PIN-gated, audited) ───────────────

type DeletableSubmission = {
  id: string
  sdgId: number
  year: number
  status: string
  points: number
  title: string
  orgUnit: { name: string }
}

/**
 * Hapus satu submission + tulis jejak audit ke activity log. Cascade schema
 * ikut menghapus SubmissionLog & ReviewComment-nya (onDelete: Cascade).
 * Audit ditulis SETELAH delete sukses agar tak mencatat hapus yang gagal.
 */
async function deleteAndAudit(sub: DeletableSubmission, ctx: AuditContext) {
  const before = { title: sub.title, status: sub.status, points: sub.points, year: sub.year, sdgId: sub.sdgId }
  await prismaClient.submission.delete({ where: { id: sub.id } })
  await recordAudit({
    action: 'DELETE',
    recordId: null,
    sdgId: sub.sdgId,
    year: sub.year,
    orgUnitName: sub.orgUnit.name,
    changes: buildChanges(before, null),
    snapshot: buildSnapshot(before),
    ctx
  })
}

/** Hapus satu submission (per-SDG) milik unit kerja. */
export const deleteSubmissionService = async (id: string, pin: string | undefined, ctx: AuditContext) => {
  await assertDeletePin(pin)
  const item = await prismaClient.submission.findUnique({ where: { id }, include: submissionInclude })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')
  await deleteAndAudit(item as unknown as DeletableSubmission, ctx)
  return { deleted: 1, sdgId: item.sdgId, year: item.year, orgUnitName: item.orgUnit.name }
}

/** Hapus SELURUH submission satu unit kerja untuk satu tahun (per-fakultas). */
export const deleteFacultySubmissionsService = async (orgUnitId: string, year: number, pin: string | undefined, ctx: AuditContext) => {
  await assertDeletePin(pin)
  if (!Number.isInteger(year)) throw new ResponseError(400, 'Tahun wajib diisi', 'BAD_REQUEST')

  const orgUnit = await prismaClient.orgUnit.findUnique({ where: { id: orgUnitId } })
  if (!orgUnit) throw new ResponseError(404, 'Unit kerja tidak ditemukan', 'NOT_FOUND')

  const items = await prismaClient.submission.findMany({ where: { orgUnitId, year }, include: submissionInclude })
  if (items.length === 0) throw new ResponseError(404, 'Tidak ada data submission untuk unit & tahun ini', 'NOT_FOUND')

  for (const item of items) {
    await deleteAndAudit(item as unknown as DeletableSubmission, ctx)
  }
  return { deleted: items.length, orgUnitName: orgUnit.name, year }
}

// ─────────────── ROLLBACK ke admin unit (validator / super admin) ───────────────

/**
 * Status yang dikembalikan ke draft. `approved` hanya ikut bila diminta
 * eksplisit (includeApproved) — persetujuan adalah keputusan final validator
 * dan tidak boleh ikut terhapus tanpa sengaja.
 */
const ROLLBACK_STATUSES: SubmissionStatus[] = ['submitted', 'under_review', 'resubmitted', 'revision', 'rejected']

/** Event riwayat yang `note`-nya berisi catatan validator (lihat reviewSubmissionService). */
const REVIEW_NOTE_EVENTS = ['review_started', 'revision_requested', 'approved', 'rejected'] as const

/**
 * Kembalikan submission satu unit kerja (periode aktif) ke admin unit sebagai draft.
 *
 * Latar: tanggal cut-off lupa diatur → semua draft ter-auto-submit ke validator
 * sebelum unit selesai mengisi. Rollback membalik itu tanpa kehilangan isian unit:
 *  - TETAP  : jawaban THE/QS dan skor (termasuk nilai bibliometrik) — semua data.
 *  - HILANG : seluruh komentar & catatan revisi validator (permanen), teks catatan
 *             validator di riwayat, dan hitungan revisi.
 *  - Riwayat status tetap utuh, ditambah satu event `rolled_back` per submission.
 *
 * Hanya bisa selama cut-off belum lewat: setelah cut-off admin unit tidak bisa
 * mengedit dan auto-submit akan langsung mengirim ulang semuanya. Urutannya:
 * perpanjang cut-off di System Settings dulu, baru rollback.
 */
export const rollbackFacultySubmissionsService = async (
  orgUnitId: string,
  request: RollbackRequest,
  currentUser: UserWithRelations
) => {
  const req = Validation.validate(SubmissionValidation.ROLLBACK, request)

  const window = await getWindow()
  if (req.year !== window.year) {
    throw new ResponseError(400, `Rollback hanya bisa untuk periode aktif (${window.year}). Muat ulang halaman.`, 'INVALID_PERIOD')
  }
  if (isCutoffPassed(window)) {
    throw new ResponseError(
      400,
      `Cut-off periode ${window.year} sudah lewat. Perpanjang tanggal cut-off di System Settings (Super Admin) terlebih dahulu — tanpa itu admin unit tetap tidak bisa mengedit dan data akan langsung dikirim ulang otomatis.`,
      'CUTOFF_PASSED'
    )
  }

  const orgUnit = await prismaClient.orgUnit.findUnique({ where: { id: orgUnitId } })
  if (!orgUnit) throw new ResponseError(404, 'Unit kerja tidak ditemukan', 'NOT_FOUND')

  const statuses: SubmissionStatus[] = req.includeApproved ? [...ROLLBACK_STATUSES, 'approved'] : ROLLBACK_STATUSES
  const reason = req.reason ? sanitizeString(req.reason) : ''
  const note = `Rollback ke admin unit — catatan validator dihapus${reason ? `. Alasan: ${reason}` : ''}`

  const result = await prismaClient.$transaction(
    async (tx) => {
      const candidates = await tx.submission.findMany({
        where: { orgUnitId, year: req.year, status: { in: statuses } },
        select: { id: true, sdgId: true, status: true }
      })

      const rolled: typeof candidates = []
      for (const item of candidates) {
        // Update bersyarat pada status lama: kalau validator lain baru saja
        // mengubahnya (mis. approve), lewati — jangan menimpa keputusan yang
        // tidak terlihat oleh pelaku rollback.
        const { count } = await tx.submission.updateMany({
          where: { id: item.id, status: item.status },
          data: { status: 'draft', submittedAt: null, revisionCount: 0 }
        })
        if (count === 0) continue
        rolled.push(item)
        await tx.submissionLog.create({
          data: {
            submissionId: item.id,
            event: 'rolled_back',
            fromStatus: item.status,
            toStatus: 'draft',
            actorUserId: currentUser.id,
            note
          }
        })
      }
      if (rolled.length === 0) return { rolled, commentsDeleted: 0, notesCleared: 0 }

      const ids = rolled.map((r) => r.id)
      const { count: commentsDeleted } = await tx.reviewComment.deleteMany({ where: { submissionId: { in: ids } } })
      // Catatan cron ("Auto-submit cutoff", "Auto-approve akhir tahun") dibiarkan:
      // teks itulah penanda baris Sistem di reviewer-alias.
      const { count: notesCleared } = await tx.submissionLog.updateMany({
        where: {
          submissionId: { in: ids },
          event: { in: [...REVIEW_NOTE_EVENTS] },
          note: { not: null },
          NOT: SYSTEM_NOTE_PREFIXES.map((p) => ({ note: { startsWith: p } }))
        },
        data: { note: null }
      })
      return { rolled, commentsDeleted, notesCleared }
    },
    { timeout: 15000 }
  )

  if (result.rolled.length === 0) {
    throw new ResponseError(400, `Tidak ada submission ${orgUnit.name} periode ${req.year} yang bisa di-rollback`, 'NOTHING_TO_ROLLBACK')
  }

  const sorted = [...result.rolled].sort((a, b) => a.sdgId - b.sdgId)
  const sdgIds = sorted.map((r) => r.sdgId)

  await logActivity({
    category: 'submission',
    action: 'SUBMISSION_ROLLED_BACK',
    description: `Rollback ${sdgIds.length} submission periode ${req.year} ke admin unit — catatan validator dihapus`,
    orgUnitName: orgUnit.name,
    year: req.year,
    targetId: orgUnit.id,
    metadata: {
      sdgIds,
      fromStatus: Object.fromEntries(sorted.map((r) => [r.sdgId, r.status])),
      includeApproved: req.includeApproved,
      commentsDeleted: result.commentsDeleted,
      notesCleared: result.notesCleared,
      ...(reason ? { reason } : {})
    }
  })

  return {
    orgUnitName: orgUnit.name,
    year: req.year,
    rolledBack: sdgIds.length,
    sdgIds,
    submissionIds: sorted.map((r) => r.id),
    commentsDeleted: result.commentsDeleted
  }
}
