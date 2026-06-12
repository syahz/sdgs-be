import { Request, Response, NextFunction } from 'express'
import { getAuditLogsService, getCellHistoryService } from '../service/audit-log-service'

/** GET /university-records/audit?sdgId=&year=&action=&actor=&q=&page=&pageSize=  (super_admin) */
export const getAuditLogsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sdgId, year, action, actor, q, page, pageSize } = req.query as {
      sdgId?: string
      year?: string
      action?: string
      actor?: string
      q?: string
      page?: string
      pageSize?: string
    }
    const result = await getAuditLogsService({ sdgId, year, action, actor, q, page, pageSize })
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

/** GET /university-records/audit/cell?sdgId=&year=  (validator + super_admin) */
export const getCellHistoryController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sdgId = parseInt(String(req.query.sdgId))
    const year = parseInt(String(req.query.year))
    if (Number.isNaN(sdgId) || Number.isNaN(year)) {
      res.status(400).json({ message: 'sdgId dan year wajib diisi', code: 'BAD_REQUEST' })
      return
    }
    const result = await getCellHistoryService(sdgId, year)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
