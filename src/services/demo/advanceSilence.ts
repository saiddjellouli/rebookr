import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { markAppointmentNoShowAndReleaseSlot } from "../rebooking/markNoShowAndReleaseSlot.js";
import { notifyWaitlistForFreeSlot } from "../rebooking/notifyWaitlist.js";
import { offerPreventiveRebookForAppointment } from "../rebooking/offerPreventiveRebook.js";
import { recalculateRiskForAppointment } from "../risk/appointmentRisk.js";

const GRACE_MIN_FOR_DEMO = 10;

export type AdvanceSilenceInput = {
  organizationId: string;
  appointmentId: string;
  /** Nombre d’heures dont on « avance » le temps du RDV (défaut 6). */
  hours?: number;
};

export type AdvanceSilenceResult =
  | {
      ok: true;
      appointmentId: string;
      previousStatus: AppointmentStatus;
      newStatus: AppointmentStatus;
      newStartsAt: string;
      hoursToStart: number;
      riskScore: number;
      reminderSimulated: "none" | "T24" | "T6" | "T1";
      noShowMarked: boolean;
      freeSlotId?: string;
      /** Nombre d’e-mails de rebook envoyés (pool chaud + liste d’attente + RDV suivants). */
      rebookOffersSent: number;
      /** `true` dès qu’on a publié un FreeSlot et envoyé au moins une proposition. */
      preventiveRebookOffered: boolean;
      /** RDV en zone irrécupérable (matinal & réservé tardivement) — pas de rebook tenté. */
      irrecoverableZone: boolean;
      message: string;
    }
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN_ORG" | "TERMINAL_STATUS" };

function shift(d: Date | null | undefined, ms: number): Date | null {
  if (!d) return null;
  return new Date(d.getTime() - ms);
}

/**
 * « Patient silencieux » — mode démo :
 *  1. On translate tous les timestamps du RDV de -N heures (startsAt, endsAt, confirmedAt, reminderT*SentAt…).
 *     Cela simule « N heures ont passé sans réponse du patient ».
 *  2. On simule la relance atteinte par cette translation (T-24 → T-6 → T-1) sans envoyer d’e-mail réel.
 *  3. On fait évoluer le statut : PENDING → AT_RISK → NO_SHOW_PROBABLE → NO_SHOW, comme en prod.
 *  4. Si le RDV est passé sans confirmation : on déclenche `markNoShowAndReleaseSlot` (release du créneau).
 *  5. On recalcule `riskScore`.
 *
 *  Cliquable plusieurs fois d’affilée : chaque clic « avance » encore le temps.
 *  Rigoureusement non-destructif pour la prod : opère uniquement sur un RDV donné, idempotent côté statut.
 */
