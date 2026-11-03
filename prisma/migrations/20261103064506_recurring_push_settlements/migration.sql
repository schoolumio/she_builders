/*
  Warnings:

  - The `status` column on the `SettlementRecord` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `SettlementRecord` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RecurringInterval" AS ENUM ('WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RecurringStatus" AS ENUM ('PENDING_SETUP', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- DropIndex
DROP INDEX "SettlementRecord_organizationId_idx";

-- AlterTable
ALTER TABLE "Donation" ADD COLUMN     "recurringDonationId" TEXT;

-- AlterTable
ALTER TABLE "FundraisingCampaign" ADD COLUMN     "allowRecurring" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "push" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "PaymentProviderConnection" ADD COLUMN     "lastSettlementSyncAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SettlementRecord" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "expectedAt" TIMESTAMP(3),
ADD COLUMN     "feeAmount" INTEGER,
ADD COLUMN     "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "RecurringDonation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" "PaymentProviderId" NOT NULL,
    "donorUserId" TEXT,
    "donorName" TEXT,
    "donorEmail" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "interval" "RecurringInterval" NOT NULL,
    "platformFeeBps" INTEGER NOT NULL DEFAULT 0,
    "status" "RecurringStatus" NOT NULL DEFAULT 'PENDING_SETUP',
    "checkoutUrl" TEXT,
    "providerCheckoutId" TEXT,
    "providerSubscriptionId" TEXT,
    "chargesCount" INTEGER NOT NULL DEFAULT 0,
    "lastChargeAt" TIMESTAMP(3),
    "nextChargeAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringDonation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringDonation_reference_key" ON "RecurringDonation"("reference");

-- CreateIndex
CREATE INDEX "RecurringDonation_organizationId_status_idx" ON "RecurringDonation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "RecurringDonation_donorUserId_idx" ON "RecurringDonation"("donorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringDonation_provider_providerSubscriptionId_key" ON "RecurringDonation"("provider", "providerSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "SettlementRecord_organizationId_status_idx" ON "SettlementRecord"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_recurringDonationId_fkey" FOREIGN KEY ("recurringDonationId") REFERENCES "RecurringDonation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementRecord" ADD CONSTRAINT "SettlementRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDonation" ADD CONSTRAINT "RecurringDonation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDonation" ADD CONSTRAINT "RecurringDonation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FundraisingCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDonation" ADD CONSTRAINT "RecurringDonation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PaymentProviderConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDonation" ADD CONSTRAINT "RecurringDonation_donorUserId_fkey" FOREIGN KEY ("donorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
