import { Request, Response, NextFunction } from 'express'
import { UserRequest } from '../type/user-request'
import {
  getUsersService,
  getUserByIdService,
  createUserService,
  updateUserService,
  deleteUserService
} from '../service/user-service'

export const getUsersController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role, orgUnitId, status } = req.query as { role?: string; orgUnitId?: string; status?: string }
    const result = await getUsersService({ role, orgUnitId, status })
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getUserByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await getUserByIdService(id)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const createUserController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await createUserService(req.body)
    res.status(201).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const updateUserController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const currentUser = (req as UserRequest).user!
    const result = await updateUserService(id, req.body, currentUser)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const deleteUserController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await deleteUserService(id)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
