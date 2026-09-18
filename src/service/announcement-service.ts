import { prismaClient } from '../application/database'
import { Validation } from '../validation/Validation'
import { sanitizeString } from '../utils/sanitize'
import { AnnouncementValidation } from '../validation/announcement-validation'
import { UpsertAnnouncementRequest, AnnouncementResponse, toAnnouncementResponse } from '../model/announcement-model'
import { logActivity } from './activity-log-service'

/**
 * Pengumuman aktif untuk banner (null jika tak ada / dimatikan).
 *
 * `updatedByName` sengaja TIDAK dikirim di sini: endpoint ini terbuka untuk
 * semua role termasuk unit_admin, dan pengumuman biasanya ditulis validator —
 * jalur bocor identitas peninjau yang sama dengan catatan revisi. Editor
 * (super_admin/validator) tetap melihatnya lewat GET /announcement/edit.
 */
export const getActiveAnnouncementService = async (): Promise<AnnouncementResponse | null> => {
  const a = await prismaClient.announcement.findFirst({ orderBy: { updatedAt: 'desc' } })
  if (!a || !a.active) return null
  return { ...toAnnouncementResponse(a), updatedByName: null }
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

  // Pengumuman tampil di dashboard semua role — sanitasi seperti teks bebas lain.
  const message = sanitizeString(req.message)

  const a = existing
    ? await prismaClient.announcement.update({
        where: { id: existing.id },
        data: { message, active: req.active, updatedByName: actorName }
      })
    : await prismaClient.announcement.create({
        data: { message, active: req.active, updatedByName: actorName }
      })

  await logActivity({
    category: 'settings',
    action: 'ANNOUNCEMENT_UPDATED',
    description: a.active ? 'Memperbarui pengumuman (aktif)' : 'Menonaktifkan pengumuman',
    metadata: { active: a.active, message: a.message.slice(0, 300) }
  })

  return toAnnouncementResponse(a)
}
