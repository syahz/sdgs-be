-- Kerangka indikator THE per tahun, disimpan di database.
-- Murni aditif: tidak ada tabel lama yang disentuh, tidak ada data yang hilang.

-- CreateEnum
CREATE TYPE "ConfigStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateTable
CREATE TABLE "sdg_config_versions" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "ConfigStatus" NOT NULL DEFAULT 'draft',
    "payload" JSONB NOT NULL,
    "checksum" TEXT NOT NULL,
    "note" TEXT,
    "sourceName" TEXT,
    "createdByUserId" TEXT,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedByName" TEXT,
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sdg_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sdg_config_versions_year_status_idx" ON "sdg_config_versions"("year", "status");

-- AddForeignKey
ALTER TABLE "sdg_config_versions" ADD CONSTRAINT "sdg_config_versions_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Satu config AKTIF per tahun, ditegakkan database.
-- Prisma belum bisa mendeklarasikan index berkondisi, jadi ditulis manual di sini.
-- Tanpa ini, dua baris active untuk tahun yang sama akan membuat skor tahun itu
-- bergantung pada baris mana yang kebetulan terbaca duluan.
CREATE UNIQUE INDEX "sdg_config_one_active_per_year"
  ON "sdg_config_versions"("year") WHERE "status" = 'active';
