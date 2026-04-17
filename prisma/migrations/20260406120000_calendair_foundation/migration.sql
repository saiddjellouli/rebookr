-- Calend'Air : sources MVP (CSV, image) + statut PENDING + champs import / annulation

-- AlterEnum AppointmentSource
ALTER TYPE "AppointmentSource" ADD VALUE 'CSV';
ALTER TYPE "AppointmentSource" ADD VALUE 'IMAGE';

-- AlterEnum AppointmentStatus (PostgreSQL 10+)
ALTER TYPE "AppointmentStatus" RENAME VALUE 'PENDING_CONFIRMATION' TO 'PENDING';

-- AlterTable Appointment
ALTER TABLE "Appointment" ADD COLUMN "importBatchId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "cancellationReason" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_organizationId_importBatchId_idx" ON "Appointment"("organizationId", "importBatchId");
