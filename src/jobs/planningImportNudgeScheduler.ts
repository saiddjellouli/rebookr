import { runPlanningImportNudgesForAllOrgs } from "../services/reminders/planningImportNudge.js";

const FIVE_MIN_MS = 5 * 60 * 1000;

export function startPlanningImportNudgeScheduler(): void {
  setInterval(() => {
    runPlanningImportNudgesForAllOrgs().catch((err) => {
      console.error("[Calend'Air] runPlanningImportNudgesForAllOrgs", err);
    });
  }, FIVE_MIN_MS);
}
