import { Request, Response, NextFunction } from 'express'
import {
  loginService,
  loginKeycloakService,
  refreshService,
  recordActivityService,
  logoutService,
  getActiveSessionsService,
  revokeSessionService,
  forceLogoutAllService,
  clearAuthCookies
} from '../service/auth-service'
import { UserRequest } from '../type/user-request'
import { ResponseError } from '../error/response-error'
import { FRONTEND_URL, NODE_ENV } from '../config'
import {
  keycloakEnabled,
  generateState,
  generatePkce,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchUserInfo
} from '../config/keycloak'

/** Cookie sementara penyimpan state + PKCE verifier selama round-trip Keycloak. */
const KC_OAUTH_COOKIE = 'kc_oauth'
const LOGIN_PATH = () => `${FRONTEND_URL ?? ''}/login`

export const loginController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? null
    const ua = req.headers['user-agent'] ?? null
    const result = await loginService(req.body, ip, ua, res)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

// ── Keycloak (IAM Universitas) — OIDC Authorization Code + PKCE ──────────
// Semua endpoint diakses lewat origin FE (proxy /api → BE) supaya cookie
// refresh_token jatuh di origin FE. redirect_uri yang di-whitelist di Keycloak
// = <URL_FE>/api/auth/keycloak/callback.

export const keycloakStartController = (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!keycloakEnabled) {
      return res.redirect(`${LOGIN_PATH()}?error=oauth_disabled`)
    }
    const state = generateState()
    const { verifier, challenge } = generatePkce()

    // Cookie state+verifier: dibaca lagi saat callback. sameSite=lax cukup —
    // callback datang sebagai navigasi top-level GET dari Keycloak.
    res.cookie(KC_OAUTH_COOKIE, JSON.stringify({ state, verifier }), {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/'
    })

    res.redirect(buildAuthorizeUrl(state, challenge))
  } catch (e) {
    next(e)
  }
}

export const keycloakCallbackController = async (req: Request, res: Response, next: NextFunction) => {
  const login = LOGIN_PATH()
  try {
    if (!keycloakEnabled) return res.redirect(`${login}?error=oauth_disabled`)

    const code = typeof req.query.code === 'string' ? req.query.code : undefined
    const state = typeof req.query.state === 'string' ? req.query.state : undefined
    const oauthError = req.query.error

    const raw = req.cookies?.[KC_OAUTH_COOKIE]
    res.clearCookie(KC_OAUTH_COOKIE, { path: '/' })

    if (oauthError || !code || !state || !raw) {
      return res.redirect(`${login}?error=oauth`)
    }

    let saved: { state?: string; verifier?: string }
    try {
      saved = JSON.parse(raw)
    } catch {
      return res.redirect(`${login}?error=oauth`)
    }
    // Cek state anti-CSRF.
    if (!saved.state || !saved.verifier || saved.state !== state) {
      return res.redirect(`${login}?error=oauth`)
    }

    const token = await exchangeCodeForToken(code, saved.verifier)
    const info = await fetchUserInfo(token.access_token)

    const ip = req.ip ?? req.socket.remoteAddress ?? null
    const ua = req.headers['user-agent'] ?? null

    // Terbitkan sesi sistem (set cookie refresh_token). FE akan /auth/refresh
    // saat mount untuk mengambil access token + user.
    await loginKeycloakService({ email: info.email }, ip, ua, res)
    return res.redirect(`${login}?oauth=success`)
  } catch (e) {
    // Email belum terdaftar → tampilkan peringatan di halaman login.
    if (e instanceof ResponseError && e.code === 'UNAUTHORIZED') {
      return res.redirect(`${login}?error=unregistered_email`)
    }
    if (e instanceof ResponseError && e.code === 'ACCOUNT_INACTIVE') {
      return res.redirect(`${login}?error=account_inactive`)
    }
    // Galat tak terduga (token exchange / jaringan) — jangan render JSON di
    // navigasi top-level; arahkan balik ke login dengan error generik.
    return res.redirect(`${login}?error=oauth`)
  }
}

export const refreshController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rt = req.cookies?.refresh_token
    const ip = req.ip ?? req.socket.remoteAddress ?? null
    const result = await refreshService(rt, ip, res)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const activityController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rt = req.cookies?.refresh_token
    const result = await recordActivityService(rt, res)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const logoutController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rt = req.cookies?.refresh_token
    const ip = req.ip ?? req.socket.remoteAddress ?? null
    const ua = req.headers['user-agent'] ?? null
    const result = await logoutService(rt, res, ip, ua)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getMeController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as UserRequest).user
    const { password: _, ...safeUser } = user as any
    res.status(200).json({ data: safeUser })
  } catch (e) {
    next(e)
  }
}

export const getActiveSessionsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const sessions = await getActiveSessionsService(currentUser.id)
    res.status(200).json({ data: sessions })
  } catch (e) {
    next(e)
  }
}

export const revokeSessionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const rawSessionId = req.params.sessionId
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId : rawSessionId[0]
    const result = await revokeSessionService(currentUser.id, sessionId)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const forceLogoutAllController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const result = await forceLogoutAllService(currentUser.id)
    clearAuthCookies(res)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
