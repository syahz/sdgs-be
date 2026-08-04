import { User } from '@prisma/client'

export interface CreateUserRequest {
  name: string
  email: string
  /** Opsional — kosong = akun SSO-only, user masuk lewat Akun UB. */
  password?: string
  role: 'super_admin' | 'validator' | 'unit_admin' | 'pimpinan'
  orgUnitId?: string | null
  avatarInitials?: string
  status?: 'active' | 'inactive'
}

export interface UpdateUserRequest {
  name?: string
  email?: string
  password?: string
  /** Wajib saat user mengganti password sendiri. Super admin tidak perlu. */
  currentPassword?: string
  role?: 'super_admin' | 'validator' | 'unit_admin' | 'pimpinan'
  orgUnitId?: string | null
  avatarInitials?: string
  status?: 'active' | 'inactive'
  isLocked?: boolean // super admin only — set false untuk buka kunci akun
}

export type UserResponse = {
  id: string
  name: string
  email: string
  role: string
  orgUnitId: string | null
  avatarInitials: string
  status: string
  isLocked: boolean
  lockedUntil: string | null
  /** Punya password lokal? Dipakai FE untuk membedakan akun SSO-only. */
  hasPassword: boolean
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    orgUnitId: user.orgUnitId,
    avatarInitials: user.avatarInitials,
    status: user.status,
    isLocked: user.isLocked,
    lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null,
    hasPassword: !!user.password
  }
}

export function generateAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
