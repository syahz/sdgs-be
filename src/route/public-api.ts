import { Router } from 'express'
import authRouter from './details/auth'

export const publicRouter = Router()

publicRouter.use('/api/auth', authRouter)
