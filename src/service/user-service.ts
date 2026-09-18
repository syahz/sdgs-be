import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { UserValidation } from '../validation/user-validation'
import { CreateUserRequest, UpdateUserRequest, UserResponse, toUserResponse, generateAvatarInitials } from '../model/user-model'
import { UserWithRelations } from '../type/user-request'
import { FieldChange } from '../model/audit-log-model'
import { ROLE_LABEL } from '../model/activity-log-model'
import { logActivity } from './activity-log-service'

async function orgUnitNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const wanted = ids.filter((id): id is string => !!id)
  if (wanted.length === 0) return new Map()
  const units = await prismaClient.orgUnit.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } })
  return new Map(units.map((u) => [u.id, u.name]))
}

export const getUsersService = async (filters: { role?: string; orgUnitId?: string; status?: string }): Promise<UserResponse[]> => {
  const where: any = {}
  if (filters.role) where.role = filters.role
  if (filters.orgUnitId) where.orgUnitId = filters.orgUnitId
  if (filters.status) where.status = filters.status
  const users = await prismaClient.user.findMany({ where, orderBy: { name: 'asc' } })
  return users.map(toUserResponse)
}

export const getUserByIdService = async (id: string): Promise<UserResponse> => {
  const user = await prismaClient.user.findUnique({ where: { id } })
  if (!user) throw new ResponseError(404, 'User tidak ditemukan', 'NOT_FOUND')
  return toUserResponse(user)
}

export const createUserService = async (request: CreateUserRequest): Promise<UserResponse> => {
  const req = Validation.validate(UserValidation.CREATE, request)

  if (req.role === 'unit_admin' && !req.orgUnitId) {
    throw new ResponseError(400, 'orgUnitId wajib diisi untuk role unit_admin', 'VALIDATION_ERROR')
  }
  if (req.role !== 'unit_admin' && req.orgUnitId) {
    throw new ResponseError(400, 'orgUnitId harus null untuk role selain unit_admin', 'VALIDATION_ERROR')
  }

  const existing = await prismaClient.user.findUnique({ where: { email: req.email } })
  if (existing) throw new ResponseError(409, 'Email sudah terdaftar', 'CONFLICT')

  const orgUnit = req.orgUnitId ? await prismaClient.orgUnit.findUnique({ where: { id: req.orgUnitId } }) : null
  if (req.orgUnitId && !orgUnit) throw new ResponseError(404, 'OrgUnit tidak ditemukan', 'NOT_FOUND')

  const avatarInitials = req.avatarInitials ?? generateAvatarInitials(req.name)

  // Password opsional. Kosong = akun SSO-only: user masuk lewat Akun UB, dan
  // email di sini harus sama persis dengan email di IAM UB.
  const user = await prismaClient.user.create({
    data: {
      name: req.name,
      email: req.email,
      password: req.password ? bcrypt.hashSync(req.password, 10) : null,
      role: req.role,
      orgUnitId: req.orgUnitId ?? null,
      avatarInitials,
      status: req.status ?? 'active'
    }
  })

  await logActivity({
    category: 'user',
    action: 'USER_CREATED',
    description: `Membuat user ${user.name} (${ROLE_LABEL[user.role] ?? user.role})`,
    orgUnitName: orgUnit?.name ?? null,
    targetId: user.id,
    metadata: { email: user.email, role: user.role, status: user.status, ssoOnly: !req.password }
  })

  return toUserResponse(user)
}

export const updateUserService = async (
  id: string,
  request: UpdateUserRequest,
  currentUser: UserWithRelations
): Promise<UserResponse> => {
  const isAdmin = currentUser.role === 'super_admin'
  const isSelf = currentUser.id === id
  if (!isAdmin && !isSelf) {
    throw new ResponseError(403, 'Insufficient permissions', 'FORBIDDEN')
  }

  const req = Validation.validate(UserValidation.UPDATE, request)

  // Non-admin self-update: hanya name / email / password.
  if (!isAdmin) {
    delete req.role
    delete req.orgUnitId
    delete req.status
    delete req.avatarInitials
    delete req.isLocked
  }

  const user = await prismaClient.user.findUnique({ where: { id } })
  if (!user) throw new ResponseError(404, 'User tidak ditemukan', 'NOT_FOUND')

  if (req.email && req.email !== user.email) {
    const conflict = await prismaClient.user.findUnique({ where: { email: req.email } })
    if (conflict) throw new ResponseError(409, 'Email sudah digunakan', 'CONFLICT')
  }

  const newRole = req.role ?? user.role
  const newOrgUnitId = 'orgUnitId' in req ? req.orgUnitId : user.orgUnitId

  if (newRole === 'unit_admin' && !newOrgUnitId) {
    throw new ResponseError(400, 'orgUnitId wajib diisi untuk role unit_admin', 'VALIDATION_ERROR')
  }
  if (newRole !== 'unit_admin' && newOrgUnitId !== null && newOrgUnitId !== undefined) {
    req.orgUnitId = null
  }

  const data: any = { ...req }
  delete data.currentPassword // field verifikasi, bukan kolom DB

  if (req.password) {
    // User mengganti password sendiri wajib membuktikan tahu password lama.
    // Tanpa ini, sesi yang dibajak bisa mengunci pemilik akun keluar.
    // Super admin dikecualikan — itu jalur reset password oleh admin.
    if (!isAdmin) {
      if (!user.password) {
        throw new ResponseError(400, 'Akun ini belum punya password. Atur lewat Super Admin.', 'SSO_ONLY')
      }
      if (!req.currentPassword || !bcrypt.compareSync(req.currentPassword, user.password)) {
        throw new ResponseError(401, 'Password saat ini salah', 'INVALID_CURRENT_PASSWORD')
      }
    }
    data.password = bcrypt.hashSync(req.password, 10)
  }

  if (req.name && !req.avatarInitials) {
    data.avatarInitials = generateAvatarInitials(req.name)
  }
  // Unlock manual super admin: buka kunci sekaligus reset counter brute-force.
  if (req.isLocked === false) {
    data.failedLogins = 0
    data.lockedUntil = null
  }

  const updated = await prismaClient.user.update({ where: { id }, data })
  await logUserUpdate(user, updated, !!req.password, isSelf)
  return toUserResponse(updated)
}

