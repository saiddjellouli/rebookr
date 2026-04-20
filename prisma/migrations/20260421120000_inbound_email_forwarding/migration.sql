-- Flux e-mail entrant (transfert accusés Doctolib / patient)

CREATE TYPE "InboundEmailOutcome" AS ENUM (
  'FILTERED_OUT_NOT_DOCTOLIB',
  'UNKNOWN_INTENT',
  'NO_PATIENT_MATCH',
  'NO_APPOINTMENT_MATCH',
  'DUPLICATE_SKIPPED',
  'CONFIRMED',
  'CANCELLED',
  'ERROR'
);

ALTER TYPE "AppointmentSource" ADD VALUE 'EMAIL_FORWARD';

ALTER TABLE "Organization" ADD COLUMN "inboundEmailToken" TEXT;
UPDATE "Organization" SET "inboundEmailToken" = gen_random_uuid()::text WHERE "inboundEmailToken" IS NULL;
ALTER TABLE "Organization" ALTER COLUMN "inboundEmailToken" SET NOT NULL;
CREATE UNIQUE INDEX "Organization_inboundEmailToken_key" ON "Organization"("inboundEmailToken");

ALTER TABLE "Organization" ADD COLUMN "inboundEmailEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "InboundEmailEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "subject" TEXT,
    "bodyPreview" TEXT NOT NULL,
    "outcome" "InboundEmailOutcome" NOT NULL,
    "matchedPatientId" TEXT,
    "matchedAppointmentId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InboundEmailEvent_organizationId_messageId_key" ON "InboundEmailEvent"("organizationId", "messageId");
CREATE INDEX "InboundEmailEvent_organizationId_createdAt_idx" ON "InboundEmailEvent"("organizationId", "createdAt");

ALTER TABLE "InboundEmailEvent" ADD CONSTRAINT "InboundEmailEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundEmailEvent" ADD CONSTRAINT "InboundEmailEvent_matchedPatientId_fkey" FOREIGN KEY ("matchedPatientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InboundEmailEvent" ADD CONSTRAINT "InboundEmailEvent_matchedAppointmentId_fkey" FOREIGN KEY ("matchedAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
