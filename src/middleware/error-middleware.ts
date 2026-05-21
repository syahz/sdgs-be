import { NextFunction, Request, Response } from 'express'
import { ResponseError } from '../error/response-error'
import { ZodError } from 'zod'

export const errorMiddleware = async (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: 'Validation Error',
      code: 'VALIDATION_ERROR',
      details: error.errors
    })
  } else if (error instanceof ResponseError) {
    res.status(error.status).json({
      message: error.message,
      code: error.code ?? 'ERROR',
      ...(error.details !== undefined ? { details: error.details } : {})
    })
  } else {
    res.status(500).json({
      message: error.message || 'Internal Server Error',
      code: 'INTERNAL_ERROR'
    })
  }
}
