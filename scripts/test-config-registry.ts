// Pemeriksaan registry config per tahun. Jalankan: npx ts-node scripts/test-config-registry.ts
import assert from 'assert'
import { resolveConfig, scoringContext, availableConfigYears } from '../src/config/config-registry'
import { THE_SDG_CONFIG_2026, QUANT_FORMULAS } from '../src/config/the-sdg-config'

let lulus = 0
function cek(nama: string, fn: () => void) {
  fn()
  lulus++
  console.log(`  ok  ${nama}`)
}

const jumlahIndikator = (sdgs: Record<number, { indicators: unknown[] }>) =>
  Object.values(sdgs).reduce((n, s) => n + s.indicators.length, 0)

console.log('Registry:')

cek('tahun yang terdaftar minimal 2026 dan urut menaik', () => {
  const years = availableConfigYears()
  assert.ok(years.includes(2026), `2026 tidak terdaftar: ${years}`)
  assert.deepStrictEqual(years, [...years].sort((a, b) => a - b))
})

cek('resolveConfig(2026) mengembalikan config 2026 utuh', () => {
  const b = resolveConfig(2026)
  assert.strictEqual(b.year, 2026)
  assert.strictEqual(Object.keys(b.sdgs).length, 17)
  assert.strictEqual(jumlahIndikator(b.sdgs), 262)
})

cek('resolveConfig(2026) mengembalikan objek yang SAMA dengan konstanta lama', () => {
  // Menjamin tidak ada penyalinan diam-diam yang bisa menggeser nilai.
  assert.strictEqual(resolveConfig(2026).sdgs, THE_SDG_CONFIG_2026)
  assert.strictEqual(resolveConfig(2026).quantFormulas, QUANT_FORMULAS)
})

cek('tahun lebih tua dari config paling awal memakai config paling awal', () => {
  // Data seed 2024 harus tetap terbaca, bukan melempar error.
  const b = resolveConfig(2024)
  assert.strictEqual(b.year, 2026)
  assert.strictEqual(jumlahIndikator(b.sdgs), 262)
})

cek('tahun masa depan mundur ke tahun terdekat yang lebih kecil', () => {
  // Ini yang menjaga 2027 tetap jalan sebelum config 2027 didaftarkan.
  const b = resolveConfig(2030)
  assert.strictEqual(b.year, 2026)
})

console.log('\nKonteks scoring:')

cek('scoringContext membawa SDG yang diminta beserta formula tahunnya', () => {
  const ctx = scoringContext(2026, 13)
  assert.ok(ctx, 'ctx null')
  assert.strictEqual(ctx!.sdg.number, 13)
  assert.ok(Object.keys(ctx!.quantFormulas).length > 0, 'quantFormulas kosong')
})

cek('SDG di luar 1-17 mengembalikan null, bukan melempar', () => {
  assert.strictEqual(scoringContext(2026, 99), null)
})

cek('semua SDG 1-17 punya konteks', () => {
  for (let i = 1; i <= 17; i++) {
    assert.ok(scoringContext(2026, i), `SDG ${i} tidak punya konteks`)
  }
})

console.log(`\n${lulus} pemeriksaan lulus.`)
