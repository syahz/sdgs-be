import { Request, Response, NextFunction } from 'express'
import QS_SDG_CONFIG from '../config/qs-sdg-config'
import { SDG_META } from '../config/sdg-meta'
import { resolveConfig, availableConfigYears } from '../config/config-registry'
import { UserRequest } from '../type/user-request'
import {
  getConfigTemplateService,
  listConfigVersionsService,
  createConfigDraftService,
  activateConfigVersionService,
  deleteConfigDraftService,
  getConfigVersionDetailService,
  getConfigYearStatusService,
} from '../service/config-version-service'

/**
 * Config indikator THE untuk satu tahun.
 *
 * `?year=` opsional; tanpa itu memakai tahun berjalan. Tahun yang belum punya
 * config sendiri dilayani config tahun terdekat sebelumnya — karena itu respons
 * SELALU menyebut `year` yang benar-benar dipakai di samping `requestedYear`,
 * supaya pemanggil tidak menyangka menerima kerangka tahun yang ia minta.
 */
export const getSdgConfigController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = req.query.year
    const requestedYear =
      typeof raw === 'string' && /^\d{4}$/.test(raw) ? Number(raw) : new Date().getFullYear()

    const bundle = resolveConfig(requestedYear)

    res.status(200).json({
      data: {
        requestedYear,
        year: bundle.year,
        source: bundle.source,
        availableYears: availableConfigYears(),
        sdgs: bundle.sdgs,
        quantFormulas: bundle.quantFormulas,
        qualQuestions: bundle.qualQuestions,
        groupTitles: bundle.groupTitles,
      },
    })
  } catch (e) {
    next(e)
  }
}

export const getQsConfigController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ data: QS_SDG_CONFIG })
  } catch (e) {
    next(e)
  }
}

export const getSdgMetaController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ data: SDG_META })
  } catch (e) {
    next(e)
  }
}

// ── Pengelolaan versi config (super admin) ─────────────────────────────────

export const getConfigTemplateController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const from = typeof req.query.from === 'string' && /^\d{4}$/.test(req.query.from) ? Number(req.query.from) : new Date().getFullYear()
    const target = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year) ? Number(req.query.year) : undefined
    const result = await getConfigTemplateService(from, target)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const listConfigVersionsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ data: await listConfigVersionsService() })
  } catch (e) {
    next(e)
  }
}

export const createConfigDraftController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as UserRequest).user!
    const result = await createConfigDraftService(req.body, { id: user.id, name: user.name })
    res.status(201).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const activateConfigVersionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await activateConfigVersionService(id, req.body, { name: user.name })
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const deleteConfigDraftController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    res.status(200).json({ data: await deleteConfigDraftService(id) })
  } catch (e) {
    next(e)
  }
}

export const getConfigYearStatusController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ data: await getConfigYearStatusService() })
  } catch (e) {
    next(e)
  }
}

export const getConfigVersionDetailController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    res.status(200).json({ data: await getConfigVersionDetailService(id) })
  } catch (e) {
    next(e)
  }
}
