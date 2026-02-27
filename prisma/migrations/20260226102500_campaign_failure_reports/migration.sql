-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "sendFailureReport" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Campaign" ADD COLUMN "failureReportEmail" TEXT;
