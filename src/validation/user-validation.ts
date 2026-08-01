import { z } from 'zod'

const roleEnum = z.enum(['super_admin', 'validator', 'unit_admin', 'pimpinan'])
const statusEnum = z.enum(['active', 'inactive'])

export class UserValidation {
  static readonly CREATE = z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    role: roleEnum,
    orgUnitId: z.string().uuid().nullable().optional(),
    avatarInitials: z.string().max(4).optional(),
    status: statusEnum.optional().default('active')
  })

  static readonly UPDATE = z.object({
    name: z.string().min(1).max(200).optional(),
    email: z.string().email().optional(),
    role: roleEnum.optional(),
    orgUnitId: z.string().uuid().nullable().optional(),
    avatarInitials: z.string().max(4).optional(),
    status: statusEnum.optional(),
    isLocked: z.boolean().optional() // super admin only — strip untuk non-admin di service
  })
}
