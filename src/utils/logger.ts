import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import winston from 'winston'
import winstonDaily from 'winston-daily-rotate-file'
import { LOG_DIR } from '../config'

const logDir: string = join(__dirname, LOG_DIR ?? '../../logs')

if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true })
}

/**
 * Format baris log. Versi lama hanya membaca `${message}` sehingga metadata
 * yang dikirim sebagai argumen kedua (`logger.error('msg', { ... })`) HILANG
 * tanpa jejak — temuan saat menindaklanjuti MEDIUM-1 CSIRT DTI.
 * Sekarang meta ikut diserialisasi, dan `stack` ditulis di baris terpisah.
 */
const logFormat = winston.format.printf((info) => {
  const { timestamp, level, message, stack, ...meta } = info as Record<string, unknown>
  const text = typeof message === 'string' ? message : JSON.stringify(message)
  const rest = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
  const trace = typeof stack === 'string' ? `\n${stack}` : ''
  return `${timestamp} ${level}: ${text}${rest}${trace}`
})

export const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json(),
    logFormat
  ),
  transports: [
    new winston.transports.Console({}),
    new winstonDaily({
      level: 'debug',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir + '/debug',
      filename: `%DATE%.log`,
      maxFiles: 5,
      json: true,
      zippedArchive: true
    }),
    new winstonDaily({
      level: 'info',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir + '/info',
      filename: `%DATE%.log`,
      maxFiles: 5,
      json: true,
      zippedArchive: true
    }),
    new winstonDaily({
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir + '/error',
      filename: `%DATE%.log`,
      maxFiles: 5,
      handleExceptions: true,
      json: false,
      zippedArchive: true
    })
  ]
})

logger.add(
  new winston.transports.Console({
    format: winston.format.combine(winston.format.splat(), winston.format.colorize())
  })
)

export const stream = {
  write: (message: string) => {
    logger.info(message.substring(0, message.lastIndexOf('\n')))
  }
}
