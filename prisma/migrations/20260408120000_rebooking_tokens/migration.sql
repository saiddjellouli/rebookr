-- Liens sécurisés pour accepter un créneau libéré (rebooking)
ALTER TABLE "RebookingOffer" ADD COLUMN "tokenHash" TEXT;
ALTER TABLE "RebookingOffer" ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "RebookingOffer_tokenHash_key" ON "RebookingOffer"("tokenHash");
