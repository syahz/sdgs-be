import { z } from 'zod'

export class AnnouncementValidation {
  static readonly UPSERT = z.object({
    message: z.string().trim().min(1, 'Pesan wajib diisi').max(1000),
    active: z.boolean()
  })
}
