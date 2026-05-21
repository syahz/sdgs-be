import { Router } from 'express'
import { getSettingsController, updateSettingsController } from '../../controller/settings-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/', getSettingsController)
router.patch('/', requireRole('super_admin'), updateSettingsController)

export default router
