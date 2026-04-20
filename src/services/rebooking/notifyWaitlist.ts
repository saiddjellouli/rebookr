import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { hashActionToken, newActionSecret, rebookOfferExpiresAt } from "../actions/tokenCrypto.js";
import { buildRebookEmail } from "../email/rebookTemplate.js";
import { sendHtmlEmail } from "../email/sendViaResend.js";
import { isIrrecoverableZone } from "../risk/irrecoverableZone.js";

const MAX_OFFERS = 30;

function publicUrl(path: string): string {
  const base = env.PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

/** Garde-fou « pas de promesse fictive » : on relit le slot avant chaque envoi
 *  et on s’abstient s’il a été comblé (claim, replanification manuelle, etc.). */
async function freeSlotStillOpen(freeSlotId: string): Promise<boolean> {
  const slot = await prisma.freeSlot.findUnique({
    where: { id: freeSlotId },
    select: { filledAt: true },
  });
  return Boolean(slot) && slot!.filledAt == null;
}

export type NotifyWaitlistResult = {
  sent: number;
  skippedNoResend: boolean;
  skippedNoWaitlist: boolean;
  skippedIrrecoverableZone?: boolean;
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

  // Garde-fou « zone irrécupérable » — créneau matinal réservé tardivement :
  // on a publié le FreeSlot pour l’audit, mais aucun patient n’a le temps d’être
  // prévenu/de répondre/d’arriver. On n’envoie aucune proposition (pas de promesse vide).
  if (slot.sourceAppointmentId) {
    const src = await prisma.appointment.findUnique({
      where: { id: slot.sourceAppointmentId },
      select: { startsAt: true, createdAt: true },
    });
    if (src && isIrrecoverableZone({
      startsAt: src.startsAt,
      createdAt: src.createdAt,
      timezone: slot.organization.timezone,
    })) {
      return {
        sent: 0,
        skippedNoResend: false,
        skippedNoWaitlist: false,
        skippedIrrecoverableZone: true,
      };
    }
  }

  const mode = env.REBOOK_NOTIFY_MODE;
  const now = new Date();

  const hotPoolRows =
    mode === "legacy"
      ? []
      : await prisma.patientPoolEntry.findMany({
          where: {
            organizationId: slot.organizationId,
            isHot: true,
            poolHotExpiresAt: { gt: now },
            patient: { email: { not: null } },
          },
          include: { patient: true },
          orderBy: [{ lastInteractionAt: "desc" }],
          take: MAX_OFFERS,
        });

  const hotPatients = hotPoolRows
    .map((r) => r.patient)
    .filter((p): p is NonNullable<typeof p> => p != null && Boolean(p.email?.trim()));

  let uniqueWaitlist: {
    id: string;
    patientId: string | null;
    patient: { id: string; email: string | null; name: string | null } | null;
  }[] = [];
  let successorAppts: {
    id: string;
    patientId: string | null;
    patient: { id: string; email: string | null; name: string | null } | null;
  }[] = [];

  if (mode !== "hot_only") {
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
    for (const e of entries) {
      if (!e.patientId || !e.patient?.email?.trim()) continue;
      if (seenPatient.has(e.patientId)) continue;
      seenPatient.add(e.patientId);
      uniqueWaitlist.push(e);
      if (uniqueWaitlist.length >= MAX_OFFERS) break;
    }

    const successorWhere = {
      organizationId: slot.organizationId,
      status: "CONFIRMED" as const,
      startsAt: { gt: slot.startsAt },
      patient: { email: { not: null } },
      ...(slot.sourceAppointmentId ? { id: { not: slot.sourceAppointmentId } } : {}),
    };

    const successorRows = await prisma.appointment.findMany({
      where: successorWhere,
      orderBy: { startsAt: "asc" },
      include: { patient: true },
      take: 200,
    });

    const byPatient = new Map<string, (typeof successorRows)[number]>();
    for (const a of successorRows) {
      if (!a.patientId || !a.patient?.email?.trim()) continue;
      if (!byPatient.has(a.patientId)) byPatient.set(a.patientId, a);
    }
    successorAppts = [...byPatient.values()].slice(0, MAX_OFFERS);
  }

  const hasHot = mode !== "legacy" && hotPatients.length > 0;
  const hasLegacy = mode !== "hot_only" && (uniqueWaitlist.length > 0 || successorAppts.length > 0);

  if (!hasHot && !hasLegacy) {
    return { sent: 0, skippedNoResend: false, skippedNoWaitlist: true };
  }

  const offeredPatientIds = new Set<string>();
  const tz = slot.organization.timezone;
  const expiresAt = rebookOfferExpiresAt(slot.startsAt);
  let sent = 0;

  for (const pat of hotPatients) {
    if (!(await freeSlotStillOpen(slot.id))) break;

    const email = pat.email!.trim();
    const recipientKey = `p:${pat.id}`;

    const existing = await prisma.rebookingOffer.findUnique({
      where: { freeSlotId_recipientKey: { freeSlotId: slot.id, recipientKey } },
    });
    if (existing?.claimedAt) continue;
    if (existing?.sentAt) continue;

    const raw = newActionSecret();
    const tokenHash = hashActionToken(raw);

    if (!existing) {
      await prisma.rebookingOffer.create({
        data: {
          freeSlotId: slot.id,
          recipientKey,
          targetPatientId: pat.id,
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
      patientName: pat.name,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      timezone: tz,
      claimUrl,
      offerKind: "hot_list",
    });

    await sendHtmlEmail({ to: email, subject, html });

    await prisma.rebookingOffer.update({
      where: { freeSlotId_recipientKey: { freeSlotId: slot.id, recipientKey } },
      data: { sentAt: new Date() },
    });

    offeredPatientIds.add(pat.id);
    sent++;
  }

  if (mode === "hot_only") {
    return { sent, skippedNoResend: false, skippedNoWaitlist: false };
  }

  for (const entry of uniqueWaitlist) {
    if (!(await freeSlotStillOpen(slot.id))) break;

    const email = entry.patient!.email!.trim();
    const recipientKey = `w:${entry.id}`;

    const existing = await prisma.rebookingOffer.findUnique({
      where: { freeSlotId_recipientKey: { freeSlotId: slot.id, recipientKey } },
    });
    if (existing?.claimedAt) continue;
    if (existing?.sentAt) continue;

    const raw = newActionSecret();
    const tokenHash = hashActionToken(raw);

    if (!existing) {
      await prisma.rebookingOffer.create({
        data: {
          freeSlotId: slot.id,
          recipientKey,
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
      offerKind: "waitlist",
    });

    await sendHtmlEmail({ to: email, subject, html });

    await prisma.rebookingOffer.update({
      where: { freeSlotId_recipientKey: { freeSlotId: slot.id, recipientKey } },
      data: { sentAt: new Date() },
    });

    offeredPatientIds.add(entry.patientId!);
    sent++;
  }

  for (const appt of successorAppts) {
    if (!(await freeSlotStillOpen(slot.id))) break;
    if (!appt.patientId) continue;
    if (offeredPatientIds.has(appt.patientId)) continue;

    const email = appt.patient!.email!.trim();
    const recipientKey = `a:${appt.id}`;

    const existing = await prisma.rebookingOffer.findUnique({
      where: { freeSlotId_recipientKey: { freeSlotId: slot.id, recipientKey } },
    });
    if (existing?.claimedAt) continue;
    if (existing?.sentAt) continue;

    const raw = newActionSecret();
    const tokenHash = hashActionToken(raw);

    if (!existing) {
      await prisma.rebookingOffer.create({
        data: {
          freeSlotId: slot.id,
          recipientKey,
          targetAppointmentId: appt.id,
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
      patientName: appt.patient?.name ?? null,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      timezone: tz,
      claimUrl,
      offerKind: "successor",
    });

    await sendHtmlEmail({ to: email, subject, html });

    await prisma.rebookingOffer.update({
      where: { freeSlotId_recipientKey: { freeSlotId: slot.id, recipientKey } },
      data: { sentAt: new Date() },
    });

    offeredPatientIds.add(appt.patientId);
    sent++;
  }

  return { sent, skippedNoResend: false, skippedNoWaitlist: false };
}
