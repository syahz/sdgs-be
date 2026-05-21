import { z } from 'zod'

export class UniversityRecordValidation {
  static readonly CREATE = z.object({
    title: z.string().min(1).max(500),
    sdgId: z.number().int().min(1).max(17),
    year: z.number().int().min(2000).max(2100),
    status: z.enum(['draft', 'published']).optional().default('draft'),
    theAnswers: z.record(z.unknown()).optional().default({}),
    qsAnswers: z.record(z.unknown()).optional().default({})
  })

  static readonly UPDATE = z.object({
    title: z.string().min(1).max(500).optional(),
    sdgId: z.number().int().min(1).max(17).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    status: z.enum(['draft', 'published']).optional(),
    theAnswers: z.record(z.unknown()).optional(),
    qsAnswers: z.record(z.unknown()).optional()
  })
}
