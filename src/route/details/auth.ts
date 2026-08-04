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

const router = Router()

// Public (kredensial = cookie refresh_token)
router.post('/login', loginLimiter, loginController)
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
