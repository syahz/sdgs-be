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
  addCommentService,
  deleteSubmissionService,
  deleteFacultySubmissionsService
} from '../service/submission-service'
import { AuditContext } from '../service/audit-log-service'
import { UserRequest } from '../type/user-request'

/** Konteks audit (pelaku + forensik) dari request — untuk jejak hapus. */
function auditCtx(req: Request): AuditContext {
  const user = (req as UserRequest).user
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : null
  return {
    actorId: user?.id ?? null,
    actorName: user?.name ?? 'Unknown',
    actorRole: user?.role ?? 'unknown',
    ip: req.ip ?? req.socket.remoteAddress ?? null,
    userAgent: req.headers['user-agent'] ?? null,
    reason
  }
}

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

export const deleteSubmissionController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id[0]
    const result = await deleteSubmissionService(id, req.body?.pin, auditCtx(req))
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}

export const deleteFacultySubmissionsController = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.orgUnitId
    const orgUnitId = typeof rawId === 'string' ? rawId : rawId[0]
    const year = parseInt(String(req.query.year))
    const result = await deleteFacultySubmissionsService(orgUnitId, year, req.body?.pin, auditCtx(req))
    res.status(200).json({ data: result })
  } catch (e) {
    next(e)
  }
}
