import { ActivityLog } from '@prisma/client'
import { z } from 'zod'

// ─────────────── kategori & aksi ───────────────
// Satu-satunya sumber nilai sah untuk kolom String `category` / `action`.
// Menambah aksi = tambah di sini (+ label di FE), tanpa migrasi.

export const ACTIVITY_ACTIONS = {
  auth: ['LOGIN', 'LOGIN_FAILED', 'LOGOUT'],
  submission: [
    'SUBMISSION_DRAFT_CREATED',
    'SUBMISSION_DRAFT_SAVED',
    'SUBMISSION_SUBMITTED',
    'SUBMISSION_RESUBMITTED',
    'SUBMISSION_AUTO_SUBMITTED',
    'SUBMISSION_ROLLED_BACK',
    'SUBMISSION_DELETED'
  ],
  review: [
    'REVIEW_COMMENT',
    'REVIEW_APPROVED',
    'REVIEW_REVISION_REQUESTED',
    'REVIEW_REJECTED',
    'REVIEW_AUTO_APPROVED'
  ],
  university_record: ['UNIV_RECORD_CREATED', 'UNIV_RECORD_UPDATED', 'UNIV_RECORD_DELETED'],
  user: ['USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_UNLOCKED', 'USER_PASSWORD_CHANGED'],
  org_unit: ['ORG_UNIT_CREATED', 'ORG_UNIT_UPDATED', 'ORG_UNIT_DELETED'],
  settings: [
    'SETTINGS_UPDATED',
    'DELETE_PIN_CHANGED',
    'ANNOUNCEMENT_UPDATED',
    'CONFIG_DRAFT_CREATED',
    'CONFIG_ACTIVATED',
    'CONFIG_DRAFT_DELETED'
  ]
} as const

export type ActivityCategory = keyof typeof ACTIVITY_ACTIONS
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[ActivityCategory][number]

export const ACTIVITY_CATEGORIES = Object.keys(ACTIVITY_ACTIONS) as ActivityCategory[]
const ALL_ACTIONS = Object.values(ACTIVITY_ACTIONS).flat() as ActivityAction[]

/** Role pelaku yang bisa difilter. `system` = cron, `guest` = login gagal tanpa akun. */
export const ACTIVITY_ROLES = ['super_admin', 'validator', 'unit_admin', 'pimpinan', 'system', 'guest'] as const

/** Label role untuk teks deskripsi log. */
export const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  validator: 'Validator',
  unit_admin: 'Admin Unit',
  pimpinan: 'Pimpinan'
}

// ─────────────── query ───────────────

// Query string selalu string; kosong = filter tidak dipakai.
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : Number(v)),
    z.number().int().min(min).max(max).optional()
  )
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.enum(values).optional())
const optionalDate = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : v),
  z.string().datetime({ offset: true, message: 'Format tanggal tidak valid' }).optional()
)

export const ActivityLogQuerySchema = z.object({
  category: optionalEnum(ACTIVITY_CATEGORIES as [ActivityCategory, ...ActivityCategory[]]),
  action: optionalEnum(ALL_ACTIONS as [ActivityAction, ...ActivityAction[]]),
  role: optionalEnum(ACTIVITY_ROLES),
  sdgId: optionalInt(1, 17),
  year: optionalInt(2000, 2100),
  // ISO datetime lengkap dari FE (awal/akhir hari di zona waktu browser) —
  // server tidak menebak zona waktu pengguna.
  from: optionalDate,
  to: optionalDate,
  q: z.preprocess((v) => (typeof v === 'string' ? v.trim().slice(0, 100) : undefined), z.string().optional()),
  page: optionalInt(1, 100000),
  pageSize: optionalInt(1, 100)
})

export type ActivityLogQuery = z.infer<typeof ActivityLogQuerySchema>

// ─────────────── response ───────────────

export type ActivityLogResponse = {
  id: string
  category: string
  action: string
  actorId: string | null
  actorName: string
  actorRole: string
  actorEmail: string | null
  orgUnitName: string | null
  sdgId: number | null
  year: number | null
  targetId: string | null
  description: string
  metadata: Record<string, unknown>
  ipAddress: string | null
  userAgent: string | null
  createdAt: Date
}

export function toActivityLogResponse(a: ActivityLog): ActivityLogResponse {
  return {
    id: a.id,
    category: a.category,
    action: a.action,
    actorId: a.actorId,
    actorName: a.actorName,
    actorRole: a.actorRole,
    actorEmail: a.actorEmail,
    orgUnitName: a.orgUnitName,
    sdgId: a.sdgId,
    year: a.year,
    targetId: a.targetId,
    description: a.description,
    metadata: (a.metadata as Record<string, unknown>) ?? {},
    ipAddress: a.ipAddress,
    userAgent: a.userAgent,
    createdAt: a.createdAt
  }
}
