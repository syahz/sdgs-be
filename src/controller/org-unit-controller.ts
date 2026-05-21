import { Request, Response, NextFunction } from 'express'
import {
  getOrgUnitsService,
  getOrgUnitByIdService,
  createOrgUnitService,
  updateOrgUnitService,
  deleteOrgUnitService
} from '../service/org-unit-service'

export const getOrgUnitsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type } = req.query as { type?: string }
    const result = await getOrgUnitsService(type)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getOrgUnitByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await getOrgUnitByIdService(id)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const createOrgUnitController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await createOrgUnitService(req.body)
    res.status(201).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const updateOrgUnitController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await updateOrgUnitService(id, req.body)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const deleteOrgUnitController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await deleteOrgUnitService(id)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
