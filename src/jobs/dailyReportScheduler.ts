import { runDailyReportsForAllOrgs } from "../services/reminders/dailyReport.js";

const FIVE_MIN_MS = 5 * 60 * 1000;

export function startDailyReportScheduler(): void {
  setInterval(() => {
    runDailyReportsForAllOrgs().catch((err) => {
      console.error("[Calend'Air] runDailyReportsForAllOrgs", err);
    });
  }, FIVE_MIN_MS);
}
