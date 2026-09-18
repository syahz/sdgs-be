/**
 * Konteks request per-alur-async (AsyncLocalStorage).
 *
 * Dipakai activity log: service cukup memanggil `logActivity(...)` dan pelaku,
 * IP, serta user-agent diambil dari request yang sedang berjalan — tanpa
 * meneruskan `req` ke setiap signature service.
 *
 * Yang disimpan adalah objek `req` itu sendiri (by reference), jadi `req.user`
 * yang baru dipasang `authRequired` SETELAH middleware ini tetap terbaca.
 * Di luar request (cron auto-submit / auto-approve, script) store-nya kosong →
 * pemanggil jatuh ke aktor "Sistem".
 */

import { AsyncLocalStorage } from 'async_hooks'
import { Request, RequestHandler } from 'express'

const storage = new AsyncLocalStorage<{ req: Request }>()

/** Pasang paling awal di app agar seluruh handler berjalan di dalam konteks. */
export const requestContextMiddleware: RequestHandler = (req, _res, next) => {
  storage.run({ req }, next)
}

/** Request yang sedang diproses, atau undefined di luar request (cron/script). */
export function currentRequest(): Request | undefined {
  return storage.getStore()?.req
}

/** IP klien — `trust proxy` sudah diset di web.ts, jadi req.ip = IP asli di belakang nginx. */
export function clientIp(req: Request): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null
}
