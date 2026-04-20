-- Liste chaude (anticipation) + opt-in public

ALTER TYPE "ActionTokenPurpose" ADD VALUE 'HOT_SLOT_OPT_IN';

ALTER TABLE "Patient" ADD COLUMN "flexible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN "interestedFastSlot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN "fastSlotOptInAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN "fastSlotChannel" TEXT;

CREATE INDEX "Patient_organizationId_interestedFastSlot_idx" ON "Patient"("organizationId", "interestedFastSlot");

ALTER TABLE "RebookingOffer" ADD COLUMN "targetPatientId" TEXT;

CREATE INDEX "RebookingOffer_targetPatientId_idx" ON "RebookingOffer"("targetPatientId");

ALTER TABLE "RebookingOffer" ADD CONSTRAINT "RebookingOffer_targetPatientId_fkey" FOREIGN KEY ("targetPatientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
