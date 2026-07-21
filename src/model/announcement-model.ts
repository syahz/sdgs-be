import { Announcement } from '@prisma/client'

export interface UpsertAnnouncementRequest {
  message: string
  active: boolean
}

export type AnnouncementResponse = {
  id: string
  message: string
  active: boolean
  updatedByName: string | null
  updatedAt: Date
}

export function toAnnouncementResponse(a: Announcement): AnnouncementResponse {
  return {
    id: a.id,
    message: a.message,
    active: a.active,
    updatedByName: a.updatedByName,
    updatedAt: a.updatedAt
  }
}
