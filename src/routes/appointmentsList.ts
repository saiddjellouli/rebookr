import type { Prisma } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { silenceDurationHours } from "../services/risk/appointmentRisk.js";
import { classifyRisk } from "../services/risk/riskBand.js";
import { isIrrecoverableZone } from "../services/risk/irrecoverableZone.js";

const orgIdSchema = z.string().uuid();

const querySchema = z.object({
  /** Score minimum (0–100). Permet de cibler les RDV à risque pour une journée / un écran « ma journée ». */
  riskMin: z.coerce.number().int().min(0).max(100).optional(),
  riskMax: z.coerce.number().int().min(0).max(100).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z
    .enum(["PENDING", "CONFIRMED", "AT_RISK", "NO_SHOW_PROBABLE", "CANCELLED", "NO_SHOW", "COMPLETED"])
    .optional(),
  /** `risk` (par défaut) trie par score décroissant ; `time` par `startsAt` croissant. */
  sort: z.enum(["risk", "time"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Liste filtrable de RDV avec score / band / dernière source de mise à jour.
 * Sert de base à un futur écran « ma journée » centré sur le risque.
 */
export const appointmentsListRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { organizationId: string }; Querystring: z.infer<typeof querySchema> }>(
    "/organizations/:organizationId/appointments",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });

      const parsed = querySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_QUERY", details: parsed.error.flatten() });
      }
      const q = parsed.data;

      const orgExists = await prisma.organization.findUnique({
        where: { id: orgId.data },
        select: { id: true, timezone: true },
      });
      if (!orgExists) return reply.code(404).send({ error: "ORG_NOT_FOUND" });

      const where: Prisma.AppointmentWhereInput = {
        organizationId: orgId.data,
      };
      if (q.status) where.status = q.status;
      if (q.from || q.to) {
        const startsAt: Prisma.DateTimeFilter = {};
        if (q.from) startsAt.gte = new Date(q.from);
        if (q.to) startsAt.lte = new Date(q.to);
        where.startsAt = startsAt;
      }
      if (q.riskMin != null || q.riskMax != null) {
        const riskScore: Prisma.IntFilter = {};
        if (q.riskMin != null) riskScore.gte = q.riskMin;
        if (q.riskMax != null) riskScore.lte = q.riskMax;
        where.riskScore = riskScore;
      }

      const orderBy =
        q.sort === "time"
          ? { startsAt: "asc" as const }
          : [{ riskScore: "desc" as const }, { startsAt: "asc" as const }];

      const rows = await prisma.appointment.findMany({
        where,
        orderBy,
        take: q.limit,
        include: { patient: true },
      });

      const now = new Date();
      const items = rows.map((a) => ({
        id: a.id,
        title: a.title,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
        status: a.status,
        riskScore: a.riskScore,
        riskBand: classifyRisk(a.riskScore),
        confirmationSignalCount: a.confirmationSignalCount,
        planningLastUpdateSource: a.planningLastUpdateSource,
        silenceDurationHours: Math.round(silenceDurationHours(a, now) * 10) / 10,
        irrecoverableZone: isIrrecoverableZone({
          startsAt: a.startsAt,
          createdAt: a.createdAt,
          timezone: orgExists.timezone,
        }),
        patient: a.patient ? { name: a.patient.name, email: a.patient.email } : null,
      }));

      return reply.send({
        timezone: orgExists.timezone,
        count: items.length,
        appointments: items,
      });
    },
  );
};
