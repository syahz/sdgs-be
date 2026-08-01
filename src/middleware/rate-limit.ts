import rateLimit from 'express-rate-limit'

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

// ponytail: loginLimiter dihapus bersama login email+password. Brute-force
// kredensial sekarang urusan Keycloak — sistem ini tidak pernah menerima password.
