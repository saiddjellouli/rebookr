import type { InboundEmailOutcome, Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getInboundEmailSummary } from "../services/inbound/inboundStats.js";
import { processInboundEmailForOrganization } from "../services/inbound/processInboundEmail.js";

const orgIdSchema = z.string().uuid();

const OUTCOME_ENUM = [
  "FILTERED_OUT_NOT_DOCTOLIB",
  "UNKNOWN_INTENT",
  "NO_PATIENT_MATCH",
  "NO_APPOINTMENT_MATCH",
  "DUPLICATE_SKIPPED",
  "CONFIRMED",
  "CANCELLED",
  "CREATED",
  "ERROR",
] as const;

const listQuerySchema = z.object({
  outcome: z.enum(OUTCOME_ENUM).optional(),
  /** Raccourci UI : ne retourne que les événements qui demandent une action humaine. */
  needsAttention: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
  sinceDays: z.coerce.number().int().min(1).max(90).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const NEEDS_ATTENTION_OUTCOMES: InboundEmailOutcome[] = [
  "UNKNOWN_INTENT",
  "NO_PATIENT_MATCH",
  "NO_APPOINTMENT_MATCH",
  "ERROR",
];

/**
 * Rend visible (UI dashboard) ce que le webhook a fait : ce qui a marché, ce qui demande une action,
 * et permet de relancer le traitement après correction manuelle (création patient, etc.).
 */
export const inboundEmailAdminRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/inbound-email/summary",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const org = await prisma.organization.findUnique({
        where: { id: orgId.data },
        select: { id: true, inboundEmailEnabled: true },
      });
      if (!org) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

      const summary = await getInboundEmailSummary(orgId.data);
      return reply.send({
        inboundEmailEnabled: org.inboundEmailEnabled,
        ...summary,
      });
    },
  );

  app.get<{ Params: { organizationId: string }; Querystring: z.infer<typeof listQuerySchema> }>(
    "/organizations/:organizationId/inbound-email/events",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const parsed = listQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_QUERY", details: parsed.error.flatten() });
      }
      const q = parsed.data;

      const where: Prisma.InboundEmailEventWhereInput = { organizationId: orgId.data };
      if (q.outcome) where.outcome = q.outcome;
      if (q.needsAttention) where.outcome = { in: NEEDS_ATTENTION_OUTCOMES };
      if (q.sinceDays) {
        where.createdAt = { gte: new Date(Date.now() - q.sinceDays * 24 * 3600 * 1000) };
      }

      const rows = await prisma.inboundEmailEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.limit,
        select: {
          id: true,
          createdAt: true,
          outcome: true,
          fromAddress: true,
          toAddress: true,
          subject: true,
          bodyPreview: true,
          matchedPatientId: true,
          matchedAppointmentId: true,
          detail: true,
          messageId: true,
        },
      });

      return reply.send({ count: rows.length, events: rows });
    },
  );

  app.post<{ Params: { organizationId: string; eventId: string } }>(
    "/organizations/:organizationId/inbound-email/events/:eventId/retry",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });
      const eventId = z.string().uuid().safeParse(request.params.eventId);
      if (!eventId.success) return reply.code(400).send({ error: "INVALID_EVENT_ID" });

      const org = await prisma.organization.findUnique({
        where: { id: orgId.data },
        select: { id: true, timezone: true },
      });
      if (!org) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

      const evt = await prisma.inboundEmailEvent.findUnique({
        where: { id: eventId.data },
        select: {
          id: true,
          organizationId: true,
          fromAddress: true,
          toAddress: true,
          subject: true,
          bodyPreview: true,
          messageId: true,
        },
      });
      if (!evt || evt.organizationId !== orgId.data) {
        return reply.code(404).send({ error: "EVENT_NOT_FOUND" });
      }
      if (!evt.fromAddress?.trim()) {
        return reply.code(400).send({ error: "EVENT_HAS_NO_FROM" });
      }

      // On réinjecte le payload tel qu’on l’a capturé — bodyPreview peut être tronqué (8k),
      // mais ça couvre le cas le plus courant (payload Doctolib < 8k).
      // messageId est volontairement reforgé pour éviter le court-circuit DUPLICATE_SKIPPED.
      const result = await processInboundEmailForOrganization({
        organizationId: orgId.data,
        timezone: org.timezone,
        payload: {
          from: evt.fromAddress,
          to: evt.toAddress ?? undefined,
          subject: evt.subject ?? undefined,
          text: evt.bodyPreview ?? undefined,
          messageId: `retry:${evt.id}:${Date.now()}`,
        },
      });

      return reply.send({
        retried: true,
        outcome: result.outcome,
        detail: result.detail,
        appointmentId: result.appointmentId,
      });
    },
  );
};
