import { Router } from 'express'
import {
  getOrgUnitsController,
  getOrgUnitByIdController,
  createOrgUnitController,
  updateOrgUnitController,
  deleteOrgUnitController
} from '../../controller/org-unit-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/', getOrgUnitsController)
router.get('/:id', getOrgUnitByIdController)
router.post('/', requireRole('super_admin'), createOrgUnitController)
router.patch('/:id', requireRole('super_admin'), updateOrgUnitController)
router.delete('/:id', requireRole('super_admin'), deleteOrgUnitController)

export default router
