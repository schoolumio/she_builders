-- AlterTable
ALTER TABLE "Donation" ADD COLUMN     "providerChargeId" TEXT;

-- CreateTable
CREATE TABLE "SimulatorRecord" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulatorRecord_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Donation_provider_providerChargeId_idx" ON "Donation"("provider", "providerChargeId");
