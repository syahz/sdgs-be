import { UniversityRecordAudit, AuditAction } from '@prisma/client'

// ─────────────── diff & snapshot ───────────────

export interface FieldChange {
  field: string
  before: string | number | null
  after: string | number | null
}

/** Nilai sel setelah perubahan — ditampilkan sebagai "NOW" di modal. */
export interface RecordSnapshot {
  title?: string
  status?: string
  points?: number
}

/** Field skalar yang dibandingkan untuk diff. Perubahan answers tercermin di points. */
const DIFF_FIELDS: { key: keyof RecordSnapshotSource; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'points', label: 'Points' },
  { key: 'year', label: 'Year' },
  { key: 'sdgId', label: 'SDG' }
]

type RecordSnapshotSource = {
  title: string
  status: string
  points: number
  year: number
  sdgId: number
}

type ScalarRecord = Partial<RecordSnapshotSource> | null

/** Bandingkan dua kondisi record → daftar field yang berubah (before→after). */
export function buildChanges(before: ScalarRecord, after: ScalarRecord): FieldChange[] {
  const changes: FieldChange[] = []
  for (const { key, label } of DIFF_FIELDS) {
    const b = before ? (before[key] ?? null) : null
    const a = after ? (after[key] ?? null) : null
    if (b !== a) changes.push({ field: label, before: b ?? null, after: a ?? null })
  }
  return changes
}

export function buildSnapshot(rec: ScalarRecord): RecordSnapshot {
  if (!rec) return {}
  return { title: rec.title, status: rec.status, points: rec.points }
}

// ─────────────── response ───────────────

export type AuditLogResponse = {
  id: string
  action: AuditAction
  recordId: string | null
  sdgId: number
  year: number
  actorId: string | null
  actorName: string
  actorRole: string
  changes: FieldChange[]
  snapshot: RecordSnapshot
  ipAddress: string | null
  userAgent: string | null
  reason: string | null
  createdAt: Date
}

export function toAuditLogResponse(a: UniversityRecordAudit): AuditLogResponse {
  return {
    id: a.id,
    action: a.action,
    recordId: a.recordId,
    sdgId: a.sdgId,
    year: a.year,
    actorId: a.actorId,
    actorName: a.actorName,
    actorRole: a.actorRole,
    changes: (a.changes as unknown as FieldChange[]) ?? [],
    snapshot: (a.snapshot as unknown as RecordSnapshot) ?? {},
    ipAddress: a.ipAddress,
    userAgent: a.userAgent,
    reason: a.reason,
    createdAt: a.createdAt
  }
}
