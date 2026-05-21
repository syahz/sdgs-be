import { Request, Response, NextFunction } from 'express'
import { getOverallDashboardService, getOrgUnitRankingService, getSdgDetailService } from '../service/dashboard-service'

export const getOverallDashboardController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawYear = typeof req.query.year === 'string' ? req.query.year : undefined
    const year = rawYear ? parseInt(rawYear) : undefined
    const result = await getOverallDashboardService(year)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getOrgUnitRankingController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawYear = typeof req.query.year === 'string' ? req.query.year : undefined
    const year = rawYear ? parseInt(rawYear) : undefined
    const result = await getOrgUnitRankingService(year)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getSdgDetailController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sdgId = parseInt(req.params.sdgId as string)
    const rawYear = typeof req.query.year === 'string' ? req.query.year : undefined
    const year = rawYear ? parseInt(rawYear) : undefined
    const result = await getSdgDetailService(sdgId, year)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
