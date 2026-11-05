-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('AMEN', 'PRAISE', 'LOVE');

-- AlterTable
ALTER TABLE "Testimony" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "TestimonyReaction" ADD COLUMN     "type" "ReactionType" NOT NULL DEFAULT 'AMEN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT;

-- CreateTable
CREATE TABLE "SessionInterest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SessionInterest_occurrenceId_userId_key" ON "SessionInterest"("occurrenceId", "userId");

-- AddForeignKey
ALTER TABLE "SessionInterest" ADD CONSTRAINT "SessionInterest_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "MeetingOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionInterest" ADD CONSTRAINT "SessionInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
