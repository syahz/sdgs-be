import { autoApproveYearEndService } from '../service/submission-service'
import { logger } from './logger'

// Cron akhir tahun: 24 Desember 23:59 (zona waktu server).
const TARGET_MONTH = 11 // Desember (0-indexed)
const TARGET_DAY = 24
const TARGET_HOUR = 23
const TARGET_MIN = 59

// Cek tiap 30 menit. setTimeout 32-bit tak bisa menjangkau ~1 tahun, jadi pakai
// interval pendek + bandingkan waktu sekarang dengan target.
const CHECK_INTERVAL_MS = 30 * 60 * 1000

// Tahun terakhir cron sudah jalan — cegah dobel-eksekusi dalam window yang sama.
let lastRunYear: number | null = null

/** Waktu target (Date) untuk tahun tertentu. */
function targetTime(year: number): Date {
  return new Date(year, TARGET_MONTH, TARGET_DAY, TARGET_HOUR, TARGET_MIN, 0, 0)
}

async function runIfDue(): Promise<void> {
  const now = new Date()
  const year = now.getFullYear()

  if (lastRunYear === year) return // sudah jalan tahun ini
  if (now.getTime() < targetTime(year).getTime()) return // belum waktunya

  lastRunYear = year
  try {
    const result = await autoApproveYearEndService(year)
    logger.info({ action: 'YEAR_END_AUTO_APPROVE', year, approved: result.approved })
  } catch (err) {
    // gagal -> izinkan retry di tick berikutnya
    lastRunYear = null
    logger.error({ action: 'YEAR_END_AUTO_APPROVE_FAILED', year, error: String(err) })
  }
}

/** Jalankan pengecekan berkala. Dipanggil sekali saat app start. */
export function startYearEndAutoApprove(): void {
  const timer = setInterval(runIfDue, CHECK_INTERVAL_MS)
  timer.unref?.()
  // cek sekali di awal agar restart setelah 24 Des tetap menangkap yang tertinggal
  void runIfDue()
}
