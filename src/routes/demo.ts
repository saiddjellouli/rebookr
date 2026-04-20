import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { isDemoApiEnabled } from "../config.js";
import { prisma } from "../lib/prisma.js";
import {
  clearDemoScenario,
  DEMO_SCENARIO_IMPORT_BATCH,
  listScenarioPresets,
  SCENARIO_PRESETS,
  type ScenarioPreset,
  seedDemoScenario,
} from "../services/demo/demoScenario.js";
import { getDemoPlanningSnapshot } from "../services/demo/demoState.js";
import { advanceSilenceForAppointment } from "../services/demo/advanceSilence.js";
import {
  applyPatientChoiceForAppointment,
  PATIENT_CHOICES,
  type PatientChoice,
} from "../services/demo/applyPatientChoice.js";
import {
  DEMO_WINDOWS,
  jumpAppointmentToWindow,
  type DemoWindow,
} from "../services/demo/jumpToWindow.js";
import {
  previewPoolProposalForAppointment,
  simulatePoolAcceptForAppointment,
} from "../services/demo/simulatePoolAccept.js";
import { processInboundEmailForOrganization } from "../services/inbound/processInboundEmail.js";
import { setPoolHotPriority, setPoolWantsEarlierSlot } from "../services/pool/patientPool.js";
import { markAppointmentNoShowAndReleaseSlot } from "../services/rebooking/markNoShowAndReleaseSlot.js";

const orgIdSchema = z.string().uuid();

