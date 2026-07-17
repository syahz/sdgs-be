import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { AuthValidation } from '../validation/auth-validation'
import { signAccessToken } from '../utils/jwt'
import { createSessionToken, hashToken } from '../utils/token'
import { LoginRequest, AuthResponse, toUserPublic } from '../model/auth-model'
import { REFRESH_TOKEN_EXPIRES_SECONDS, IDLE_TIMEOUT_SECONDS, COOKIE_DOMAIN, NODE_ENV } from '../config'
import { logger } from '../utils/logger'
import { auditAuth } from '../utils/audit-logger'

const REFRESH_EXPIRES = Number(REFRESH_TOKEN_EXPIRES_SECONDS ?? 60 * 60 * 24 * 30)
const MAX_SESSIONS = 5
/** Brute-force: gagal login berturut sebanyak ini → akun dikunci. */
const LOCK_THRESHOLD = 5
/** Durasi kunci otomatis (menit). Setelah lewat, login berikut auto-unlock. */
const LOCK_DURATION_MINUTES = 15
/** Idle window — sesi mati bila tak ada aktivitas user selama durasi ini (default 30 menit). */
const IDLE_TIMEOUT = Number(IDLE_TIMEOUT_SECONDS ?? 1800)

/** Tenggat idle baru: sekarang + IDLE_TIMEOUT. */
function idleDeadline(): Date {
  return new Date(Date.now() + IDLE_TIMEOUT * 1000)
}

function cookieOptions() {
  const base = {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: REFRESH_EXPIRES * 1000,
    path: '/'
  }
  return COOKIE_DOMAIN ? { ...base, domain: COOKIE_DOMAIN } : base
}

export function clearAuthCookies(res: Response) {
  // Atribut harus match saat set (secure + sameSite), kalau tidak Chrome modern
  // bisa abaikan Set-Cookie penghapus → cookie nyangkut. maxAge tidak perlu.
  const clearOpts = {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/'
  }
  const cookiesToClear = ['refresh_token']
  cookiesToClear.forEach((name) => {
    res.clearCookie(name, clearOpts)
    if (COOKIE_DOMAIN) res.clearCookie(name, { ...clearOpts, domain: COOKIE_DOMAIN })
  })
}

async function pruneAndEnforce(userId: string) {
  await prismaClient.refreshToken.deleteMany({
    where: { userId, OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }] }
  })

  const activeSessions = await prismaClient.refreshToken.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  })

  if (activeSessions.length >= MAX_SESSIONS) {
    const toRemove = activeSessions.slice(MAX_SESSIONS - 1).map((s) => s.id)
    await prismaClient.refreshToken.deleteMany({ where: { id: { in: toRemove } } })
  }
}

async function createSessionForUser(user: any, ipAddress: string | null, userAgent: string | null, res: Response): Promise<AuthResponse> {
  const accessToken = signAccessToken({ userId: user.id, role: user.role, orgUnitId: user.orgUnitId })

  const refreshPlain = createSessionToken()
  const tokenHash = hashToken(refreshPlain)
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES * 1000)
  const familyId = randomUUID()

  await prismaClient.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt, ipAddress, userAgent, familyId, idleExpiresAt: idleDeadline() }
  })

  res.cookie('refresh_token', refreshPlain, cookieOptions())

  return {
    accessToken,
    user: toUserPublic(user)
  }
}

