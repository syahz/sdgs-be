# API Contract — BE-SDGS

| Field | Value |
|---|---|
| Versi | 1.0 |
| Tanggal | 2026-05-16 |
| Stack | Express 5, Prisma 7, PostgreSQL, JWT, Google OAuth2 |
| Base URL | `/api` |
| Acuan | `Referensi/src/services/api.ts` + struktur `BE/` |

---

## 1. Konvensi

### 1.1 Response envelope

**Sukses:**
```jsonc
{ "data": <payload> }            // 200/201
```

**Error:**
```jsonc
{ "message": "Human readable", "code": "ERROR_CODE", "details": <optional>, "requestId": <optional> }
```

Status: `400` validasi, `401` tak login, `403` role ditolak, `404` not found,
`409` konflik (unique), `500` server.

Error tak tertangani **tidak pernah** mengembalikan `error.message`, stack, atau
pesan Prisma ke client — detail hanya masuk `logs/error/%DATE%.log`. Yang
dikirim adalah pesan generik plus `requestId` acak yang juga tercatat di log,
sehingga laporan pengguna bisa dicocokkan ke baris log tanpa membocorkan apa pun
tentang errornya. Body JSON rusak dibalas `400 BAD_REQUEST`, bukan `500`.

### 1.2 Auth

- Access token: header `Authorization: Bearer <jwt>` (TTL pendek, ±15 menit).
- Refresh token: cookie httpOnly `refresh_token` (rotasi tiap refresh).
- Middleware: `authRequired` (verifikasi JWT) → `requireRole(...roles)`.

### 1.3 Penamaan

- `orgUnitId` = unit kerja (fakultas/direktorat/unit).
- `sdgId` = 1–17, rujuk config THE hardcoded.

---

## 2. Auth — `/api/auth`

| Method | Path | Role | Keterangan |
|---|---|---|---|
Dua jalur login berdampingan: SSO Keycloak (IAM UB) dan email+password.
Akun dengan `password` null hanya bisa masuk lewat SSO.

| Method | Path | Role | Keterangan |
|---|---|---|---|
| POST | `/auth/login` | publik | Login email+password. Rate limit 10×/15 mnt per email |
| GET | `/auth/keycloak` | publik | Mulai OIDC. Response `{ url }` → browser dinavigasi ke sana |
| GET | `/auth/keycloak/callback` | publik | Callback IAM → set cookie refresh → redirect FE |
| POST | `/auth/refresh` | cookie | Tukar refresh → access token baru |
| POST | `/auth/activity` | cookie | Heartbeat idle — geser `idleExpiresAt` |
| DELETE | `/auth/logout` | cookie | Revoke refresh token + clear cookie |
| GET | `/auth/me` | login | Profil user aktif |
| GET | `/auth/sessions` | login | Daftar sesi aktif (multi-device) |
| DELETE | `/auth/sessions/:id` | login | Revoke 1 sesi |
| DELETE | `/auth/sessions` | login | Revoke semua sesi (force logout all) |

**`POST /auth/login`** — Request:
```jsonc
{ "email": "nama@ub.ac.id", "password": "rahasia" }
```

**`POST /auth/login`** dan **`POST /auth/refresh`** — Response `data`:
```jsonc
{
  "accessToken": "<jwt>",
  "user": { "id","name","email","role","orgUnitId","avatarInitials","status" }
}
```

Kode error login password: `INVALID_CREDENTIALS` (401), `SSO_ONLY` (401, akun
belum punya password), `ACCOUNT_LOCKED` (403), `ACCOUNT_INACTIVE` (403),
`LOGIN_RATE_LIMITED` (429). Lima kali salah password → akun terkunci 15 menit;
`isLocked` juga menutup jalur SSO.

Callback SSO gagal → redirect ke `FRONTEND_URL/login?error=<kode>`:

| Kode | Sebab |
|---|---|
| `unregistered_email` | Email IAM belum terdaftar di tabel `users` |
| `account_inactive` | `status = inactive` |
| `account_locked` | `isLocked = true` (dikunci super admin) |
| `oauth_disabled` | Env Keycloak belum lengkap |
| `oauth` | Galat lain (state/PKCE tidak cocok, token exchange gagal) |

---

## 3. Org Units — `/api/org-units`

| Method | Path | Role | Keterangan |
|---|---|---|---|
| GET | `/org-units` | login | List. Query `?type=faculty\|directorate\|unit` |
| GET | `/org-units/:id` | login | Detail |
| POST | `/org-units` | super_admin | Buat |
| PATCH | `/org-units/:id` | super_admin | Update |
| DELETE | `/org-units/:id` | super_admin | Hapus (tolak `409` bila punya submission) |

Record: `{ id, name, abbreviation, type, createdAt, updatedAt }`.

---

## 4. Users — `/api/users`

| Method | Path | Role | Keterangan |
|---|---|---|---|
| GET | `/users` | super_admin | List. Query `?role=` `?orgUnitId=` `?status=` |
| GET | `/users/:id` | super_admin | Detail |
| POST | `/users` | super_admin | Buat |
| PATCH | `/users/:id` | super_admin | Update. `isLocked: false` = buka kunci akun |
| DELETE | `/users/:id` | super_admin | Hapus |

