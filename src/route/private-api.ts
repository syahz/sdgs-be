import { Router } from 'express'
import orgUnitRouter from './details/org-unit'
import userRouter from './details/user'
import submissionRouter from './details/submission'
import reviewCommentRouter from './details/review-comment'
import universityRecordRouter from './details/university-record'
import settingsRouter from './details/settings'
import dashboardRouter from './details/dashboard'
import configRouter from './details/config'

export const privateRouter = Router()

privateRouter.use('/api/org-units', orgUnitRouter)
privateRouter.use('/api/users', userRouter)
privateRouter.use('/api/submissions', submissionRouter)
privateRouter.use('/api/comments', reviewCommentRouter)
privateRouter.use('/api/university-records', universityRecordRouter)
privateRouter.use('/api/settings', settingsRouter)
privateRouter.use('/api/dashboard', dashboardRouter)
privateRouter.use('/api/config', configRouter)
