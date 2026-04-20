import { prisma } from "../../lib/prisma.js";
import {
  cancelAppointmentFromPatient,
  confirmAppointmentFromPatient,
} from "../appointments/patientSelfService.js";
import {
  refreshPoolHasFutureAppointment,
  setPoolHotPriority,
  setPoolWantsEarlierSlot,
} from "../pool/patientPool.js";

export const PATIENT_CHOICES = ["confirm", "cancel", "silence"] as const;
export type PatientChoice = (typeof PATIENT_CHOICES)[number];

/** Durée d’activation HOT pour le pool en mode démo : 24 h, suffisant pour rejouer. */
const DEMO_POOL_HOT_HOURS = 24;

export type ApplyPatientChoiceInput = {
  organizationId: string;
  appointmentId: string;
  choice: PatientChoice;
};

export type ApplyPatientChoiceResult =
  | {
      ok: true;
      choice: PatientChoice;
      newStatus: string;
      message: string;
      freeSlotId?: string;
      poolOptedIn?: boolean;
    }
  | { ok: false; error: "NOT_FOUND" | "FORBIDDEN_ORG" | "BAD_STATE"; detail?: string };

/**
 * Démo guidée — applique une décision « patient » sur un RDV à une fenêtre donnée.
 *
 * - **confirm** : simule un clic patient sur le lien Calend’Air (`PATIENT_LINK` =
 *   confiance forte). Statut → `CONFIRMED`. À noter pour le praticien : *même un
 *   CONFIRMED reste sujet au risque résiduel — il peut toujours ne pas venir*.
 * - **cancel**  : simule un clic patient sur le lien d’annulation. Libère le créneau,
 *   crée le `FreeSlot` et déclenche `notifyWaitlistForFreeSlot` (rebook réel).
 * - **silence** : noop pour la base de données — sert juste à matérialiser le choix
 *   dans l’UI démo (« on laisse couler, on attend la prochaine relance »).
 *
 * On utilise volontairement les mêmes fonctions que les routes publiques pour garantir
 * que la démo respecte exactement la logique de production.
 */
export async function applyPatientChoiceForAppointment(
  input: ApplyPatientChoiceInput,
): Promise<ApplyPatientChoiceResult> {
  const apt = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: { id: true, organizationId: true, status: true, patientId: true },
  });
  if (!apt) return { ok: false, error: "NOT_FOUND" };
  if (apt.organizationId !== input.organizationId) return { ok: false, error: "FORBIDDEN_ORG" };

  if (input.choice === "silence") {
    return {
      ok: true,
      choice: "silence",
      newStatus: apt.status,
      message:
        "Patient inactif : aucune action déclenchée. Le silence va être interprété par le système — utilisez « Patient ne répond pas (+6 h) » pour avancer dans le temps.",
    };
  }

  if (input.choice === "confirm") {
    const r = await confirmAppointmentFromPatient({
      appointmentId: apt.id,
      organizationId: input.organizationId,
      planningMeta: { lastUpdateSource: "PATIENT_LINK", incrementConfirmationSignal: true },
    });
    if (!r.ok) {
      return { ok: false, error: "BAD_STATE", detail: r.error ?? "CONFIRM_FAILED" };
    }

    // Démo : on simule aussi le clic sur l’e-mail follow-up « voulez-vous être prévenu·e
    // si un créneau plus tôt se libère ? ». En production c’est un 2ᵉ click distinct ;
    // ici on l’enchaîne pour rendre le scénario WOW lisible (le patient devient
    // candidat *prioritaire* du pool pour 24 h). Skippé si RDV anonyme (sans patient lié).
    let poolOptedIn = false;
    if (apt.patientId) {
      try {
        await setPoolWantsEarlierSlot({
          organizationId: input.organizationId,
          patientId: apt.patientId,
        });
        await setPoolHotPriority({
          organizationId: input.organizationId,
          patientId: apt.patientId,
          hotTtlHours: DEMO_POOL_HOT_HOURS,
        });
        await refreshPoolHasFutureAppointment(apt.patientId, input.organizationId);
        poolOptedIn = true;
      } catch (err) {
        console.error("[applyPatientChoice.confirm] pool opt-in failed", err);
      }
    }

    const after = await prisma.appointment.findUnique({
      where: { id: apt.id },
      select: { status: true },
    });

    let message: string;
    if (r.alreadyConfirmed) {
      message =
        "Le patient avait déjà confirmé — rien à refaire. (Note : un CONFIRMED reste sujet au risque résiduel.)";
    } else if (poolOptedIn) {
      message =
        "Patient confirmé via lien Calend’Air → CONFIRMED. " +
        "Bonus : il a aussi accepté d’être prévenu si un créneau plus tôt se libère " +
        "(ajouté au pool HOT, valable 24 h). ⚠ Confirmer ne garantit pas qu’il viendra.";
    } else {
      message =
        "Patient confirmé via lien Calend’Air → CONFIRMED. ⚠ Cela ne garantit pas qu’il viendra : le risque résiduel reste suivi.";
    }

    return {
      ok: true,
      choice: "confirm",
      newStatus: after?.status ?? "CONFIRMED",
      poolOptedIn,
      message,
    };
  }

  // cancel
  const r = await cancelAppointmentFromPatient({
    appointmentId: apt.id,
    organizationId: input.organizationId,
    cancellationReason: "Annulation patient via lien Calend’Air (démo)",
    planningMeta: { lastUpdateSource: "PATIENT_LINK", incrementConfirmationSignal: false },
  });
  if (!r.ok) {
    return { ok: false, error: "BAD_STATE", detail: r.error ?? "CANCEL_FAILED" };
  }
  return {
    ok: true,
    choice: "cancel",
    newStatus: "CANCELLED",
    freeSlotId: r.freeSlotId,
    message: r.alreadyCancelled
      ? "Le RDV était déjà annulé."
      : "Patient annule via lien Calend’Air. Créneau libéré, propositions envoyées au pool / liste d’attente.",
  };
}
