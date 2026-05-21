import { Router } from 'express'
import {
  getUsersController,
  getUserByIdController,
  createUserController,
  updateUserController,
  deleteUserController
} from '../../controller/user-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/', requireRole('super_admin'), getUsersController)
router.get('/:id', requireRole('super_admin'), getUserByIdController)
router.post('/', requireRole('super_admin'), createUserController)
// PATCH: super_admin (any user) OR a user updating their own profile — enforced in service
router.patch('/:id', updateUserController)
router.delete('/:id', requireRole('super_admin'), deleteUserController)

export default router
