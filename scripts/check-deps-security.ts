/**
 * Cek dependensi yang versinya dipaksa lewat `overrides` di package.json.
 *
 * Override memaksa versi tambalan ke dalam paket yang mem-pin versi rentan.
 * Yang berisiko bukan celahnya, tapi PEMAKAINYA: kalau API paket tertambal itu
 * berubah, jalur yang memakainya bisa diam-diam rusak. Dua jalur di bawah ini
 * yang paling penting untuk tidak rusak: rate-limit login (anti brute-force)
 * dan sanitasi HTML.
 *
 *   npm run check:deps
 */
import assert from 'assert'
import express from 'express'
import type { AddressInfo } from 'net'
import sanitizeHtml from 'sanitize-html'
import { globalLimiter, loginLimiter } from '../src/middleware/rate-limit'

async function main() {
  // ── 1. express-rate-limit di atas ip-address yang ditambal ───────────────
  // ip-address dipakai express-rate-limit untuk menormalkan IP. Kalau
  // normalisasinya berubah/rusak, limiter login ikut rusak dan brute-force
  // password lolos tanpa suara.
  const app = express()
  app.set('trust proxy', 1)
  app.use(globalLimiter)
  app.use(express.json())
  app.post('/login', loginLimiter, (_req, res) => {
    res.status(401).json({ ok: false })
  })

  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo

  const post = (body: unknown) =>
    fetch(`http://127.0.0.1:${port}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })

  // Kunci = email: 10 percobaan lolos ke handler, ke-11 ditolak limiter.
  const statuses: number[] = []
  for (let i = 0; i < 11; i++) {
    statuses.push((await post({ email: 'a@ub.ac.id', password: 'x' })).status)
  }
  assert.deepStrictEqual(
    statuses,
    [...Array(10).fill(401), 429],
    `limiter per-email meleset: ${statuses.join(',')}`
  )

  // Akun lain tidak ikut terkunci — bukti kuncinya per-akun, bukan per-IP.
  assert.strictEqual(
    (await post({ email: 'b@ub.ac.id', password: 'x' })).status,
    401,
    'akun lain ikut terblokir — keyGenerator jatuh ke IP'
  )

  // Body tanpa email → fallback ipKeyGenerator, yaitu jalur ip-address itu
  // sendiri. Yang diuji: tidak melempar dan request tetap sampai ke handler.
  assert.strictEqual(
    (await post({ password: 'x' })).status,
    401,
    'fallback ipKeyGenerator melempar'
  )

  server.close()
  console.log('OK  express-rate-limit + ip-address (rate-limit login utuh)')

  // ── 2. sanitize-html di atas nanoid yang ditambal (lewat postcss) ────────
  assert.strictEqual(
    sanitizeHtml('<b>halo</b><script>alert(1)</script>', { allowedTags: ['b'] }),
    '<b>halo</b>',
    'sanitize-html tidak lagi membuang <script>'
  )
  console.log('OK  sanitize-html + nanoid (sanitasi utuh)')

  console.log('\nSEMUA CEK LULUS')
}

main().catch((e) => {
  console.error('GAGAL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
