import { prisma } from "../../lib/prisma.js";
import { advanceSilenceForAppointment, type AdvanceSilenceResult } from "./advanceSilence.js";

export const DEMO_WINDOWS = ["T-24", "T-6", "T-1"] as const;
export type DemoWindow = (typeof DEMO_WINDOWS)[number];

const TARGET_HOURS: Record<DemoWindow, number> = {
  "T-24": 24,
  "T-6": 6,
  "T-1": 1,
};

export type JumpToWindowInput = {
  organizationId: string;
  appointmentId: string;
  window: DemoWindow;
};

export type JumpToWindowResult =
  | {
      ok: true;
      window: DemoWindow;
      shifted: boolean;
      hoursShift: number;
      advanceResult?: AdvanceSilenceResult;
      message: string;
    }
  | {
      ok: false;
      error: "NOT_FOUND" | "FORBIDDEN_ORG" | "TERMINAL_STATUS" | "TARGET_IN_PAST";
    };

/**
 * Démo guidée — « Avancer le RDV jusqu’à la fenêtre T-24 / T-6 / T-1 ».
 *
 * Calcule le décalage nécessaire pour que `startsAt` se retrouve à exactement N heures
 * dans le futur, puis délègue à `advanceSilenceForAppointment`. Toute la logique
 * (relances simulées, transitions PENDING → AT_RISK → NO_SHOW_PROBABLE, FreeSlot,
 * notifyWaitlist, zone irrécupérable) suit son cours normal.
 *
 *  - Si le RDV est déjà passé la fenêtre cible (p.ex. dans 3h alors qu’on demande T-24),
 *    on retourne `TARGET_IN_PAST` (le praticien doit choisir une fenêtre plus proche).
 *  - Si le décalage est < 6 min on ne fait rien (no-op idempotent).
 */
export async function jumpAppointmentToWindow(
  input: JumpToWindowInput,
): Promise<JumpToWindowResult> {
  const apt = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    select: { id: true, organizationId: true, startsAt: true, status: true },
  });
  if (!apt) return { ok: false, error: "NOT_FOUND" };
  if (apt.organizationId !== input.organizationId) return { ok: false, error: "FORBIDDEN_ORG" };
  if (apt.status === "CANCELLED" || apt.status === "COMPLETED" || apt.status === "NO_SHOW") {
    return { ok: false, error: "TERMINAL_STATUS" };
  }

  const targetHours = TARGET_HOURS[input.window];
  const now = new Date();
  const currentHoursToStart = (apt.startsAt.getTime() - now.getTime()) / 3600000;
  const shiftHours = currentHoursToStart - targetHours;

  if (shiftHours < -0.5) {
    return { ok: false, error: "TARGET_IN_PAST" };
  }

  if (shiftHours < 0.1) {
    return {
      ok: true,
      window: input.window,
      shifted: false,
      hoursShift: 0,
      message: `RDV déjà à environ ${input.window} — aucune translation nécessaire.`,
    };
  }

  // `advanceSilenceForAppointment` clamp à 72 h. Pour des sauts plus longs
  // (ex. RDV dans 96 h, cible T-24 → besoin de 72 h ⇒ ok ; cible plus lointaine
  // demanderait plusieurs clics).
  const clampedShift = Math.min(72, shiftHours);
  const advanceResult = await advanceSilenceForAppointment({
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    hours: Math.max(0.5, clampedShift),
  });

  return {
    ok: true,
    window: input.window,
    shifted: true,
    hoursShift: Math.round(clampedShift * 10) / 10,
    advanceResult,
    message: `Translation de ${Math.round(clampedShift * 10) / 10} h — RDV maintenant à ${input.window}.`,
  };
}
