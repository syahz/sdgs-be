import { Request, Response, NextFunction } from 'express'
import { deleteCommentService } from '../service/review-comment-service'
import { UserRequest } from '../type/user-request'

export const deleteCommentController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await deleteCommentService(id, currentUser)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
