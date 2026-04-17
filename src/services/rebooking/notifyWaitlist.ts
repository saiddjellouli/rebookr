import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { hashActionToken, newActionSecret, rebookOfferExpiresAt } from "../actions/tokenCrypto.js";
import { buildRebookEmail } from "../email/rebookTemplate.js";
import { sendHtmlEmail } from "../email/sendViaResend.js";

const MAX_OFFERS = 30;

function publicUrl(path: string): string {
  const base = env.PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

export type NotifyWaitlistResult = {
  sent: number;
  skippedNoResend: boolean;
  skippedNoWaitlist: boolean;
};

export async function notifyWaitlistForFreeSlot(freeSlotId: string): Promise<NotifyWaitlistResult> {
  if (!env.RESEND_API_KEY) {
    return { sent: 0, skippedNoResend: true, skippedNoWaitlist: false };
  }

  const slot = await prisma.freeSlot.findUnique({
    where: { id: freeSlotId },
    include: { organization: true },
  });

  if (!slot || slot.filledAt) {
    return { sent: 0, skippedNoResend: false, skippedNoWaitlist: false };
  }

  const entries = await prisma.waitlistEntry.findMany({
    where: {
      organizationId: slot.organizationId,
      active: true,
      patient: { email: { not: null } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { patient: true },
    take: 120,
  });

  const seenPatient = new Set<string>();
  const unique: typeof entries = [];
  for (const e of entries) {
    if (!e.patientId || !e.patient?.email?.trim()) continue;
    if (seenPatient.has(e.patientId)) continue;
    seenPatient.add(e.patientId);
    unique.push(e);
    if (unique.length >= MAX_OFFERS) break;
  }

  if (unique.length === 0) {
    return { sent: 0, skippedNoResend: false, skippedNoWaitlist: true };
  }

  const tz = slot.organization.timezone;
  const expiresAt = rebookOfferExpiresAt(slot.startsAt);
  let sent = 0;

  for (const entry of unique) {
    const email = entry.patient!.email!.trim();

    const existing = await prisma.rebookingOffer.findUnique({
      where: {
        freeSlotId_waitlistEntryId: { freeSlotId: slot.id, waitlistEntryId: entry.id },
      },
    });
    if (existing?.claimedAt) continue;
    if (existing?.sentAt) continue;

    const raw = newActionSecret();
    const tokenHash = hashActionToken(raw);

    if (!existing) {
      await prisma.rebookingOffer.create({
        data: {
          freeSlotId: slot.id,
          waitlistEntryId: entry.id,
          tokenHash,
          expiresAt,
        },
      });
    } else {
      await prisma.rebookingOffer.update({
        where: { id: existing.id },
        data: { tokenHash, expiresAt },
      });
    }

    const claimUrl = publicUrl(`/api/public/rebook/${encodeURIComponent(raw)}`);
    const { subject, html } = buildRebookEmail({
      organizationName: slot.organization.name,
      patientName: entry.patient!.name,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      timezone: tz,
      claimUrl,
    });

    await sendHtmlEmail({ to: email, subject, html });

    await prisma.rebookingOffer.update({
      where: {
        freeSlotId_waitlistEntryId: { freeSlotId: slot.id, waitlistEntryId: entry.id },
      },
      data: { sentAt: new Date() },
    });

    sent++;
  }

  return { sent, skippedNoResend: false, skippedNoWaitlist: false };
}
