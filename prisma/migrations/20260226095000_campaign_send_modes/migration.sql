-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "sendMode" TEXT NOT NULL DEFAULT 'now';
ALTER TABLE "Campaign" ADD COLUMN "scheduledFor" DATETIME;
ALTER TABLE "Campaign" ADD COLUMN "staggerMinutes" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "processingStartedAt" DATETIME;
