import { z } from 'zod'

export class AuthValidation {
  static readonly LOGIN = z.object({
    email: z.string().email('Format email tidak valid'),
    password: z.string().min(1, 'Password tidak boleh kosong')
  })
}
