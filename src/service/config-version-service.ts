import { createHash } from 'crypto'
import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { SdgConfigPayloadSchema } from '../validation/sdg-config-validation'
import { lintConfig, type ConfigIssue } from './config-lint'
import { buildConfigDiff, diffAffectsScoring, type ConfigDiff } from './config-diff'
import { assertDeletePin } from './settings-service'
import { resolveConfig, loadConfigCache, type SdgConfigPayload } from '../config/config-registry'
import { logger } from '../utils/logger'
import { canonicalJson } from '../utils/canonical-json'
import { logActivity } from './activity-log-service'

/**
 * Pengelolaan versi kerangka indikator THE oleh super admin.
 *
 * Alurnya dua langkah dan sengaja tidak digabung:
 *   1. unggah  → validasi + lint + diff, disimpan sebagai draft
 *   2. aktivasi → divalidasi ULANG di server, dicocokkan checksum, gerbang PIN
 *
 * Validasi diulang di langkah 2 karena diff yang dilihat admin bisa sudah basi
 * kalau ada draft lain masuk di antaranya. Checksum yang dikirim balik memastikan
 * yang diaktifkan benar-benar yang tadi dilihat.
 */

export function checksumOf(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex')
}

export interface VersionSummary {
  id: string
  year: number
  status: string
  checksum: string
  note: string | null
  sourceName: string | null
  createdByName: string
  createdAt: Date
  activatedByName: string | null
  activatedAt: Date | null
  indicatorCount: number
  /** Jumlah data tersimpan di tahun itu. > 0 = kerangkanya terkunci. */
  dataCount: number
  locked: boolean
}

function ringkas(row: {
  id: string
  year: number
  status: string
  checksum: string
  note: string | null
  sourceName: string | null
  createdByName: string
  createdAt: Date
  activatedByName: string | null
  activatedAt: Date | null
  payload: unknown
}): VersionSummary {
  const p = row.payload as SdgConfigPayload
  const n = Object.values(p?.sdgs ?? {}).reduce((a, s) => a + s.indicators.length, 0)
  return { ...row, payload: undefined, indicatorCount: n } as unknown as VersionSummary
}

/** Daftar versi, terbaru dulu, beserta status kunci tiap tahun. */
export const listConfigVersionsService = async (): Promise<VersionSummary[]> => {
  const rows = await prismaClient.sdgConfigVersion.findMany({
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
  })
  const tahun = [...new Set(rows.map((r) => r.year))]
  const hitung = new Map<number, number>()
  await Promise.all(tahun.map(async (y) => hitung.set(y, await tahunSudahBerdata(y))))
  return rows.map((r) => {
    const n = hitung.get(r.year) ?? 0
    return { ...ringkas(r), dataCount: n, locked: n > 0 }
  })
}

/**
 * Status tiap tahun untuk panduan admin: mana yang masih boleh diubah
 * kerangkanya, mana yang sudah terkunci karena ada data.
 *
 * Tanpa ini admin harus menebak — dan baru tahu tahunnya terkunci setelah
 * mengunggah berkas 180 KB dan ditolak.
 */
export const getConfigYearStatusService = async () => {
  const now = new Date().getFullYear()
  const rows = await prismaClient.sdgConfigVersion.findMany({
    select: { year: true, status: true },
  })
  const tahunConfig = new Set(rows.map((r) => r.year))
  // Rentang yang masuk akal: dari config paling awal sampai 2 tahun ke depan.
  const mulai = Math.min(now, ...(tahunConfig.size ? [...tahunConfig] : [now]))
  const daftar: number[] = []
  for (let y = mulai; y <= now + 2; y++) daftar.push(y)

  return Promise.all(
    daftar.map(async (year) => {
      const dataCount = await tahunSudahBerdata(year)
      return {
        year,
        dataCount,
        locked: dataCount > 0,
        hasActive: rows.some((r) => r.year === year && r.status === 'active'),
        hasDraft: rows.some((r) => r.year === year && r.status === 'draft'),
      }
    })
  )
}

/**
 * Buka kembali sebuah versi: hitung ulang validasi dan diff-nya.
 *
 * Draft yang diunggah lalu halamannya ditutup sebelumnya jadi tidak terjangkau —
 * tersimpan di database tapi tak ada cara melihat atau menghapusnya dari UI.
 */
