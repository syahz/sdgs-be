import { z } from 'zod'

export class SettingsValidation {
  static readonly UPDATE = z.object({
    submissionYear: z.number().int().min(2000).max(2100).optional(),
    windowStartMonth: z.number().int().min(1).max(12).optional(),
    windowStartDay: z.number().int().min(1).max(31).optional(),
    windowEndMonth: z.number().int().min(1).max(12).optional(),
    windowEndDay: z.number().int().min(1).max(31).optional()
  })

  static readonly DELETE_PIN = z.object({
    pin: z.string().regex(/^\d{6}$/, 'PIN harus 6 angka'),
    currentPin: z.string().regex(/^\d{6}$/).optional()
  })
}
