import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { processInboundEmailForOrganization } from "../services/inbound/processInboundEmail.js";

const paramsSchema = z.object({
  token: z.string().uuid(),
});

const bodySchema = z.object({
  from: z.string().min(1),
  to: z.string().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  messageId: z.string().optional(),
});

/**
 * Webhook e-mail entrant : configurez votre fournisseur (transfert, Resend Inbound, CloudMailin…)
 * pour POSTici avec le corps normalisé. Le jeton par cabinet est fourni dans GET /api/auth/me.
 */
export const inboundEmailRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { token: string }; Body: z.infer<typeof bodySchema> }>(
    "/inbound/email/:token",
    async (request, reply) => {
      const p = paramsSchema.safeParse(request.params);
      if (!p.success) {
        return reply.code(400).send({ error: "INVALID_TOKEN" });
      }
      const parsedBody = bodySchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsedBody.error.flatten() });
      }

      const org = await prisma.organization.findUnique({
        where: { inboundEmailToken: p.data.token },
      });
      if (!org) {
        return reply.code(404).send({ error: "ORG_NOT_FOUND" });
      }
      if (!org.inboundEmailEnabled) {
        return reply.code(403).send({ error: "INBOUND_DISABLED" });
      }

      const result = await processInboundEmailForOrganization({
        organizationId: org.id,
        timezone: org.timezone,
        payload: parsedBody.data,
      });

      return reply.send({
        ok: true,
        outcome: result.outcome,
        detail: result.detail,
        appointmentId: result.appointmentId,
      });
    },
  );
};
