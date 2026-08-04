// Pemeriksaan penomoran alias peninjau. Jalankan: npx ts-node scripts/test-reviewer-alias.ts
import assert from 'assert'
import { buildReviewerAliases, maskComment, maskLog, shouldMaskReviewers } from '../src/model/reviewer-alias'

let lulus = 0
function cek(nama: string, fn: () => void) {
  fn()
  lulus++
  console.log(`  ok  ${nama}`)
}

const t = (menit: number) => new Date(2026, 0, 1, 0, menit)
const VAL_A = 'uuid-validator-a'
const VAL_B = 'uuid-validator-b'
const UNIT = 'uuid-unit-admin'

const comments = [
  { userId: VAL_B, createdAt: t(10), user: { id: VAL_B, name: 'Budi Santoso', role: 'validator' } },
  { userId: VAL_A, createdAt: t(5), user: { id: VAL_A, name: 'Ani Wijaya', role: 'validator' } },
  { userId: UNIT, createdAt: t(1), user: { id: UNIT, name: 'Citra Dewi', role: 'unit_admin' } }
]
const logs = [
  { actorUserId: UNIT, createdAt: t(0), note: null, actor: { id: UNIT, name: 'Citra Dewi', role: 'unit_admin' } },
  { actorUserId: VAL_A, createdAt: t(6), note: 'revisi', actor: { id: VAL_A, name: 'Ani Wijaya', role: 'validator' } },
  {
    actorUserId: VAL_B,
    createdAt: t(99),
    note: 'Auto-approve akhir tahun (cron 24 Des) — belum divalidasi sebelum tahun berganti',
    actor: { id: VAL_B, name: 'Budi Santoso', role: 'super_admin' }
  }
]

console.log('Penomoran:')

cek('nomor mengikuti kemunculan pertama, bukan urutan array', () => {
  const m = buildReviewerAliases(comments, logs)
  assert.strictEqual(m.label.get(VAL_A), 'Validator 1') // menit 5
  assert.strictEqual(m.label.get(VAL_B), 'Validator 2') // menit 10
})

cek('aktor unit_admin tidak ikut dinomori', () => {
  const m = buildReviewerAliases(comments, logs)
  assert.strictEqual(m.label.get(UNIT), undefined)
})

cek('log aksi cron tidak menghabiskan nomor validator', () => {
  // VAL_B hanya muncul di log auto-approve → tanpa komentar, tidak dapat nomor.
  const m = buildReviewerAliases([], [logs[2]])
  assert.strictEqual(m.label.size, 0)
})

cek('nomor identik untuk komentar dan log dalam satu submission', () => {
  const m = buildReviewerAliases(comments, logs)
  const c = maskComment(comments[1], m)
  const l = maskLog(logs[1], m)
  assert.strictEqual(c.user!.name, 'Validator 1')
  assert.strictEqual(l.actor!.name, 'Validator 1')
})

console.log('\nMasking:')

cek('nama asli hilang dan UUID ikut dialiaskan', () => {
  const m = buildReviewerAliases(comments, logs)
  const out = JSON.stringify(comments.map((c) => maskComment(c, m)))
  assert.ok(!out.includes('Ani Wijaya'), 'nama validator masih ada')
  assert.ok(!out.includes('Budi Santoso'), 'nama validator masih ada')
  assert.ok(!out.includes(VAL_A), 'UUID validator masih ada — korelator lintas submission')
  assert.ok(!out.includes(VAL_B), 'UUID validator masih ada')
})

cek('penulis dari unit sendiri tidak diubah', () => {
  const m = buildReviewerAliases(comments, logs)
  const out = maskComment(comments[2], m)
  assert.strictEqual(out.user!.name, 'Citra Dewi')
  assert.strictEqual(out.userId, UNIT)
})

cek('role dipertahankan — FE memfilter dengannya', () => {
  const m = buildReviewerAliases(comments, logs)
  assert.strictEqual(maskComment(comments[0], m).user!.role, 'validator')
})

cek('aksi cron diberi label Sistem, bukan nomor validator', () => {
  const m = buildReviewerAliases(comments, logs)
  const out = maskLog(logs[2], m)
  assert.strictEqual(out.actor!.name, 'Sistem')
  assert.ok(!JSON.stringify(out).includes('Budi Santoso'))
})

console.log('\nGate role penonton:')

cek('hanya unit_admin yang dimask', () => {
  assert.strictEqual(shouldMaskReviewers('unit_admin'), true)
  assert.strictEqual(shouldMaskReviewers('validator'), false)
  assert.strictEqual(shouldMaskReviewers('super_admin'), false)
  assert.strictEqual(shouldMaskReviewers('pimpinan'), false)
})

console.log('\nStabilitas:')

cek('nomor tidak bergeser saat daftar difilter', () => {
  const penuh = buildReviewerAliases(comments, logs)
  // Peta dibangun dari data lengkap, lalu dipakai untuk subset apa pun.
  const subset = [comments[0]]
  assert.strictEqual(maskComment(subset[0], penuh).user!.name, 'Validator 2')
})

console.log(`\n${lulus} pemeriksaan lulus.`)
