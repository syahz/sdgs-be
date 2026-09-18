/**
 * Anonimisasi identitas peninjau terhadap admin unit kerja (unit_admin).
 *
 * Admin fakultas membaca catatan revisi dari validator. Menampilkan nama asli
 * di sana memicu gesekan antar-orang, jadi identitas peninjau diganti label
 * netral "Validator 1", "Validator 2", dst.
 *
 * Penomoran dilakukan DI BACKEND saat serialisasi, bukan disembunyikan di UI.
 * Kalau nama tetap dikirim lalu hanya tidak dirender, nama itu masih terbaca di
 * tab Network, `curl`, dan cache react-query — itu bukan perbaikan.
 *
 * Sifat nomor:
 *  - LOKAL PER SUBMISSION. Validator yang sama bisa jadi "Validator 1" di satu
 *    submission dan "Validator 2" di submission lain. Ini disengaja: nomor yang
 *    konsisten lintas submission justru bisa dikorelasikan untuk menebak siapa.
 *  - STABIL di dalam satu submission. Urutan ditentukan kemunculan pertama
 *    (createdAt, tie-break userId) atas GABUNGAN komentar + log, dan dihitung
 *    dari data lengkap submission — bukan dari subset yang sedang difilter —
 *    supaya nomor tidak bergeser antar halaman.
 *  - `id` peninjau ikut dialiaskan. UUID asli adalah korelator stabil lintas
 *    submission; membiarkannya lolos membuat penomoran sekadar kosmetik.
 */

export type ViewerRole = string | null | undefined

/** Hanya role ini yang identitasnya disembunyikan. Validator & super admin tetap melihat nama asli. */
export function shouldMaskReviewers(viewerRole: ViewerRole): boolean {
  return viewerRole === 'unit_admin'
}

type ActorLike = { id: string; name: string; role?: string } | null | undefined

interface CommentLike {
  userId: string
  createdAt: Date
  user?: ActorLike
}

interface LogLike {
  actorUserId: string | null
  createdAt: Date
  note?: string | null
  actor?: ActorLike
}

/**
 * Catatan yang ditulis otomatis oleh cron, bukan oleh manusia. Juga dipakai
 * rollback: catatan berprefix ini TIDAK boleh dikosongkan, karena tanpa teksnya
 * baris cron tak lagi dikenali sebagai "Sistem" dan ikut dinomori sbg validator.
 */
export const SYSTEM_NOTE_PREFIXES = ['Auto-approve akhir tahun', 'Auto-submit cutoff']

function isSystemLog(note: string | null | undefined): boolean {
  if (!note) return false
  return SYSTEM_NOTE_PREFIXES.some((p) => note.startsWith(p))
}

export interface ReviewerAliasMap {
  /** userId → label tampil ("Validator 1"). */
  label: Map<string, string>
  /** userId → id semu yang stabil di dalam submission ini saja. */
  alias: Map<string, string>
}

/**
 * Bangun peta alias dari SELURUH komentar + log satu submission.
 * Hanya aktor ber-role peninjau (validator/super_admin) yang dinomori — penulis
 * dari unit itu sendiri tetap tampil apa adanya, karena admin fakultas memang
 * sudah tahu siapa rekan satu unitnya.
 */
export function buildReviewerAliases(comments: CommentLike[], logs: LogLike[]): ReviewerAliasMap {
  const seen: { userId: string; at: number }[] = []

  const catat = (userId: string | null | undefined, role: string | undefined, at: Date) => {
    if (!userId) return
    if (role !== 'validator' && role !== 'super_admin') return
    const existing = seen.find((s) => s.userId === userId)
    const t = at.getTime()
    if (!existing) seen.push({ userId, at: t })
    else if (t < existing.at) existing.at = t
  }

  for (const c of comments) catat(c.userId, c.user?.role, c.createdAt)
  for (const l of logs) {
    if (isSystemLog(l.note)) continue // aksi cron, bukan orang — jangan ikut dinomori
    catat(l.actorUserId, l.actor?.role, l.createdAt)
  }

  seen.sort((a, b) => a.at - b.at || a.userId.localeCompare(b.userId))

  const label = new Map<string, string>()
  const alias = new Map<string, string>()
  seen.forEach((s, i) => {
    label.set(s.userId, `Validator ${i + 1}`)
    alias.set(s.userId, `reviewer-${i + 1}`)
  })
  return { label, alias }
}

/** Terapkan alias ke satu baris komentar. Bentuk field tidak berubah. */
export function maskComment<T extends CommentLike>(c: T, map: ReviewerAliasMap): T {
  const label = map.label.get(c.userId)
  if (!label) return c
  const aliasId = map.alias.get(c.userId)!
  return {
    ...c,
    userId: aliasId,
    user: { id: aliasId, name: label, role: c.user?.role ?? 'validator' }
  }
}

/** Terapkan alias ke satu baris log. Aksi cron diberi label "Sistem". */
export function maskLog<T extends LogLike>(l: T, map: ReviewerAliasMap): T {
  if (isSystemLog(l.note)) {
    return { ...l, actorUserId: 'system', actor: { id: 'system', name: 'Sistem', role: 'system' } }
  }
  const label = l.actorUserId ? map.label.get(l.actorUserId) : undefined
  if (!label) return l
  const aliasId = map.alias.get(l.actorUserId!)!
  return {
    ...l,
    actorUserId: aliasId,
    actor: { id: aliasId, name: label, role: l.actor?.role ?? 'validator' }
  }
}
