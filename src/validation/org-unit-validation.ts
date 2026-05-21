import { z } from 'zod'

const orgUnitType = z.enum(['faculty', 'directorate', 'unit'])

export class OrgUnitValidation {
  static readonly CREATE = z.object({
    name: z.string().min(1).max(200),
    abbreviation: z.string().min(1).max(20),
    type: orgUnitType
  })

  static readonly UPDATE = z.object({
    name: z.string().min(1).max(200).optional(),
    abbreviation: z.string().min(1).max(20).optional(),
    type: orgUnitType.optional()
  })
}
