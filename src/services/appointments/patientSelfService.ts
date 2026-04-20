import { prisma } from "../../lib/prisma.js";
import { refreshPoolHasFutureAppointment } from "../pool/patientPool.js";
import { recalculateRiskForAppointment } from "../risk/appointmentRisk.js";
import { notifyWaitlistForFreeSlot } from "../rebooking/notifyWaitlist.js";
import { revokeUnfilledFreeSlotsForAppointment } from "../rebooking/revokePreventiveFreeSlots.js";

const CONFIRMABLE = new Set(["PENDING", "AT_RISK", "NO_SHOW_PROBABLE"]);
const CANCELLABLE = new Set(["PENDING", "CONFIRMED", "AT_RISK", "NO_SHOW_PROBABLE"]);

export type PlanningMetaInput = {
  lastUpdateSource?: "EMAIL" | "IMPORT" | "MANUAL" | "PATIENT_LINK" | "DEMO" | "SYSTEM";
  incrementConfirmationSignal?: boolean;
};

/**
 * Confirmation patient (lien magique Calend’Air ou accusé reçu par e-mail / transfert).
 */
export async function confirmAppointmentFromPatient(params: {
  appointmentId: string;
  organizationId: string;
  planningMeta?: PlanningMetaInput;
}): Promise<{ ok: boolean; error?: string; alreadyConfirmed?: boolean }> {
  const apt = await prisma.appointment.findFirst({
    where: { id: params.appointmentId, organizationId: params.organizationId },
  });
  if (!apt) return { ok: false, error: "NOT_FOUND" };
  if (apt.status === "CONFIRMED") {
    await recalculateRiskForAppointment(apt.id);
    return { ok: true, alreadyConfirmed: true };
  }
  if (!CONFIRMABLE.has(apt.status)) return { ok: false, error: "BAD_STATUS" };

  const pm = params.planningMeta;
  await prisma.$transaction(async (tx) => {
    await revokeUnfilledFreeSlotsForAppointment(tx, apt.id);
    await tx.appointment.update({
      where: { id: apt.id },
      data: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        confirmationScore: Math.min(100, (apt.confirmationScore ?? 0) + 50),
        lastSyncedAt: new Date(),
        ...(pm?.lastUpdateSource ? { planningLastUpdateSource: pm.lastUpdateSource } : {}),
        ...(pm?.incrementConfirmationSignal ? { confirmationSignalCount: { increment: 1 } } : {}),
      },
    });
    await tx.actionToken.deleteMany({ where: { appointmentId: apt.id } });
  });

  if (apt.patientId) {
    await refreshPoolHasFutureAppointment(apt.patientId, params.organizationId);
  }
  await recalculateRiskForAppointment(apt.id);
  return { ok: true };
}

/**
 * Annulation patient : libère le créneau et notifie la liste d’attente (comme le lien public).
 */
export async function cancelAppointmentFromPatient(params: {
  appointmentId: string;
  organizationId: string;
  cancellationReason: string | null;
  planningMeta?: PlanningMetaInput;
}): Promise<{ ok: boolean; error?: string; freeSlotId?: string; alreadyCancelled?: boolean }> {
  const apt = await prisma.appointment.findFirst({
    where: { id: params.appointmentId, organizationId: params.organizationId },
  });
  if (!apt) return { ok: false, error: "NOT_FOUND" };
  if (apt.status === "CANCELLED") return { ok: true, alreadyCancelled: true, freeSlotId: undefined };
  if (!CANCELLABLE.has(apt.status)) return { ok: false, error: "BAD_STATUS" };

  const freeSlotId = await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: apt.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: params.cancellationReason,
        lastSyncedAt: new Date(),
      },
    });
    await tx.actionToken.deleteMany({ where: { appointmentId: apt.id } });

    const existing = await tx.freeSlot.findFirst({
      where: { sourceAppointmentId: apt.id },
    });
    if (existing) return existing.id;
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
    console.error("[cancelAppointmentFromPatient] notifyWaitlistForFreeSlot", err);
  });

  if (apt.patientId) {
    await refreshPoolHasFutureAppointment(apt.patientId, params.organizationId);
  }
  await recalculateRiskForAppointment(apt.id);
  return { ok: true, freeSlotId };
}

/**
 * Signal d’un e-mail Doctolib entrant « RDV confirmé ».
 *
 * Principe produit — Doctolib = source de SIGNAUX, pas de vérité :
 *  - on **n’écrit jamais** `status = CONFIRMED` depuis un e-mail entrant ;
 *  - on incrémente `confirmationSignalCount` (le risque baisse mécaniquement) ;
 *  - si le RDV est en `AT_RISK` ou `NO_SHOW_PROBABLE`, on le fait redescendre en `PENDING`
 *    (le signal efface l’escalade, mais n’établit pas une confirmation fiable) ;
 *  - on **ne touche pas** aux `ActionToken` ni aux `FreeSlot` (un rebook en cours doit rester
 *    ouvert tant que le patient n’a pas cliqué notre lien ou n’est pas venu).
 *
 *  Seule une action *traçable par notre système* (clic du lien Calend’Air = `PATIENT_LINK`)
 *  peut donner `status = CONFIRMED`.
 */
export async function registerInboundConfirmationSignal(params: {
  appointmentId: string;
  organizationId: string;
}): Promise<{
  ok: boolean;
  error?: string;
  previousStatus?: string;
  newStatus?: string;
  confirmationSignalCount?: number;
  riskScore?: number;
}> {
  const apt = await prisma.appointment.findFirst({
    where: { id: params.appointmentId, organizationId: params.organizationId },
  });
  if (!apt) return { ok: false, error: "NOT_FOUND" };
  if (apt.status === "CANCELLED" || apt.status === "COMPLETED" || apt.status === "NO_SHOW") {
    return { ok: false, error: "TERMINAL_STATUS" };
  }

  const demotedFromEscalation =
    apt.status === "AT_RISK" || apt.status === "NO_SHOW_PROBABLE";
  const nextStatus = demotedFromEscalation ? "PENDING" : apt.status;

  const updated = await prisma.appointment.update({
    where: { id: apt.id },
    data: {
      status: nextStatus,
      confirmationSignalCount: { increment: 1 },
      planningLastUpdateSource: "EMAIL",
      lastSyncedAt: new Date(),
    },
    select: { status: true, confirmationSignalCount: true },
  });

  const riskScore = (await recalculateRiskForAppointment(apt.id)) ?? undefined;

  return {
    ok: true,
    previousStatus: apt.status,
    newStatus: updated.status,
    confirmationSignalCount: updated.confirmationSignalCount,
    riskScore,
  };
}
