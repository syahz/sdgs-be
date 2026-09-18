import { Prisma, AuditAction } from '@prisma/client'
import { prismaClient } from '../application/database'
import {
  FieldChange,
  RecordSnapshot,
  toAuditLogResponse
} from '../model/audit-log-model'
import { logger } from '../utils/logger'
import { logActivity } from './activity-log-service'

// Konteks pelaku + forensik yang dibawa dari controller per request.
export interface AuditContext {
  actorId?: string | null
  actorName: string
  actorRole: string
  actorEmail?: string | null
  ip?: string | null
  userAgent?: string | null
  reason?: string | null
}

interface RecordAuditParams {
  action: AuditAction
  recordId: string | null
  sdgId: number
  year: number
  changes: FieldChange[]
  snapshot: RecordSnapshot
  ctx: AuditContext
  // Terisi hanya untuk jejak hapus submission unit kerja; null = data universitas.
  orgUnitName?: string | null
}

/**
 * Tulis satu baris audit (append-only). Best-effort: kegagalan log TIDAK boleh
 * menggagalkan operasi data utama, jadi error ditelan + dicatat ke console.
 */
export async function recordAudit(params: RecordAuditParams): Promise<void> {
  try {
    await prismaClient.universityRecordAudit.create({
      data: {
        action: params.action,
        recordId: params.recordId,
        sdgId: params.sdgId,
        year: params.year,
        orgUnitName: params.orgUnitName ?? null,
        actorId: params.ctx.actorId ?? null,
        actorName: params.ctx.actorName,
        actorRole: params.ctx.actorRole,
        changes: params.changes as unknown as Prisma.InputJsonValue,
        snapshot: params.snapshot as unknown as Prisma.InputJsonValue,
        ipAddress: params.ctx.ip ?? null,
        userAgent: params.ctx.userAgent ?? null,
        reason: params.ctx.reason ?? null
      }
    })
  } catch (e) {
    // console.error tidak pernah mendarat di logs/error/ — kegagalan audit
    // justru hal yang paling perlu terekam.
    logger.error('Gagal menulis university_record_audit', {
      action: 'AUDIT_WRITE_FAILED',
      error: String(e)
    })
  }

  // Cermin ke activity log global. Tabel audit di atas tetap sumber riwayat per
  // sel (modal "riwayat SDG × tahun"); activity log adalah feed gabungan.
  await logActivity(auditToActivity(params))
}

function auditToActivity(p: RecordAuditParams): Parameters<typeof logActivity>[0] {
  const base = {
    actor: { id: p.ctx.actorId ?? null, name: p.ctx.actorName, role: p.ctx.actorRole, email: p.ctx.actorEmail ?? null },
    sdgId: p.sdgId,
    year: p.year,
    targetId: p.recordId,
    orgUnitName: p.orgUnitName ?? null,
    metadata: { changes: p.changes, ...(p.ctx.reason ? { reason: p.ctx.reason } : {}) },
    ip: p.ctx.ip ?? null,
    userAgent: p.ctx.userAgent ?? null
  }
  // orgUnitName terisi = hapus submission unit kerja oleh super admin.
  if (p.orgUnitName) {
    return {
      ...base,
      category: 'submission',
      action: 'SUBMISSION_DELETED',
      description: `Menghapus submission SDG ${p.sdgId} periode ${p.year}`
    }
  }
  const verb = { CREATE: 'Membuat', UPDATE: 'Mengubah', DELETE: 'Menghapus' }[p.action]
  const action = ({ CREATE: 'UNIV_RECORD_CREATED', UPDATE: 'UNIV_RECORD_UPDATED', DELETE: 'UNIV_RECORD_DELETED' } as const)[p.action]
  return {
    ...base,
    category: 'university_record',
    action,
    description: `${verb} data universitas SDG ${p.sdgId} tahun ${p.year}`
  }
}

// ─────────────── reads ───────────────

export const getAuditLogsService = async (filters: {
  sdgId?: string
  year?: string
  action?: string
  actor?: string
  q?: string
  page?: string
  pageSize?: string
}) => {
  const where: Prisma.UniversityRecordAuditWhereInput = {}
  if (filters.sdgId) where.sdgId = parseInt(filters.sdgId)
  if (filters.year) where.year = parseInt(filters.year)
  if (filters.action) where.action = filters.action as AuditAction
  if (filters.actor) where.actorName = filters.actor
  // pencarian bebas: cocokkan nama pelaku atau alasan (case-insensitive)
  if (filters.q) {
    const q = filters.q.trim()
    if (q) {
      where.OR = [
        { actorName: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } }
      ]
    }
  }

  // paginasi (1-based). Clamp pageSize agar tak kebablasan.
  const page = Math.max(1, parseInt(filters.page ?? '1') || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(filters.pageSize ?? '20') || 20))

  const [items, total, distinctActors, distinctYears] = await Promise.all([
    prismaClient.universityRecordAudit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prismaClient.universityRecordAudit.count({ where }),
    // opsi dropdown — dari SELURUH tabel, bukan halaman saat ini
    prismaClient.universityRecordAudit.findMany({
      distinct: ['actorName'],
      select: { actorName: true },
      orderBy: { actorName: 'asc' }
    }),
    prismaClient.universityRecordAudit.findMany({
      distinct: ['year'],
      select: { year: true },
      orderBy: { year: 'desc' }
    })
  ])

  return {
    items: items.map(toAuditLogResponse),
    total,
    page,
    pageSize,
    actors: distinctActors.map((a) => a.actorName),
    years: distinctYears.map((y) => y.year)
  }
}

/** Riwayat satu sel (SDG + tahun), lama → baru untuk timeline modal. */
export const getCellHistoryService = async (sdgId: number, year: number) => {
  const items = await prismaClient.universityRecordAudit.findMany({
    where: { sdgId, year },
    orderBy: { createdAt: 'asc' }
  })
  return items.map(toAuditLogResponse)
}
