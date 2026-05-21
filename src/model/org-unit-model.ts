import { OrgUnit } from '@prisma/client'

export interface CreateOrgUnitRequest {
  name: string
  abbreviation: string
  type: 'faculty' | 'directorate' | 'unit'
}

export interface UpdateOrgUnitRequest {
  name?: string
  abbreviation?: string
  type?: 'faculty' | 'directorate' | 'unit'
}

export type OrgUnitResponse = {
  id: string
  name: string
  abbreviation: string
  type: string
  createdAt: Date
  updatedAt: Date
}

export function toOrgUnitResponse(o: OrgUnit): OrgUnitResponse {
  return {
    id: o.id,
    name: o.name,
    abbreviation: o.abbreviation,
    type: o.type,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt
  }
}
