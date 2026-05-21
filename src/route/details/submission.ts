import { Router } from 'express'
import {
  getSubmissionsController,
  getSubmissionByIdController,
  createSubmissionController,
  updateSubmissionController,
  submitSubmissionController,
  reviewSubmissionController,
  getSubmissionLogsController,
  getSubmissionCommentsController,
  addCommentController
} from '../../controller/submission-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

// List & detail — all authenticated roles
router.get('/', getSubmissionsController)
router.get('/:id', getSubmissionByIdController)
router.get('/:id/logs', getSubmissionLogsController)
router.get('/:id/comments', getSubmissionCommentsController)

// unit_admin only
router.post('/', requireRole('unit_admin'), createSubmissionController)
router.patch('/:id', requireRole('unit_admin'), updateSubmissionController)
router.post('/:id/submit', requireRole('unit_admin'), submitSubmissionController)

// validator + super_admin
router.post('/:id/review', requireRole('validator', 'super_admin'), reviewSubmissionController)
router.post('/:id/comments', requireRole('validator', 'super_admin'), addCommentController)

export default router
