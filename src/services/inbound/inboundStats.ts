import type { InboundEmailOutcome } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

const ALL_OUTCOMES: InboundEmailOutcome[] = [
  "FILTERED_OUT_NOT_DOCTOLIB",
  "UNKNOWN_INTENT",
  "NO_PATIENT_MATCH",
  "NO_APPOINTMENT_MATCH",
  "DUPLICATE_SKIPPED",
  "CONFIRMED",
  "CANCELLED",
  "CREATED",
  "ERROR",
];

export type InboundEmailSummary = {
  since: string;
  totalEvents: number;
  /** Événements qui ont produit un effet concret sur le planning (CREATED + CONFIRMED + CANCELLED). */
  actionableCount: number;
  /** Événements qui demandent une attention humaine (UNKNOWN_INTENT, NO_PATIENT_MATCH, NO_APPOINTMENT_MATCH, ERROR). */
  needsAttentionCount: number;
  byOutcome: Record<InboundEmailOutcome, number>;
  lastEventAt: string | null;
};

export async function getInboundEmailSummary(
  organizationId: string,
  sinceDays: number = 7,
): Promise<InboundEmailSummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);

  const grouped = await prisma.inboundEmailEvent.groupBy({
    by: ["outcome"],
    where: { organizationId, createdAt: { gte: since } },
    _count: { _all: true },
  });

  const last = await prisma.inboundEmailEvent.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const byOutcome = Object.fromEntries(
    ALL_OUTCOMES.map((o) => [o, 0]),
  ) as Record<InboundEmailOutcome, number>;
  let total = 0;
  for (const g of grouped) {
    byOutcome[g.outcome] = g._count._all;
    total += g._count._all;
  }

  const actionable = byOutcome.CONFIRMED + byOutcome.CANCELLED + byOutcome.CREATED;
  const needsAttention =
    byOutcome.UNKNOWN_INTENT +
    byOutcome.NO_PATIENT_MATCH +
    byOutcome.NO_APPOINTMENT_MATCH +
    byOutcome.ERROR;

  return {
    since: since.toISOString(),
    totalEvents: total,
    actionableCount: actionable,
    needsAttentionCount: needsAttention,
    byOutcome,
    lastEventAt: last?.createdAt?.toISOString() ?? null,
  };
}