export async function advanceSilenceForAppointment(
  input: AdvanceSilenceInput,
): Promise<AdvanceSilenceResult> {
  const hours = Math.max(0.5, Math.min(72, input.hours ?? 6));
  const shiftMs = hours * 3600 * 1000;

  const apt = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { organization: { select: { timezone: true } } },
  });
  if (!apt) return { ok: false, error: "NOT_FOUND" };
  if (apt.organizationId !== input.organizationId) return { ok: false, error: "FORBIDDEN_ORG" };
  if (apt.status === "CANCELLED" || apt.status === "COMPLETED" || apt.status === "NO_SHOW") {
    return { ok: false, error: "TERMINAL_STATUS" };
  }

  const now = new Date();
  const newStartsAt = shift(apt.startsAt, shiftMs)!;
  const newEndsAt = shift(apt.endsAt, shiftMs)!;
  const hoursToStart = (newStartsAt.getTime() - now.getTime()) / 3600000;
  const wasConfirmed = apt.status === "CONFIRMED";

  const data: Record<string, unknown> = {
    startsAt: newStartsAt,
    endsAt: newEndsAt,
    planningLastUpdateSource: "DEMO",
  };
  if (apt.confirmedAt) data.confirmedAt = shift(apt.confirmedAt, shiftMs);
  if (apt.reminderT24SentAt) data.reminderT24SentAt = shift(apt.reminderT24SentAt, shiftMs);
  if (apt.reminderT6SentAt) data.reminderT6SentAt = shift(apt.reminderT6SentAt, shiftMs);
  if (apt.reminderT3SentAt) data.reminderT3SentAt = shift(apt.reminderT3SentAt, shiftMs);
  if (apt.reminderT1SentAt) data.reminderT1SentAt = shift(apt.reminderT1SentAt, shiftMs);
  if (apt.reminderJ1SentAt) data.reminderJ1SentAt = shift(apt.reminderJ1SentAt, shiftMs);
  if (apt.reminderH3SentAt) data.reminderH3SentAt = shift(apt.reminderH3SentAt, shiftMs);

  let newStatus: AppointmentStatus = apt.status;
  let reminderSimulated: "none" | "T24" | "T6" | "T1" = "none";
  let triggerPreventiveRebook = false;

  if (!wasConfirmed) {
    const t24AlreadySent = Boolean(apt.reminderT24SentAt);
    const t6AlreadySent = Boolean(apt.reminderT6SentAt);
    const t1AlreadySent = Boolean(apt.reminderT1SentAt);

    if (!t24AlreadySent && hoursToStart > 0 && hoursToStart <= 26) {
      data.reminderT24SentAt = now;
      data.reminderJ1SentAt = now;
      reminderSimulated = "T24";
    }
    const hasT24Now = t24AlreadySent || reminderSimulated === "T24";

    if (hasT24Now && !t6AlreadySent && hoursToStart > 0 && hoursToStart <= 7) {
      data.reminderT6SentAt = now;
      data.reminderH3SentAt = now;
      if (newStatus === "PENDING") newStatus = "AT_RISK";
      reminderSimulated = "T6";
    }
    const hasT6Now = t6AlreadySent || reminderSimulated === "T6";

    if (hasT6Now && !t1AlreadySent && hoursToStart > 0 && hoursToStart <= 1.3) {
      data.reminderT1SentAt = now;
      if (newStatus !== "NO_SHOW_PROBABLE") {
        newStatus = "NO_SHOW_PROBABLE";
        triggerPreventiveRebook = true;
      }
      reminderSimulated = "T1";
    } else if (hasT6Now && hoursToStart > 0 && hoursToStart <= 0.3 && newStatus === "AT_RISK") {
      newStatus = "NO_SHOW_PROBABLE";
      triggerPreventiveRebook = true;
    }
  }

  // On évite d’écrire `status` ici quand on va enchaîner sur `offerPreventiveRebookForAppointment`
  // (qui fige lui-même `status = NO_SHOW_PROBABLE` + `preventiveRebookOfferedAt` en transaction).
  if (triggerPreventiveRebook) {
    delete data.status;
  } else {
    data.status = newStatus;
  }
  await prisma.appointment.update({ where: { id: apt.id }, data });

  let noShowMarked = false;
  let freeSlotId: string | undefined;
  let rebookOffersSent = 0;
  let preventiveRebookOffered = false;
  let irrecoverableZone = false;
  const passedCutoff = newEndsAt.getTime() < now.getTime() - GRACE_MIN_FOR_DEMO * 60 * 1000;

  if (!wasConfirmed && passedCutoff) {
    // Le RDV est techniquement « passé » : on passe par le pipeline no-show standard
    // (qui publie un FreeSlot + `notifyWaitlistForFreeSlot` en arrière-plan).
    const r = await markAppointmentNoShowAndReleaseSlot({
      organizationId: apt.organizationId,
      appointmentId: apt.id,
    });
    if (r.ok) {
      noShowMarked = true;
      freeSlotId = r.freeSlotId ?? undefined;
      newStatus = "NO_SHOW";

      // `markNoShow...` a déclenché `notifyWaitlistForFreeSlot` en fire-and-forget.
      // En démo, on le relance en sync pour récupérer `sent` et l’afficher.
      // `notifyWaitlistForFreeSlot` est idempotent (unique key `freeSlotId_recipientKey`
      // + garde `sentAt`), donc pas de double e-mail.
      const notify = await notifyWaitlistForFreeSlot(freeSlotId!).catch((err) => {
        console.error("[advanceSilence] notifyWaitlistForFreeSlot (post noShow)", err);
        return null;
      });
      if (notify) rebookOffersSent = notify.sent;
      preventiveRebookOffered = Boolean(freeSlotId);
    }
  } else if (triggerPreventiveRebook) {
    // CŒUR MÉTIER — détection préventive → proposition AUX AUTRES patients.
    // `offerPreventiveRebookForAppointment` :
    //  - fige `status = NO_SHOW_PROBABLE` + `preventiveRebookOfferedAt`
    //  - crée le FreeSlot pour le créneau libérable du RDV source (qui reste non annulé)
    // Puis `notifyWaitlistForFreeSlot` envoie les propositions au pool HOT, à la liste
    // d’attente et aux RDV futurs (mêmes garde-fous qu’en prod : `freeSlotStillOpen`).
    const offer = await offerPreventiveRebookForAppointment(apt.id);
    if (offer) {
      if (offer.irrecoverableZone) {
        irrecoverableZone = true;
        // Statut bien passé en NO_SHOW_PROBABLE par offerPreventiveRebook... mais aucun
        // FreeSlot publié → aucune proposition envoyée. C’est volontaire.
      } else {
        freeSlotId = offer.freeSlotId;
        preventiveRebookOffered = true;
        if (offer.shouldNotifyWaitlist) {
          const notify = await notifyWaitlistForFreeSlot(offer.freeSlotId).catch((err) => {
            console.error("[advanceSilence] notifyWaitlistForFreeSlot", err);
            return null;
          });
          if (notify) rebookOffersSent = notify.sent;
        }
      }
    }
  } else if (newStatus === "AT_RISK" && apt.status === "PENDING") {
    // Pré-qualification : on alerte le pool sans encore promettre de créneau concret.
    const { broadcastPoolHotInviteForAtRiskAppointment } = await import("../pool/atRiskBroadcast.js");
    broadcastPoolHotInviteForAtRiskAppointment(apt.id).catch((err) => {
      console.error("[advanceSilence] broadcastPoolHotInviteForAtRiskAppointment", err);
    });
  }

  const riskScore = (await recalculateRiskForAppointment(apt.id)) ?? 0;

  let message: string;
  if (irrecoverableZone) {
    message = `Zone irrécupérable détectée — RDV matinal réservé tardivement. Statut NO_SHOW_PROBABLE pour le suivi, mais aucun rebook tenté (personne n’a le temps d’être prévenu et d’arriver).`;
  } else if (noShowMarked) {
    message = `RDV passé sans confirmation → NO_SHOW, créneau libéré` +
      (rebookOffersSent > 0
        ? `. ${rebookOffersSent} proposition(s) de rebook envoyée(s) au pool / liste d’attente.`
        : `. Aucun patient disponible dans le pool pour ce créneau.`);
  } else if (preventiveRebookOffered) {
    message =
      rebookOffersSent > 0
        ? `No-show probable détecté en avance (T-1) — ${rebookOffersSent} proposition(s) de rebook envoyée(s) au pool et à la liste d’attente. On attend qu’un patient clique.`
        : `No-show probable détecté en avance (T-1) — créneau publié, mais aucun patient éligible dans le pool / liste d’attente pour l’instant.`;
  } else if (reminderSimulated !== "none") {
    message = `Silence simulé +${hours} h — relance ${reminderSimulated} envoyée, statut ${newStatus}.`;
  } else if (newStatus !== apt.status) {
    message = `Silence simulé +${hours} h — statut ${apt.status} → ${newStatus}.`;
  } else {
    message = `Silence simulé +${hours} h — aucun changement de statut (encore loin du RDV ou déjà confirmé).`;
  }

  return {
    ok: true,
    appointmentId: apt.id,
    previousStatus: apt.status,
    newStatus,
    newStartsAt: newStartsAt.toISOString(),
    hoursToStart: Math.round(hoursToStart * 10) / 10,
    riskScore,
    reminderSimulated,
    noShowMarked,
    freeSlotId,
    rebookOffersSent,
    preventiveRebookOffered,
    irrecoverableZone,
    message,
  };
}
