-- Add idleExpiresAt to refresh_tokens.
-- Non-nullable: add as nullable, backfill existing rows, then enforce NOT NULL.

-- AlterTable (nullable first)
ALTER TABLE "refresh_tokens" ADD COLUMN "idleExpiresAt" TIMESTAMP(3);

-- Backfill existing sessions with a 30-minute idle window from now
UPDATE "refresh_tokens" SET "idleExpiresAt" = NOW() + INTERVAL '30 minutes' WHERE "idleExpiresAt" IS NULL;

-- Enforce NOT NULL
ALTER TABLE "refresh_tokens" ALTER COLUMN "idleExpiresAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "refresh_tokens_idleExpiresAt_idx" ON "refresh_tokens"("idleExpiresAt");
