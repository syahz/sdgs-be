import { ensureCutoffAutoSubmit } from '../service/submission-service'
import { logger } from './logger'

// Backstop kalau tak ada yang buka halaman: cek tiap 5 menit. Pemicu utama sebenarnya
// lazy di getSubmissionsService — begitu cutoff lewat & ada yang baca daftar, langsung jalan.
const CHECK_INTERVAL_MS = 5 * 60 * 1000

async function runIfDue(): Promise<void> {
  try {
    await ensureCutoffAutoSubmit()
  } catch (err) {
    logger.error({ action: 'CUTOFF_AUTO_SUBMIT_FAILED', error: String(err) })
  }
}

/** Jalankan pengecekan berkala. Dipanggil sekali saat app start. */
export function startCutoffAutoSubmit(): void {
  const timer = setInterval(runIfDue, CHECK_INTERVAL_MS)
  timer.unref?.()
  void runIfDue()
}
