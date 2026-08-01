-- Autentikasi sepenuhnya lewat Keycloak (IAM UB). Tidak ada password lokal lagi,
-- jadi kolom password dan penghitung brute-force ikut dihapus.
-- "isLocked" DIPERTAHANKAN — blokir manual oleh super admin, kini di-enforce di
-- jalur login SSO.
--
-- PERINGATAN: DROP COLUMN menghapus data secara permanen. Backup dulu:
--   pg_dump -U sdgsub -d sdgs_db -t users > users_backup.sql

ALTER TABLE "users" DROP COLUMN "password";
ALTER TABLE "users" DROP COLUMN "failedLogins";
ALTER TABLE "users" DROP COLUMN "lockedUntil";
