import { Request, Response, NextFunction } from 'express'
import { getSettingsService, updateSettingsService } from '../service/settings-service'

export const getSettingsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getSettingsService()
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const updateSettingsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await updateSettingsService(req.body)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
