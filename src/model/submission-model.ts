import { Submission, OrgUnit, User, ReviewComment, SubmissionLog } from '@prisma/client'

export interface CreateSubmissionRequest {
  title: string
  sdgId: number
  year: number
  theAnswers?: Record<string, unknown>
  qsAnswers?: Record<string, unknown>
  fileNames?: Record<string, unknown>
}

export interface UpdateSubmissionRequest {
  title?: string
  theAnswers?: Record<string, unknown>
  qsAnswers?: Record<string, unknown>
  fileNames?: Record<string, unknown>
}

export interface ReviewRequest {
  action: 'approve' | 'request_revision' | 'reject' | 'comment'
  comment?: string
  questionId?: string | null
  bibliometricScores?: Record<string, number>
}

export type SubmissionWithRelations = Submission & {
  orgUnit: OrgUnit
  submittedBy: { id: string; name: string }
  reviewComments?: ReviewComment[]
  logs?: SubmissionLog[]
}

export type SubmissionResponse = {
  id: string
  title: string
  sdgId: number
  year: number
  status: string
  points: number
  revisionCount: number
  orgUnitId: string
  orgUnit: { id: string; name: string; abbreviation: string; type: string }
  submittedByUserId: string
  submittedBy: { id: string; name: string }
  submittedAt: Date | null
  theAnswers: unknown
  qsAnswers: unknown
  fileNames: unknown
  createdAt: Date
  updatedAt: Date
  reviewComments?: unknown[]
  logs?: unknown[]
}

export function toSubmissionResponse(s: SubmissionWithRelations): SubmissionResponse {
  return {
    id: s.id,
    title: s.title,
    sdgId: s.sdgId,
    year: s.year,
    status: s.status,
    points: s.points,
    revisionCount: s.revisionCount,
    orgUnitId: s.orgUnitId,
    orgUnit: {
      id: s.orgUnit.id,
      name: s.orgUnit.name,
      abbreviation: s.orgUnit.abbreviation,
      type: s.orgUnit.type
    },
    submittedByUserId: s.submittedByUserId,
    submittedBy: s.submittedBy,
    submittedAt: s.submittedAt,
    theAnswers: s.theAnswers,
    qsAnswers: s.qsAnswers,
    fileNames: s.fileNames,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    ...(s.reviewComments !== undefined ? { reviewComments: s.reviewComments } : {}),
    ...(s.logs !== undefined ? { logs: s.logs } : {})
  }
}
