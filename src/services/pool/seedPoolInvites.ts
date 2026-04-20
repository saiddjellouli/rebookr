import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { sendHtmlEmail } from "../email/sendViaResend.js";
import { buildWantsEarlierFollowupEmail } from "../email/poolInviteTemplate.js";
import { createPoolInviteToken } from "./poolInvites.js";

function publicUrl(path: string): string {
  const base = env.PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

export type SeedPoolInvitesResult = {
  candidatesScanned: number;
  invited: number;
  skippedAlreadyInPool: number;
  skippedNoEmail: number;
  skippedRecentInvite: number;
  skippedNoResend: boolean;
};

export type SeedPoolInvitesOptions = {
  organizationId: string;
  /** Combien de jours d’horizon scanner (RDV à venir). Défaut 21 (cf. import planning). */
  horizonDays?: number;
  /** Plafond d’envois par run (anti-spam). */
  maxInvitesPerRun?: number;
  /** Ne pas réinviter un patient qui a déjà reçu une invite WANTS_EARLIER_SLOT depuis N jours. */
  cooldownDays?: number;
};

/**
 * Gonfle le pool en proposant `WANTS_EARLIER_SLOT` aux patients ayant un RDV à venir
 * et qui ne sont pas déjà dans le pool. C’est un canal d’acquisition réelle de liquidité —
 * pas une promesse de créneau.
 *
 * Idempotent : ré-exécutable, ne renvoie pas à un patient déjà invité récemment.
 */
export async function seedPoolInvitesForOrganization(
  options: SeedPoolInvitesOptions,
): Promise<SeedPoolInvitesResult> {
  const horizonDays = options.horizonDays ?? 21;
  const maxInvites = options.maxInvitesPerRun ?? 50;
  const cooldownDays = options.cooldownDays ?? 14;

  if (!env.RESEND_API_KEY) {
    return {
      candidatesScanned: 0,
      invited: 0,
      skippedAlreadyInPool: 0,
      skippedNoEmail: 0,
      skippedRecentInvite: 0,
      skippedNoResend: true,
    };
  }

  const org = await prisma.organization.findUnique({
    where: { id: options.organizationId },
    select: { id: true, name: true },
  });
  if (!org) {
    return {
      candidatesScanned: 0,
      invited: 0,
      skippedAlreadyInPool: 0,
      skippedNoEmail: 0,
      skippedRecentInvite: 0,
      skippedNoResend: false,
    };
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + horizonDays * 24 * 3600 * 1000);
  const cooldownSince = new Date(now.getTime() - cooldownDays * 24 * 3600 * 1000);
  const inviteExpiresAt = new Date(now.getTime() + env.POOL_WANTS_INVITE_TTL_DAYS * 24 * 3600 * 1000);

  const upcoming = await prisma.appointment.findMany({
    where: {
      organizationId: org.id,
      startsAt: { gte: now, lte: horizon },
      status: { in: ["PENDING", "CONFIRMED", "AT_RISK"] },
      patient: { email: { not: null } },
    },
    include: { patient: true },
    orderBy: { startsAt: "asc" },
    take: 500,
  });

  const seenPatient = new Set<string>();
  const candidates: Array<{ patientId: string; patientName: string | null; email: string; appointmentId: string }> = [];
  let skippedNoEmail = 0;
  for (const a of upcoming) {
    if (!a.patientId) continue;
    if (!a.patient?.email?.trim()) {
      skippedNoEmail++;
      continue;
    }
    if (seenPatient.has(a.patientId)) continue;
    seenPatient.add(a.patientId);
    candidates.push({
      patientId: a.patientId,
      patientName: a.patient.name ?? null,
      email: a.patient.email.trim(),
      appointmentId: a.id,
    });
  }

  let invited = 0;
  let skippedAlreadyInPool = 0;
  let skippedRecentInvite = 0;

  for (const c of candidates) {
    if (invited >= maxInvites) break;

    const existingPool = await prisma.patientPoolEntry.findUnique({
      where: {
        organizationId_patientId: {
          organizationId: org.id,
          patientId: c.patientId,
        },
      },
    });
    if (existingPool && (existingPool.wantsEarlierSlot || existingPool.isOnWaitingList)) {
      skippedAlreadyInPool++;
      continue;
    }

    const recent = await prisma.poolInviteToken.findFirst({
      where: {
        organizationId: org.id,
        patientId: c.patientId,
        purpose: "WANTS_EARLIER_SLOT",
        createdAt: { gte: cooldownSince },
      },
      select: { id: true },
    });
    if (recent) {
      skippedRecentInvite++;
      continue;
    }

    const raw = await createPoolInviteToken({
      organizationId: org.id,
      patientId: c.patientId,
      purpose: "WANTS_EARLIER_SLOT",
      expiresAt: inviteExpiresAt,
      relatedAppointmentId: c.appointmentId,
    });

    const wantsEarlierUrl = publicUrl(`/api/public/pool/invite/${encodeURIComponent(raw)}`);
    const { subject, html } = buildWantsEarlierFollowupEmail({
      organizationName: org.name,
      patientName: c.patientName,
      wantsEarlierUrl,
    });

    await sendHtmlEmail({ to: c.email, subject, html });
    invited++;
  }

  return {
    candidatesScanned: candidates.length,
    invited,
    skippedAlreadyInPool,
    skippedNoEmail,
    skippedRecentInvite,
    skippedNoResend: false,
  };
}
