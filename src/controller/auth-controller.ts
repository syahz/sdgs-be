import { Request, Response, NextFunction } from 'express'
import {
  loginService,
  loginGoogleService,
  refreshService,
  recordActivityService,
  logoutService,
  getActiveSessionsService,
  revokeSessionService,
  forceLogoutAllService,
  clearAuthCookies
} from '../service/auth-service'
import { UserRequest } from '../type/user-request'

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

export const googleCallbackController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? null
    const ua = req.headers['user-agent'] ?? null
    const googleUser = (req as any).user
    const result = await loginGoogleService(googleUser, ip, ua, res)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
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