export const loginService = async (request: LoginRequest, ipAddress: string | null, userAgent: string | null, res: Response): Promise<AuthResponse> => {
  const req = Validation.validate(AuthValidation.LOGIN, request)

  const user = await prismaClient.user.findUnique({
    where: { email: req.email },
    include: { orgUnit: true }
  })
  if (!user) {
    auditAuth({ action: 'LOGIN_FAILED', email: req.email, ip: ipAddress, userAgent, detail: 'unknown_email' })
    throw new ResponseError(401, 'Invalid email or password', 'INVALID_CREDENTIALS')
  }
  if (user.isLocked) {
    // Auto-unlock bila lockedUntil sudah lewat. lockedUntil null = lock manual, hanya super admin yang bisa buka.
    if (user.lockedUntil && user.lockedUntil <= new Date()) {
      await prismaClient.user.update({
        where: { id: user.id },
        data: { isLocked: false, failedLogins: 0, lockedUntil: null }
      })
      auditAuth({ action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: 'auto_unlocked' })
      user.isLocked = false
      user.failedLogins = 0
      user.lockedUntil = null
    } else {
      const detail = user.lockedUntil
        ? `account_locked (until ${user.lockedUntil.toISOString()})`
        : 'account_locked (manual)'
      auditAuth({ action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail })
      const minsLeft = user.lockedUntil
        ? Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000))
        : null
      const msg = minsLeft
        ? `Akun terkunci. Coba lagi dalam ${minsLeft} menit atau hubungi Super Admin.`
        : 'Akun terkunci. Hubungi Super Admin untuk membuka.'
      throw new ResponseError(403, msg, 'ACCOUNT_LOCKED')
    }
  }
  if (!user.password) {
    auditAuth({ action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: 'sso_only' })
    throw new ResponseError(401, 'This account uses SSO login only', 'SSO_ONLY')
  }

  const match = bcrypt.compareSync(req.password, user.password)
  if (!match) {
    const newFailed = user.failedLogins + 1
    const willLock = newFailed >= LOCK_THRESHOLD
    await prismaClient.user.update({
      where: { id: user.id },
      data: {
        failedLogins: newFailed,
        isLocked: willLock,
        lockedUntil: willLock ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60000) : null
      }
    })
    auditAuth({ action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: `wrong_password (attempt ${newFailed}${willLock ? ', locked' : ''})` })
    throw new ResponseError(401, 'Invalid email or password', 'INVALID_CREDENTIALS')
  }

  if (user.failedLogins > 0) {
    await prismaClient.user.update({ where: { id: user.id }, data: { failedLogins: 0 } })
  }

  // Cek status setelah password benar — user nonaktif tidak boleh punya sesi.
  // Tanpa ini login sukses tapi tiap request API kena 403 di authRequired → loading tak berujung di FE.
  if (user.status === 'inactive') {
    auditAuth({ action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: 'account_inactive' })
    throw new ResponseError(403, 'Akun Anda nonaktif. Hubungi Super Admin.', 'ACCOUNT_INACTIVE')
  }

  await pruneAndEnforce(user.id)
  const result = await createSessionForUser(user, ipAddress, userAgent, res)
  auditAuth({ action: 'LOGIN_SUCCESS', email: user.email, userId: user.id, ip: ipAddress, userAgent })
  return result
}

/**
 * Login via Keycloak (IAM Universitas). Identitas (email) sudah dibuktikan
 * Keycloak; di sini hanya cek apakah email terdaftar & aktif di sistem ini,
 * lalu terbitkan sesi milik sistem (cookie refresh_token + access token).
 * Tidak memakai sesi Keycloak sama sekali.
 *
 * Cookie pakai opsi default (sameSite=lax, host-only) — cukup karena FE & BE
 * same-site (sama-sama di bawah ub.ac.id), meski beda origin.
 */
export const loginKeycloakService = async (kcUser: { email?: string }, ipAddress: string | null, userAgent: string | null, res: Response): Promise<AuthResponse> => {
  if (!kcUser.email) {
    auditAuth({ action: 'LOGIN_FAILED', ip: ipAddress, userAgent, detail: 'keycloak_no_email' })
    throw new ResponseError(401, 'No email from Keycloak', 'UNAUTHORIZED')
  }

  const user = await prismaClient.user.findUnique({
    where: { email: kcUser.email },
    include: { orgUnit: true }
  })
  if (!user) {
    auditAuth({ action: 'LOGIN_FAILED', email: kcUser.email, ip: ipAddress, userAgent, detail: 'keycloak_unregistered' })
    throw new ResponseError(401, 'User not found', 'UNAUTHORIZED')
  }

  if (user.status === 'inactive') {
    auditAuth({ action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: 'account_inactive' })
    throw new ResponseError(403, 'Akun Anda nonaktif. Hubungi Super Admin.', 'ACCOUNT_INACTIVE')
  }

  await pruneAndEnforce(user.id)
  const result = await createSessionForUser(user, ipAddress, userAgent, res)
  auditAuth({ action: 'LOGIN_KEYCLOAK', email: user.email, userId: user.id, ip: ipAddress, userAgent })
  return result
}

