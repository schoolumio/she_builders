-- AlterEnum
ALTER TYPE "AuthTokenType" ADD VALUE 'MFA_CHALLENGE';

-- AlterTable
ALTER TABLE "AuthToken" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "requireMfaForAdmins" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaEnabledAt" TIMESTAMP(3),
ADD COLUMN     "mfaLastUsedStep" INTEGER,
ADD COLUMN     "mfaPendingSecretEnc" TEXT,
ADD COLUMN     "mfaRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mfaSecretEnc" TEXT;
