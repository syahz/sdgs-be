// Pindahkan config THE 2026 dari kode ke database.
// Jalankan: npx ts-node prisma/seed-sdg-config-2026.ts
//
// Idempoten: menjalankan ulang tidak menggandakan baris.
//
// Sumbernya adalah modul TypeScript yang sudah di-import, BUKAN JSON yang
// ditulis tangan. Dengan begitu yang terserialisasi adalah bentuk AKHIR config —
// sudah termasuk 17 indikator SDG 17 hasil `Array.from` dan `existenceScoring`
// yang ditempelkan loop saat modul dimuat. Menulis JSON manual akan melewatkan
// keduanya tanpa ada yang menyadari.
import { createHash } from 'crypto'
import { PrismaClient } from '@prisma/client'
import {
  THE_SDG_CONFIG_2026,
  QUANT_FORMULAS,
  QUAL_QUESTIONS,
  GROUP_TITLES,
} from '../src/config/the-sdg-config'
import type { SdgConfigPayload } from '../src/config/config-registry'

const prisma = new PrismaClient()
const YEAR = 2026

/** JSON dengan key tersortir — checksum harus stabil lintas proses. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`
}

async function main() {
  const payload: SdgConfigPayload = {
    schemaVersion: 1,
    year: YEAR,
    sdgs: THE_SDG_CONFIG_2026,
    quantFormulas: QUANT_FORMULAS,
    qualQuestions: QUAL_QUESTIONS,
    groupTitles: GROUP_TITLES,
  }

  // Bukti config benar-benar bisa diserialisasi tanpa kehilangan apa pun.
  const roundTrip = JSON.parse(JSON.stringify(payload)) as SdgConfigPayload
  const indAsli = Object.values(payload.sdgs).reduce((n, s) => n + s.indicators.length, 0)
  const indBalik = Object.values(roundTrip.sdgs).reduce((n, s) => n + s.indicators.length, 0)
  if (indAsli !== indBalik) {
    throw new Error(`Serialisasi kehilangan indikator: ${indAsli} → ${indBalik}. Seed dibatalkan.`)
  }

  const checksum = createHash('sha256').update(canonical(payload)).digest('hex')

  console.log(`Config THE ${YEAR}`)
  console.log(`  SDG           : ${Object.keys(payload.sdgs).length}`)
  console.log(`  indikator     : ${indAsli}`)
  console.log(`  formula kuant : ${Object.keys(payload.quantFormulas).length}`)
  console.log(`  ukuran JSON   : ${(JSON.stringify(payload).length / 1024).toFixed(1)} KB`)
  console.log(`  checksum      : ${checksum.slice(0, 16)}…`)

  const existing = await prisma.sdgConfigVersion.findFirst({
    where: { year: YEAR, status: 'active' },
  })

  if (existing) {
    if (existing.checksum === checksum) {
      console.log('\nSudah ada dan isinya identik — tidak ada yang diubah.')
      return
    }

    // Config aktif tahun ini BEDA dari config di kode. Jangan timpa diam-diam:
    // kalau tahun ini sudah punya submission, menimpanya bisa mengubah skor.
    // Pisahkan perubahan yang MEMENGARUHI SKOR dari yang cuma teks tampilan —
    // keduanya butuh keputusan yang berbeda beratnya.
    const lama = existing.payload as unknown as SdgConfigPayload
    const skorBerubah =
      canonical(lama.sdgs) !== canonical(payload.sdgs) ||
      canonical(lama.quantFormulas) !== canonical(payload.quantFormulas)
    const teksBerubah =
      canonical(lama.qualQuestions ?? {}) !== canonical(payload.qualQuestions) ||
      canonical(lama.groupTitles ?? {}) !== canonical(payload.groupTitles)

    console.log('\nTAHUN INI SUDAH PUNYA CONFIG AKTIF DENGAN ISI BERBEDA.')
    console.log(`  checksum database : ${existing.checksum.slice(0, 16)}…`)
    console.log(`  checksum kode     : ${checksum.slice(0, 16)}…`)
    console.log(`  indikator/bobot berubah : ${skorBerubah ? 'YA — SKOR BISA BERGESER' : 'tidak'}`)
    console.log(`  teks pertanyaan/judul   : ${teksBerubah ? 'ya' : 'tidak'}`)

    if (process.env.SEED_CONFIG_REPLACE !== '1') {
      console.log('\n  Seed TIDAK menimpa.')
      if (skorBerubah) {
        console.log('  Perubahan menyentuh indikator atau bobot. Jalankan `npm run check:drift`')
        console.log('  lebih dulu, backup, baru putuskan.')
      }
      console.log('  Kalau memang disengaja: SEED_CONFIG_REPLACE=1 npx ts-node prisma/seed-sdg-config-2026.ts')
      process.exitCode = 1
      return
    }

    // Diganti secara sadar: versi lama diarsipkan, tidak dihapus.
    await prisma.$transaction([
      prisma.sdgConfigVersion.update({
        where: { id: existing.id },
        data: { status: 'archived', archivedAt: new Date() },
      }),
      prisma.sdgConfigVersion.create({
        data: {
          year: YEAR,
          status: 'active',
          payload: payload as unknown as object,
          checksum,
          note: 'Diganti lewat seed (SEED_CONFIG_REPLACE=1)',
          sourceName: 'src/config/the-sdg-config.ts',
          createdByName: 'seed',
          activatedByName: 'seed',
          activatedAt: new Date(),
        },
      }),
    ])

    console.log('\nVersi lama diarsipkan, versi baru aktif.')
    return
  }

  await prisma.sdgConfigVersion.create({
    data: {
      year: YEAR,
      status: 'active',
      payload: payload as unknown as object,
      checksum,
      note: 'Migrasi awal dari konstanta TypeScript',
      sourceName: 'src/config/the-sdg-config.ts',
      createdByName: 'seed',
      activatedByName: 'seed',
      activatedAt: new Date(),
    },
  })

  console.log(`\nConfig ${YEAR} tersimpan di database sebagai versi aktif.`)
}

main()
  .catch((e) => {
    console.error('Seed gagal:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
