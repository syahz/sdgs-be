// Membuktikan config dibaca dari database SEKALI, lalu dilayani dari memori.
// Jalankan: npx ts-node scripts/test-config-cache.ts
//
// Ini menangkap regresi paling mungkin dari seluruh perubahan config:
// seseorang memindahkan pembacaan config ke dalam jalur per-pemanggilan,
// dan halaman dashboard yang mengagregasi puluhan submission berubah jadi
// puluhan query database.
import assert from 'assert'
import { prismaClient } from '../src/application/database'
import {
  loadConfigCache,
  resolveConfig,
  scoringContext,
  configDbLoadCount,
  availableConfigYears,
} from '../src/config/config-registry'

let lulus = 0
function cek(nama: string, fn: () => void) {
  fn()
  lulus++
  console.log(`  ok  ${nama}`)
}

async function main() {
  console.log('Sebelum dimuat — jaring pengaman config bawaan:')

  cek('resolveConfig jalan meski cache belum diisi', () => {
    const b = resolveConfig(2026)
    assert.strictEqual(b.source, 'bundled')
    assert.strictEqual(Object.values(b.sdgs).reduce((n, s) => n + s.indicators.length, 0), 262)
  })

  const sebelum = configDbLoadCount()
  const hasil = await loadConfigCache()
  console.log(`\nDimuat dari database: ${hasil.loaded} tahun (${hasil.years.join(', ') || '-'})`)

  cek('pemuatan menambah tepat satu pembacaan database', () => {
    assert.strictEqual(configDbLoadCount(), sebelum + 1)
  })

  cek('config 2026 kini berasal dari database, bukan kode', () => {
    assert.strictEqual(resolveConfig(2026).source, 'database')
  })

  cek('isi dari database utuh — 17 SDG, 262 indikator', () => {
    const b = resolveConfig(2026)
    assert.strictEqual(Object.keys(b.sdgs).length, 17)
    assert.strictEqual(Object.values(b.sdgs).reduce((n, s) => n + s.indicators.length, 0), 262)
    assert.ok(Object.keys(b.quantFormulas).length >= 25)
  })

  console.log('\nCache — inilah pemeriksaan intinya:')

  cek('1000 panggilan resolveConfig = NOL pembacaan database tambahan', () => {
    const patokan = configDbLoadCount()
    for (let i = 0; i < 1000; i++) resolveConfig(2026)
    assert.strictEqual(
      configDbLoadCount(),
      patokan,
      'resolveConfig menyentuh database — cache tidak bekerja'
    )
  })

  cek('1000 panggilan scoringContext juga nol pembacaan tambahan', () => {
    const patokan = configDbLoadCount()
    for (let i = 0; i < 1000; i++) scoringContext(2026, (i % 17) + 1)
    assert.strictEqual(configDbLoadCount(), patokan)
  })

  console.log('\nResolusi tahun:')

  cek('tahun tanpa config mundur ke tahun terdekat lebih kecil', () => {
    // Jangan patok tahun tertentu — daftar config berubah seiring admin
    // menambah kerangka baru. Yang diuji adalah ATURANNYA.
    const years = availableConfigYears()
    const jauh = Math.max(...years) + 5
    const b = resolveConfig(jauh)
    assert.strictEqual(b.year, Math.max(...years), `${jauh} seharusnya memakai config ${Math.max(...years)}`)
    assert.ok(!years.includes(jauh))
  })

  cek('tahun lebih tua dari config paling awal tetap terlayani', () => {
    const b = resolveConfig(2024)
    assert.ok(b.sdgs[1], 'SDG 1 tidak ada')
  })

  cek('daftar tahun mencakup yang dari database', () => {
    assert.ok(availableConfigYears().includes(2026))
  })

  console.log('\nWaktu:')
  const t = process.hrtime.bigint()
  for (let i = 0; i < 10000; i++) resolveConfig(2026)
  const ms = Number(process.hrtime.bigint() - t) / 1e6
  console.log(`  10.000 resolveConfig = ${ms.toFixed(1)} ms (${((ms / 10000) * 1000).toFixed(2)} µs per panggilan)`)

  console.log(`\n${lulus} pemeriksaan lulus.`)
}

main()
  .catch((e) => {
    console.error('GAGAL:', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prismaClient.$disconnect())
