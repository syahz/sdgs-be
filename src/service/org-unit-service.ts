import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { OrgUnitValidation } from '../validation/org-unit-validation'
import { CreateOrgUnitRequest, UpdateOrgUnitRequest, OrgUnitResponse, toOrgUnitResponse } from '../model/org-unit-model'

export const getOrgUnitsService = async (type?: string): Promise<OrgUnitResponse[]> => {
  const where = type ? { type: type as any } : {}
  const items = await prismaClient.orgUnit.findMany({ where, orderBy: { name: 'asc' } })
  return items.map(toOrgUnitResponse)
}

export const getOrgUnitByIdService = async (id: string): Promise<OrgUnitResponse> => {
  const item = await prismaClient.orgUnit.findUnique({ where: { id } })
  if (!item) throw new ResponseError(404, 'OrgUnit tidak ditemukan', 'NOT_FOUND')
  return toOrgUnitResponse(item)
}

export const createOrgUnitService = async (request: CreateOrgUnitRequest): Promise<OrgUnitResponse> => {
  const req = Validation.validate(OrgUnitValidation.CREATE, request)
  const existing = await prismaClient.orgUnit.findFirst({ where: { name: req.name } })
  if (existing) throw new ResponseError(409, 'Nama org unit sudah ada', 'CONFLICT')
  const item = await prismaClient.orgUnit.create({ data: req })
  return toOrgUnitResponse(item)
}

export const updateOrgUnitService = async (id: string, request: UpdateOrgUnitRequest): Promise<OrgUnitResponse> => {
  const req = Validation.validate(OrgUnitValidation.UPDATE, request)
  const existing = await prismaClient.orgUnit.findUnique({ where: { id } })
  if (!existing) throw new ResponseError(404, 'OrgUnit tidak ditemukan', 'NOT_FOUND')

  if (req.name && req.name !== existing.name) {
    const conflict = await prismaClient.orgUnit.findFirst({ where: { name: req.name, id: { not: id } } })
    if (conflict) throw new ResponseError(409, 'Nama org unit sudah digunakan', 'CONFLICT')
  }

  const updated = await prismaClient.orgUnit.update({ where: { id }, data: req })
  return toOrgUnitResponse(updated)
}

export const deleteOrgUnitService = async (id: string): Promise<{ message: string }> => {
  const existing = await prismaClient.orgUnit.findUnique({ where: { id } })
  if (!existing) throw new ResponseError(404, 'OrgUnit tidak ditemukan', 'NOT_FOUND')

  const submissionCount = await prismaClient.submission.count({ where: { orgUnitId: id } })
  if (submissionCount > 0) {
    throw new ResponseError(409, `OrgUnit tidak dapat dihapus karena memiliki ${submissionCount} submission`, 'CONFLICT')
  }

  await prismaClient.orgUnit.delete({ where: { id } })
  return { message: 'OrgUnit berhasil dihapus' }
}
