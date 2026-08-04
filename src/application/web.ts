import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { FRONTEND_URL } from '../config/index'
import { publicRouter } from '../route/public-api'
import { privateRouter } from '../route/private-api'
import { errorMiddleware } from '../middleware/error-middleware'
import { globalLimiter } from '../middleware/rate-limit'

export const web = express()

web.set('trust proxy', 1)

const corsOptions = {
  origin: FRONTEND_URL || 'http://localhost:3010',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}

web.use(helmet())
web.use(cors(corsOptions))
web.use(globalLimiter)
web.use(cookieParser())
// Parser JSON global dengan batas bawaan (100 KB) — cukup untuk seluruh API.
//
// Jalur unggah kerangka indikator dilewati: payloadnya ±180 KB dan punya parser
// sendiri berbatas lebih longgar di route-nya. Parser global harus di-skip, bukan
// dinaikkan batasnya, supaya endpoint lain tidak ikut menerima body raksasa.
// Cocokkan PERSIS jalur unggah, bukan prefix: sub-jalurnya
// (mis. /api/config/versions/:id/activate) berbadan kecil dan tetap butuh
// parser global. Prefix yang terlalu luas membuat req.body-nya kosong.
const jsonParser = express.json()
const isConfigUpload = (req: { method: string; path: string }) =>
  req.method === 'POST' && req.path === '/api/config/versions'
web.use((req, res, next) => {
  if (isConfigUpload(req)) return next()
  return jsonParser(req, res, next)
})

web.use(publicRouter)
web.use(privateRouter)
web.use(errorMiddleware)
