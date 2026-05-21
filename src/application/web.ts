import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import passport from 'passport'
import { FRONTEND_URL } from '../config/index'
import { publicRouter } from '../route/public-api'
import { privateRouter } from '../route/private-api'
import { errorMiddleware } from '../middleware/error-middleware'
import { globalLimiter } from '../middleware/rate-limit'
import '../config/passport-setup'

export const web = express()

web.set('trust proxy', 1)

const corsOptions = {
  origin: FRONTEND_URL || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}

web.use(helmet())
web.use(cors(corsOptions))
web.use(globalLimiter)
web.use(cookieParser())
web.use(express.json())
web.use(passport.initialize())

web.use(publicRouter)
web.use(privateRouter)
web.use(errorMiddleware)
