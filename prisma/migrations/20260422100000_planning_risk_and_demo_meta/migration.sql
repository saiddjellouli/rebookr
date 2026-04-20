-- Métadonnées planning : risque async + signaux (aligné mode démo / prod)

CREATE TYPE "PlanningUpdateSource" AS ENUM (
  'EMAIL',
  'IMPORT',
  'MANUAL',
  'PATIENT_LINK',
  'DEMO',
  'SYSTEM'
);

ALTER TABLE "Appointment" ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Appointment" ADD COLUMN "confirmationSignalCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Appointment" ADD COLUMN "planningLastUpdateSource" "PlanningUpdateSource";
