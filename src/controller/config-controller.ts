import { Request, Response, NextFunction } from 'express'
import { THE_SDG_CONFIG_2026 } from '../config/the-sdg-config'
import QS_SDG_CONFIG from '../config/qs-sdg-config'
import { SDG_META } from '../config/sdg-meta'

export const getSdgConfigController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.status(200).json({ data: THE_SDG_CONFIG_2026 })
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
