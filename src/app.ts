import { config } from 'dotenv'
import { web } from './application/web'
import { startIdleSessionEviction } from './utils/idle-eviction'
import { startYearEndAutoApprove } from './utils/year-end-auto-approve'
import { startCutoffAutoSubmit } from './utils/cutoff-auto-submit'

config()

const PORT = process.env.PORT || 4001

web.listen(PORT, () => {
  console.log(`BE-SDGS listening on port ${PORT}`)
})

// Hapus sesi idle (idleExpiresAt lewat) secara proaktif tiap 5 menit.
startIdleSessionEviction()

// Saat cutoff window ditutup: auto-submit draft/revision ke validator.
startCutoffAutoSubmit()

// Backstop akhir tahun (24 Des 23:59): auto-approve submission yang belum sempat divalidasi.
startYearEndAutoApprove()
