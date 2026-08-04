import { User, OrgUnit } from '@prisma/client'

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  accessToken: string
  user: UserPublic
}

export interface UserPublic {
  id: string
  name: string
  email: string
  role: string
  orgUnitId: string | null
  avatarInitials: string
  status: string
}

export type UserWithOrgUnit = User & { orgUnit: OrgUnit | null }

export function toUserPublic(user: UserWithOrgUnit): UserPublic {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    orgUnitId: user.orgUnitId,
    avatarInitials: user.avatarInitials,
    status: user.status
  }
}
