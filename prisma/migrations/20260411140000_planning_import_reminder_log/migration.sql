-- CreateTable
CREATE TABLE "PlanningImportReminderLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanningImportReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanningImportReminderLog_organizationId_dayKey_key" ON "PlanningImportReminderLog"("organizationId", "dayKey");

-- CreateIndex
CREATE INDEX "PlanningImportReminderLog_organizationId_idx" ON "PlanningImportReminderLog"("organizationId");

-- AddForeignKey
ALTER TABLE "PlanningImportReminderLog" ADD CONSTRAINT "PlanningImportReminderLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
