import { prisma } from "../../lib/prisma.js";
import { recalculateRiskForAppointment } from "../risk/appointmentRisk.js";

export type SimulatePoolAcceptInput = {
  organizationId: string;
  appointmentId: string;
};

export type PoolProposalPreview = {
  freeSlotId: string | null;
  filledAt: string | null;
  totalPendingOffers: number;
  firstCandidate: {
    name: string | null;
    email: string | null;
    kind: "hot_list" | "waitlist" | "successor";
  } | null;
};

/**
 * Lecture seule — renvoie, pour un RDV en cours de rebook préventif, le 1er candidat
 * dans la file de propositions (même ordre de priorité que `notifyWaitlistForFreeSlot`).
 * Utilisé côté démo pour afficher dynamiquement « Laura D. a accepté — confirmer ? ».
 */
export async function previewPoolProposalForAppointment(params: {
  organizationId: string;
  appointmentId: string;
}): Promise<PoolProposalPreview | null> {
  const apt = await prisma.appointment.findUnique({
    where: { id: params.appointmentId },
    select: { id: true, organizationId: true },
  });
  if (!apt || apt.organizationId !== params.organizationId) return null;

  const slot = await prisma.freeSlot.findFirst({
    where: { sourceAppointmentId: apt.id },
    orderBy: { createdAt: "desc" },
  });
  if (!slot) {
    return { freeSlotId: null, filledAt: null, totalPendingOffers: 0, firstCandidate: null };
  }

  const now = new Date();
  const offers = await prisma.rebookingOffer.findMany({
    where: {
      freeSlotId: slot.id,
      sentAt: { not: null },
      claimedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: {
      targetPatient: true,
      waitlistEntry: { include: { patient: true } },
      targetAppointment: { include: { patient: true } },
    },
  });

  function rank(o: (typeof offers)[number]): number {
    if (o.targetPatientId) return 0;
    if (o.waitlistEntryId) return 1;
    if (o.targetAppointmentId) return 2;
    return 3;
  }
  const sorted = offers.slice().sort((a, b) => rank(a) - rank(b));
  const first = sorted[0];
  let firstCandidate: PoolProposalPreview["firstCandidate"] = null;
  if (first) {
    const kind: "hot_list" | "waitlist" | "successor" = first.waitlistEntryId
      ? "waitlist"
      : first.targetAppointmentId
        ? "successor"
        : "hot_list";
    const p = first.waitlistEntryId
      ? first.waitlistEntry?.patient
      : first.targetAppointmentId
        ? first.targetAppointment?.patient
        : first.targetPatient;
    firstCandidate = { name: p?.name ?? null, email: p?.email ?? null, kind };
  }

  return {
    freeSlotId: slot.id,
    filledAt: slot.filledAt ? slot.filledAt.toISOString() : null,
    totalPendingOffers: offers.length,
    firstCandidate,
  };
}

export type SimulatePoolAcceptResult =
  | {
      ok: true;
      freeSlotId: string;
      offerId: string;
      kind: "hot_list" | "waitlist" | "successor";
      patientName: string | null;
      patientEmail: string | null;
      newAppointmentId?: string;
      message: string;
    }
  | {
      ok: false;
      error:
        | "APPOINTMENT_NOT_FOUND"
        | "FORBIDDEN_ORG"
        | "NO_FREE_SLOT"
        | "SLOT_ALREADY_FILLED"
        | "NO_PENDING_OFFER"
        | "RACE_LOST";
    };

/**
 * Mode démo — « Un patient du pool accepte la proposition ».
 *
 * Reproduit côté serveur le parcours du lien `/public/rebook/:token` :
 *  - on cherche le FreeSlot publié pour ce RDV (créé par `offerPreventiveRebookForAppointment`
 *    ou `markAppointmentNoShowAndReleaseSlot`),
 *  - on sélectionne la 1re `RebookingOffer` sentAt/non claimée/non expirée (priorité
 *    hot_list → waitlist → successor, alignée avec `notifyWaitlistForFreeSlot`),
 *  - on claim la slot en transaction : annulation du RDV source + création du nouveau RDV
 *    (ou replanification pour un `successor`) + marquage de l’offre comme claimée.
 *
 *  C’est la même logique métier que la route publique — zéro fiction côté produit.
 */
export async function simulatePoolAcceptForAppointment(
  input: SimulatePoolAcceptInput,
): Promise<SimulatePoolAcceptResult> {
  const apt = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: { id: true, organizationId: true },
  });
  if (!apt) return { ok: false, error: "APPOINTMENT_NOT_FOUND" };
  if (apt.organizationId !== input.organizationId) {
    return { ok: false, error: "FORBIDDEN_ORG" };
  }

  const slot = await prisma.freeSlot.findFirst({
    where: { sourceAppointmentId: apt.id },
    orderBy: { createdAt: "desc" },
  });
  if (!slot) return { ok: false, error: "NO_FREE_SLOT" };
  if (slot.filledAt) return { ok: false, error: "SLOT_ALREADY_FILLED" };

  const now = new Date();
  const offers = await prisma.rebookingOffer.findMany({
    where: {
      freeSlotId: slot.id,
      sentAt: { not: null },
      claimedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: {
      targetPatient: true,
      waitlistEntry: { include: { patient: true } },
      targetAppointment: { include: { patient: true } },
    },
  });

  // Priorité alignée avec notifyWaitlistForFreeSlot : hot_list → waitlist → successor.
  function rank(o: (typeof offers)[number]): number {
    if (o.targetPatientId) return 0;
    if (o.waitlistEntryId) return 1;
    if (o.targetAppointmentId) return 2;
    return 3;
  }
  const sorted = offers.slice().sort((a, b) => rank(a) - rank(b));
  const offer = sorted[0];
  if (!offer) return { ok: false, error: "NO_PENDING_OFFER" };

  const isWaitlist = Boolean(offer.waitlistEntryId);
  const isSuccessor = Boolean(offer.targetAppointmentId);
  const kind: "hot_list" | "waitlist" | "successor" = isWaitlist
    ? "waitlist"
    : isSuccessor
      ? "successor"
      : "hot_list";

  const patient = isWaitlist
    ? offer.waitlistEntry?.patient
    : isSuccessor
      ? offer.targetAppointment?.patient
      : offer.targetPatient;
  if (!patient) return { ok: false, error: "NO_PENDING_OFFER" };

  let newAppointmentId: string | undefined;
  let successMessage = "";

  try {
    await prisma.$transaction(async (tx) => {
      const lock = await tx.freeSlot.updateMany({
        where: { id: slot.id, filledAt: null },
        data: { filledAt: new Date() },
      });
      if (lock.count !== 1) throw new Error("RACE_LOST");

      if (slot.sourceAppointmentId) {
        const src = await tx.appointment.findUnique({ where: { id: slot.sourceAppointmentId } });
        if (src && !["CANCELLED", "NO_SHOW"].includes(src.status)) {
          await tx.appointment.update({
            where: { id: src.id },
            data: {
              status: "CANCELLED",
              cancelledAt: new Date(),
              cancellationReason: "REBOOK_FILLED",
            },
          });
        }
      }

      if (isWaitlist) {
        const title =
          patient.name?.trim() ? `Rendez-vous — ${patient.name.trim()}` : "Rendez-vous (liste d’attente)";
        const created = await tx.appointment.create({
          data: {
            organizationId: slot.organizationId,
            patientId: patient.id,
            title,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: "PENDING",
            source: "MANUAL",
          },
        });
        newAppointmentId = created.id;
        await tx.waitlistEntry.update({
          where: { id: offer.waitlistEntryId! },
          data: { active: false },
        });
        successMessage = `Liste d’attente : ${patient.name ?? "un patient"} a accepté — créneau comblé.`;
      } else if (isSuccessor) {
        const appt = offer.targetAppointment!;
        await tx.actionToken.deleteMany({ where: { appointmentId: appt.id } });
        await tx.appointment.update({
          where: { id: appt.id },
          data: { startsAt: slot.startsAt, endsAt: slot.endsAt },
        });
        newAppointmentId = appt.id;
        successMessage = `RDV futur : ${patient.name ?? "un patient"} avance son rendez-vous sur ce créneau — comblé.`;
      } else {
        const title =
          patient.name?.trim() ? `Rendez-vous — ${patient.name.trim()}` : "Rendez-vous (liste chaude)";
        const created = await tx.appointment.create({
          data: {
            organizationId: slot.organizationId,
            patientId: offer.targetPatientId!,
            title,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: "PENDING",
            source: "MANUAL",
          },
        });
        newAppointmentId = created.id;
        successMessage = `Pool HOT : ${patient.name ?? "un patient"} a accepté — un no-show probable vient d’être transformé en RDV.`;
      }

      await tx.rebookingOffer.update({
        where: { id: offer.id },
        data: { claimedAt: new Date() },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "RACE_LOST") {
      return { ok: false, error: "RACE_LOST" };
    }
    throw e;
  }

  recalculateRiskForAppointment(apt.id).catch((err) => {
    console.error("[simulatePoolAccept] recalculateRiskForAppointment", err);
  });

  return {
    ok: true,
    freeSlotId: slot.id,
    offerId: offer.id,
    kind,
    patientName: patient.name ?? null,
    patientEmail: patient.email ?? null,
    newAppointmentId,
    message: successMessage,
  };
}
