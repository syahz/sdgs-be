import { prismaClient } from '../application/database'
import { Validation } from '../validation/Validation'
import { SettingsValidation } from '../validation/settings-validation'
import { UpdateSettingsRequest, SettingsResponse, toSettingsResponse, DEFAULT_SETTINGS } from '../model/settings-model'

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
  return toSettingsResponse(updated)
}
