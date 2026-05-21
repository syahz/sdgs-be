import { UniversityRecord, User } from '@prisma/client'

export interface CreateUniversityRecordRequest {
  title: string
  sdgId: number
  year: number
  status?: 'draft' | 'published'
  theAnswers?: Record<string, unknown>
  qsAnswers?: Record<string, unknown>
}

export interface UpdateUniversityRecordRequest {
  title?: string
  sdgId?: number
  year?: number
  status?: 'draft' | 'published'
  theAnswers?: Record<string, unknown>
  qsAnswers?: Record<string, unknown>
}

export type UniversityRecordWithUser = UniversityRecord & {
  createdBy: { id: string; name: string }
}

export type UniversityRecordResponse = {
  id: string
  title: string
  sdgId: number
  year: number
  status: string
  points: number
  createdByUserId: string
  createdBy: { id: string; name: string }
  theAnswers: unknown
  qsAnswers: unknown
  createdAt: Date
  updatedAt: Date
}

export function toUniversityRecordResponse(r: UniversityRecordWithUser): UniversityRecordResponse {
  return {
    id: r.id,
    title: r.title,
    sdgId: r.sdgId,
    year: r.year,
    status: r.status,
    points: r.points,
    createdByUserId: r.createdByUserId,
    createdBy: r.createdBy,
    theAnswers: r.theAnswers,
    qsAnswers: r.qsAnswers,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }
}
