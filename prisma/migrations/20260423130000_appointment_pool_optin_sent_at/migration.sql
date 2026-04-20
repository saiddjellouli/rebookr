-- Étape 2 du workflow Doctolib : après création d’un RDV via EMAIL_FORWARD, on envoie
-- (avec ~2 min de décalage, pour ne pas empiler avec le mail natif Doctolib) une
-- invitation « Voulez-vous être contacté·e si un créneau se libère plus tôt ? »
-- Cette colonne porte l’idempotence : tant qu’elle est NULL, le cron retentera.

ALTER TABLE "Appointment"
  ADD COLUMN "poolOptInEmailSentAt" TIMESTAMP(3);

CREATE INDEX "Appointment_poolOptInEmailSentAt_idx"
  ON "Appointment" ("organizationId", "poolOptInEmailSentAt");