**Record (response):** `{ id, name, email, role, orgUnitId, avatarInitials, status, isLocked, lockedUntil, hasPassword }`.
`password` **tidak pernah** dikembalikan — hanya boolean `hasPassword`.

**`POST /users`** — Request:
```jsonc
{
  "name": "Budi", "email": "budi@ub.ac.id", "role": "unit_admin",
  "orgUnitId": "<uuid>",          // wajib bila role unit_admin, else null
  "password": "min8karakter",     // opsional; kosong = akun SSO-only
  "status": "active"
}
```
Aturan: `role=unit_admin` → `orgUnitId` wajib. Role lain → `orgUnitId` null.
`avatarInitials` auto-generate dari `name` bila tak dikirim.

`password` dikosongkan → user hanya bisa masuk lewat SSO, dan `email` **wajib
sama persis** dengan email akun IAM-nya.

**`PATCH /users/:id`** — saat user mengganti password **sendiri**, wajib kirim
`currentPassword` bersama `password`; salah → 401 `INVALID_CURRENT_PASSWORD`.
Super admin yang me-reset password user lain tidak perlu `currentPassword`.

---

## 5. Submissions — `/api/submissions`

| Method | Path | Role | Keterangan |
|---|---|---|---|
| GET | `/submissions` | login | List + filter (lihat bawah) |
| GET | `/submissions/:id` | login | Detail (+ comments + logs opsional via query) |
| POST | `/submissions` | unit_admin | Buat draft (unit sendiri) |
| PATCH | `/submissions/:id` | unit_admin | Update jawaban — hanya status `draft`/`revision`, unit sendiri |
| POST | `/submissions/:id/submit` | unit_admin | Transisi `draft→submitted` / `revision→resubmitted` |
| POST | `/submissions/:id/review` | validator, super_admin | Aksi review |
| GET | `/submissions/:id/logs` | login | Riwayat `SubmissionLog` |
| GET | `/submissions/:id/comments` | login | Komentar review |
| POST | `/submissions/:id/comments` | validator, super_admin | Tambah komentar |

**Filter `GET /submissions`:** `?status=` `?orgUnitId=` `?year=` `?sdgId=`
`?submittedByUserId=`. Default sort `submittedAt desc`.

**Config indikator per tahun.** `GET /api/config/sdg?year=YYYY` (login).
`year` opsional — tanpa itu memakai tahun berjalan. Response `data`:

```jsonc
{
  "requestedYear": 2030,          // yang diminta
  "year": 2026,                   // yang BENAR-BENAR dipakai
  "source": "database",           // "database" | "bundled"
  "availableYears": [2026],
  "sdgs": { "1": { ... } },       // 17 SDG, 262 indikator
  "quantFormulas": { ... },
  "qualQuestions": { ... },
  "groupTitles": { ... }
}
```

Tahun yang belum punya config sendiri dilayani config tahun terdekat
**sebelumnya** — karena itu `year` dan `requestedYear` dipisah, supaya pemanggil
tidak menyangka menerima kerangka tahun yang ia minta. Sumber kebenarannya tabel
`sdg_config_versions`; `source: "bundled"` berarti tabel belum berisi tahun itu
dan sistem memakai config bawaan kode sebagai jaring pengaman.

**Anonimisasi peninjau.** Untuk pemanggil ber-role `unit_admin`, identitas
validator pada `reviewComments[].user` dan `logs[].actor` DIGANTI di server —
berlaku di `GET /submissions/:id` (dengan `includeComments`/`includeLogs`),
`GET /submissions/:id/logs`, dan `GET /submissions/:id/comments`:

| Field | Nilai untuk `unit_admin` |
|---|---|
| `user.name` / `actor.name` | `"Validator 1"`, `"Validator 2"`, … |
| `user.id` / `actor.id`, `userId` / `actorUserId` | alias `"reviewer-N"` — UUID asli tidak dikirim |
| `user.role` / `actor.role` | apa adanya (FE memfilter dengannya) |

Nomor bersifat **lokal per submission**: validator yang sama bisa menjadi
`Validator 1` di satu submission dan `Validator 2` di submission lain. Ini
disengaja — nomor yang konsisten lintas submission justru bisa dikorelasikan.
Di dalam satu submission nomornya stabil dan identik antara daftar komentar dan
daftar log. Aksi otomatis cron dilabeli `"Sistem"`. Penulis dari unit itu
sendiri tidak diubah. Role `validator`, `super_admin`, dan `pimpinan` tetap
menerima nama asli.

**Aturan akses:** `unit_admin` otomatis difilter ke `orgUnitId`-nya (abaikan
query `orgUnitId` lain). `validator`/`super_admin`/`pimpinan` lihat semua.

**Record:**
```jsonc
{
  "id","title","sdgId","year","status","points","revisionCount",
  "orgUnitId","orgUnit": { "id","name","abbreviation","type" },
  "submittedByUserId","submittedBy": { "id","name" },
  "submittedAt","theAnswers","qsAnswers","fileNames","createdAt","updatedAt"
}
```

