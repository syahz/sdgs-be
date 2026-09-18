import { Router } from 'express'
import { getActivityLogsController } from '../../controller/activity-log-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/', requireRole('super_admin'), getActivityLogsController)

export default router
