import { z } from 'zod'

export class SubmissionValidation {
  static readonly CREATE = z.object({
    title: z.string().min(1).max(500),
    sdgId: z.number().int().min(1).max(17),
    year: z.number().int().min(2020).max(2100),
    theAnswers: z.record(z.unknown()).optional().default({}),
    qsAnswers: z.record(z.unknown()).optional().default({})
  })

  static readonly UPDATE = z.object({
    title: z.string().min(1).max(500).optional(),
    theAnswers: z.record(z.unknown()).optional(),
    qsAnswers: z.record(z.unknown()).optional()
  })

  static readonly REVIEW = z.object({
    action: z.enum(['approve', 'request_revision', 'reject', 'comment']),
    comment: z.string().optional(),
    questionId: z.string().nullable().optional(),
    bibliometricScores: z.record(z.number().min(0).max(100)).optional()
  })

  static readonly ROLLBACK = z.object({
    year: z.number({ required_error: 'Periode wajib diisi' }).int().min(2000).max(2100),
    includeApproved: z.boolean().optional().default(false),
    reason: z.string().trim().max(500, 'Alasan rollback maksimal 500 karakter').optional()
  })
}
