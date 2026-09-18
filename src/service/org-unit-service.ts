import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { OrgUnitValidation } from '../validation/org-unit-validation'
import { CreateOrgUnitRequest, UpdateOrgUnitRequest, OrgUnitResponse, toOrgUnitResponse } from '../model/org-unit-model'
import { FieldChange } from '../model/audit-log-model'
import { logActivity } from './activity-log-service'

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
  await logActivity({
    category: 'org_unit',
    action: 'ORG_UNIT_CREATED',
    description: `Membuat unit kerja ${item.name} (${item.abbreviation})`,
    orgUnitName: item.name,
    targetId: item.id,
    metadata: { abbreviation: item.abbreviation, type: item.type }
  })
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

  const changes: FieldChange[] = []
  const fields: [string, string, string][] = [
    ['Nama', existing.name, updated.name],
    ['Singkatan', existing.abbreviation, updated.abbreviation],
    ['Jenis', existing.type, updated.type]
  ]
  for (const [field, before, after] of fields) {
    if (before !== after) changes.push({ field, before, after })
  }
  if (changes.length > 0) {
    await logActivity({
      category: 'org_unit',
      action: 'ORG_UNIT_UPDATED',
      description: `Mengubah unit kerja ${updated.name}`,
      orgUnitName: updated.name,
      targetId: updated.id,
      metadata: { changes }
    })
  }
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
  await logActivity({
    category: 'org_unit',
    action: 'ORG_UNIT_DELETED',
    description: `Menghapus unit kerja ${existing.name} (${existing.abbreviation})`,
    orgUnitName: existing.name,
    targetId: existing.id
  })
  return { message: 'OrgUnit berhasil dihapus' }
}
