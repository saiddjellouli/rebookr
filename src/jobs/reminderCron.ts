import cron from "node-cron";
import { dispatchReminders } from "../services/reminders/dispatch.js";
import { finalizeNoShowsAfterGrace } from "../services/reminders/finalizeNoShows.js";

export function startReminderCron(): void {
  cron.schedule("*/10 * * * *", () => {
    dispatchReminders()
      .then(() => finalizeNoShowsAfterGrace())
      .catch((err) => {
        console.error("[Calend'Air] dispatchReminders / finalizeNoShows", err);
      });
  });
}
