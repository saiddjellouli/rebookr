-- Architecture pool : planning = détection, pool = demande de rebooking

CREATE TYPE "PoolInvitePurpose" AS ENUM ('WANTS_EARLIER_SLOT', 'HOT_PRIORITY');

CREATE TABLE "PatientPoolEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "wantsEarlierSlot" BOOLEAN NOT NULL DEFAULT false,
    "isOnWaitingList" BOOLEAN NOT NULL DEFAULT false,
    "hasFutureAppointment" BOOLEAN NOT NULL DEFAULT false,
    "isHot" BOOLEAN NOT NULL DEFAULT false,
    "poolHotExpiresAt" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientPoolEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientPoolEntry_organizationId_patientId_key" ON "PatientPoolEntry"("organizationId", "patientId");
CREATE INDEX "PatientPoolEntry_organizationId_isHot_idx" ON "PatientPoolEntry"("organizationId", "isHot");
CREATE INDEX "PatientPoolEntry_organizationId_wantsEarlierSlot_isOnWaitingList_idx" ON "PatientPoolEntry"("organizationId", "wantsEarlierSlot", "isOnWaitingList");

ALTER TABLE "PatientPoolEntry" ADD CONSTRAINT "PatientPoolEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPoolEntry" ADD CONSTRAINT "PatientPoolEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PoolInviteToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "purpose" "PoolInvitePurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "relatedAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolInviteToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PoolInviteToken_tokenHash_key" ON "PoolInviteToken"("tokenHash");
CREATE INDEX "PoolInviteToken_organizationId_idx" ON "PoolInviteToken"("organizationId");
CREATE INDEX "PoolInviteToken_patientId_idx" ON "PoolInviteToken"("patientId");

ALTER TABLE "PoolInviteToken" ADD CONSTRAINT "PoolInviteToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolInviteToken" ADD CONSTRAINT "PoolInviteToken_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
