import type { Appointment, AppointmentStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";

/**
 * Heuristique 0–100 :0 = faible risque, 100 = risque élevé (no-show probable).
 * Recalcul périodique + après événements (e-mail, clic patient, no-show).
 */
export function computeRiskScore(params: {
  status: AppointmentStatus;
  startsAt: Date;
  confirmedAt: Date | null;
  confirmationSignalCount: number;
  timezone: string;
  now: Date;
}): number {
  const { status, startsAt, confirmedAt, confirmationSignalCount, timezone, now } = params;

  if (status === "CANCELLED" || status === "COMPLETED") return 0;
  if (status === "NO_SHOW") return 100;

  let r = 38;

  if (status === "CONFIRMED") r -= 30;
  if (status === "AT_RISK") r += 28;
  if (status === "NO_SHOW_PROBABLE") r += 38;

  const startLocal = DateTime.fromJSDate(startsAt, { zone: "utc" }).setZone(timezone);
  const nowLocal = DateTime.fromJSDate(now, { zone: "utc" }).setZone(timezone);
  const hoursToStart = startLocal.diff(nowLocal, "hours").hours;

  if (
    (status === "PENDING" || status === "AT_RISK" || status === "NO_SHOW_PROBABLE") &&
    hoursToStart > 0
  ) {
    if (hoursToStart < 24) r += 14;
    if (hoursToStart < 6) r += 20;
  }

  if (confirmedAt) {
    const sinceConfirm =
      (now.getTime() - confirmedAt.getTime()) / (3600 * 1000);
    if (sinceConfirm < 72) r -= 14;
  }

  r -= Math.min(22, confirmationSignalCount * 5);

  return Math.max(0, Math.min(100, Math.round(r)));
}

export async function recalculateRiskForAppointment(appointmentId: string): Promise<number | null> {
  const row = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organization: { select: { timezone: true } } },
  });
  if (!row) return null;

  const riskScore = computeRiskScore({
    status: row.status,
    startsAt: row.startsAt,
    confirmedAt: row.confirmedAt,
    confirmationSignalCount: row.confirmationSignalCount,
    timezone: row.organization.timezone,
    now: new Date(),
  });

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { riskScore },
  });
  return riskScore;
}

export async function recalculateRisksForOrganization(organizationId: string): Promise<{ updated: number }> {
  const rows = await prisma.appointment.findMany({
    where: { organizationId },
    include: { organization: { select: { timezone: true } } },
  });
  const now = new Date();
  for (const row of rows) {
    const riskScore = computeRiskScore({
      status: row.status,
      startsAt: row.startsAt,
      confirmedAt: row.confirmedAt,
      confirmationSignalCount: row.confirmationSignalCount,
      timezone: row.organization.timezone,
      now,
    });
    await prisma.appointment.update({
      where: { id: row.id },
      data: { riskScore },
    });
  }
  return { updated: rows.length };
}

export async function recalculateRisksAllOrganizations(): Promise<{ organizations: number; appointments: number }> {
  const orgs = await prisma.organization.findMany({ select: { id: true } });
  let appointments = 0;
  for (const o of orgs) {
    const r = await recalculateRisksForOrganization(o.id);
    appointments += r.updated;
  }
  return { organizations: orgs.length, appointments };
}

/** Durée depuis la dernière mise à jour enregistrée (proxy « silence » pour affichage démo). */
export function silenceDurationHours(apt: Appointment, now: Date): number {
  const t = Math.max(apt.updatedAt.getTime(), apt.confirmedAt?.getTime() ?? 0, apt.createdAt.getTime());
  return Math.max(0, (now.getTime() - t) / (3600 * 1000));
}
