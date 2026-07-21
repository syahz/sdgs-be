import { prismaClient } from '../application/database'
import { Validation } from '../validation/Validation'
import { AnnouncementValidation } from '../validation/announcement-validation'
import { UpsertAnnouncementRequest, AnnouncementResponse, toAnnouncementResponse } from '../model/announcement-model'

/** Pengumuman aktif untuk banner (null jika tak ada / dimatikan). */
export const getActiveAnnouncementService = async (): Promise<AnnouncementResponse | null> => {
  const a = await prismaClient.announcement.findFirst({ orderBy: { updatedAt: 'desc' } })
  if (!a || !a.active) return null
  return toAnnouncementResponse(a)
}

/** Untuk editor (super_admin/validator) — kembalikan baris apa pun statusnya. */
export const getAnnouncementForEditService = async (): Promise<AnnouncementResponse | null> => {
  const a = await prismaClient.announcement.findFirst({ orderBy: { updatedAt: 'desc' } })
  return a ? toAnnouncementResponse(a) : null
}

/** Upsert 1 pengumuman logis (1 aktif). Update baris terakhir, atau buat baru. */
export const upsertAnnouncementService = async (
  request: UpsertAnnouncementRequest,
  actorName: string
): Promise<AnnouncementResponse> => {
  const req = Validation.validate(AnnouncementValidation.UPSERT, request)
  const existing = await prismaClient.announcement.findFirst({ orderBy: { updatedAt: 'desc' } })

  const a = existing
    ? await prismaClient.announcement.update({
        where: { id: existing.id },
        data: { message: req.message, active: req.active, updatedByName: actorName }
      })
    : await prismaClient.announcement.create({
        data: { message: req.message, active: req.active, updatedByName: actorName }
      })

  return toAnnouncementResponse(a)
}
