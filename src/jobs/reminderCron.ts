import cron from "node-cron";
import { dispatchPostBookingPoolOptIn } from "../services/pool/dispatchPostBookingPoolOptIn.js";
import { dispatchReminders } from "../services/reminders/dispatch.js";
import { finalizeNoShowsAfterGrace } from "../services/reminders/finalizeNoShows.js";
import { recalculateRisksAllOrganizations } from "../services/risk/appointmentRisk.js";

export function startReminderCron(): void {
  cron.schedule("*/10 * * * *", () => {
    dispatchReminders()
      .then(() => finalizeNoShowsAfterGrace())
      .catch((err) => {
        console.error("[Calend'Air] dispatchReminders / finalizeNoShows", err);
      });
  });

  cron.schedule("*/15 * * * *", () => {
    recalculateRisksAllOrganizations().catch((err) => {
      console.error("[Calend'Air] recalculateRisksAllOrganizations", err);
    });
  });

  // Étape 2 du workflow Doctolib : envoi décalé (~2 min après création) du mail opt-in
  // pool. Fréquence 1 min pour garder une latence max de ~3 min entre la création du
  // RDV et la réception du mail. Idempotence assurée via Appointment.poolOptInEmailSentAt.
  cron.schedule("* * * * *", () => {
    dispatchPostBookingPoolOptIn().catch((err) => {
      console.error("[Calend'Air] dispatchPostBookingPoolOptIn", err);
    });
  });
}
