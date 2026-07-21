import { Request, Response, NextFunction } from 'express'
import { UserRequest } from '../type/user-request'
import {
  getActiveAnnouncementService,
  getAnnouncementForEditService,
  upsertAnnouncementService
} from '../service/announcement-service'

/** GET /announcement — banner aktif (semua role). null jika tak ada. */
export const getAnnouncementController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getActiveAnnouncementService()
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

/** GET /announcement/edit — baris apa pun (super_admin/validator) untuk editor. */
export const getAnnouncementForEditController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getAnnouncementForEditService()
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

/** PUT /announcement — set/ubah pengumuman (super_admin/validator). */
export const upsertAnnouncementController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as UserRequest).user!
    const result = await upsertAnnouncementService(req.body, user.name)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
