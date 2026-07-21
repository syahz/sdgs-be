import { Router } from 'express'
import { getSettingsController, updateSettingsController, updateDeletePinController } from '../../controller/settings-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/', getSettingsController)
router.patch('/', requireRole('super_admin'), updateSettingsController)
router.patch('/delete-pin', requireRole('super_admin'), updateDeletePinController)

export default router
