CREATE TABLE "DailyReportLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReportLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyReportLog_organizationId_dayKey_key" ON "DailyReportLog"("organizationId", "dayKey");

CREATE INDEX "DailyReportLog_organizationId_idx" ON "DailyReportLog"("organizationId");

ALTER TABLE "DailyReportLog" ADD CONSTRAINT "DailyReportLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