export const getConfigVersionDetailService = async (id: string): Promise<DraftResult> => {
  const row = await prismaClient.sdgConfigVersion.findUnique({ where: { id } })
  if (!row) throw new ResponseError(404, 'Versi config tidak ditemukan', 'NOT_FOUND')

  const payload = row.payload as unknown as SdgConfigPayload
  const { errors, warnings } = lintConfig(payload)

  const dasar = resolveConfig(payload.year)
  const basePayload: SdgConfigPayload | null =
    Object.keys(dasar.sdgs).length > 0
      ? {
          schemaVersion: 1,
          year: dasar.year,
          sdgs: dasar.sdgs,
          quantFormulas: dasar.quantFormulas,
          qualQuestions: dasar.qualQuestions,
          groupTitles: dasar.groupTitles,
        }
      : null
  const diff = buildConfigDiff(basePayload, payload)

  return {
    id: row.id,
    year: row.year,
    checksum: row.checksum,
    issues: { errors, warnings },
    diff,
    affectsScoring: diffAffectsScoring(diff),
    indicatorCount: diff.counts.indicatorsAfter,
  }
}

/**
 * Template untuk diunduh admin sebagai titik awal.
 *
 * Ini yang membuat alur "unggah JSON" praktis: tidak ada yang akan mengetik 262
 * indikator dari nol. Admin mengunduh kerangka tahun berjalan, menyuntingnya,
 * lalu mengunggah balik — bentuk payloadnya otomatis selalu benar.
 */
export const getConfigTemplateService = async (year: number, targetYear?: number) => {
  const bundle = resolveConfig(year)
  if (Object.keys(bundle.sdgs).length === 0) {
    throw new ResponseError(404, `Tidak ada config untuk tahun ${year}`, 'NOT_FOUND')
  }
  const payload: SdgConfigPayload = {
    schemaVersion: 1,
    year: targetYear ?? year,
    sdgs: bundle.sdgs,
    quantFormulas: bundle.quantFormulas,
    qualQuestions: bundle.qualQuestions,
    groupTitles: bundle.groupTitles,
  }
  return { sourceYear: bundle.year, payload }
}

export interface DraftResult {
  id: string
  year: number
  checksum: string
  issues: { errors: ConfigIssue[]; warnings: ConfigIssue[] }
  diff: ConfigDiff
  affectsScoring: boolean
  indicatorCount: number
}

/** Apakah tahun ini sudah punya data — kalau ya, confignya beku. */
async function tahunSudahBerdata(year: number): Promise<number> {
  const [s, u] = await Promise.all([
    prismaClient.submission.count({ where: { year } }),
    prismaClient.universityRecord.count({ where: { year } }),
  ])
  return s + u
}

export const createConfigDraftService = async (
  body: { payload: unknown; note?: string; sourceName?: string },
  actor: { id: string; name: string }
): Promise<DraftResult> => {
  // 1. Struktur. Zod melempar ZodError → 400 VALIDATION_ERROR di error middleware.
  const payload = Validation.validate(SdgConfigPayloadSchema, body.payload) as unknown as SdgConfigPayload

  // 2. Semantik lintas-referensi.
  const { errors, warnings } = lintConfig(payload)
  if (errors.length > 0) {
    throw new ResponseError(400, 'Konfigurasi punya kesalahan yang harus diperbaiki', 'CONFIG_INVALID', errors)
  }

  // 3. Tahun yang sudah punya data tidak boleh diganti kerangkanya.
  const jumlahData = await tahunSudahBerdata(payload.year)
  if (jumlahData > 0) {
    throw new ResponseError(
      409,
      `Tahun ${payload.year} sudah punya ${jumlahData} data tersimpan — kerangkanya terkunci. Kerangka baru hanya boleh untuk tahun yang belum terisi.`,
      'CONFIG_YEAR_LOCKED'
    )
  }

  // 4. Diff terhadap config yang berlaku (tahun sama, atau tahun sebelumnya).
  const dasar = resolveConfig(payload.year)
  const basePayload: SdgConfigPayload | null =
    Object.keys(dasar.sdgs).length > 0
      ? {
          schemaVersion: 1,
          year: dasar.year,
          sdgs: dasar.sdgs,
          quantFormulas: dasar.quantFormulas,
          qualQuestions: dasar.qualQuestions,
          groupTitles: dasar.groupTitles,
        }
      : null
  const diff = buildConfigDiff(basePayload, payload)
  const checksum = checksumOf(payload)

  // Draft tahun yang sama ditimpa — tidak perlu menumpuk draft.
  await prismaClient.sdgConfigVersion.deleteMany({ where: { year: payload.year, status: 'draft' } })

  const row = await prismaClient.sdgConfigVersion.create({
    data: {
      year: payload.year,
      status: 'draft',
      payload: payload as unknown as object,
      checksum,
      note: body.note ?? null,
      sourceName: body.sourceName ?? null,
      createdByUserId: actor.id,
      createdByName: actor.name,
    },
  })

  await logActivity({
    category: 'settings',
    action: 'CONFIG_DRAFT_CREATED',
    description: `Mengunggah draft kerangka indikator THE ${payload.year}`,
    year: payload.year,
    targetId: row.id,
    metadata: {
      sourceName: body.sourceName ?? null,
      note: body.note ?? null,
      indicatorCount: diff.counts.indicatorsAfter,
      affectsScoring: diffAffectsScoring(diff),
      warnings: warnings.length,
    },
  })

  return {
    id: row.id,
    year: payload.year,
    checksum,
    issues: { errors, warnings },
    diff,
    affectsScoring: diffAffectsScoring(diff),
    indicatorCount: diff.counts.indicatorsAfter,
  }
}

