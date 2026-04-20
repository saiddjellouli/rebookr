import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { sendHtmlEmail } from "../email/sendViaResend.js";
import { buildPoolOptInPostBookingEmail } from "../email/poolInviteTemplate.js";
import { createPoolInviteToken } from "./poolInvites.js";

/**
 * Étape 2 du workflow Doctolib : pour chaque RDV créé via EMAIL_FORWARD il y a ≥ 2 minutes
 * et qui n’a pas encore reçu d’invite pool, on envoie au patient le mail
 * « [Votre RDV chez …] — des créneaux peuvent se libérer, cliquez Confirmer pour rejoindre le pool ».
 *
 * Principes :
 *  - idempotent : `Appointment.poolOptInEmailSentAt` marqué à chaque passage (succès, skip ou erreur
 *    structurelle comme patient sans email) pour ne jamais renvoyer deux fois ;
 *  - anti-spam : si le patient est déjà wantsEarlierSlot=true ou a reçu une invite WANTS_EARLIER_SLOT
 *    depuis <14 jours, on skippe (et on marque quand même l’envoi pour ne pas retenter) ;
 *  - tolérant aux crashes : relancer le cron ne génère pas de double envoi.
 */

const POST_BOOKING_DELAY_MS = 2 * 60 * 1000;
const COOLDOWN_DAYS = 14;

export type DispatchPostBookingPoolOptInResult = {
  scanned: number;
  sent: number;
  skippedAlreadyInPool: number;
  skippedRecentInvite: number;
  skippedNoEmail: number;
  skippedNoResend: boolean;
};

export async function dispatchPostBookingPoolOptIn(
  now: Date = new Date(),
): Promise<DispatchPostBookingPoolOptInResult> {
  if (!env.RESEND_API_KEY) {
    return {
      scanned: 0,
      sent: 0,
      skippedAlreadyInPool: 0,
      skippedRecentInvite: 0,
      skippedNoEmail: 0,
      skippedNoResend: true,
    };
  }

  const cutoff = new Date(now.getTime() - POST_BOOKING_DELAY_MS);
  const cooldownSince = new Date(now.getTime() - COOLDOWN_DAYS * 24 * 3600 * 1000);
  const inviteExpiresAt = new Date(
    now.getTime() + env.POOL_WANTS_INVITE_TTL_DAYS * 24 * 3600 * 1000,
  );

  const candidates = await prisma.appointment.findMany({
    where: {
      source: "EMAIL_FORWARD",
      poolOptInEmailSentAt: null,
      createdAt: { lte: cutoff },
      startsAt: { gt: now },
      status: { in: ["PENDING", "CONFIRMED", "AT_RISK"] },
    },
    include: {
      patient: true,
      organization: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  let sent = 0;
  let skippedAlreadyInPool = 0;
  let skippedRecentInvite = 0;
  let skippedNoEmail = 0;

  for (const apt of candidates) {
    // Cas sans patient ou sans email : on marque sentAt (sinon le cron les rescanne sans fin),
    // mais on ne génère pas d’invite.
    if (!apt.patientId || !apt.patient?.email?.trim()) {
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { poolOptInEmailSentAt: now },
      });
      skippedNoEmail++;
      continue;
    }

    const existingPool = await prisma.patientPoolEntry.findUnique({
      where: {
        organizationId_patientId: {
          organizationId: apt.organizationId,
          patientId: apt.patientId,
        },
      },
      select: { wantsEarlierSlot: true, isOnWaitingList: true },
    });
    if (existingPool?.wantsEarlierSlot || existingPool?.isOnWaitingList) {
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { poolOptInEmailSentAt: now },
      });
      skippedAlreadyInPool++;
      continue;
    }

    const recentInvite = await prisma.poolInviteToken.findFirst({
      where: {
        organizationId: apt.organizationId,
        patientId: apt.patientId,
        purpose: "WANTS_EARLIER_SLOT",
        createdAt: { gte: cooldownSince },
      },
      select: { id: true },
    });
    if (recentInvite) {
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { poolOptInEmailSentAt: now },
      });
      skippedRecentInvite++;
      continue;
    }

    try {
      const raw = await createPoolInviteToken({
        organizationId: apt.organizationId,
        patientId: apt.patientId,
        purpose: "WANTS_EARLIER_SLOT",
        expiresAt: inviteExpiresAt,
        relatedAppointmentId: apt.id,
      });
      const base = env.PUBLIC_APP_URL.replace(/\/$/, "");
      const wantsEarlierUrl = `${base}/api/public/pool/invite/${encodeURIComponent(raw)}`;

      const { subject, html } = buildPoolOptInPostBookingEmail({
        organizationName: apt.organization.name,
        patientName: apt.patient.name,
        wantsEarlierUrl,
      });

      await sendHtmlEmail({ to: apt.patient.email.trim(), subject, html });

      await prisma.appointment.update({
        where: { id: apt.id },
        data: { poolOptInEmailSentAt: now },
      });
      sent++;
    } catch (err) {
      // On NE marque PAS sentAt pour permettre un retry au prochain tick du cron.
      // (Erreur transitoire Resend / réseau / etc.)
      console.error("[dispatchPostBookingPoolOptIn]", apt.id, err);
    }
  }

  return {
    scanned: candidates.length,
    sent,
    skippedAlreadyInPool,
    skippedRecentInvite,
    skippedNoEmail,
    skippedNoResend: false,
  };
}
