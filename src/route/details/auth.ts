import { Router } from 'express'
import {
  loginController,
  keycloakStartController,
  keycloakCallbackController,
  refreshController,
  activityController,
  logoutController,
  getMeController,
  getActiveSessionsController,
  revokeSessionController,
  forceLogoutAllController
} from '../../controller/auth-controller'
import { authRequired } from '../../middleware/auth-middleware'
import { loginLimiter } from '../../middleware/rate-limit'
import { passwordLoginEnabled } from '../../config'
import { ResponseError } from '../../error/response-error'

const router = Router()

// Public (kredensial = cookie refresh_token)
//
// LOGIN EMAIL+PASSWORD dikendalikan env `PASSWORD_LOGIN_ENABLED` (default OFF,
// permintaan klien) — masuk hanya lewat IAM Universitas di /keycloak.
// `loginController` + `loginService` + `loginLimiter` tetap utuh; menyalakan =
// set PASSWORD_LOGIN_ENABLED=true di .env lalu restart BE.
//
// Saat OFF, path tetap didaftarkan tapi menolak dengan pesan yang jelas. Kalau
// dibiarkan 404, FE yang flag-nya terlanjur ON hanya melihat "Login gagal"
// generik dan tidak ada petunjuk bahwa saklar BE-nya yang belum dibuka.
if (passwordLoginEnabled) {
  router.post('/login', loginLimiter, loginController)
} else {
  router.post('/login', (_req, _res, next) =>
    next(
      new ResponseError(
        403,
        'Login email & password dinonaktifkan. Gunakan tombol "Masuk dengan Akun UB".',
        'PASSWORD_LOGIN_DISABLED'
      )
    )
  )
}
router.post('/refresh', refreshController)
router.post('/activity', activityController)
router.delete('/logout', logoutController)

// Keycloak (IAM Universitas) — jalur login kedua. Alur OIDC dijalankan manual
// (tanpa passport).
router.get('/keycloak', keycloakStartController)
router.get('/keycloak/callback', keycloakCallbackController)

// Protected
router.get('/me', authRequired, getMeController)
router.get('/sessions', authRequired, getActiveSessionsController)
router.delete('/sessions', authRequired, forceLogoutAllController)
router.delete('/sessions/:id', authRequired, revokeSessionController)

export default router