export const demoRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/demo/state",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const snap = await getDemoPlanningSnapshot(orgId.data);
      if (!snap) return reply.code(404).send({ error: "ORG_NOT_FOUND" });
      return reply.send(snap);
    },
  );

  app.get(
    "/demo/scenario/presets",
    async (_request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      return reply.send({ presets: listScenarioPresets() });
    },
  );

  const seedQuery = z.object({
    /** Préset par défaut conservé pour rétrocompat : `busy_normal`. */
    preset: z.enum(SCENARIO_PRESETS).optional(),
    /** Si `true`, on supprime d’abord le scénario démo existant avant de re-seeder. */
    clearFirst: z
      .union([z.literal("true"), z.literal("false"), z.boolean()])
      .optional()
      .transform((v) => v === true || v === "true"),
  });

  app.post<{ Params: { organizationId: string }; Querystring: z.infer<typeof seedQuery> }>(
    "/organizations/:organizationId/demo/scenario/seed",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const parsed = seedQuery.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_QUERY", details: parsed.error.flatten() });
      }

      const org = await prisma.organization.findUnique({ where: { id: orgId.data } });
      if (!org) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

      if (parsed.data.clearFirst) {
        await clearDemoScenario(org.id);
      }
      const result = await seedDemoScenario(org.id, parsed.data.preset ?? "busy_normal");
      return reply.send({
        ...result,
        importBatchId: DEMO_SCENARIO_IMPORT_BATCH,
        nextStep: {
          fr: "GET /api/organizations/{orgId}/demo/state : utiliser inboundSimulateExamples pour POST /api/organizations/{orgId}/demo/simulate/inbound-email.",
        },
      });
    },
  );

  const presetParams = z.object({ name: z.enum(SCENARIO_PRESETS) });

  app.post<{ Params: { organizationId: string; name: ScenarioPreset } }>(
    "/organizations/:organizationId/demo/scenario/preset/:name",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });
      const pn = presetParams.safeParse({ name: request.params.name });
      if (!pn.success) {
        return reply.code(400).send({ error: "INVALID_PRESET", validValues: SCENARIO_PRESETS });
      }

      const org = await prisma.organization.findUnique({ where: { id: orgId.data } });
      if (!org) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

      // Switch de scénario = on repart d’une page blanche pour éviter les mélanges démo.
      await clearDemoScenario(org.id);
      const result = await seedDemoScenario(org.id, pn.data.name);
      return reply.send({
        switched: true,
        ...result,
        importBatchId: DEMO_SCENARIO_IMPORT_BATCH,
      });
    },
  );

  app.delete<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/demo/scenario",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const cleared = await clearDemoScenario(orgId.data);
      return reply.send(cleared);
    },
  );

  const simulateBody = z.object({
    action: z.enum(["confirm", "cancel"]),
    patientEmail: z.string().email(),
    /** Ligne de texte avec date/heure du RDV (ex. du 17/04/2026 à 23:00) — même logique que le webhook prod. */
    dateLine: z.string().min(4),
    messageId: z.string().optional(),
  });

  app.post<{ Params: { organizationId: string }; Body: z.infer<typeof simulateBody> }>(
    "/organizations/:organizationId/demo/simulate/inbound-email",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const parsed = simulateBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }

      const org = await prisma.organization.findUnique({ where: { id: orgId.data } });
      if (!org) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

      const { action, patientEmail, dateLine, messageId } = parsed.data;
      const subject =
        action === "confirm" ? "Doctolib — confirmation de rendez-vous" : "Doctolib — annulation de rendez-vous";
      const text =
        action === "confirm"
          ? `Doctolib\nVous avez confirmé votre rendez-vous ${dateLine}.\nCompte : ${patientEmail}`
          : `Doctolib\nVotre rendez-vous ${dateLine} a été annulé.\nCompte : ${patientEmail}`;

      const result = await processInboundEmailForOrganization({
        organizationId: org.id,
        timezone: org.timezone,
        payload: {
          from: patientEmail,
          subject,
          text,
          messageId: messageId ?? `demo-${Date.now()}-${action}`,
        },
      });

      return reply.send({
        ...result,
        note: "Même pipeline que POST /api/inbound/email/:token (filtrage Doctolib + matching).",
      });
    },
  );

  const poolBody = z.object({
    makeHot: z.boolean().optional(),
  });

  app.post<{ Params: { organizationId: string }; Body: z.infer<typeof poolBody> }>(
    "/organizations/:organizationId/demo/pool/sample-opt-ins",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const parsed = poolBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }

      const patients = await prisma.patient.findMany({
        where: {
          organizationId: orgId.data,
          email: { endsWith: "@calendair.invalid" },
        },
        take: 6,
        orderBy: { createdAt: "asc" },
      });

      const slice = patients.slice(0, 3);
      for (const p of slice) {
        await setPoolWantsEarlierSlot({ organizationId: orgId.data, patientId: p.id });
        if (parsed.data.makeHot === true) {
          await setPoolHotPriority({
            organizationId: orgId.data,
            patientId: p.id,
            hotTtlHours: 48,
          });
        }
      }

      return reply.send({
        optedInPatientIds: slice.map((p) => p.id),
        hotAlsoSet: parsed.data.makeHot === true,
      });
    },
  );

  const advanceBody = z.object({
    /** Par défaut 6 h — permet de cliquer plusieurs fois pour translater davantage. */
    hours: z.number().min(0.5).max(72).optional(),
  });

  app.post<{
    Params: { organizationId: string; appointmentId: string };
    Body: z.infer<typeof advanceBody>;
  }>(
    "/organizations/:organizationId/demo/appointments/:appointmentId/advance-silence",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      const aptId = orgIdSchema.safeParse(request.params.appointmentId);
      if (!orgId.success || !aptId.success) return reply.code(400).send({ error: "INVALID_ID" });

      const parsed = advanceBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }

      const result = await advanceSilenceForAppointment({
        organizationId: orgId.data,
        appointmentId: aptId.data,
        hours: parsed.data.hours,
      });

      if (!result.ok) {
        const code =
          result.error === "NOT_FOUND" ? 404 : result.error === "FORBIDDEN_ORG" ? 403 : 409;
        return reply.code(code).send({ error: result.error });
      }
      return reply.send(result);
    },
  );

  const jumpBody = z.object({ window: z.enum(DEMO_WINDOWS) });

  app.post<{
    Params: { organizationId: string; appointmentId: string };
    Body: { window: DemoWindow };
  }>(
    "/organizations/:organizationId/demo/appointments/:appointmentId/jump-to-window",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      const aptId = orgIdSchema.safeParse(request.params.appointmentId);
      if (!orgId.success || !aptId.success) return reply.code(400).send({ error: "INVALID_ID" });

      const parsed = jumpBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }

      const result = await jumpAppointmentToWindow({
        organizationId: orgId.data,
        appointmentId: aptId.data,
        window: parsed.data.window,
      });
      if (!result.ok) {
        const code =
          result.error === "NOT_FOUND" ? 404 : result.error === "FORBIDDEN_ORG" ? 403 : 409;
        return reply.code(code).send({ error: result.error });
      }
      return reply.send(result);
    },
  );

  const choiceBody = z.object({ choice: z.enum(PATIENT_CHOICES) });

  app.post<{
    Params: { organizationId: string; appointmentId: string };
    Body: { choice: PatientChoice };
  }>(
    "/organizations/:organizationId/demo/appointments/:appointmentId/apply-choice",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      const aptId = orgIdSchema.safeParse(request.params.appointmentId);
      if (!orgId.success || !aptId.success) return reply.code(400).send({ error: "INVALID_ID" });

      const parsed = choiceBody.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }

      const result = await applyPatientChoiceForAppointment({
        organizationId: orgId.data,
        appointmentId: aptId.data,
        choice: parsed.data.choice,
      });
      if (!result.ok) {
        const code =
          result.error === "NOT_FOUND" ? 404 : result.error === "FORBIDDEN_ORG" ? 403 : 409;
        return reply.code(code).send({ error: result.error });
      }
      return reply.send(result);
    },
  );

  app.get<{ Params: { organizationId: string; appointmentId: string } }>(
    "/organizations/:organizationId/demo/appointments/:appointmentId/pool-proposal",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      const aptId = orgIdSchema.safeParse(request.params.appointmentId);
      if (!orgId.success || !aptId.success) return reply.code(400).send({ error: "INVALID_ID" });

      const preview = await previewPoolProposalForAppointment({
        organizationId: orgId.data,
        appointmentId: aptId.data,
      });
      if (!preview) return reply.code(404).send({ error: "APPOINTMENT_NOT_FOUND" });
      return reply.send(preview);
    },
  );

  app.post<{ Params: { organizationId: string; appointmentId: string } }>(
    "/organizations/:organizationId/demo/appointments/:appointmentId/simulate-pool-accept",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      const aptId = orgIdSchema.safeParse(request.params.appointmentId);
      if (!orgId.success || !aptId.success) return reply.code(400).send({ error: "INVALID_ID" });

      const result = await simulatePoolAcceptForAppointment({
        organizationId: orgId.data,
        appointmentId: aptId.data,
      });
      if (!result.ok) {
        const code =
          result.error === "APPOINTMENT_NOT_FOUND"
            ? 404
            : result.error === "FORBIDDEN_ORG"
              ? 403
              : 409;
        return reply.code(code).send({ error: result.error });
      }
      return reply.send(result);
    },
  );

  app.post<{ Params: { organizationId: string; appointmentId: string } }>(
    "/organizations/:organizationId/demo/appointments/:appointmentId/simulate-no-show",
    async (request, reply) => {
      if (!isDemoApiEnabled()) return reply.code(404).send({ error: "DEMO_DISABLED" });
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      const aptId = orgIdSchema.safeParse(request.params.appointmentId);
      if (!orgId.success || !aptId.success) return reply.code(400).send({ error: "INVALID_ID" });

      const result = await markAppointmentNoShowAndReleaseSlot({
        organizationId: orgId.data,
        appointmentId: aptId.data,
      });

      if (!result.ok) {
        const code =
          result.error === "NOT_FOUND" ? 404 : result.error === "FORBIDDEN_ORG" ? 403 : 409;
        return reply.code(code).send({ error: result.error });
      }

      return reply.send({
        freeSlotId: result.freeSlotId,
        message: "No-show simulé : créneau publié (même logique que la route no-show standard).",
      });
    },
  );
};
