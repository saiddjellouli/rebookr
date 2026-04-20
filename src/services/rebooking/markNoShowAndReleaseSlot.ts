import { prisma } from "../../lib/prisma.js";
import { recalculateRiskForAppointment } from "../risk/appointmentRisk.js";
import { notifyWaitlistForFreeSlot } from "./notifyWaitlist.js";

const RELEASABLE = new Set(["PENDING", "CONFIRMED", "AT_RISK", "NO_SHOW_PROBABLE"]);

export type MarkNoShowResult =
  | { ok: true; freeSlotId: string }
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN_ORG" | "INVALID_STATUS" };

/**
 * Le patient ne s’est pas présenté : on marque NO_SHOW, on publie le créneau comme libre
 * et on notifie la liste d’attente (même logique métier qu’après une annulation par lien).
 */
export async function markAppointmentNoShowAndReleaseSlot(params: {
  organizationId: string;
  appointmentId: string;
}): Promise<MarkNoShowResult> {
  const apt = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
  });
  if (!apt) {
    return { ok: false, error: "NOT_FOUND" };
  }
  if (apt.organizationId !== params.organizationId) {
    return { ok: false, error: "FORBIDDEN_ORG" };
  }
  if (!RELEASABLE.has(apt.status)) {
    return { ok: false, error: "INVALID_STATUS" };
  }

  const freeSlotId = await prisma.$transaction(async (tx) => {
    const existingSlot = await tx.freeSlot.findFirst({
      where: { sourceAppointmentId: apt.id },
    });
    if (existingSlot) {
      await tx.appointment.update({
        where: { id: apt.id },
        data: { status: "NO_SHOW", planningLastUpdateSource: "SYSTEM" },
      });
      return existingSlot.id;
    }

    await tx.appointment.update({
      where: { id: apt.id },
      data: { status: "NO_SHOW", planningLastUpdateSource: "SYSTEM" },
    });

    const created = await tx.freeSlot.create({
      data: {
        organizationId: apt.organizationId,
        sourceAppointmentId: apt.id,
        startsAt: apt.startsAt,
        endsAt: apt.endsAt,
      },
    });
    return created.id;
  });

  notifyWaitlistForFreeSlot(freeSlotId).catch((err) => {
    console.error("[markAppointmentNoShowAndReleaseSlot] notifyWaitlistForFreeSlot", err);
  });

  await recalculateRiskForAppointment(apt.id);

  return { ok: true, freeSlotId };
}
