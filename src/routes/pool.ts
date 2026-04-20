import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getPoolStats } from "../services/pool/poolStats.js";
import { seedPoolInvitesForOrganization } from "../services/pool/seedPoolInvites.js";

const orgIdSchema = z.string().uuid();

const seedBodySchema = z.object({
  horizonDays: z.number().int().min(1).max(60).optional(),
  maxInvitesPerRun: z.number().int().min(1).max(500).optional(),
  cooldownDays: z.number().int().min(0).max(180).optional(),
});

export const poolRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/pool/stats",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const org = await prisma.organization.findUnique({
        where: { id: orgId.data },
        select: { id: true },
      });
      if (!org) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

      const stats = await getPoolStats(orgId.data);
      return reply.send(stats);
    },
  );

  app.post<{ Params: { organizationId: string }; Body: z.infer<typeof seedBodySchema> }>(
    "/organizations/:organizationId/pool/seed-invites",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const parsed = seedBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }

      const org = await prisma.organization.findUnique({
        where: { id: orgId.data },
        select: { id: true },
      });
      if (!org) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

      const result = await seedPoolInvitesForOrganization({
        organizationId: orgId.data,
        ...parsed.data,
      });
      return reply.send(result);
    },
  );
};
