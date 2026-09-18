import { Request, Response, NextFunction } from 'express'
import { getActivityLogsService } from '../service/activity-log-service'

/** GET /activity-logs?category=&action=&role=&sdgId=&year=&from=&to=&q=&page=&pageSize=  (super_admin) */
export const getActivityLogsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getActivityLogsService(req.query)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
