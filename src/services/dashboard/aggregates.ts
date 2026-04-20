import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";

export type DashboardSummary = {
  period: { from: string; to: string };
  sessionPriceCents: number;
  sessionPriceEuros: number;
  rebookedCount: number;
  recoveredFromRebooksEuros: number;
  /** KPI principal : basé sur les rebooks × tarif séance, sur la période. */
  recoveryKpiSentence: string;
  noShowsAvoidedProxy: number;
  confirmationRate: number | null;
  confirmedCount: number;
  cancelledCount: number;
};

function buildRecoverySentence(rebookedCount: number, sessionPriceCents: number): string {
  const euros = (rebookedCount * sessionPriceCents) / 100;
  const amountStr = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(euros);
  return `Vous avez récupéré : ${rebookedCount} rdv, ce qui correspond à : ${amountStr} euros`;
}

export async function getDashboardSummary(
  organizationId: string,
  from: Date,
  to: Date,
): Promise<DashboardSummary | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });
  if (!org) return null;

  const confirmed = await prisma.appointment.count({
    where: {
      organizationId,
      confirmedAt: { gte: from, lte: to },
    },
  });

  const cancelled = await prisma.appointment.count({
    where: {
      organizationId,
      cancelledAt: { gte: from, lte: to },
    },
  });

  const rebooked = await prisma.rebookingOffer.count({
    where: {
      claimedAt: { gte: from, lte: to },
      freeSlot: { organizationId },
    },
  });

  const denom = confirmed + cancelled;
  const confirmationRate = denom === 0 ? null : Math.round((1000 * confirmed) / denom) / 1000;

  const sessionPriceCents = org.sessionPriceCents;
  const recoveredFromRebooksEuros =
    Math.round(((rebooked * sessionPriceCents) / 100) * 100) / 100;
  const noShowsAvoidedProxy = confirmed + rebooked;

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    sessionPriceCents,
    sessionPriceEuros: Math.round((sessionPriceCents / 100) * 100) / 100,
    rebookedCount: rebooked,
    recoveredFromRebooksEuros,
    recoveryKpiSentence: buildRecoverySentence(rebooked, sessionPriceCents),
    noShowsAvoidedProxy,
    confirmationRate,
    confirmedCount: confirmed,
    cancelledCount: cancelled,
  };
}

export type TimeseriesPoint = {
  day: string;
  /** Confirmations enregistrées ce jour-là (`confirmedAt`, fuseau org). */
  confirmed: number;
  /** RDV au statut CONFIRMED dont le début (`startsAt`) tombe ce jour-là (fuseau org). */
  confirmedSlotDay: number;
  cancelled: number;
  rebooked: number;
};

export async function getDashboardTimeseries(
  organizationId: string,
  days: number,
): Promise<TimeseriesPoint[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, timezone: true },
  });
  if (!org) return [];

  const tz = org.timezone;
  const n = Math.min(Math.max(days, 1), 90);
  const out: TimeseriesPoint[] = [];

  for (let i = n - 1; i >= 0; i--) {
    const dayStart = DateTime.now().setZone(tz).startOf("day").minus({ days: i });
    const dayEnd = dayStart.endOf("day");
    const from = dayStart.toUTC().toJSDate();
    const to = dayEnd.toUTC().toJSDate();
    const day = dayStart.toFormat("yyyy-MM-dd");

    const [confirmed, confirmedSlotDay, cancelled, rebooked] = await Promise.all([
      prisma.appointment.count({
        where: { organizationId, confirmedAt: { gte: from, lte: to } },
      }),
      prisma.appointment.count({
        where: { organizationId, status: "CONFIRMED", startsAt: { gte: from, lte: to } },
      }),
      prisma.appointment.count({
        where: { organizationId, cancelledAt: { gte: from, lte: to } },
      }),
      prisma.rebookingOffer.count({
        where: {
          claimedAt: { gte: from, lte: to },
          freeSlot: { organizationId },
        },
      }),
    ]);

    out.push({ day, confirmed, confirmedSlotDay, cancelled, rebooked });
  }

  return out;
}

