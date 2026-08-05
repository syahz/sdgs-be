import { z } from 'zod'

export class AuthValidation {
  // required_error/invalid_type_error diisi supaya field yang hilang atau bertipe
  // salah tidak jatuh ke pesan default Zod ("Required") yang berbahasa Inggris dan
  // tidak menyebut field apa — pesan ini ditampilkan langsung ke user di form login.
  static readonly LOGIN = z.object({
    email: z
      .string({ required_error: 'Email wajib diisi', invalid_type_error: 'Email wajib diisi' })
      .email('Format email tidak valid'),
    password: z
      .string({ required_error: 'Password wajib diisi', invalid_type_error: 'Password wajib diisi' })
      .min(1, 'Password tidak boleh kosong')
  })
}
