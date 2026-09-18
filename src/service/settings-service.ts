import bcrypt from 'bcryptjs'
import { prismaClient } from '../application/database'
import { ResponseError } from '../error/response-error'
import { Validation } from '../validation/Validation'
import { SettingsValidation } from '../validation/settings-validation'
import { UpdateSettingsRequest, UpdateDeletePinRequest, SettingsResponse, toSettingsResponse, DEFAULT_SETTINGS } from '../model/settings-model'
import { FieldChange } from '../model/audit-log-model'
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
 * Set / ganti PIN hapus (6 angka). Jika PIN sudah ada, `currentPin` wajib &
 * harus cocok — cegah orang lain (sesi terbajak) mengganti PIN diam-diam.
 */
export const updateDeletePinService = async (request: UpdateDeletePinRequest): Promise<SettingsResponse> => {
  const req = Validation.validate(SettingsValidation.DELETE_PIN, request)
  const settings = await getOrCreateSettings()

  if (settings.deletePinHash) {
    if (!req.currentPin || !bcrypt.compareSync(req.currentPin, settings.deletePinHash)) {
      throw new ResponseError(401, 'PIN saat ini salah', 'PIN_INVALID')
    }
  }

  const updated = await prismaClient.systemSettings.update({
    where: { id: settings.id },
    data: { deletePinHash: bcrypt.hashSync(req.pin, 10) }
  })

  // Nilai PIN (lama maupun baru) tidak pernah masuk log.
  await logActivity({
    category: 'settings',
    action: 'DELETE_PIN_CHANGED',
    description: settings.deletePinHash ? 'Mengganti PIN hapus data' : 'Membuat PIN hapus data'
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
