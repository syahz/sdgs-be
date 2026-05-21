import rateLimit from 'express-rate-limit'

/**
 * Limiter global — lindungi seluruh API dari flooding/abuse.
 * Longgar agar penggunaan normal (refresh token, polling data) tidak terblokir.
 */
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  limit: 300, // 300 request / menit / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Terlalu banyak permintaan, coba lagi nanti.', code: 'RATE_LIMITED' }
})

/**
 * Limiter ketat khusus login — proteksi brute-force kredensial.
 * Hanya dipasang di POST /api/auth/login (bukan /refresh, agar rotasi token normal tidak kena).
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  limit: 10, // 10 percobaan login / 15 menit / IP
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // login sukses tidak menghabiskan kuota
  message: { message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.', code: 'LOGIN_RATE_LIMITED' }
})
