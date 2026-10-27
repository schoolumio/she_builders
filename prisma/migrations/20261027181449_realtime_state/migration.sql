-- CreateTable
CREATE TABLE "MeetingParticipantState" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canSpeak" BOOLEAN NOT NULL DEFAULT false,
    "handRaisedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingParticipantState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealtimeWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealtimeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipantState_occurrenceId_userId_key" ON "MeetingParticipantState"("occurrenceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "RealtimeWebhookEvent_provider_eventId_key" ON "RealtimeWebhookEvent"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "MeetingParticipantState" ADD CONSTRAINT "MeetingParticipantState_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "MeetingOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
