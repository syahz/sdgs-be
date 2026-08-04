import { Router, json } from 'express'
import {
  getSdgConfigController,
  getQsConfigController,
  getSdgMetaController,
  getConfigTemplateController,
  listConfigVersionsController,
  createConfigDraftController,
  activateConfigVersionController,
  deleteConfigDraftController,
  getConfigYearStatusController,
  getConfigVersionDetailController,
} from '../../controller/config-controller'
import { authRequired, requireRole } from '../../middleware/auth-middleware'

const router = Router()

router.use(authRequired)

// Baca — semua role yang sudah login.
router.get('/sdg', getSdgConfigController)
router.get('/qs', getQsConfigController)
router.get('/sdg-meta', getSdgMetaController)

// ── Pengelolaan versi — super admin saja ───────────────────────────────────
//
// Body limit dinaikkan KHUSUS di jalur ini. `express.json()` global memakai
// batas bawaan 100 KB, sedangkan payload kerangka THE ±180 KB — tanpa ini
// unggahan ditolak 413 sebelum sempat divalidasi, dan pesannya tidak
// menjelaskan apa pun ke admin.
const configBody = json({ limit: '2mb' })

router.get('/versions', requireRole('super_admin'), listConfigVersionsController)
router.get('/years', requireRole('super_admin'), getConfigYearStatusController)
router.get('/versions/:id', requireRole('super_admin'), getConfigVersionDetailController)
router.get('/template', requireRole('super_admin'), getConfigTemplateController)
router.post('/versions', requireRole('super_admin'), configBody, createConfigDraftController)
router.post('/versions/:id/activate', requireRole('super_admin'), activateConfigVersionController)
router.delete('/versions/:id', requireRole('super_admin'), deleteConfigDraftController)

export default router
