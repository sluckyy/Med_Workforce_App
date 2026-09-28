-- AlterTable
ALTER TABLE "User" ADD COLUMN "mfaSecret" TEXT,
ADD COLUMN "mfaBackupCodesHashed" JSONB;
