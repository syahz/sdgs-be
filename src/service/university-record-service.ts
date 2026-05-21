import { prismaClient } from '../application/database'
import { Prisma } from '@prisma/client'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { UniversityRecordValidation } from '../validation/university-record-validation'
import {
  CreateUniversityRecordRequest,
  UpdateUniversityRecordRequest,
  UniversityRecordWithUser,
  toUniversityRecordResponse
} from '../model/university-record-model'
import { UserWithRelations } from '../type/user-request'
import { calcSdgEstimate } from '../config/sdg-scoring'
import { unwrapTheAnswers } from '../config/the-answer-key'
import { sanitizeJson } from '../utils/sanitize'

const recordInclude = {
  createdBy: { select: { id: true, name: true } }
}

function computePoints(sdgId: number, theAnswers: Record<string, unknown>): number {
  const decoded = unwrapTheAnswers(theAnswers as Record<string, any>)
  return calcSdgEstimate(sdgId, decoded as any)
}

export const getUniversityRecordsService = async (filters: { year?: string; sdgId?: string; status?: string }) => {
  const where: any = {}
  if (filters.year) where.year = parseInt(filters.year)
  if (filters.sdgId) where.sdgId = parseInt(filters.sdgId)
  if (filters.status) where.status = filters.status

  const items = await prismaClient.universityRecord.findMany({
    where,
    include: recordInclude,
    orderBy: [{ year: 'desc' }, { sdgId: 'asc' }]
  })
  return items.map((r) => toUniversityRecordResponse(r as UniversityRecordWithUser))
}

export const getUniversityRecordByIdService = async (id: string) => {
  const item = await prismaClient.universityRecord.findUnique({ where: { id }, include: recordInclude })
  if (!item) throw new ResponseError(404, 'University record tidak ditemukan', 'NOT_FOUND')
  return toUniversityRecordResponse(item as UniversityRecordWithUser)
}

export const createUniversityRecordService = async (request: CreateUniversityRecordRequest, currentUser: UserWithRelations) => {
  const req = Validation.validate(UniversityRecordValidation.CREATE, request)

  const existing = await prismaClient.universityRecord.findFirst({
    where: { sdgId: req.sdgId, year: req.year }
  })
  if (existing) throw new ResponseError(409, 'University record untuk SDG dan tahun ini sudah ada', 'CONFLICT')

  const cleanThe = sanitizeJson(req.theAnswers ?? {})
  const cleanQs = sanitizeJson(req.qsAnswers ?? {})
  const points = computePoints(req.sdgId, cleanThe as any)

  const item = await prismaClient.universityRecord.create({
    data: {
      title: req.title,
      sdgId: req.sdgId,
      year: req.year,
      status: req.status as any,
      theAnswers: cleanThe as Prisma.InputJsonValue,
      qsAnswers: cleanQs as Prisma.InputJsonValue,
      points,
      createdByUserId: currentUser.id
    },
    include: recordInclude
  })
  return toUniversityRecordResponse(item as UniversityRecordWithUser)
}

export const updateUniversityRecordService = async (id: string, request: UpdateUniversityRecordRequest) => {
  const req = Validation.validate(UniversityRecordValidation.UPDATE, request)

  const item = await prismaClient.universityRecord.findUnique({ where: { id }, include: recordInclude })
  if (!item) throw new ResponseError(404, 'University record tidak ditemukan', 'NOT_FOUND')

  const newSdgId = req.sdgId ?? item.sdgId
  const newTheAnswers = sanitizeJson(req.theAnswers ?? (item.theAnswers as any))
  const points = computePoints(newSdgId, newTheAnswers)

  const updated = await prismaClient.universityRecord.update({
    where: { id },
    data: {
      title: req.title,
      sdgId: req.sdgId,
      year: req.year,
      status: req.status as any,
      theAnswers: newTheAnswers as Prisma.InputJsonValue,
      qsAnswers:
        req.qsAnswers !== undefined
          ? (sanitizeJson(req.qsAnswers) as Prisma.InputJsonValue)
          : undefined,
      points
    },
    include: recordInclude
  })
  return toUniversityRecordResponse(updated as UniversityRecordWithUser)
}

export const deleteUniversityRecordService = async (id: string): Promise<{ message: string }> => {
  const item = await prismaClient.universityRecord.findUnique({ where: { id } })
  if (!item) throw new ResponseError(404, 'University record tidak ditemukan', 'NOT_FOUND')
  await prismaClient.universityRecord.delete({ where: { id } })
  return { message: 'University record berhasil dihapus' }
}
