import { buildApp } from "./app.js";
import { env } from "./config.js";
import { startDailyReportScheduler } from "./jobs/dailyReportScheduler.js";
import { startPlanningImportNudgeScheduler } from "./jobs/planningImportNudgeScheduler.js";
import { startReminderCron } from "./jobs/reminderCron.js";

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  startReminderCron();
  startDailyReportScheduler();
  startPlanningImportNudgeScheduler();
  app.log.info(
    "Calend'Air — rappels (10 min) + rapports quotidiens + nudge import planning (contrôle 5 min)",
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
