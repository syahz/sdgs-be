import { SystemSettings } from '@prisma/client'

export interface UpdateSettingsRequest {
  submissionYear?: number
  windowStartMonth?: number
  windowStartDay?: number
  windowEndMonth?: number
  windowEndDay?: number
}

export type SettingsResponse = {
  submissionYear: number
  windowStartMonth: number
  windowStartDay: number
  windowEndMonth: number
  windowEndDay: number
}

export const DEFAULT_SETTINGS: SettingsResponse = {
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
    windowEndDay: s.windowEndDay
  }
}
