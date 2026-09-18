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
import { auditAuth, AuthAuditEntry } from '../utils/audit-logger'
import { logActivity } from './activity-log-service'

const REFRESH_EXPIRES = Number(REFRESH_TOKEN_EXPIRES_SECONDS ?? 60 * 60 * 24 * 30)
const MAX_SESSIONS = 5
/** Brute-force: gagal login berturut sebanyak ini → akun dikunci. */
const LOCK_THRESHOLD = 5
/** Durasi kunci otomatis (menit). Setelah lewat, login berikut auto-unlock. */
const LOCK_DURATION_MINUTES = 15
/** Idle window — sesi mati bila tak ada aktivitas user selama durasi ini (default 30 menit). */
const IDLE_TIMEOUT = Number(IDLE_TIMEOUT_SECONDS ?? 1800)

/**
 * SATU pesan untuk SEMUA kegagalan kredensial: email tak dikenal, password salah,
 * dan akun yang hanya punya jalur SSO. Ketiganya juga memakai status dan `code`
 * yang sama, jadi response-nya tidak bisa dibedakan.
 *
 * Kenapa: pesan yang berbeda mengubah form login jadi alat enumerasi. "Akun ini
 * belum punya password" memberi tahu penyerang bahwa email itu terdaftar DAN
 * bahwa akun itu SSO-only — persis daftar target untuk phishing halaman login UB
 * palsu, karena korbannya sudah pasti terbiasa masuk lewat SSO.
 *
 * Petunjuk SSO tetap ada, tapi TANPA SYARAT — ditampilkan untuk setiap kegagalan
 * kredensial. Karena tidak bergantung pada keadaan akun, kehadirannya tidak
 * menyimpulkan apa pun. Pembedaan sebenarnya hanya hidup di log audit
 * (`unknown_email` / `wrong_password` / `sso_only`).
 */
const CREDENTIAL_ERROR =
  'Email atau password salah. Bila akun Anda terdaftar lewat Akun UB, gunakan tombol "Masuk dengan Akun UB".'

/**
 * Hash pembanding untuk request yang tidak punya password asli untuk dicek.
 * Tanpa ini, email tak dikenal dan akun SSO-only membalas jauh lebih cepat
 * daripada password salah (bcrypt dilewati) — selisih waktu itu sendiri sudah
 * cukup untuk enumerasi, meski pesannya sudah diseragamkan.
 */
const TIMING_DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', 10)

type AuthActor = { id: string; name: string; role: string; email: string }

/**
 * Jejak autentikasi ke DUA tempat: file audit harian (seperti sebelumnya) dan
 * activity log DB yang tampil di panel super admin. Tulisan DB sengaja tidak
 * ditunggu supaya alur login tidak melambat — logActivity menelan error-nya sendiri.
 *
 * `user` null = tidak ada akun yang cocok (email tak terdaftar); email yang
 * dicoba dicatat sebagai pelaku "guest".
 */
function trackAuth(entry: AuthAuditEntry, user: AuthActor | null, description: string): void {
  auditAuth(entry)
  void logActivity({
    category: 'auth',
    action: entry.action === 'LOGOUT' ? 'LOGOUT' : entry.action === 'LOGIN_FAILED' ? 'LOGIN_FAILED' : 'LOGIN',
    description,
    actor: user
      ? { id: user.id, name: user.name, role: user.role, email: user.email }
      : { id: null, name: entry.email ?? 'Tidak dikenal', role: 'guest', email: entry.email ?? null },
    ip: entry.ip ?? null,
    userAgent: entry.userAgent ?? null,
    metadata: {
      ...(entry.action === 'LOGIN_SUCCESS' ? { method: 'password' } : {}),
      ...(entry.action === 'LOGIN_KEYCLOAK' ? { method: 'sso' } : {}),
      ...(entry.detail ? { reason: entry.detail } : {})
    }
  })
}

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

/**
 * Gate kunci akun — dipakai jalur password MAUPUN SSO.
 * Auto-unlock bila `lockedUntil` sudah lewat; kalau masih terkunci, lempar 403.
 * Memutasi `user` di tempat supaya pemanggil melihat status terbaru.
 *
 * Wajib ada di jalur SSO juga: tanpa ini tombol "Kunci akun" di panel super admin
 * hanya memblokir login password, sementara pintu SSO tetap terbuka.
 */
async function enforceLockGate(
  user: AuthActor & { isLocked: boolean; failedLogins: number; lockedUntil: Date | null },
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  if (!user.isLocked) return

  // lockedUntil null = lock manual, hanya super admin yang bisa buka.
  if (user.lockedUntil && user.lockedUntil <= new Date()) {
    await prismaClient.user.update({
      where: { id: user.id },
      data: { isLocked: false, failedLogins: 0, lockedUntil: null }
    })
    // Hanya file audit: bukan kegagalan, hasil login sesudahnya dicatat terpisah.
    auditAuth({ action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: 'auto_unlocked' })
    user.isLocked = false
    user.failedLogins = 0
    user.lockedUntil = null
    return
  }

  const detail = user.lockedUntil
    ? `account_locked (until ${user.lockedUntil.toISOString()})`
    : 'account_locked (manual)'
  trackAuth(
    { action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail },
    user,
    'Login gagal — akun terkunci'
  )

  const minsLeft = user.lockedUntil
    ? Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000))
    : null
  throw new ResponseError(
    403,
    minsLeft
      ? `Akun terkunci. Coba lagi dalam ${minsLeft} menit atau hubungi Super Admin.`
      : 'Akun terkunci. Hubungi Super Admin untuk membuka.',
    'ACCOUNT_LOCKED'
  )
}

