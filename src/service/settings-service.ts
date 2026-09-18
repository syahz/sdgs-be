import bcrypt from 'bcryptjs'
import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { SettingsValidation } from '../validation/settings-validation'
import { UpdateSettingsRequest, UpdateDeletePinRequest, SettingsResponse, toSettingsResponse, DEFAULT_SETTINGS } from '../model/settings-model'
import { FieldChange } from '../model/audit-log-model'
import { UserWithRelations } from '../type/user-request'
import { logActivity } from './activity-log-service'

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

type WindowFields = Pick<SettingsResponse, 'submissionYear' | 'windowStartMonth' | 'windowStartDay' | 'windowEndMonth' | 'windowEndDay' | 'mandatorySdgs'>

const fmtStart = (s: WindowFields) => `${s.windowStartDay} ${MONTHS[s.windowStartMonth - 1]} ${s.submissionYear}`
const fmtEnd = (s: WindowFields) => `${s.windowEndDay} ${MONTHS[s.windowEndMonth - 1]} ${s.submissionYear}`

/** Diff pengaturan yang terbaca manusia — tanggal ditampilkan utuh, bukan angka bulan/hari terpisah. */
function settingsChanges(before: WindowFields, after: WindowFields): FieldChange[] {
  const changes: FieldChange[] = []
  const track = (field: string, b: string | number, a: string | number) => {
    if (b !== a) changes.push({ field, before: b, after: a })
  }
  track('Tahun pelaporan', before.submissionYear, after.submissionYear)
  track('Mulai pengisian', fmtStart(before), fmtStart(after))
  track('Cut-off', fmtEnd(before), fmtEnd(after))
  track('SDG wajib', before.mandatorySdgs.join(', '), after.mandatorySdgs.join(', '))
  return changes
}

async function getOrCreateSettings() {
  let settings = await prismaClient.systemSettings.findFirst()
  if (!settings) settings = await prismaClient.systemSettings.create({ data: DEFAULT_SETTINGS })
  return settings
}

export const getSettingsService = async (): Promise<SettingsResponse> => {
  let settings = await prismaClient.systemSettings.findFirst()
  if (!settings) {
    settings = await prismaClient.systemSettings.create({ data: DEFAULT_SETTINGS })
  }
  return toSettingsResponse(settings)
}

export const updateSettingsService = async (request: UpdateSettingsRequest): Promise<SettingsResponse> => {
  const req = Validation.validate(SettingsValidation.UPDATE, request)

  let settings = await prismaClient.systemSettings.findFirst()
  if (!settings) {
    settings = await prismaClient.systemSettings.create({ data: DEFAULT_SETTINGS })
  }

  const updated = await prismaClient.systemSettings.update({
    where: { id: settings.id },
    data: req
  })

  const changes = settingsChanges(settings, updated)
  if (changes.length > 0) {
    const cutoff = changes.find((c) => c.field === 'Cut-off')
    await logActivity({
      category: 'settings',
      action: 'SETTINGS_UPDATED',
      description: cutoff
        ? `Mengubah tanggal cut-off: ${cutoff.before} → ${cutoff.after}`
        : `Mengubah pengaturan sistem (${changes.map((c) => c.field).join(', ')})`,
      year: updated.submissionYear,
      metadata: { changes }
    })
  }

  return toSettingsResponse(updated)
}

/**
 * Set / ganti PIN hapus (6 angka), diverifikasi dengan PASSWORD AKUN super admin
 * yang sedang login — bukan PIN lama. Dulu PIN lama wajib, sehingga PIN yang
 * terlupa tidak bisa diganti sama sekali. Password tetap mencegah sesi terbajak
 * mengganti PIN diam-diam. Berhasil maupun gagal, keduanya tercatat di activity log.
 *
 * Password salah → 403, BUKAN 401: interceptor axios FE memperlakukan 401 sebagai
 * sesi kedaluwarsa lalu mengulang request (password terkirim & tercatat dua kali).
 */
export const updateDeletePinService = async (
  request: UpdateDeletePinRequest,
  currentUser: UserWithRelations
): Promise<SettingsResponse> => {
  const req = Validation.validate(SettingsValidation.DELETE_PIN, request)
  const settings = await getOrCreateSettings()
  const verb = settings.deletePinHash ? 'Mengganti' : 'Membuat'

  if (!currentUser.password) {
    throw new ResponseError(
      400,
      'Akun Anda belum punya password lokal (masuk lewat SSO). Atur password akun Anda dulu di User Management, lalu ulangi.',
      'SSO_ONLY'
    )
  }
  if (!bcrypt.compareSync(req.password, currentUser.password)) {
    await logActivity({
      category: 'settings',
      action: 'DELETE_PIN_CHANGE_FAILED',
      description: `Gagal ${verb.toLowerCase()} PIN hapus data — password akun salah`
    })
    throw new ResponseError(403, 'Password akun salah', 'PASSWORD_INVALID')
  }

  const updated = await prismaClient.systemSettings.update({
    where: { id: settings.id },
    data: { deletePinHash: bcrypt.hashSync(req.pin, 10) }
  })

  // Nilai PIN (lama maupun baru) dan password tidak pernah masuk log.
  await logActivity({
    category: 'settings',
    action: 'DELETE_PIN_CHANGED',
    description: `${verb} PIN hapus data (diverifikasi password akun)`,
    metadata: { verifiedBy: 'password' }
  })

  return toSettingsResponse(updated)
}

/**
 * Verifikasi PIN hapus. Throw 400 jika PIN belum diatur, 401 jika salah.
 * ponytail: tanpa lockout — 6 angka + aksi super-admin only + terlog. Tambah
 * rate-limit kalau brute-force jadi masalah nyata.
 */
export const assertDeletePin = async (pin: string | undefined): Promise<void> => {
  const settings = await getOrCreateSettings()
  if (!settings.deletePinHash) {
    throw new ResponseError(400, 'PIN hapus belum diatur. Atur dulu di System Settings.', 'PIN_NOT_SET')
  }
  if (!pin || !bcrypt.compareSync(pin, settings.deletePinHash)) {
    throw new ResponseError(401, 'PIN salah', 'PIN_INVALID')
  }
}
