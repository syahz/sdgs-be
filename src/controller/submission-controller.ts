import { Request, Response, NextFunction } from 'express'
import {
  getSubmissionsService,
  getSubmissionByIdService,
  createSubmissionService,
  updateSubmissionService,
  submitSubmissionService,
  reviewSubmissionService,
  getSubmissionLogsService,
  getSubmissionCommentsService,
  addCommentService
} from '../service/submission-service'
import { UserRequest } from '../type/user-request'

export const getSubmissionsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, orgUnitId, year, sdgId, submittedByUserId } = req.query as Record<string, string>
    const currentUser = (req as UserRequest).user!
    const result = await getSubmissionsService({ status, orgUnitId, year, sdgId, submittedByUserId }, currentUser)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getSubmissionByIdController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const includeComments = req.query.includeComments === 'true'
    const includeLogs = req.query.includeLogs === 'true'
    const result = await getSubmissionByIdService(id, currentUser, includeComments, includeLogs)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const createSubmissionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const result = await createSubmissionService(req.body, currentUser)
    res.status(201).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const updateSubmissionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await updateSubmissionService(id, req.body, currentUser)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const submitSubmissionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await submitSubmissionService(id, currentUser)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const reviewSubmissionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await reviewSubmissionService(id, req.body, currentUser)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getSubmissionLogsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await getSubmissionLogsService(id, currentUser)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const getSubmissionCommentsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await getSubmissionCommentsService(id, currentUser)
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const addCommentController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUser = (req as UserRequest).user!
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await addCommentService(id, req.body, currentUser)
    res.status(201).json({ data: result })
  } catch (e) {
    next(e)
  }
}
