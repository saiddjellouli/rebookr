import { createHash, randomBytes } from "node:crypto";

export function hashActionToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function newActionSecret(): string {
  return randomBytes(24).toString("base64url");
}

export function tokenExpiresAt(appointmentStartsAt: Date): Date {
  const capAfterStart = appointmentStartsAt.getTime() + 24 * 60 * 60 * 1000;
  const capTwoWeeks = Date.now() + 14 * 24 * 60 * 60 * 1000;
  return new Date(Math.min(capAfterStart, capTwoWeeks));
}

/** Expiration des liens rebooking (créneau libéré). */
export function rebookOfferExpiresAt(freeSlotStartsAt: Date): Date {
  const afterStart = freeSlotStartsAt.getTime() + 24 * 60 * 60 * 1000;
  const week = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return new Date(Math.min(afterStart, week));
}
