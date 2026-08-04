// Periksa apakah `points` yang tersimpan masih cocok dengan hasil hitung ulang
// jawaban yang ada sekarang. Jalankan: npx ts-node scripts/check-points-drift.ts
//
// READ-ONLY — tidak menulis apa pun.
//
// Kenapa bisa tidak cocok: `points` dibekukan sebagai angka saat data ditulis,
// sementara setiap halaman rincian menghitung ulang dari jawaban. Kalau ENGINE
// SCORING berubah setelah angka itu dibekukan, keduanya berselisih tanpa satu
// pun pesan error — ranking memakai angka lama, rincian memakai aturan baru.
//
// Perubahan engine yang sudah pernah terjadi di repo ini:
//   06b5fe9  ubah logika penilaian backend
//   2641326  indikator QUANTITATIVE berhenti menyumbang bobot; existence
//            scoring bertingkat (parsial) menggantikan ya/tidak penuh
import { PrismaClient } from '@prisma/client'
import { calcSdgEstimate } from '../src/config/sdg-scoring'
import { scoringContext } from '../src/config/config-registry'
import { unwrapTheAnswers } from '../src/config/the-answer-key'

const prisma = new PrismaClient()

function hitung(year: number, sdgId: number, theAnswers: unknown): number | null {
  const ctx = scoringContext(year, sdgId)
  if (!ctx) return null
  return calcSdgEstimate(ctx, unwrapTheAnswers(theAnswers as Record<string, any>) as any)
}

async function main() {
  const subs = await prisma.submission.findMany({
    select: { id: true, year: true, sdgId: true, status: true, points: true, theAnswers: true, updatedAt: true },
    orderBy: [{ year: 'asc' }, { sdgId: 'asc' }],
  })
  const recs = await prisma.universityRecord.findMany({
    select: { id: true, year: true, sdgId: true, status: true, points: true, theAnswers: true, updatedAt: true },
    orderBy: [{ year: 'asc' }, { sdgId: 'asc' }],
  })

  const baris = [
    ...subs.map((s) => ({ jenis: 'submission', ...s })),
    ...recs.map((r) => ({ jenis: 'univ_record', ...r })),
  ]

  const drift = baris
    .map((b) => ({ ...b, baru: hitung(b.year, b.sdgId, b.theAnswers) }))
    .filter((b) => b.baru !== null && Math.abs(b.baru - b.points) > 0.001)

  console.log(`Diperiksa ${baris.length} baris (${subs.length} submission, ${recs.length} university record)`)

  if (drift.length === 0) {
    console.log('\nSemua points tersimpan cocok dengan hitung ulang.')
    return
  }

  console.log(`\n${drift.length} baris berselisih:\n`)
  console.log('jenis        tahun sdg status      tersimpan  hitung-ulang  selisih   diubah')
  for (const d of drift) {
    const sel = (d.baru! - d.points).toFixed(2).padStart(8)
    console.log(
      `${d.jenis.padEnd(12)} ${String(d.year).padEnd(5)} ${String(d.sdgId).padEnd(3)} ${d.status.padEnd(11)} ` +
        `${d.points.toFixed(2).padStart(9)}  ${d.baru!.toFixed(2).padStart(12)}  ${sel}  ${d.updatedAt.toISOString().slice(0, 10)}`
    )
  }

  console.log(`
Selisih BUKAN berarti data rusak — jawabannya utuh. Yang usang adalah angka
beku di kolom points. Dua pilihan:
  1. Biarkan: ranking memakai angka era lama, rincian memakai aturan sekarang.
     Kedua angka akan terus berbeda di layar untuk baris yang sama.
  2. Hitung ulang sekali dan simpan, supaya keduanya kembali sepakat.
     Ini MENGUBAH skor historis — putuskan sadar-sadar, backup dulu.`)
}

main()
  .catch((e) => {
    console.error('Gagal:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
