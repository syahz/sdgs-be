import { config } from 'dotenv'
import { web } from './application/web'
import { startIdleSessionEviction } from './utils/idle-eviction'

config()

const PORT = process.env.PORT || 4001

web.listen(PORT, () => {
  console.log(`BE-SDGS listening on port ${PORT}`)
})

// Hapus sesi idle (idleExpiresAt lewat) secara proaktif tiap 5 menit.
startIdleSessionEviction()