export async function getDashboardTimeseriesInRange(
  organizationId: string,
  from: Date,
  to: Date,
): Promise<TimeseriesPoint[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  if (!org) return [];

  const tz = org.timezone;
  let cursor = DateTime.fromJSDate(from, { zone: "utc" }).setZone(tz).startOf("day");
  const end = DateTime.fromJSDate(to, { zone: "utc" }).setZone(tz).startOf("day");

  const out: TimeseriesPoint[] = [];
  let guard = 0;
  while (cursor <= end && guard++ < 400) {
    const dayEnd = cursor.endOf("day");
    const f = cursor.toUTC().toJSDate();
    const t = dayEnd.toUTC().toJSDate();
    const day = cursor.toFormat("yyyy-MM-dd");

    const [confirmed, confirmedSlotDay, cancelled, rebooked] = await Promise.all([
      prisma.appointment.count({
        where: { organizationId, confirmedAt: { gte: f, lte: t } },
      }),
      prisma.appointment.count({
        where: { organizationId, status: "CONFIRMED", startsAt: { gte: f, lte: t } },
      }),
      prisma.appointment.count({
        where: { organizationId, cancelledAt: { gte: f, lte: t } },
      }),
      prisma.rebookingOffer.count({
        where: {
          claimedAt: { gte: f, lte: t },
          freeSlot: { organizationId },
        },
      }),
    ]);

    out.push({ day, confirmed, confirmedSlotDay, cancelled, rebooked });
    cursor = cursor.plus({ days: 1 });
  }

  return out;
}

export type DashboardEvent = {
  at: string;
  type: "confirmed" | "cancelled" | "rebooked";
  title: string;
  detail: string | null;
};

export async function getDashboardEvents(
  organizationId: string,
  limit: number,
  from?: Date,
  to?: Date,
): Promise<DashboardEvent[]> {
  const take = Math.min(Math.max(limit, 1), 50);

  const inPeriod = from != null && to != null;

  const confirmWhere = inPeriod
    ? {
        organizationId,
        OR: [
          { confirmedAt: { gte: from, lte: to } },
          {
            status: "CONFIRMED" as const,
            confirmedAt: { not: null },
            startsAt: { gte: from, lte: to },
          },
        ],
      }
    : {
        organizationId,
        confirmedAt: { not: null },
      };

  const cancelWhere = {
    organizationId,
    cancelledAt: inPeriod ? { gte: from, lte: to } : { not: null },
  };

  const rebookWhere = {
    freeSlot: { organizationId },
    claimedAt: inPeriod ? { gte: from, lte: to } : { not: null },
  };

  const [confirms, cancels, rebooks] = await Promise.all([
    prisma.appointment.findMany({
      where: confirmWhere,
      orderBy: { confirmedAt: "desc" },
      take,
      include: { patient: true },
    }),
    prisma.appointment.findMany({
      where: cancelWhere,
      orderBy: { cancelledAt: "desc" },
      take,
      include: { patient: true },
    }),
    prisma.rebookingOffer.findMany({
      where: rebookWhere,
      orderBy: { claimedAt: "desc" },
      take,
      include: {
        freeSlot: true,
        waitlistEntry: { include: { patient: true } },
        targetAppointment: { include: { patient: true } },
        targetPatient: true,
      },
    }),
  ]);

  const events: DashboardEvent[] = [];

  for (const a of confirms) {
    events.push({
      at: a.confirmedAt!.toISOString(),
      type: "confirmed",
      title: a.title,
      detail: a.patient?.name ?? a.patient?.email ?? null,
    });
  }
  for (const a of cancels) {
    events.push({
      at: a.cancelledAt!.toISOString(),
      type: "cancelled",
      title: a.title,
      detail: a.patient?.name ?? a.patient?.email ?? null,
    });
  }
  for (const r of rebooks) {
    const p = r.waitlistEntry?.patient ?? r.targetAppointment?.patient ?? r.targetPatient;
    const title =
      r.targetPatientId && !r.waitlistEntryId && !r.targetAppointmentId
        ? "Créneau réservé (liste chaude)"
        : r.targetAppointmentId != null && !r.waitlistEntryId
          ? "RDV avancé (rebook)"
          : "Créneau récupéré";
    events.push({
      at: r.claimedAt!.toISOString(),
      type: "rebooked",
      title,
      detail: p?.name ?? p?.email ?? null,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  return events.slice(0, take);
}
