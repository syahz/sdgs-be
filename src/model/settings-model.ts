import { SystemSettings } from '@prisma/client'

export interface UpdateSettingsRequest {
  submissionYear?: number
  windowStartMonth?: number
  windowStartDay?: number
  windowEndMonth?: number
  windowEndDay?: number
}

/** Set/ganti PIN hapus. currentPin wajib jika PIN sudah pernah diatur. */
export interface UpdateDeletePinRequest {
  pin: string
  currentPin?: string
}

export type SettingsResponse = {
  submissionYear: number
  windowStartMonth: number
  windowStartDay: number
  windowEndMonth: number
  windowEndDay: number
  // Hanya status keberadaan PIN — hash TIDAK PERNAH dikirim ke klien.
  hasDeletePin: boolean
}

export const DEFAULT_SETTINGS = {
  submissionYear: new Date().getFullYear(),
  windowStartMonth: 7,
  windowStartDay: 1,
  windowEndMonth: 9,
  windowEndDay: 15
}

export function toSettingsResponse(s: SystemSettings): SettingsResponse {
  return {
    submissionYear: s.submissionYear,
    windowStartMonth: s.windowStartMonth,
    windowStartDay: s.windowStartDay,
    windowEndMonth: s.windowEndMonth,
    windowEndDay: s.windowEndDay,
    hasDeletePin: !!s.deletePinHash
  }
}