export const refreshService = async (rt: string | undefined, ipAddress: string | null, res: Response): Promise<AuthResponse> => {
  if (!rt) {
    clearAuthCookies(res)
    throw new ResponseError(401, 'No refresh token', 'UNAUTHORIZED')
  }

  const tokenHash = hashToken(rt)
  const stored = await prismaClient.refreshToken.findUnique({ where: { tokenHash } })

  if (!stored) {
    clearAuthCookies(res)
    throw new ResponseError(401, 'Invalid refresh token', 'UNAUTHORIZED')
  }

  if (stored.expiresAt < new Date()) {
    await prismaClient.refreshToken.delete({ where: { id: stored.id } })
    clearAuthCookies(res)
    throw new ResponseError(401, 'Refresh token expired', 'UNAUTHORIZED')
  }

  if (stored.revoked) {
    logger.warn({ action: 'TOKEN_REUSE_DETECTED', userId: stored.userId, ipAddress })
    await prismaClient.refreshToken.deleteMany({ where: { userId: stored.userId } })
    clearAuthCookies(res)
    throw new ResponseError(401, 'Token reuse detected — all sessions revoked', 'UNAUTHORIZED')
  }

  // Idle gate — sesi mati bila user tak aktif > IDLE_TIMEOUT.
  // Refresh hanya MENG-ENFORCE batas idle, tidak menggesernya (lihat copy idleExpiresAt di bawah).
  if (stored.idleExpiresAt < new Date()) {
    if (stored.familyId) {
      await prismaClient.refreshToken.deleteMany({ where: { familyId: stored.familyId } })
    } else {
      await prismaClient.refreshToken.delete({ where: { id: stored.id } })
    }
    clearAuthCookies(res)
    throw new ResponseError(401, 'Session expired due to inactivity', 'SESSION_IDLE')
  }

  const user = await prismaClient.user.findUnique({
    where: { id: stored.userId },
    include: { orgUnit: true }
  })
  if (!user) throw new ResponseError(401, 'User not found', 'UNAUTHORIZED')

  const newPlain = createSessionToken()
  const newHash = hashToken(newPlain)
  const newExpires = new Date(Date.now() + REFRESH_EXPIRES * 1000)
  const inheritedFamilyId = stored.familyId || randomUUID()

  await prismaClient.$transaction(async (tx) => {
    const newToken = await tx.refreshToken.create({
      data: { userId: stored.userId, tokenHash: newHash, expiresAt: newExpires, ipAddress: ipAddress ?? stored.ipAddress, userAgent: stored.userAgent, lastUsedAt: new Date(), familyId: inheritedFamilyId, idleExpiresAt: stored.idleExpiresAt }
    })
    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true, replacedBy: newToken.id }
    })
  })

  await prismaClient.refreshToken.deleteMany({
    where: { userId: stored.userId, OR: [{ revoked: true, id: { not: stored.id } }, { expiresAt: { lt: new Date() } }] }
  })

  const accessToken = signAccessToken({ userId: user.id, role: user.role, orgUnitId: user.orgUnitId })

  res.clearCookie('refresh_token', { path: '/' })
  if (COOKIE_DOMAIN) res.clearCookie('refresh_token', { path: '/', domain: COOKIE_DOMAIN })
  res.cookie('refresh_token', newPlain, cookieOptions())

  return { accessToken, user: toUserPublic(user) }
}

