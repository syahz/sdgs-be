import { Prisma } from '@prisma/client'
import { prismaClient } from '../application/database'
import {
  ActivityAction,
  ActivityCategory,
  ActivityLogQuerySchema,
  toActivityLogResponse
} from '../model/activity-log-model'
import { UserRequest } from '../type/user-request'
import { clientIp, currentRequest } from '../utils/request-context'
import { logger } from '../utils/logger'

export interface ActivityActor {
  id: string | null
  name: string
  role: string
  email?: string | null
}

/** Pelaku untuk aksi cron (auto-submit cutoff, auto-approve akhir tahun). */
export const SYSTEM_ACTOR: ActivityActor = { id: null, name: 'Sistem', role: 'system' }

export interface LogActivityParams {
  category: ActivityCategory
  action: ActivityAction
  description: string
  /** Default: user dari request aktif; di luar request → SYSTEM_ACTOR. */
  actor?: ActivityActor
  orgUnitName?: string | null
  sdgId?: number | null
  year?: number | null
  targetId?: string | null
  metadata?: Record<string, unknown>
  /** Default: dari request aktif. */
  ip?: string | null
  userAgent?: string | null
}

function actorFromRequest(): ActivityActor | null {
  const user = (currentRequest() as UserRequest | undefined)?.user
  return user ? { id: user.id, name: user.name, role: user.role, email: user.email } : null
}

/**
 * Tulis satu baris activity log (append-only).
 *
 * Best-effort, sama seperti recordAudit: gagal menulis log TIDAK boleh
 * menggagalkan aksi utama yang sudah terjadi. Panggil SETELAH aksi sukses supaya
 * log tidak pernah mencatat sesuatu yang batal.
 */
export async function logActivity(p: LogActivityParams): Promise<void> {
  try {
    const req = currentRequest()
    const actor = p.actor ?? actorFromRequest() ?? SYSTEM_ACTOR
    await prismaClient.activityLog.create({
      data: {
        category: p.category,
        action: p.action,
        description: p.description,
        actorId: actor.id,
        // email tamu (login gagal) berasal dari input bebas — batasi panjangnya
        actorName: actor.name.slice(0, 200),
        actorRole: actor.role,
        actorEmail: actor.email?.slice(0, 200) ?? null,
        orgUnitName: p.orgUnitName ?? null,
        sdgId: p.sdgId ?? null,
        year: p.year ?? null,
        targetId: p.targetId ?? null,
        metadata: (p.metadata ?? {}) as Prisma.InputJsonValue,
        ipAddress: p.ip !== undefined ? p.ip : req ? clientIp(req) : null,
        userAgent: p.userAgent !== undefined ? p.userAgent : (req?.headers['user-agent'] ?? null)
      }
    })
  } catch (e) {
    logger.error('Gagal menulis activity_log', {
      action: 'ACTIVITY_LOG_WRITE_FAILED',
      activity: p.action,
      error: String(e)
    })
  }
}

// ─────────────── reads ───────────────

export const getActivityLogsService = async (query: unknown) => {
  // .parse langsung, bukan Validation.validate: skema ini ber-preprocess (input
  // `unknown` ≠ output), sehingga generic Validation.validate salah menyimpulkan tipe.
  const f = ActivityLogQuerySchema.parse(query)

  const where: Prisma.ActivityLogWhereInput = {}
  if (f.category) where.category = f.category
  if (f.action) where.action = f.action
  if (f.role) where.actorRole = f.role
  if (f.sdgId) where.sdgId = f.sdgId
  if (f.year) where.year = f.year
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(f.from) } : {}),
      ...(f.to ? { lte: new Date(f.to) } : {})
    }
  }
  if (f.q) {
    where.OR = [
      { actorName: { contains: f.q, mode: 'insensitive' } },
      { actorEmail: { contains: f.q, mode: 'insensitive' } },
      { description: { contains: f.q, mode: 'insensitive' } },
      { orgUnitName: { contains: f.q, mode: 'insensitive' } }
    ]
  }

  const page = f.page ?? 1
  const pageSize = f.pageSize ?? 20

  const [items, total, distinctYears] = await Promise.all([
    prismaClient.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prismaClient.activityLog.count({ where }),
    // opsi dropdown tahun — dari SELURUH tabel, bukan halaman saat ini
    prismaClient.activityLog.findMany({
      where: { year: { not: null } },
      distinct: ['year'],
      select: { year: true },
      orderBy: { year: 'desc' }
    })
  ])

  return {
    items: items.map(toActivityLogResponse),
    total,
    page,
    pageSize,
    years: distinctYears.map((y) => y.year as number)
  }
}
