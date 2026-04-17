-- Timeline relances T-24 / T-6 / T-3 / T-1 + NO_SHOW_PROBABLE + scoring

ALTER TYPE "AppointmentStatus" ADD VALUE 'NO_SHOW_PROBABLE';

ALTER TABLE "Appointment" ADD COLUMN "reminderT24SentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "reminderT6SentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "reminderT3SentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "reminderT1SentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "preventiveRebookOfferedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "confirmationScore" INTEGER NOT NULL DEFAULT 0;

UPDATE "Appointment"
SET
  "reminderT24SentAt" = COALESCE("reminderT24SentAt", "reminderJ1SentAt"),
  "reminderT6SentAt" = COALESCE("reminderT6SentAt", "reminderH3SentAt"),
  "reminderT3SentAt" = COALESCE("reminderT3SentAt", "reminderH3SentAt")
WHERE "reminderJ1SentAt" IS NOT NULL OR "reminderH3SentAt" IS NOT NULL;