export const logoutService = async (
  rt: string | undefined,
  res: Response,
  ipAddress: string | null = null,
  userAgent: string | null = null
): Promise<{ ok: boolean }> => {
  if (rt) {
    const tokenHash = hashToken(rt)
    const stored = await prismaClient.refreshToken.findUnique({ where: { tokenHash } })
    if (stored) {
      const u = await prismaClient.user.findUnique({
        where: { id: stored.userId },
        select: { email: true }
      })
      auditAuth({ action: 'LOGOUT', email: u?.email, userId: stored.userId, ip: ipAddress, userAgent })
      if (stored.familyId) {
        await prismaClient.refreshToken.deleteMany({ where: { familyId: stored.familyId } })
      } else {
        await prismaClient.refreshToken.delete({ where: { id: stored.id } })
      }
    }
  }
  clearAuthCookies(res)
  return { ok: true }
}

/**
 * Heartbeat aktivitas user — geser `idleExpiresAt` maju.
 * Dipanggil FE hanya saat ada aktivitas user nyata (throttled).
 * TIDAK merotasi token (beda dengan /auth/refresh) → tanpa transaksi, murah.
 */
export const recordActivityService = async (
  rt: string | undefined,
  res: Response
): Promise<{ ok: boolean; idleExpiresAt: string }> => {
  if (!rt) {
    clearAuthCookies(res)
    throw new ResponseError(401, 'No refresh token', 'UNAUTHORIZED')
  }

  const tokenHash = hashToken(rt)
  const stored = await prismaClient.refreshToken.findUnique({ where: { tokenHash } })

  if (!stored) {
    clearAuthCookies(res)
    throw new ResponseError(401, 'Invalid refresh token', 'UNAUTHORIZED')
  }

  if (stored.expiresAt < new Date()) {
    await prismaClient.refreshToken.delete({ where: { id: stored.id } })
    clearAuthCookies(res)
    throw new ResponseError(401, 'Refresh token expired', 'UNAUTHORIZED')
  }

  if (stored.revoked) {
    logger.warn({ action: 'TOKEN_REUSE_DETECTED', userId: stored.userId })
    await prismaClient.refreshToken.deleteMany({ where: { userId: stored.userId } })
    clearAuthCookies(res)
    throw new ResponseError(401, 'Token reuse detected — all sessions revoked', 'UNAUTHORIZED')
  }

  if (stored.idleExpiresAt < new Date()) {
    if (stored.familyId) {
      await prismaClient.refreshToken.deleteMany({ where: { familyId: stored.familyId } })
    } else {
      await prismaClient.refreshToken.delete({ where: { id: stored.id } })
    }
    clearAuthCookies(res)
    throw new ResponseError(401, 'Session expired due to inactivity', 'SESSION_IDLE')
  }

  const newIdle = idleDeadline()
  await prismaClient.refreshToken.update({
    where: { id: stored.id },
    data: { idleExpiresAt: newIdle, lastUsedAt: new Date() }
  })

  return { ok: true, idleExpiresAt: newIdle.toISOString() }
}

export const getActiveSessionsService = async (userId: string) => {
  return prismaClient.refreshToken.findMany({
    where: { userId, revoked: false, expiresAt: { gt: new Date() } },
    select: { id: true, ipAddress: true, userAgent: true, createdAt: true, lastUsedAt: true },
    orderBy: { lastUsedAt: 'desc' }
  })
}

export const revokeSessionService = async (userId: string, sessionId: string) => {
  const session = await prismaClient.refreshToken.findFirst({
    where: { id: sessionId, userId, revoked: false }
  })
  if (!session) throw new ResponseError(404, 'Session tidak ditemukan', 'NOT_FOUND')

  if (session.familyId) {
    await prismaClient.refreshToken.deleteMany({ where: { familyId: session.familyId } })
  } else {
    await prismaClient.refreshToken.delete({ where: { id: sessionId } })
  }
  return { ok: true }
}

export const forceLogoutAllService = async (userId: string) => {
  await prismaClient.refreshToken.deleteMany({ where: { userId } })
  return { ok: true }
}
