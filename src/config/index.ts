import { config } from 'dotenv'
import path from 'path'

// Path absolut relatif ke file ini (src/config atau dist/config → root BE),
// bukan process.cwd() — supaya restart pm2/systemd dengan cwd berbeda tetap baca .env.
config({ path: path.resolve(__dirname, '../../.env') })

if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL kosong di production — .env tidak terbaca. CORS akan menolak semua request.')
}

/**
 * Slash di ujung dibuang. CORS membandingkan origin PERSIS string-nya, dan
 * header `Origin` dari browser tidak pernah punya slash di ujung — jadi
 * `FRONTEND_URL=https://silaras.ub.ac.id/` menolak SEMUA XHR tanpa jejak error
 * di log BE. Gejalanya di FE: "Tidak dapat terhubung ke server".
 */
export const FRONTEND_URL = process.env.FRONTEND_URL?.replace(/\/+$/, '')

export const {
  PORT,
  LOG_DIR,
  NODE_ENV,
  ACCESS_TOKEN_SECRET,
  ACCESS_TOKEN_EXPIRES,
  REFRESH_TOKEN_SECRET,
  REFRESH_TOKEN_EXPIRES_SECONDS,
  IDLE_TIMEOUT_SECONDS,
  COOKIE_DOMAIN,
  // Keycloak (IAM Universitas) — OIDC Authorization Code + PKCE
  KEYCLOAK_ISSUER_URL,
  KEYCLOAK_CLIENT_ID,
  KEYCLOAK_CLIENT_SECRET,
  KEYCLOAK_REDIRECT_URI
} = process.env
