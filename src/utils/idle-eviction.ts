import { prismaClient } from '../application/database'
import { logger } from './logger'

/** Interval evict sesi idle — 5 menit. */
const EVICTION_INTERVAL_MS = 5 * 60 * 1000

/**
 * Hapus semua refresh token yang idle-nya sudah lewat (`idleExpiresAt < now`).
 * Backstop server-side untuk auto-logout idle — tak menunggu request berikutnya.
 */
export async function evictIdleSessions(): Promise<void> {
  try {
    const result = await prismaClient.refreshToken.deleteMany({
      where: { idleExpiresAt: { lt: new Date() } }
    })
    if (result.count > 0) {
      logger.info({ action: 'IDLE_SESSION_EVICTION', removed: result.count })
    }
  } catch (err) {
    logger.error({ action: 'IDLE_SESSION_EVICTION_FAILED', error: String(err) })
  }
}

/** Jalankan eviction berkala. Dipanggil sekali saat app start. */
export function startIdleSessionEviction(): void {
  const timer = setInterval(evictIdleSessions, EVICTION_INTERVAL_MS)
  timer.unref?.()
  // jalankan sekali di awal agar sesi basi langsung bersih
  void evictIdleSessions()
}
