import { Request } from 'express'
import { Prisma } from '@prisma/client'

export type UserWithRelations = Prisma.UserGetPayload<{
  include: { orgUnit: true }
}>

export interface UserRequest extends Request {
  user?: UserWithRelations
}
