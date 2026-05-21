import crypto from 'crypto'

export function createSessionToken(): string {
  return crypto.randomBytes(64).toString('hex')
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
