import { prismaClient } from '../application/database'
import { logger } from '../utils/logger'
import {
  THE_CONFIG_BY_YEAR,
  QUANT_FORMULAS_BY_YEAR,
  QUAL_QUESTIONS,
  type SdgConfig,
  type QuantFormula,
} from './the-sdg-config'

/**
 * Resolusi konfigurasi indikator THE per tahun.
 *
 * Sumber kebenaran: tabel `sdg_config_versions` (satu baris `active` per tahun).
 * Config TypeScript bawaan hanya jadi JARING PENGAMAN — dipakai bila tabelnya
 * belum berisi tahun yang diminta, sehingga sistem tetap berjalan persis
 * seperti sebelum migrasi meski seed belum dijalankan.
 *
 * ── Kenapa cache di memori bersifat WAJIB, bukan optimasi ──
 *
 * `resolveConfig` dipanggil dari dalam loop saat dashboard dan ranking
 * mengagregasi banyak submission. Kalau setiap panggilan menyentuh database,
 * satu halaman dashboard berubah jadi puluhan query. Karena itu fungsi ini
 * SINKRON terhadap cache; hanya `loadConfigCache()` yang menyentuh DB, dan itu
 * dipanggil sekali saat boot lalu setiap kali sebuah versi diaktifkan.
 *
 * Jumlah config sedikit (satu per tahun, ±143 KB), jadi seluruhnya dimuat
 * sekaligus. Tidak ada pemuatan malas per tahun — itu akan memaksa fungsi ini
 * jadi async dan menular ke seluruh jalur scoring.
 */

export interface YearBundle {
  /** Tahun config yang benar-benar dipakai — bisa lebih kecil dari yang diminta. */
  year: number
  sdgs: Record<number, SdgConfig>
  quantFormulas: Record<string, QuantFormula>
  qualQuestions: Record<string, string>
  groupTitles: Record<string, string>
  /** Dari mana config ini datang — untuk diagnosa, bukan logika. */
  source: 'database' | 'bundled'
}

/** Bentuk payload JSON yang disimpan di kolom `payload`. */
export interface SdgConfigPayload {
  schemaVersion: 1
  year: number
  sdgs: Record<number, SdgConfig>
  quantFormulas: Record<string, QuantFormula>
  qualQuestions: Record<string, string>
  groupTitles: Record<string, string>
}

/** Config bawaan kode — jaring pengaman saat tabel kosong. */
function bundledBundle(year: number): YearBundle {
  return {
    year,
    sdgs: THE_CONFIG_BY_YEAR[year],
    quantFormulas: QUANT_FORMULAS_BY_YEAR[year] ?? {},
    qualQuestions: QUAL_QUESTIONS,
    groupTitles: {},
    source: 'bundled',
  }
}

/** null = belum pernah dimuat; Map kosong = sudah dimuat tapi tabel kosong. */
let cache: Map<number, YearBundle> | null = null

/** Hitungan pemuatan dari DB — dipakai skrip pemeriksaan untuk membuktikan cache bekerja. */
let dbLoadCount = 0
export function configDbLoadCount(): number {
  return dbLoadCount
}

/**
 * Muat seluruh config aktif dari database ke memori.
 * Panggil sekali saat boot, dan lagi setiap kali sebuah versi diaktifkan.
 * Kegagalan TIDAK melempar — sistem jatuh ke config bawaan dan tetap melayani.
 */
export async function loadConfigCache(): Promise<{ loaded: number; years: number[] }> {
  try {
    const rows = await prismaClient.sdgConfigVersion.findMany({
      where: { status: 'active' },
      select: { year: true, payload: true },
      orderBy: { year: 'asc' },
    })
    dbLoadCount++

    const next = new Map<number, YearBundle>()
    for (const r of rows) {
      const p = r.payload as unknown as SdgConfigPayload
      if (!p || p.schemaVersion !== 1 || !p.sdgs) {
        logger.error('Config tahun dilewati — payload tidak dikenali', {
          action: 'CONFIG_PAYLOAD_INVALID',
          year: r.year,
        })
        continue
      }
      next.set(r.year, {
        year: r.year,
        sdgs: p.sdgs,
        quantFormulas: p.quantFormulas ?? {},
        qualQuestions: p.qualQuestions ?? {},
        groupTitles: p.groupTitles ?? {},
        source: 'database',
      })
    }

    cache = next
    return { loaded: next.size, years: [...next.keys()] }
  } catch (e) {
    // Database tak terjangkau saat boot bukan alasan untuk mati — config
    // bawaan sudah cukup untuk melayani tahun yang dikenal kode.
    logger.error('Gagal memuat config dari database, memakai config bawaan', {
      action: 'CONFIG_LOAD_FAILED',
      error: String(e),
    })
    cache = cache ?? new Map()
    return { loaded: 0, years: [] }
  }
}

/** Daftar tahun yang punya config, urut menaik. Gabungan database + bawaan. */
export function availableConfigYears(): number[] {
  const years = new Set<number>(Object.keys(THE_CONFIG_BY_YEAR).map(Number))
  if (cache) for (const y of cache.keys()) years.add(y)
  return [...years].sort((a, b) => a - b)
}

/**
 * Ambil config untuk sebuah tahun.
 *
 * Urutan: baris `active` tahun itu di DB → config bawaan tahun itu → tahun
 * terdekat yang LEBIH KECIL (data 2024 hasil seed harus tetap terbaca meski
 * config paling awal 2026) → tahun paling awal yang ada.
 */
export function resolveConfig(year: number): YearBundle {
  const fromDb = cache?.get(year)
  if (fromDb) return fromDb

  if (THE_CONFIG_BY_YEAR[year]) return bundledBundle(year)

  const years = availableConfigYears()
  if (years.length === 0) throw new Error('Tidak ada config THE yang terdaftar')

  const fallbackYear = [...years].reverse().find((y) => y < year) ?? years[0]
  const cached = cache?.get(fallbackYear)
  return cached ?? bundledBundle(fallbackYear)
}

/** Konteks scoring untuk satu SDG. `null` bila SDG itu tidak ada di config tahun tersebut. */
export function scoringContext(year: number, sdgNum: number) {
  const bundle = resolveConfig(year)
  const sdg = bundle.sdgs[sdgNum]
  if (!sdg) return null
  return { sdg, quantFormulas: bundle.quantFormulas }
}
