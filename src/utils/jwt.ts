import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken'
import { ACCESS_TOKEN_SECRET, ACCESS_TOKEN_EXPIRES } from '../config'

export interface AccessPayload {
  userId: string
  role: string
  orgUnitId: string | null
}

export function signAccessToken(payload: AccessPayload): string {
  const secret = ACCESS_TOKEN_SECRET
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET not set')
  const options: SignOptions = { expiresIn: (ACCESS_TOKEN_EXPIRES ?? '15m') as any }
  return jwt.sign(payload, secret, options)
}

export function verifyAccessToken(token: string): JwtPayload & AccessPayload {
  const secret = ACCESS_TOKEN_SECRET
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET not set')
  return jwt.verify(token, secret) as JwtPayload & AccessPayload
}