export const activateConfigVersionService = async (
  id: string,
  body: { pin: string; checksum: string },
  actor: { name: string }
) => {
  const draft = await prismaClient.sdgConfigVersion.findUnique({ where: { id } })
  if (!draft) throw new ResponseError(404, 'Versi config tidak ditemukan', 'NOT_FOUND')
  if (draft.status !== 'draft') {
    throw new ResponseError(400, `Versi ini berstatus ${draft.status}, bukan draft`, 'BAD_REQUEST')
  }

  // Checksum yang dikirim balik = bukti admin mengaktifkan versi yang tadi ia
  // lihat diff-nya, bukan draft lain yang menyusup di antaranya.
  if (body.checksum !== draft.checksum) {
    throw new ResponseError(
      409,
      'Draft berubah sejak pratinjau terakhir. Muat ulang dan periksa kembali sebelum mengaktifkan.',
      'CONFIG_CHECKSUM_MISMATCH'
    )
  }

  // Validasi ULANG di server. Jangan pernah percaya hasil validasi yang dikirim client.
  const payload = Validation.validate(SdgConfigPayloadSchema, draft.payload) as unknown as SdgConfigPayload
  const { errors } = lintConfig(payload)
  if (errors.length > 0) {
    throw new ResponseError(400, 'Konfigurasi tidak lolos validasi ulang', 'CONFIG_INVALID', errors)
  }

  const jumlahData = await tahunSudahBerdata(payload.year)
  if (jumlahData > 0) {
    throw new ResponseError(
      409,
      `Tahun ${payload.year} sudah punya ${jumlahData} data tersimpan — kerangkanya terkunci.`,
      'CONFIG_YEAR_LOCKED'
    )
  }

  await assertDeletePin(body.pin)

  const aktifLama = await prismaClient.sdgConfigVersion.findFirst({
    where: { year: draft.year, status: 'active' },
  })

  await prismaClient.$transaction([
    ...(aktifLama
      ? [
          prismaClient.sdgConfigVersion.update({
            where: { id: aktifLama.id },
            data: { status: 'archived', archivedAt: new Date() },
          }),
        ]
      : []),
    prismaClient.sdgConfigVersion.update({
      where: { id: draft.id },
      data: { status: 'active', activatedByName: actor.name, activatedAt: new Date() },
    }),
  ])

  // Cache proses harus dimuat ulang, kalau tidak config lama masih dilayani.
  const { loaded, years } = await loadConfigCache()
  logger.info('Config diaktifkan', {
    action: 'CONFIG_ACTIVATED',
    year: draft.year,
    versionId: draft.id,
    actor: actor.name,
    cacheYears: years,
  })

  await logActivity({
    category: 'settings',
    action: 'CONFIG_ACTIVATED',
    description: `Mengaktifkan kerangka indikator THE ${draft.year}`,
    year: draft.year,
    targetId: draft.id,
    metadata: { archivedVersionId: aktifLama?.id ?? null, note: draft.note },
  })

  return { id: draft.id, year: draft.year, activatedAt: new Date(), cacheLoaded: loaded }
}

export const deleteConfigDraftService = async (id: string) => {
  const row = await prismaClient.sdgConfigVersion.findUnique({ where: { id } })
  if (!row) throw new ResponseError(404, 'Versi config tidak ditemukan', 'NOT_FOUND')
  if (row.status !== 'draft') {
    throw new ResponseError(400, 'Hanya draft yang bisa dihapus', 'BAD_REQUEST')
  }
  await prismaClient.sdgConfigVersion.delete({ where: { id } })
  await logActivity({
    category: 'settings',
    action: 'CONFIG_DRAFT_DELETED',
    description: `Menghapus draft kerangka indikator THE ${row.year}`,
    year: row.year,
    targetId: row.id,
  })
  return { message: 'Draft dihapus' }
}
