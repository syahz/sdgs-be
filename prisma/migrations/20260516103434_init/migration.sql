-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'validator', 'unit_admin', 'pimpinan');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "OrgUnitType" AS ENUM ('faculty', 'directorate', 'unit');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('draft', 'submitted', 'under_review', 'revision', 'resubmitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('comment', 'request_revision', 'approve', 'reject');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "SubmissionEvent" AS ENUM ('created', 'updated', 'submitted', 'review_started', 'revision_requested', 'resubmitted', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "org_units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "type" "OrgUnitType" NOT NULL DEFAULT 'faculty',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" "UserRole" NOT NULL,
    "avatarInitials" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "orgUnitId" TEXT,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sdgId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'draft',
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "orgUnitId" TEXT NOT NULL,
    "submittedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "theAnswers" JSONB NOT NULL DEFAULT '{}',
    "qsAnswers" JSONB NOT NULL DEFAULT '{}',
    "fileNames" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_logs" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "event" "SubmissionEvent" NOT NULL,
    "fromStatus" "SubmissionStatus",
    "toStatus" "SubmissionStatus",
    "actorUserId" TEXT NOT NULL,
    "note" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comments" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT,
    "userId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL DEFAULT 'comment',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_records" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sdgId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'draft',
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "theAnswers" JSONB NOT NULL DEFAULT '{}',
    "qsAnswers" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "submissionYear" INTEGER NOT NULL,
    "windowStartMonth" INTEGER NOT NULL,
    "windowStartDay" INTEGER NOT NULL,
    "windowEndMonth" INTEGER NOT NULL,
    "windowEndDay" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replacedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_units_name_key" ON "org_units"("name");

-- CreateIndex
CREATE INDEX "org_units_type_idx" ON "org_units"("type");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "submissions_status_idx" ON "submissions"("status");

-- CreateIndex
CREATE INDEX "submissions_orgUnitId_idx" ON "submissions"("orgUnitId");

-- CreateIndex
CREATE INDEX "submissions_year_idx" ON "submissions"("year");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_orgUnitId_sdgId_year_key" ON "submissions"("orgUnitId", "sdgId", "year");

-- CreateIndex
CREATE INDEX "submission_logs_submissionId_idx" ON "submission_logs"("submissionId");

-- CreateIndex
CREATE INDEX "submission_logs_event_idx" ON "submission_logs"("event");

-- CreateIndex
CREATE INDEX "review_comments_submissionId_idx" ON "review_comments"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "university_records_sdgId_year_key" ON "university_records"("sdgId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_logs" ADD CONSTRAINT "submission_logs_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_logs" ADD CONSTRAINT "submission_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_records" ADD CONSTRAINT "university_records_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
