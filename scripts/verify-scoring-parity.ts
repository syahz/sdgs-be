// Verifikasi skor tidak bergeser satu desimal pun setelah pindah ke config per tahun.
// Jalankan: npx ts-node scripts/verify-scoring-parity.ts
//
// Ini pemeriksaan paling penting dari seluruh perubahan config. `points` dibekukan
// sebagai angka di kolom submission, tapi setiap halaman rincian menghitung ulang.
// Selisih sekecil apa pun antara jalur lama dan jalur baru berarti angka di layar
// berbeda dari angka di ranking — tanpa satu pun pesan error.
//
// READ-ONLY: tidak menulis apa pun ke database.
import { PrismaClient } from '@prisma/client'
import { calcSdgEstimate } from '../src/config/sdg-scoring'
import { scoringContext, loadConfigCache, resolveConfig } from '../src/config/config-registry'
import { THE_SDG_CONFIG_2026, QUANT_FORMULAS } from '../src/config/the-sdg-config'
import { unwrapTheAnswers } from '../src/config/the-answer-key'

const prisma = new PrismaClient()

/** Jalur LAMA: selalu config 2026, apa pun tahun datanya. */
function skorLama(sdgId: number, theAnswers: unknown): number | null {
  const sdg = THE_SDG_CONFIG_2026[sdgId]
  if (!sdg) return null
  const decoded = unwrapTheAnswers(theAnswers as Record<string, any>)
  return calcSdgEstimate({ sdg, quantFormulas: QUANT_FORMULAS }, decoded as any)
}

/** Jalur BARU: config yang berlaku untuk tahun baris itu. */
function skorBaru(year: number, sdgId: number, theAnswers: unknown): number | null {
  const ctx = scoringContext(year, sdgId)
  if (!ctx) return null
  const decoded = unwrapTheAnswers(theAnswers as Record<string, any>)
  return calcSdgEstimate(ctx, decoded as any)
}

interface Selisih {
  sumber: string
  id: string
  year: number
  sdgId: number
  lama: number | null
  baru: number | null
  tersimpan: number
}

async function main() {
  // Muat config dari database supaya jalur "baru" benar-benar memakai payload
  // yang tersimpan, bukan konstanta di kode. Tanpa ini pemeriksaannya hanya
  // membandingkan kode dengan kode dan selalu lulus tanpa arti.
  const { loaded, years } = await loadConfigCache()
  console.log(
    loaded > 0
      ? `Config dari database: ${loaded} tahun (${years.join(', ')})`
      : 'Config database kosong — jalur baru memakai config bawaan kode'
  )
  console.log(`Sumber config 2026: ${resolveConfig(2026).source}\n`)

  const bedaJalur: Selisih[] = []
  const bedaTersimpan: Selisih[] = []
  let diperiksa = 0

  const submissions = await prisma.submission.findMany({
    select: { id: true, year: true, sdgId: true, theAnswers: true, points: true },
  })
  const records = await prisma.universityRecord.findMany({
    select: { id: true, year: true, sdgId: true, theAnswers: true, points: true },
  })

  const semua = [
    ...submissions.map((s) => ({ sumber: 'submission', ...s })),
    ...records.map((r) => ({ sumber: 'university_record', ...r })),
  ]

  for (const row of semua) {
    diperiksa++
    const lama = skorLama(row.sdgId, row.theAnswers)
    const baru = skorBaru(row.year, row.sdgId, row.theAnswers)
    const entri: Selisih = {
      sumber: row.sumber,
      id: row.id,
      year: row.year,
      sdgId: row.sdgId,
      lama,
      baru,
      tersimpan: row.points,
    }
    if (lama !== baru) bedaJalur.push(entri)
    // Selisih terhadap angka tersimpan bisa wajar (jawaban berubah setelah approve),
    // jadi dilaporkan terpisah sebagai informasi, bukan kegagalan.
    else if (baru !== null && Math.abs(baru - row.points) > 0.001) bedaTersimpan.push(entri)
  }

  console.log(`Diperiksa: ${diperiksa} baris (${submissions.length} submission, ${records.length} university record)`)

  if (semua.length === 0) {
    console.log('\nDatabase kosong — tidak ada yang bisa dibandingkan.')
    console.log('Jalankan lagi setelah ada data untuk hasil yang berarti.')
    return
  }

  console.log(`\nSelisih jalur lama vs baru : ${bedaJalur.length}`)
  for (const d of bedaJalur.slice(0, 20)) {
    console.log(`  ${d.sumber} ${d.id} | ${d.year} SDG${d.sdgId} | lama=${d.lama} baru=${d.baru}`)
  }
  if (bedaJalur.length > 20) console.log(`  ... dan ${bedaJalur.length - 20} lagi`)

  console.log(`\nBerbeda dari points tersimpan (informasi saja): ${bedaTersimpan.length}`)
  for (const d of bedaTersimpan.slice(0, 10)) {
    console.log(`  ${d.sumber} ${d.id} | ${d.year} SDG${d.sdgId} | hitung=${d.baru} tersimpan=${d.tersimpan}`)
  }

  if (bedaJalur.length > 0) {
    console.log('\nGAGAL: ada selisih antara jalur lama dan jalur baru. Jangan deploy.')
    process.exitCode = 1
  } else {
    console.log('\nLULUS: skor identik di kedua jalur.')
  }
}

main()
  .catch((e) => {
    console.error('Gagal menjalankan verifikasi:', e instanceof Error ? e.message : e)
    console.error('Pastikan DATABASE_URL benar dan database bisa dijangkau.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
