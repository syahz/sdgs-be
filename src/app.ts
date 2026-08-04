import { config } from 'dotenv'
import { web } from './application/web'
import { startIdleSessionEviction } from './utils/idle-eviction'
import { startYearEndAutoApprove } from './utils/year-end-auto-approve'
import { startCutoffAutoSubmit } from './utils/cutoff-auto-submit'
import { loadConfigCache } from './config/config-registry'

config()

const PORT = process.env.PORT || 4001

web.listen(PORT, () => {
  console.log(`BE-SDGS listening on port ${PORT}`)
})

// Muat config indikator per tahun ke memori sekali saat boot. Setelah ini
// resolveConfig() sinkron dan tidak pernah menyentuh database lagi — penting
// karena ia dipanggil di dalam loop saat dashboard mengagregasi submission.
// Gagal memuat tidak mematikan server: sistem jatuh ke config bawaan kode.
loadConfigCache().then(({ loaded, years }) => {
  console.log(
    loaded > 0
      ? `Config THE dimuat dari database: ${loaded} tahun (${years.join(', ')})`
      : 'Config THE belum ada di database — memakai config bawaan kode'
  )
})

// Hapus sesi idle (idleExpiresAt lewat) secara proaktif tiap 5 menit.
startIdleSessionEviction()

// Saat cutoff window ditutup: auto-submit draft/revision ke validator.
startCutoffAutoSubmit()

// Backstop akhir tahun (24 Des 23:59): auto-approve submission yang belum sempat divalidasi.
startYearEndAutoApprove()
