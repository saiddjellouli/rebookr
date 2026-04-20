-- Offres de rebook pour RDV confirmés ultérieurs (pas seulement liste d'attente)

ALTER TABLE "RebookingOffer" ADD COLUMN "recipientKey" TEXT;
ALTER TABLE "RebookingOffer" ADD COLUMN "targetAppointmentId" TEXT;

UPDATE "RebookingOffer" SET "recipientKey" = CONCAT('w:', "waitlistEntryId") WHERE "recipientKey" IS NULL;

ALTER TABLE "RebookingOffer" ALTER COLUMN "recipientKey" SET NOT NULL;

ALTER TABLE "RebookingOffer" ALTER COLUMN "waitlistEntryId" DROP NOT NULL;

DROP INDEX IF EXISTS "RebookingOffer_freeSlotId_waitlistEntryId_key";

CREATE UNIQUE INDEX "RebookingOffer_freeSlotId_recipientKey_key" ON "RebookingOffer"("freeSlotId", "recipientKey");

CREATE INDEX "RebookingOffer_targetAppointmentId_idx" ON "RebookingOffer"("targetAppointmentId");

ALTER TABLE "RebookingOffer" ADD CONSTRAINT "RebookingOffer_targetAppointmentId_fkey" FOREIGN KEY ("targetAppointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
