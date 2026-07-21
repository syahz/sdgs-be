import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { UserValidation } from '../validation/user-validation'
import { CreateUserRequest, UpdateUserRequest, UserResponse, toUserResponse, generateAvatarInitials } from '../model/user-model'
import { UserWithRelations } from '../type/user-request'

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

  if (req.orgUnitId) {
    const orgUnit = await prismaClient.orgUnit.findUnique({ where: { id: req.orgUnitId } })
    if (!orgUnit) throw new ResponseError(404, 'OrgUnit tidak ditemukan', 'NOT_FOUND')
  }

  const hashedPassword = bcrypt.hashSync(req.password, 10)
  const avatarInitials = req.avatarInitials ?? generateAvatarInitials(req.name)

  const user = await prismaClient.user.create({
    data: {
      name: req.name,
      email: req.email,
      password: hashedPassword,
      role: req.role,
      orgUnitId: req.orgUnitId ?? null,
      avatarInitials,
      status: req.status ?? 'active'
    }
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

  // Non-admin self-update: only name / email / password allowed.
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
  if (req.password) {
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
  return toUserResponse(updated)
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
  return { message: 'User berhasil dihapus' }
}
