-- Event baru di riwayat submission: validator mengembalikan submission ke admin unit.
-- Dipisah dari migrasi lain karena nilai enum baru tidak boleh dipakai di
-- transaksi yang sama dengan ALTER TYPE ... ADD VALUE-nya.
-- IF NOT EXISTS: aman juga untuk DB yang skemanya sudah disinkronkan lewat `prisma db push`.

-- AlterEnum
ALTER TYPE "SubmissionEvent" ADD VALUE IF NOT EXISTS 'rolled_back';
