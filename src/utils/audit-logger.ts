/**
 * Audit logger — jejak autentikasi (login/logout) untuk keperluan audit keamanan.
 *
 * Ditulis ke file harian terpisah `logs/audit/%DATE%.log` dengan format
 * satu-baris yang mudah dibaca & di-grep. Retensi lebih panjang (90 hari)
 * dibanding log aplikasi biasa karena nilainya untuk audit.
 *
 * Contoh baris:
 *   2026-05-16 22:51:03 | LOGIN_SUCCESS | email=admin@ub.ac.id | userId=abc-123 | ip=140.213.187.119 | ua="Mozilla/5.0 ..."
 */

import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import winston from 'winston'
import winstonDaily from 'winston-daily-rotate-file'
import { LOG_DIR } from '../config'

const auditDir: string = join(__dirname, LOG_DIR ?? '../../logs', 'audit')

if (!existsSync(auditDir)) {
  mkdirSync(auditDir, { recursive: true })
}

const auditLogger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, message }) => `${timestamp} | ${message}`)
  ),
  transports: [
    new winstonDaily({
      datePattern: 'YYYY-MM-DD',
      dirname: auditDir,
      filename: `%DATE%.log`,
      maxFiles: 90,
      zippedArchive: true
    })
  ]
})

export type AuthAuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_GOOGLE'
  | 'LOGIN_KEYCLOAK'
  | 'LOGIN_FAILED'
  | 'LOGOUT'

export interface AuthAuditEntry {
  action: AuthAuditAction
  email?: string | null
  userId?: string | null
  ip?: string | null
  userAgent?: string | null
  /** Keterangan tambahan — mis. alasan kegagalan login. */
  detail?: string
}

/** Catat satu peristiwa autentikasi ke audit log. */
export function auditAuth(entry: AuthAuditEntry): void {
  const parts = [
    entry.action,
    `email=${entry.email ?? '-'}`,
    `userId=${entry.userId ?? '-'}`,
    `ip=${entry.ip ?? '-'}`,
    `ua="${(entry.userAgent ?? '-').replace(/"/g, "'")}"`
  ]
  if (entry.detail) parts.push(`detail=${entry.detail}`)
  auditLogger.info(parts.join(' | '))
}
