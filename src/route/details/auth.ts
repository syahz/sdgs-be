import { Router } from 'express'
import passport from 'passport'
import {
  loginController,
  googleCallbackController,
  refreshController,
  activityController,
  logoutController,
  getMeController,
  getActiveSessionsController,
  revokeSessionController,
  forceLogoutAllController
} from '../../controller/auth-controller'
import { authRequired } from '../../middleware/auth-middleware'
import { FRONTEND_URL } from '../../config'

const router = Router()

// Public (kredensial = cookie refresh_token)
router.post('/login', loginController)
router.post('/refresh', refreshController)
router.post('/activity', activityController)
router.delete('/logout', logoutController)

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }))
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL ?? ''}/login?error=oauth` }),
  googleCallbackController
)

// Protected
router.get('/me', authRequired, getMeController)
router.get('/sessions', authRequired, getActiveSessionsController)
router.delete('/sessions', authRequired, forceLogoutAllController)
router.delete('/sessions/:id', authRequired, revokeSessionController)

export default router
