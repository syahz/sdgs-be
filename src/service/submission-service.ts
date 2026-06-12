import { prismaClient } from '../application/database'
import { Prisma } from '@prisma/client'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { SubmissionValidation } from '../validation/submission-validation'
import { CreateSubmissionRequest, UpdateSubmissionRequest, ReviewRequest, SubmissionWithRelations, toSubmissionResponse } from '../model/submission-model'
import { UserWithRelations } from '../type/user-request'
import { calcSdgEstimate } from '../config/sdg-scoring'
import { unwrapTheAnswers } from '../config/the-answer-key'
import { MANDATORY_SDGS } from '../config/the-sdg-config'
import { getSettingsService } from './settings-service'
import { getSubmissionWindowFromConfig, isWithinWindow, isCutoffPassed, SubmissionWindow } from '../config/submission-window'
import { sanitizeJson } from '../utils/sanitize'

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

function computePoints(sdgId: number, theAnswers: Record<string, unknown>, qsAnswers: Record<string, unknown>): number {
  const decoded = unwrapTheAnswers(theAnswers as Record<string, any>)
  return calcSdgEstimate(sdgId, decoded as any)
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
  if (includeLogs) include.logs = { include: { actor: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }

  const item = await prismaClient.submission.findUnique({ where: { id }, include })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')

  if (currentUser.role === 'unit_admin' && item.orgUnitId !== currentUser.orgUnitId) {
    throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')
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
  const points = computePoints(req.sdgId, cleanThe as any, cleanQs as any)

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
  const points = computePoints(item.sdgId, newTheAnswers, newQsAnswers)

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

  // Validate mandatory SDGs
  if (MANDATORY_SDGS.includes(item.sdgId)) {
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

  let updateData: any = {}

  switch (req.action) {
    case 'approve':
      toStatus = 'approved'
      event = 'approved'
      // Apply bibliometric scores if provided
      if (req.bibliometricScores && Object.keys(req.bibliometricScores).length > 0) {
        const theAnswers = (item.theAnswers as Record<string, any>) || {}
        for (const [code, score] of Object.entries(req.bibliometricScores)) {
          const key = `THE_${code.replace(/\./g, '_')}`
          theAnswers[key] = { score }
        }
        const points = computePoints(item.sdgId, theAnswers, item.qsAnswers as any)
        updateData = { theAnswers, points }
      }
      break
    case 'request_revision':
      toStatus = 'revision'
      event = 'revision_requested'
      updateData = { revisionCount: { increment: 1 } }
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

  // Create review comment
  if (req.comment || req.action !== 'approve') {
    await prismaClient.reviewComment.create({
      data: {
        submissionId: id,
        userId: currentUser.id,
        comment: req.comment ?? '',
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
      note: req.comment
    }
  })

  return toSubmissionResponse(updated as SubmissionWithRelations)
}

export const getSubmissionLogsService = async (id: string, currentUser: UserWithRelations) => {
  const item = await prismaClient.submission.findUnique({ where: { id } })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')

  if (currentUser.role === 'unit_admin' && item.orgUnitId !== currentUser.orgUnitId) {
    throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')
  }

  return prismaClient.submissionLog.findMany({
    where: { submissionId: id },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' }
  })
}

export const getSubmissionCommentsService = async (id: string, currentUser: UserWithRelations) => {
  const item = await prismaClient.submission.findUnique({ where: { id } })
  if (!item) throw new ResponseError(404, 'Submission tidak ditemukan', 'NOT_FOUND')

  if (currentUser.role === 'unit_admin' && item.orgUnitId !== currentUser.orgUnitId) {
    throw new ResponseError(403, 'Akses ditolak', 'FORBIDDEN')
  }

  return prismaClient.reviewComment.findMany({
    where: { submissionId: id },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'asc' }
  })
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
      comment: data.comment,
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
    const points = computePoints(item.sdgId, item.theAnswers as any, item.qsAnswers as any)
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

  return { approved: pending.length, year }
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
    select: { id: true, status: true, submittedByUserId: true }
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

  return { submitted: pending.length, year }
}
