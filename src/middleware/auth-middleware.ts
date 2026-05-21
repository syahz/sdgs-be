import { logger } from '../utils/logger'
import { verifyAccessToken } from '../utils/jwt'
import { Response, NextFunction, RequestHandler } from 'express'
import { prismaClient } from '../application/database'
import { UserRequest } from '../type/user-request'
import { UserRole } from '@prisma/client'

export const authRequired: RequestHandler = async (req, res: Response, next: NextFunction) => {
  const authHeader = req.header('authorization')
  if (!authHeader) {
    res.status(401).json({ message: 'Missing Authorization header', code: 'UNAUTHORIZED' })
    return
  }
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({ message: 'Invalid Authorization header', code: 'UNAUTHORIZED' })
    return
  }
  try {
    const payload = verifyAccessToken(parts[1])
    const user = await prismaClient.user.findUnique({
      where: { id: payload.userId },
      include: { orgUnit: true }
    })

    if (!user) {
      res.status(401).json({ message: 'User not found', code: 'UNAUTHORIZED' })
      return
    }

    if (user.status === 'inactive') {
      res.status(403).json({ message: 'Account is inactive', code: 'FORBIDDEN' })
      return
    }

    ;(req as UserRequest).user = user
    next()
  } catch (err) {
    logger.error('JWT verify error:', err)
    res.status(401).json({ message: 'Invalid or expired token', code: 'UNAUTHORIZED' })
  }
}

export const requireRole = (...roles: UserRole[]): RequestHandler => {
  return (req, res: Response, next: NextFunction) => {
    const user = (req as UserRequest).user
    if (!user) {
      res.status(401).json({ message: 'Not authenticated', code: 'UNAUTHORIZED' })
      return
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ message: 'Insufficient permissions', code: 'FORBIDDEN' })
      return
    }
    next()
  }
}