**`PATCH /submissions/:id`** — body `Partial<{ title, theAnswers, qsAnswers, fileNames }>`.
Server hitung ulang `points` via scoring engine. Tolak `403` bila status bukan
`draft`/`revision` atau bukan unit milik user.

**`POST /submissions/:id/submit`** — body kosong. Validasi server:
- window submission terbuka (`SystemSettings`),
- SDG wajib (1,3,4,8,17) terisi,
- data QS lengkap.
Sukses → status `submitted` (atau `resubmitted`), set `submittedAt`,
tulis `SubmissionLog`.

**`POST /submissions/:id/review`** — Request:
```jsonc
{
  "action": "approve" | "request_revision" | "reject" | "comment",
  "comment": "string",            // wajib kecuali approve tanpa catatan
  "questionId": "1.2.1" | null,   // null = komentar umum
  "bibliometricScores": { "1.1.1": 80, ... }  // opsional, isi skor BIBLIOMETRIC
}
```
Efek per `action`:
- `approve` → status `approved`
- `request_revision` → status `revision`, `revisionCount++`
- `reject` → status `rejected`
- `comment` → status tetap (`under_review` bila masih `submitted`)
Selalu buat `ReviewComment` + `SubmissionLog`.

---

## 6. Review Comments — `/api/comments`

| Method | Path | Role | Keterangan |
|---|---|---|---|
| DELETE | `/comments/:id` | validator, super_admin | Hapus komentar (pemilik / super_admin) |

(List & create via `/submissions/:id/comments` — §5.)

Record: `{ id, submissionId, questionId, userId, user:{id,name,role}, comment, action, createdAt }`.

---

## 7. University Records — `/api/university-records`

| Method | Path | Role |z
|---|---|---|
| GET | `/university-records` | login (query `?year=` `?sdgId=` `?status=`) |
| GET | `/university-records/:id` | login |
| POST | `/university-records` | validator, super_admin |
| PATCH | `/university-records/:id` | validator, super_admin |
| DELETE | `/university-records/:id` | validator, super_admin |

Record: `{ id, title, sdgId, year, status, points, createdByUserId, createdBy:{id,name}, theAnswers, qsAnswers, createdAt, updatedAt }`.
Default sort `year desc`.

---

## 8. System Settings — `/api/settings`

| Method | Path | Role |
|---|---|---|
| GET | `/settings` | login |
| PATCH | `/settings` | super_admin |

Record: `{ submissionYear, windowStartMonth, windowStartDay, windowEndMonth, windowEndDay }`.
Singleton (`id=1`). `GET` auto-create default bila belum ada.

---

## 9. Dashboard / Scoring — `/api/dashboard`

Agregasi skor pindah ke server (Referensi menghitung di client).

| Method | Path | Role | Keterangan |
|---|---|---|---|
| GET | `/dashboard/overall` | login | Skor universitas. Query `?year=` |
| GET | `/dashboard/org-units` | login | Breakdown + ranking per unit kerja |
| GET | `/dashboard/sdg/:sdgId` | login | Breakdown indikator per SDG |

**`/dashboard/overall`** `data`:
```jsonc
{
  "overall": 72.5,
  "sdg17Score": 80,
  "topSdgs": [ { "sdgId","sdgName","totalPoints","color" } ],
  "allSdgScores": [ ... ]
}
```
Formula: `SDG17×22% + Top1×26% + Top2×26% + Top3×26%` (Top = 3 SDG tertinggi
selain 17). Sumber: submission `status=approved`.

---

## 10. Config (hardcoded) — `/api/config` *(opsional)*

| Method | Path | Keterangan |
|---|---|---|
| GET | `/config/sdg` | `THE_SDG_CONFIG` (indikator THE) |
| GET | `/config/qs` | konfigurasi pertanyaan QS |

Read-only, dari file konstanta — bukan DB. FE boleh impor langsung file config
(satu sumber); endpoint ini opsional bila ingin sentralisasi.

---

## 11. Ringkasan RBAC per endpoint

| Grup | super_admin | validator | unit_admin | pimpinan |
|---|:---:|:---:|:---:|:---:|
| auth/* | ✅ | ✅ | ✅ | ✅ |
| org-units (read) | ✅ | ✅ | ✅ | ✅ |
| org-units (write) | ✅ | ❌ | ❌ | ❌ |
| users (all) | ✅ | ❌ | ❌ | ❌ |
| submissions (read) | ✅ semua | ✅ semua | ✅ unit sendiri | ✅ semua |
| submissions (create/edit/submit) | ❌ | ❌ | ✅ | ❌ |
| submissions review | ✅ | ✅ | ❌ | ❌ |
| university-records (read) | ✅ | ✅ | ✅ | ✅ |
| university-records (write) | ✅ | ✅ | ❌ | ❌ |
| settings (read) | ✅ | ✅ | ✅ | ✅ |
| settings (write) | ✅ | ❌ | ❌ | ❌ |
| dashboard/* | ✅ | ✅ | ✅ | ✅ |
