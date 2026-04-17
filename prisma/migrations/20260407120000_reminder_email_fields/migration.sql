-- Suivi des relances email J-1 / H-3 (Calend'Air)
ALTER TABLE "Appointment" ADD COLUMN "reminderJ1SentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "reminderH3SentAt" TIMESTAMP(3);
