-- Hapus kolom fileNames yang tidak terpakai (form faculty hanya kirim publicLinks).
ALTER TABLE "submissions" DROP COLUMN "fileNames";
