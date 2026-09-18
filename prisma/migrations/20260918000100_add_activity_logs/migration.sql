-- Activity log global: jejak aktivitas SELURUH user (login, draft, submit, review,
-- rollback, perubahan data, user, unit, pengaturan) untuk tab Activity Log super admin.
-- Murni aditif: tabel lama tidak diubah. Riwayat yang sudah ada disalin sekali di
-- bawah supaya feed tidak mulai kosong.
--
-- SELURUH file ini idempoten (IF NOT EXISTS + ON CONFLICT DO NOTHING), karena
-- sebagian perubahan skema proyek ini diterapkan lewat `prisma db push`, bukan
-- migrasi. Dua jalur sama-sama aman:
--   a) npx prisma migrate deploy
--   b) npx prisma db push, lalu jalankan file ini untuk backfill riwayat:
--      npx prisma db execute --file prisma/migrations/20260918000100_add_activity_logs/migration.sql --schema prisma/schema.prisma
-- Menjalankannya berulang kali tidak menggandakan baris.

-- CreateTable
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "actorEmail" TEXT,
    "orgUnitName" TEXT,
    "sdgId" INTEGER,
    "year" INTEGER,
    "targetId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_category_createdAt_idx" ON "activity_logs"("category", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_actorId_idx" ON "activity_logs"("actorId");

-- ── Backfill riwayat lama ────────────────────────────────────────────────
-- Dibungkus DO + to_regclass: tabel university_record_audits tidak dibuat oleh
-- migrasi mana pun (hanya lewat db push), jadi pada DB yang murni dibangun dari
-- migrasi, backfill-nya dilewati alih-alih menggagalkan migrasi.
--
-- `go_live`: event sesudah baris log "live" pertama sudah dicatat langsung oleh
-- aplikasi (dengan id berbeda), jadi tidak disalin lagi — menjalankan file ini
-- setelah versi baru berjalan tidak menggandakan event. Margin 10 detik menutup
-- selisih antara baris sumber dan baris live dari request yang sama.
DO $$
DECLARE
    go_live TIMESTAMP(3) := COALESCE(
        (SELECT MIN("createdAt") FROM "activity_logs" WHERE NOT ("metadata" ? 'backfilledFrom')) - INTERVAL '10 seconds',
        'infinity'
    );
BEGIN
    -- 1) Jejak data universitas + hapus submission oleh super admin.
    --    orgUnitName terisi = baris hapus submission unit kerja.
    IF to_regclass('university_record_audits') IS NOT NULL THEN
        INSERT INTO "activity_logs" (
            "id", "category", "action", "actorId", "actorName", "actorRole",
            "orgUnitName", "sdgId", "year", "targetId", "description", "metadata",
            "ipAddress", "userAgent", "createdAt"
        )
        SELECT
            a."id",
            CASE WHEN a."orgUnitName" IS NULL THEN 'university_record' ELSE 'submission' END,
            CASE
                WHEN a."orgUnitName" IS NOT NULL THEN 'SUBMISSION_DELETED'
                WHEN a."action" = 'CREATE' THEN 'UNIV_RECORD_CREATED'
                WHEN a."action" = 'UPDATE' THEN 'UNIV_RECORD_UPDATED'
                ELSE 'UNIV_RECORD_DELETED'
            END,
            a."actorId",
            a."actorName",
            a."actorRole",
            a."orgUnitName",
            a."sdgId",
            a."year",
            a."recordId",
            CASE
                WHEN a."orgUnitName" IS NOT NULL THEN 'Menghapus submission SDG ' || a."sdgId" || ' periode ' || a."year"
                WHEN a."action" = 'CREATE' THEN 'Membuat data universitas SDG ' || a."sdgId" || ' tahun ' || a."year"
                WHEN a."action" = 'UPDATE' THEN 'Mengubah data universitas SDG ' || a."sdgId" || ' tahun ' || a."year"
                ELSE 'Menghapus data universitas SDG ' || a."sdgId" || ' tahun ' || a."year"
            END,
            jsonb_strip_nulls(jsonb_build_object('changes', a."changes", 'reason', a."reason", 'backfilledFrom', 'university_record_audits')),
            a."ipAddress",
            a."userAgent",
            a."createdAt"
        FROM "university_record_audits" a
        WHERE a."createdAt" < go_live
        ON CONFLICT ("id") DO NOTHING;
    END IF;

    -- 2) Riwayat submission (draft, submit, review).
    --    Teks catatan validator SENGAJA tidak disalin: catatan bisa dihapus lewat
    --    rollback, jadi tidak boleh tertinggal salinannya di sini. Baris cron
    --    dikenali dari prefix catatannya (= SYSTEM_NOTE_PREFIXES di reviewer-alias.ts).
    INSERT INTO "activity_logs" (
        "id", "category", "action", "actorId", "actorName", "actorRole", "actorEmail",
        "orgUnitName", "sdgId", "year", "targetId", "description", "metadata", "createdAt"
    )
    SELECT
        src."id",
        CASE WHEN src."event" IN ('created', 'updated', 'submitted', 'resubmitted') THEN 'submission' ELSE 'review' END,
        CASE
            WHEN src."event" = 'created' THEN 'SUBMISSION_DRAFT_CREATED'
            WHEN src."event" = 'updated' THEN 'SUBMISSION_DRAFT_SAVED'
            WHEN src."event" IN ('submitted', 'resubmitted') AND src."isSystem" THEN 'SUBMISSION_AUTO_SUBMITTED'
            WHEN src."event" = 'submitted' THEN 'SUBMISSION_SUBMITTED'
            WHEN src."event" = 'resubmitted' THEN 'SUBMISSION_RESUBMITTED'
            WHEN src."event" = 'review_started' THEN 'REVIEW_COMMENT'
            WHEN src."event" = 'revision_requested' THEN 'REVIEW_REVISION_REQUESTED'
            WHEN src."event" = 'approved' AND src."isSystem" THEN 'REVIEW_AUTO_APPROVED'
            WHEN src."event" = 'approved' THEN 'REVIEW_APPROVED'
            ELSE 'REVIEW_REJECTED'
        END,
        CASE WHEN src."isSystem" THEN NULL ELSE src."userId" END,
        CASE WHEN src."isSystem" THEN 'Sistem' ELSE src."userName" END,
        CASE WHEN src."isSystem" THEN 'system' ELSE src."userRole" END,
        CASE WHEN src."isSystem" THEN NULL ELSE src."userEmail" END,
        src."orgUnitName",
        src."sdgId",
        src."year",
        src."submissionId",
        CASE
            WHEN src."event" = 'created' THEN 'Membuat draft SDG ' || src."sdgId" || ' periode ' || src."year"
            WHEN src."event" = 'updated' AND src."toStatus" = 'revision' THEN 'Menyimpan perbaikan revisi SDG ' || src."sdgId" || ' periode ' || src."year"
            WHEN src."event" = 'updated' THEN 'Menyimpan draft SDG ' || src."sdgId" || ' periode ' || src."year"
            WHEN src."event" IN ('submitted', 'resubmitted') AND src."isSystem" THEN 'Auto-submit cutoff: SDG ' || src."sdgId" || ' periode ' || src."year" || ' dikirim otomatis ke validator'
            WHEN src."event" = 'submitted' THEN 'Mengirim SDG ' || src."sdgId" || ' periode ' || src."year" || ' ke validator'
            WHEN src."event" = 'resubmitted' THEN 'Mengirim ulang revisi SDG ' || src."sdgId" || ' periode ' || src."year" || ' ke validator'
            WHEN src."event" = 'review_started' THEN 'Memberi catatan review SDG ' || src."sdgId" || ' periode ' || src."year"
            WHEN src."event" = 'revision_requested' THEN 'Meminta revisi SDG ' || src."sdgId" || ' periode ' || src."year"
            WHEN src."event" = 'approved' AND src."isSystem" THEN 'Auto-approve akhir tahun: SDG ' || src."sdgId" || ' periode ' || src."year"
            WHEN src."event" = 'approved' THEN 'Menyetujui SDG ' || src."sdgId" || ' periode ' || src."year"
            ELSE 'Menolak SDG ' || src."sdgId" || ' periode ' || src."year"
        END,
        jsonb_build_object('fromStatus', src."fromStatus", 'toStatus', src."toStatus", 'backfilledFrom', 'submission_logs'),
        src."createdAt"
    FROM (
        SELECT
            l."id",
            l."event"::text AS "event",
            l."fromStatus"::text AS "fromStatus",
            l."toStatus"::text AS "toStatus",
            l."createdAt",
            s."id" AS "submissionId",
            s."sdgId",
            s."year",
            o."name" AS "orgUnitName",
            u."id" AS "userId",
            u."name" AS "userName",
            u."role"::text AS "userRole",
            u."email" AS "userEmail",
            COALESCE(l."note" LIKE 'Auto-submit cutoff%' OR l."note" LIKE 'Auto-approve akhir tahun%', FALSE) AS "isSystem"
        FROM "submission_logs" l
        JOIN "submissions" s ON s."id" = l."submissionId"
        JOIN "org_units" o ON o."id" = s."orgUnitId"
        JOIN "users" u ON u."id" = l."actorUserId"
        -- rolled_back hanya ada setelah fitur ini aktif — sudah tercatat langsung.
        WHERE l."event"::text <> 'rolled_back'
          AND l."createdAt" < go_live
    ) src
    ON CONFLICT ("id") DO NOTHING;
END $$;
