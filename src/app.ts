import { config } from 'dotenv'
import { web } from './application/web'
import { startIdleSessionEviction } from './utils/idle-eviction'
import { startYearEndAutoApprove } from './utils/year-end-auto-approve'
import { startCutoffAutoSubmit } from './utils/cutoff-auto-submit'
import { loadConfigCache } from './config/config-registry'

config()

const PORT = process.env.PORT || 4001

const server = web.listen(PORT, () => {
  console.log(`BE-SDGS listening on port ${PORT}`)
})

// Node menutup koneksi keep-alive yang menganggur setelah 5 detik (bawaan).
// Reverse proxy di depan (nginx) memegang koneksi upstream-nya jauh lebih lama,
// jadi ia bisa mengirim request lewat socket yang baru saja ditutup Node →
// nginx membalas 502. Balasan 502 itu datang dari nginx, bukan Express, jadi
// TIDAK membawa header CORS → browser memblokirnya dan XHR terlihat seperti
// "tidak dapat terhubung ke server", padahal server hidup.
//
// Ini menjelaskan kenapa hanya login email+password yang kena: nginx dan browser
// mengulang request idempoten (GET /api/auth/keycloak) secara diam-diam, tapi
// TIDAK pernah mengulang POST. Karena itu jalur IAM mulus sementara POST
// /api/auth/login gagal, lalu "tiba-tiba bisa" begitu ada koneksi baru.
//
// Ambang harus DI ATAS keepalive_timeout proxy (nginx bawaan 60–75 detik).
server.keepAliveTimeout = 65_000
server.headersTimeout = 66_000 // wajib > keepAliveTimeout, kalau tidak Node menolak duluan

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
