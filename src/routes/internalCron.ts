import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { dispatchPostBookingPoolOptIn } from "../services/pool/dispatchPostBookingPoolOptIn.js";
import { dispatchReminders } from "../services/reminders/dispatch.js";
import { finalizeNoShowsAfterGrace } from "../services/reminders/finalizeNoShows.js";
import { runDailyReportsForAllOrgs } from "../services/reminders/dailyReport.js";
import { runPlanningImportNudgesForAllOrgs } from "../services/reminders/planningImportNudge.js";
import { recalculateRisksAllOrganizations } from "../services/risk/appointmentRisk.js";

function authorizeCron(request: { headers: { authorization?: string } }): boolean {
  if (!env.CRON_SECRET) return true;
  return request.headers.authorization === `Bearer ${env.CRON_SECRET}`;
}

export const internalCronRoutes: FastifyPluginAsync = async (app) => {
  app.post("/internal/run-reminders", async (request, reply) => {
    if (!authorizeCron(request)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const result = await dispatchReminders();
    const finalized = await finalizeNoShowsAfterGrace();
    return reply.send({
      ...result,
      noShowFinalized: finalized.finalized,
      message: result.skippedNoResend
        ? "RESEND_API_KEY absente : aucun envoi (configurez Resend pour activer les relances)."
        : undefined,
    });
  });

  app.post("/internal/run-daily-reports", async (request, reply) => {
    if (!authorizeCron(request)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const bodySchema = z.object({ force: z.boolean().optional() });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }

    const result = await runDailyReportsForAllOrgs(new Date(), { force: parsed.data.force === true });
    return reply.send(result);
  });

  app.post("/internal/recalculate-risks", async (request, reply) => {
    if (!authorizeCron(request)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const result = await recalculateRisksAllOrganizations();
    return reply.send(result);
  });

  app.post("/internal/run-post-booking-pool-optin", async (request, reply) => {
    if (!authorizeCron(request)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const result = await dispatchPostBookingPoolOptIn();
    return reply.send(result);
  });

  app.post("/internal/run-planning-import-nudges", async (request, reply) => {
    if (!authorizeCron(request)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const bodySchema = z.object({ force: z.boolean().optional() });
    const parsed = bodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_BODY" });
    }

    const result = await runPlanningImportNudgesForAllOrgs(new Date(), {
      force: parsed.data.force === true,
    });
    return reply.send(result);
  });
};