type UserRow = { id: string; name: string; email: string; role: string; orgUnitId: string | null; status: string; isLocked: boolean }

/** Catat perubahan user: buka kunci dicatat terpisah, sisanya satu baris berisi diff. */
async function logUserUpdate(before: UserRow, after: UserRow, passwordChanged: boolean, isSelf: boolean) {
  // Selalu dicari (bukan hanya saat unit berubah) — kolom orgUnitName log butuh nama, bukan id.
  const units = await orgUnitNames([before.orgUnitId, after.orgUnitId])
  const unitName = (id: string | null) => (id ? (units.get(id) ?? id) : null)

  const changes: FieldChange[] = []
  const track = (field: string, b: string | null, a: string | null) => {
    if (b !== a) changes.push({ field, before: b, after: a })
  }
  track('Nama', before.name, after.name)
  track('Email', before.email, after.email)
  track('Role', ROLE_LABEL[before.role] ?? before.role, ROLE_LABEL[after.role] ?? after.role)
  track('Unit', unitName(before.orgUnitId), unitName(after.orgUnitId))
  track('Status', before.status, after.status)
  if (passwordChanged) changes.push({ field: 'Password', before: null, after: isSelf ? 'diganti' : 'direset admin' })
  if (!before.isLocked && after.isLocked) changes.push({ field: 'Kunci akun', before: 'tidak', after: 'ya' })

  const base = { category: 'user' as const, targetId: after.id, orgUnitName: unitName(after.orgUnitId) }

  if (before.isLocked && !after.isLocked) {
    await logActivity({ ...base, action: 'USER_UNLOCKED', description: `Membuka kunci akun ${after.name}` })
  }
  if (changes.length === 0) return

  const ownPassword = isSelf && passwordChanged
  await logActivity({
    ...base,
    action: ownPassword ? 'USER_PASSWORD_CHANGED' : 'USER_UPDATED',
    description: ownPassword ? 'Mengganti password akun sendiri' : isSelf ? 'Mengubah profil sendiri' : `Mengubah user ${after.name}`,
    metadata: { changes }
  })
}

export const deleteUserService = async (id: string): Promise<{ message: string }> => {
  const user = await prismaClient.user.findUnique({ where: { id } })
  if (!user) throw new ResponseError(404, 'User tidak ditemukan', 'NOT_FOUND')

  // Cek dependensi dulu (deterministik). FK di schema pakai RESTRICT → Postgres
  // lempar 23001 yang TIDAK dipetakan Prisma ke P2003, jadi andalkan hitung ini,
  // bukan error-type. refreshTokens dikecualikan (onDelete: Cascade).
  const [submissions, reviewComments, universityRecords, submissionLogs] = await Promise.all([
    prismaClient.submission.count({ where: { submittedByUserId: id } }),
    prismaClient.reviewComment.count({ where: { userId: id } }),
    prismaClient.universityRecord.count({ where: { createdByUserId: id } }),
    prismaClient.submissionLog.count({ where: { actorUserId: id } })
  ])
  if (submissions + reviewComments + universityRecords + submissionLogs > 0) {
    throw new ResponseError(
      409,
      'User tidak bisa dihapus karena masih punya data terkait (submission, review, atau data universitas). Nonaktifkan user ini lewat Edit → Status: Inactive sebagai gantinya.',
      'USER_HAS_DEPENDENCIES'
    )
  }

  // Fallback: kalau ada relasi RESTRICT lain yang terlewat, tetap tangani rapi.
  try {
    await prismaClient.user.delete({ where: { id } })
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError ||
      e instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      throw new ResponseError(
        409,
        'User tidak bisa dihapus karena masih punya data terkait. Nonaktifkan user ini lewat Edit → Status: Inactive sebagai gantinya.',
        'USER_HAS_DEPENDENCIES'
      )
    }
    throw e
  }

  await logActivity({
    category: 'user',
    action: 'USER_DELETED',
    description: `Menghapus user ${user.name} (${ROLE_LABEL[user.role] ?? user.role})`,
    targetId: user.id,
    metadata: { email: user.email, role: user.role }
  })

  return { message: 'User berhasil dihapus' }
}
