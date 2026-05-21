import { Request, Response, NextFunction } from 'express'
import {
  getUniversityRecordsService,
  getUniversityRecordByIdService,
  createUniversityRecordService,
  updateUniversityRecordService,
  deleteUniversityRecordService
} from '../service/university-record-service'
import { UserRequest } from '../type/user-request'

export const getUniversityRecordsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { year, sdgId, status } = req.query as { year?: string; sdgId?: string; status?: string }
    const result = await getUniversityRecordsService({ year, sdgId, status })
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getUniversityRecordByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await getUniversityRecordByIdService(id)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const createUniversityRecordController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const result = await createUniversityRecordService(req.body, currentUser)
    res.status(201).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const updateUniversityRecordController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await updateUniversityRecordService(id, req.body)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const deleteUniversityRecordController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await deleteUniversityRecordService(id)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
