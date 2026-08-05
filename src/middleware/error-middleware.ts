import { NextFunction, Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { ResponseError } from '../error/response-error'
import { ZodError } from 'zod'
import { logger } from '../utils/logger'

/**
 * Error handler global.
 *
 * Aturan: detail internal (error.message, stack, pesan Prisma) HANYA masuk log,
 * TIDAK PERNAH ke response client — pesan Prisma membocorkan nama tabel/kolom
 * dan constraint yang dilanggar, yang mempermudah pemetaan skema saat
 * reconnaissance. Temuan MEDIUM-1 CSIRT DTI UB (INC-2026-008).
 *
 * Client menerima `requestId` supaya laporan pengguna bisa dicocokkan dengan
 * baris log tanpa membocorkan apa pun tentang errornya.
 */
export const errorMiddleware = async (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Error yang muncul setelah response terkirim (mis. stream putus) tidak bisa
  // ditangani lagi — serahkan ke handler bawaan Express supaya koneksi ditutup
  // rapi, bukan memicu ERR_HTTP_HEADERS_SENT.
  if (res.headersSent) return next(error)

  if (error instanceof ZodError) {
    // Pesan issue pertama dipakai apa adanya — schema menuliskannya dalam bahasa
    // Indonesia dan siap tampil ke user (mis. "Format email tidak valid").
    // Sebelumnya selalu "Validation Error", yang tidak memberi tahu apa pun.
    // `details` tetap dikirim untuk form yang menandai error per-field.
    res.status(400).json({
      message: error.errors[0]?.message ?? 'Data yang dikirim tidak valid',
      code: 'VALIDATION_ERROR',
      details: error.errors
    })
    return
  }

  if (error instanceof ResponseError) {
    res.status(error.status).json({
      message: error.message,
      code: error.code ?? 'ERROR',
      ...(error.details !== undefined ? { details: error.details } : {})
    })
    return
  }

  // Body JSON rusak dari express.json(). Tanpa cabang ini jatuh ke 500 dan
  // memantulkan potongan body mentah kembali ke pengirim.
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(400).json({ message: 'Malformed JSON body', code: 'BAD_REQUEST' })
    return
  }

  // Body melebihi batas parser. Tanpa cabang ini jatuh ke 500 dan admin tidak
  // punya petunjuk apa pun tentang apa yang salah.
  if (error.name === 'PayloadTooLargeError') {
    res.status(413).json({
      message: 'Berkas terlalu besar untuk diproses',
      code: 'PAYLOAD_TOO_LARGE'
    })
    return
  }

  const requestId = crypto.randomUUID()

  // Database tak terjangkau (mati, kredensial salah, pool habis). Tanpa cabang ini
  // jatuh ke 500 "Internal Server Error" dan user mengira aplikasinya yang rusak,
  // padahal ini gangguan infrastruktur yang jelas — 503 + pesan yang jujur.
  // P1001/P1002/P1017 biasanya lewat InitializationError; P2024 = pool timeout.
  const DB_DOWN_CODES = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024']
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && DB_DOWN_CODES.includes(error.code))
  ) {
    logger.error('Database unavailable', {
      requestId,
      action: 'DB_UNAVAILABLE',
      method: req.method,
      path: req.originalUrl,
      code: (error as { errorCode?: string; code?: string }).errorCode ?? (error as { code?: string }).code,
      error: error.message
    })
    res.status(503).json({
      message: 'Server tidak dapat menghubungi database. Coba lagi beberapa saat atau hubungi administrator.',
      code: 'DB_UNAVAILABLE',
      requestId
    })
    return
  }

  // Prisma: status yang berarti, pesan tetap generik.
  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientValidationError
  ) {
    const conflict =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    logger.error('Prisma error', {
      requestId,
      action: 'PRISMA_ERROR',
      method: req.method,
      path: req.originalUrl,
      code: (error as Prisma.PrismaClientKnownRequestError).code,
      error: error.message
    })
    res.status(conflict ? 409 : 400).json({
      message: conflict ? 'Data sudah ada' : 'Permintaan tidak dapat diproses',
      code: conflict ? 'CONFLICT' : 'BAD_REQUEST',
      requestId
    })
    return
  }

  logger.error('Unhandled error', {
    requestId,
    action: 'UNHANDLED_ERROR',
    method: req.method,
    path: req.originalUrl,
    name: error.name,
    error: error.message,
    stack: error.stack
  })

  res.status(500).json({
    message: 'Internal Server Error',
    code: 'INTERNAL_ERROR',
    requestId
  })
}
