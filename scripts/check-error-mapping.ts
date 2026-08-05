// Periksa apakah errorMiddleware masih memetakan tiap jenis error ke status +
// pesan yang benar. Jalankan: npx ts-node scripts/check-error-mapping.ts
//
// READ-ONLY terhadap DB aplikasi — satu kasus sengaja menyambung ke port mati
// untuk memancing error koneksi Prisma yang asli.
//
// Kenapa perlu dicek: pemetaan ini yang menentukan apa yang dibaca user saat
// login gagal. Kalau cabang DB_UNAVAILABLE hilang (mis. nama kelas Prisma
// berubah saat upgrade), gejalanya bukan crash melainkan pesan "Internal Server
// Error" yang membuat gangguan database tampak seperti aplikasi rusak.
import { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { errorMiddleware } from '../src/middleware/error-middleware'
import { ResponseError } from '../src/error/response-error'

type Hasil = { status: number; body: any }

/** Jalankan errorMiddleware dengan req/res palsu, ambil status + body-nya. */
async function jalankan(error: Error): Promise<Hasil> {
  const hasil: Hasil = { status: 0, body: null }
  const res = {
    headersSent: false,
    status(s: number) {
      hasil.status = s
      return this
    },
    json(b: unknown) {
      hasil.body = b
      return this
    }
  }
  const req = { method: 'POST', originalUrl: '/api/auth/login' }
  await errorMiddleware(error, req as never, res as never, (() => {}) as never)
  return hasil
}

/** Error koneksi Prisma yang asli — bukan tiruan — dari port yang tidak ada. */
async function errorDbMati(): Promise<Error> {
  const prisma = new PrismaClient({
    datasources: { db: { url: 'postgresql://postgres:x@127.0.0.1:59999/nope' } }
  })
  try {
    await prisma.user.findFirst()
  } catch (e) {
    return e as Error
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
  throw new Error('query ke port mati malah sukses — kasus uji tidak valid')
}

async function main() {
  const zodError = (() => {
    try {
      z.object({ email: z.string().email('Format email tidak valid') }).parse({ email: 'test@test' })
    } catch (e) {
      return e as Error
    }
    throw new Error('schema tidak menolak email invalid')
  })()

  const kasus: Array<{ nama: string; error: Error; status: number; code: string; pesan?: string }> = [
    { nama: 'DB tidak terjangkau', error: await errorDbMati(), status: 503, code: 'DB_UNAVAILABLE' },
    { nama: 'validasi Zod', error: zodError, status: 400, code: 'VALIDATION_ERROR', pesan: 'Format email tidak valid' },
    {
      nama: 'kredensial salah',
      error: new ResponseError(401, 'Email atau password salah.', 'INVALID_CREDENTIALS'),
      status: 401,
      code: 'INVALID_CREDENTIALS',
      pesan: 'Email atau password salah.'
    },
    { nama: 'error tak dikenal', error: new Error('boom'), status: 500, code: 'INTERNAL_ERROR' }
  ]

  let gagal = 0
  for (const k of kasus) {
    const { status, body } = await jalankan(k.error)
    const ok =
      status === k.status && body?.code === k.code && (!k.pesan || body?.message === k.pesan)
    if (!ok) gagal++
    console.log(`${ok ? 'OK  ' : 'GAGAL'} ${k.nama}: ${status} ${JSON.stringify(body?.message)} [${body?.code}]`)
  }

  // Pesan internal tidak boleh bocor ke client — hanya requestId untuk pelacakan.
  const bocor = await jalankan(new Error('rahasia: koneksi ke 10.0.0.5 ditolak'))
  if (JSON.stringify(bocor.body).includes('rahasia')) {
    gagal++
    console.log('GAGAL kebocoran: pesan internal ikut terkirim ke client')
  } else {
    console.log(`OK   pesan internal tidak bocor (requestId: ${bocor.body?.requestId ? 'ada' : 'TIDAK ADA'})`)
  }

  console.log(gagal === 0 ? '\nSemua pemetaan error sesuai.' : `\n${gagal} pemetaan tidak sesuai.`)
  process.exit(gagal === 0 ? 0 : 1)
}

main()
