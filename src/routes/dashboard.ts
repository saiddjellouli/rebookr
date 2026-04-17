import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  getDashboardEvents,
  getDashboardSummary,
  getDashboardTimeseries,
  getDashboardTimeseriesInRange,
} from "../services/dashboard/aggregates.js";
import { resolveDashboardPeriod } from "../services/dashboard/period.js";

const orgIdSchema = z.string().uuid();

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { organizationId: string }; Querystring: { from?: string; to?: string } }>(
    "/organizations/:organizationId/dashboard/summary",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const bounds = await resolveDashboardPeriod(
        orgId.data,
        request.query.from,
        request.query.to,
        30,
      );
      if (!bounds) {
        return reply.code(400).send({ error: "INVALID_PERIOD_OR_ORG" });
      }

      const summary = await getDashboardSummary(orgId.data, bounds.from, bounds.to);
      if (!summary) return reply.code(404).send({ error: "ORG_NOT_FOUND" });
      return reply.send(summary);
    },
  );

  app.get<{
    Params: { organizationId: string };
    Querystring: { days?: string; from?: string; to?: string };
  }>("/organizations/:organizationId/dashboard/timeseries", async (request, reply) => {
    const orgId = orgIdSchema.safeParse(request.params.organizationId);
    if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

    const orgExists = await prisma.organization.findUnique({
      where: { id: orgId.data },
      select: { id: true, timezone: true },
    });
    if (!orgExists) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

    const { from: fromQ, to: toQ } = request.query;
    if (fromQ && toQ) {
      const bounds = await resolveDashboardPeriod(orgId.data, fromQ, toQ, 30);
      if (!bounds) return reply.code(400).send({ error: "INVALID_PERIOD" });
      const points = await getDashboardTimeseriesInRange(orgId.data, bounds.from, bounds.to);
      return reply.send({ timezone: orgExists.timezone, points, from: fromQ, to: toQ });
    }

    const days = Math.min(90, Math.max(1, Number.parseInt(request.query.days ?? "30", 10) || 30));
    const points = await getDashboardTimeseries(orgId.data, days);
    return reply.send({ timezone: orgExists.timezone, points, days });
  });

  app.get<{
    Params: { organizationId: string };
    Querystring: { limit?: string; from?: string; to?: string };
  }>("/organizations/:organizationId/dashboard/events", async (request, reply) => {
    const orgId = orgIdSchema.safeParse(request.params.organizationId);
    if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

    const orgExists = await prisma.organization.findUnique({
      where: { id: orgId.data },
      select: { id: true },
    });
    if (!orgExists) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

    const limit = Number.parseInt(request.query.limit ?? "20", 10) || 20;
    const { from: fromQ, to: toQ } = request.query;

    let from: Date | undefined;
    let to: Date | undefined;
    if (fromQ && toQ) {
      const bounds = await resolveDashboardPeriod(orgId.data, fromQ, toQ, 30);
      if (!bounds) return reply.code(400).send({ error: "INVALID_PERIOD" });
      from = bounds.from;
      to = bounds.to;
    }

    const events = await getDashboardEvents(orgId.data, limit, from, to);
    return reply.send({ events });
  });
};
