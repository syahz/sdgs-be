import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

/**
 * Limiter global — lindungi seluruh API dari flooding/abuse.
 * Longgar agar penggunaan normal (refresh token, polling data) tidak terblokir.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  // Default 300/menit/IP. Bisa dinaikkan via RATE_LIMIT_GLOBAL saat audit scan (mis. 100000),
  // tanpa perlu mengedit kode. Kembalikan/hapus env-nya setelah audit.
  limit: Number(process.env.RATE_LIMIT_GLOBAL ?? 300),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Terlalu banyak permintaan, coba lagi nanti.', code: 'RATE_LIMITED' }
})

/**
 * Limiter ketat khusus login — proteksi brute-force kredensial.
 * Hanya dipasang di POST /api/auth/login (bukan /refresh, agar rotasi token normal tidak kena).
 *
 * Key berbasis EMAIL (per-akun), bukan IP. Tanpa ini, beberapa user di balik IP yang sama
 * (NAT kampus, kantor, satu mesin) berbagi kuota — percobaan login user A bisa memblokir user B.
 * Fallback ke IP bila body.email tidak ada (request rusak / bukan JSON).
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  limit: 10, // 10 percobaan login / 15 menit / akun
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // login sukses tidak menghabiskan kuota
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : ''
    return email ? `login:${email}` : `login-ip:${ipKeyGenerator(req.ip ?? '')}`
  },
  message: { message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', code: 'LOGIN_RATE_LIMITED' }
})
