import { Router } from 'express'
import {
  getUniversityRecordsController,
  getUniversityRecordByIdController,
  createUniversityRecordController,
  updateUniversityRecordController,
  deleteUniversityRecordController
} from '../../controller/university-record-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/', getUniversityRecordsController)
router.get('/:id', getUniversityRecordByIdController)
router.post('/', requireRole('validator', 'super_admin'), createUniversityRecordController)
router.patch('/:id', requireRole('validator', 'super_admin'), updateUniversityRecordController)
router.delete('/:id', requireRole('validator', 'super_admin'), deleteUniversityRecordController)

export default router
