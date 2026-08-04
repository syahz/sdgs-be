// Membuktikan aturan validasi tidak lebih ketat dari kenyataan.
// Jalankan: npx ts-node scripts/test-config-lint.ts
import assert from 'assert'
import { SdgConfigPayloadSchema } from '../src/validation/sdg-config-validation'
import { lintConfig } from '../src/service/config-lint'
import { THE_SDG_CONFIG_2026, QUANT_FORMULAS, QUAL_QUESTIONS, GROUP_TITLES } from '../src/config/the-sdg-config'
import type { SdgConfigPayload } from '../src/config/config-registry'

const payload = {
  schemaVersion: 1 as const,
  year: 2026,
  sdgs: THE_SDG_CONFIG_2026,
  quantFormulas: QUANT_FORMULAS,
  qualQuestions: QUAL_QUESTIONS,
  groupTitles: GROUP_TITLES,
}

let lulus = 0
const cek = (n: string, f: () => void) => { f(); lulus++; console.log(`  ok  ${n}`) }

console.log('Config 2026 yang berjalan sekarang harus LULUS aturannya sendiri:')

cek('lolos validasi struktur (Zod)', () => {
  const r = SdgConfigPayloadSchema.safeParse(JSON.parse(JSON.stringify(payload)))
  if (!r.success) {
    console.log('\n  Isu struktur:')
    for (const i of r.error.errors.slice(0, 10)) console.log('   -', i.path.join('.'), ':', i.message)
  }
  assert.ok(r.success, 'config yang berjalan ditolak skema sendiri — aturannya yang salah, bukan datanya')
})

cek('lolos pemeriksaan semantik tanpa satu pun error', () => {
  const { errors, warnings } = lintConfig(payload as unknown as SdgConfigPayload)
  if (errors.length) {
    console.log('\n  Error:')
    for (const e of errors.slice(0, 10)) console.log(`   - [${e.code}] ${e.path}: ${e.message}`)
  }
  console.log(`      (peringatan: ${warnings.length})`)
  assert.strictEqual(errors.length, 0)
})

console.log('\nAturan harus MENANGKAP kesalahan nyata:')

const rusak = (ubah: (p: any) => void) => {
  const p = JSON.parse(JSON.stringify(payload))
  ubah(p)
  return p
}

cek('salah ketik nama field ditolak (weigthInSdg)', () => {
  const p = rusak((p) => { const i = p.sdgs['1'].indicators[0]; i.weigthInSdg = i.weightInSdg; delete i.weightInSdg })
  assert.ok(!SdgConfigPayloadSchema.safeParse(p).success)
})

cek('kode indikator ganda ditolak', () => {
  const p = rusak((p) => { p.sdgs['1'].indicators.push({ ...p.sdgs['1'].indicators[0] }) })
  assert.ok(lintConfig(p).errors.some((e) => e.code === 'DUPLICATE_CODE'))
})

cek('mengganti id opsi "whole" memutus gate — tertangkap', () => {
  const p = rusak((p) => {
    for (const s of Object.values<any>(p.sdgs))
      for (const i of s.indicators)
        if (i.existenceScoring?.options)
          for (const o of i.existenceScoring.options) if (o.id === 'whole') o.id = 'semua'
  })
  const errs = lintConfig(p).errors.filter((e) => e.code === 'GATE_TARGET_INVALID')
  assert.ok(errs.length > 0, 'gate rusak tidak terdeteksi')
  console.log(`      (${errs.length} rasio kuantitatif akan berhenti dihitung)`)
})

cek('menghapus indikator yang dirujuk QS tertangkap', () => {
  const p = rusak((p) => { p.sdgs['17'].indicators = p.sdgs['17'].indicators.filter((i: any) => i.code !== '17.4.4') })
  assert.ok(lintConfig(p).errors.some((e) => e.code === 'QS_SOURCE_BROKEN'))
})

cek('formula menunjuk metric yang tidak ada tertangkap', () => {
  const p = rusak((p) => { p.quantFormulas['1.2.1'].numerator = 'salahKetik' })
  assert.ok(lintConfig(p).errors.some((e) => e.code === 'FORMULA_FIELD_MISSING'))
})

cek('bobot SDG tidak berjumlah 100 tertangkap', () => {
  const p = rusak((p) => { p.sdgs['1'].indicators[0].weightInSdg += 20 })
  assert.ok(lintConfig(p).errors.some((e) => e.code === 'WEIGHT_SUM'))
})

cek('nomor SDG tidak cocok kode indikator tertangkap', () => {
  const p = rusak((p) => { p.sdgs['1'].indicators[0].code = '9.9.9' })
  assert.ok(lintConfig(p).errors.some((e) => e.code === 'CODE_SDG_MISMATCH'))
})

console.log(`\n${lulus} pemeriksaan lulus.`)
