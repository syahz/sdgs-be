import { Router } from 'express'
import { getSdgConfigController, getQsConfigController, getSdgMetaController } from '../../controller/config-controller'
import { authRequired } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

router.get('/sdg', getSdgConfigController)
router.get('/qs', getQsConfigController)
router.get('/sdg-meta', getSdgMetaController)

export default router
