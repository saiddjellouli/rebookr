-- Nouveau cas d’usage : un mail Doctolib forwardé peut créer un RDV (patient + appointment)
-- au lieu de seulement matcher un RDV existant. Voir docs/CALENDAIR_PRINCIPES.md §6 (signal partiel).

ALTER TYPE "InboundEmailOutcome" ADD VALUE IF NOT EXISTS 'CREATED';
