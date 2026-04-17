-- Tarif séance (même sémantique que l’ancien champ KPI)
ALTER TABLE "Organization" RENAME COLUMN "defaultRevenuePerApptCents" TO "sessionPriceCents";
