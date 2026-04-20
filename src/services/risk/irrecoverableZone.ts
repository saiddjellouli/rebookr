import { DateTime } from "luxon";

/**
 * Heuristique « zone grise » du produit : on considère qu’un RDV est *irrécupérable*
 * (impossible à compenser via un rebook pool / liste d’attente) lorsque les deux
 * conditions sont réunies :
 *   1. son heure locale est avant 10h (créneau matinal),
 *   2. il a été créé moins de 18h avant son début (réservation tardive).
 *
 * Logique métier : aucun patient extérieur n’a le temps d’être prévenu, de répondre
 * et d’arriver à l’heure — donc on n’y déclenche **pas** de propositions de rebook.
 * Le système continue à *détecter* (riskScore, NO_SHOW_PROBABLE), mais n’en attend
 * aucune récupération. C’est un signal honnête au praticien : « rien à tenter ici ».
 */
export const IRRECOVERABLE_LOCAL_HOUR_BEFORE = 10;
export const IRRECOVERABLE_BOOKED_LEAD_HOURS = 18;

export type IrrecoverableInput = {
  startsAt: Date;
  createdAt: Date;
  timezone: string;
};

export function isIrrecoverableZone(input: IrrecoverableInput): boolean {
  const startLocal = DateTime.fromJSDate(input.startsAt, { zone: "utc" }).setZone(input.timezone);
  if (startLocal.hour >= IRRECOVERABLE_LOCAL_HOUR_BEFORE) return false;

  const leadMs = input.startsAt.getTime() - input.createdAt.getTime();
  const leadHours = leadMs / 3600000;
  return leadHours < IRRECOVERABLE_BOOKED_LEAD_HOURS;
}

export type IrrecoverableContext = {
  irrecoverable: boolean;
  reason: "OK" | "EARLY_SLOT_LATE_BOOKING";
  startLocalHour: number;
  bookingLeadHours: number;
};

export function describeIrrecoverableZone(input: IrrecoverableInput): IrrecoverableContext {
  const startLocal = DateTime.fromJSDate(input.startsAt, { zone: "utc" }).setZone(input.timezone);
  const startLocalHour = startLocal.hour;
  const bookingLeadHours = (input.startsAt.getTime() - input.createdAt.getTime()) / 3600000;
  const irrecoverable =
    startLocalHour < IRRECOVERABLE_LOCAL_HOUR_BEFORE &&
    bookingLeadHours < IRRECOVERABLE_BOOKED_LEAD_HOURS;
  return {
    irrecoverable,
    reason: irrecoverable ? "EARLY_SLOT_LATE_BOOKING" : "OK",
    startLocalHour,
    bookingLeadHours: Math.round(bookingLeadHours * 10) / 10,
  };
}
