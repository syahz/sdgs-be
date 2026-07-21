import { Router } from 'express'
import {
  getAnnouncementController,
  getAnnouncementForEditController,
  upsertAnnouncementController
} from '../../controller/announcement-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/', getAnnouncementController)
router.get('/edit', requireRole('super_admin', 'validator'), getAnnouncementForEditController)
router.put('/', requireRole('super_admin', 'validator'), upsertAnnouncementController)

export default router
