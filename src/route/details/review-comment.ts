import { Router } from 'express'
import { deleteCommentController } from '../../controller/review-comment-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.delete('/:id', requireRole('validator', 'super_admin'), deleteCommentController)

export default router