/**
 * Login manual email + password. Berdampingan dengan SSO: akun yang belum pernah
 * diberi password lokal (`password` null) ditolak di sini dan harus lewat SSO.
 */
export const loginService = async (request: LoginRequest, ipAddress: string | null, userAgent: string | null, res: Response): Promise<AuthResponse> => {
  const req = Validation.validate(AuthValidation.LOGIN, request)

  const user = await prismaClient.user.findUnique({
    where: { email: req.email },
    include: { orgUnit: true }
  })
  if (!user) {
    bcrypt.compareSync(req.password, TIMING_DUMMY_HASH)
    trackAuth(
      { action: 'LOGIN_FAILED', email: req.email, ip: ipAddress, userAgent, detail: 'unknown_email' },
      null,
      'Login gagal — email tidak terdaftar'
    )
    throw new ResponseError(401, CREDENTIAL_ERROR, 'INVALID_CREDENTIALS')
  }
  await enforceLockGate(user, ipAddress, userAgent)

  if (!user.password) {
    bcrypt.compareSync(req.password, TIMING_DUMMY_HASH)
    trackAuth(
      { action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: 'sso_only' },
      user,
      'Login gagal — akun ini hanya bisa masuk lewat SSO'
    )
    throw new ResponseError(401, CREDENTIAL_ERROR, 'INVALID_CREDENTIALS')
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
    trackAuth(
      { action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: `wrong_password (attempt ${newFailed}${willLock ? ', locked' : ''})` },
      user,
      `Login gagal — password salah (percobaan ke-${newFailed}${willLock ? `, akun dikunci ${LOCK_DURATION_MINUTES} menit` : ''})`
    )
    throw new ResponseError(401, CREDENTIAL_ERROR, 'INVALID_CREDENTIALS')
  }

  if (user.failedLogins > 0) {
    await prismaClient.user.update({ where: { id: user.id }, data: { failedLogins: 0 } })
  }

  // Cek status setelah password benar — user nonaktif tidak boleh punya sesi.
  // Tanpa ini login sukses tapi tiap request API kena 403 di authRequired → loading tak berujung di FE.
  if (user.status === 'inactive') {
    trackAuth(
      { action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: 'account_inactive' },
      user,
      'Login gagal — akun nonaktif'
    )
    throw new ResponseError(403, 'Akun Anda nonaktif. Hubungi Super Admin.', 'ACCOUNT_INACTIVE')
  }

  await pruneAndEnforce(user.id)
  const result = await createSessionForUser(user, ipAddress, userAgent, res)
  trackAuth(
    { action: 'LOGIN_SUCCESS', email: user.email, userId: user.id, ip: ipAddress, userAgent },
    user,
    'Login dengan email & password'
  )
  return result
}

/**
 * Login via Keycloak (IAM Universitas). Identitas (email) sudah dibuktikan
 * Keycloak; di sini hanya cek apakah email terdaftar, aktif, dan tidak diblokir,
 * lalu terbitkan sesi milik sistem (cookie refresh_token + access token).
 * Tidak memakai sesi Keycloak sama sekali.
 *
 * Cookie pakai opsi default (sameSite=lax, host-only) — cukup karena FE & BE
 * same-site (sama-sama di bawah ub.ac.id), meski beda origin.
 */
export const loginKeycloakService = async (kcUser: { email?: string }, ipAddress: string | null, userAgent: string | null, res: Response): Promise<AuthResponse> => {
  if (!kcUser.email) {
    trackAuth(
      { action: 'LOGIN_FAILED', ip: ipAddress, userAgent, detail: 'keycloak_no_email' },
      null,
      'Login SSO gagal — IAM tidak mengirim email'
    )
    throw new ResponseError(401, 'No email from Keycloak', 'UNAUTHORIZED')
  }

  const user = await prismaClient.user.findUnique({
    where: { email: kcUser.email },
    include: { orgUnit: true }
  })
  if (!user) {
    trackAuth(
      { action: 'LOGIN_FAILED', email: kcUser.email, ip: ipAddress, userAgent, detail: 'keycloak_unregistered' },
      null,
      'Login SSO gagal — email belum terdaftar di sistem'
    )
    throw new ResponseError(401, 'User not found', 'UNAUTHORIZED')
  }

  if (user.status === 'inactive') {
    trackAuth(
      { action: 'LOGIN_FAILED', email: user.email, userId: user.id, ip: ipAddress, userAgent, detail: 'account_inactive' },
      user,
      'Login SSO gagal — akun nonaktif'
    )
    throw new ResponseError(403, 'Akun Anda nonaktif. Hubungi Super Admin.', 'ACCOUNT_INACTIVE')
  }

  await enforceLockGate(user, ipAddress, userAgent)

  await pruneAndEnforce(user.id)
  const result = await createSessionForUser(user, ipAddress, userAgent, res)
  trackAuth(
    { action: 'LOGIN_KEYCLOAK', email: user.email, userId: user.id, ip: ipAddress, userAgent },
    user,
    'Login via SSO (Akun UB)'
  )
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
        select: { id: true, name: true, role: true, email: true }
      })
      trackAuth({ action: 'LOGOUT', email: u?.email, userId: stored.userId, ip: ipAddress, userAgent }, u, 'Logout')
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
