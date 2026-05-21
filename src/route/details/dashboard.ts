import { Router } from 'express'
import {
  getOverallDashboardController,
  getOrgUnitRankingController,
  getSdgDetailController
} from '../../controller/dashboard-controller'
import { authRequired } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/overall', getOverallDashboardController)
router.get('/org-units', getOrgUnitRankingController)
router.get('/sdg/:sdgId', getSdgDetailController)

export default router
