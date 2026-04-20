import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { sendHtmlEmail } from "../email/sendViaResend.js";
import { buildPoolHotPriorityEmail } from "../email/poolInviteTemplate.js";
import { createPoolInviteToken } from "./poolInvites.js";

function publicUrl(path: string): string {
  const base = env.PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

const HOT_INVITE_MAX_PER_BROADCAST = 50;
const HOT_INVITE_COOLDOWN_HOURS = 24;

/**
 * Quand un RDV passe « à risque » : prévenir le pool (hors patient concerné) — spec §7.
 *
 * Garde-fous :
 *  - cap dur sur le nombre d’invites envoyées par broadcast,
 *  - cooldown : on ne réinvite pas un même patient en HOT_PRIORITY dans les 24h.
 *  Note : on ne promet pas de créneau, on propose seulement la priorité « si une place s’ouvre ».
 */
export async function broadcastPoolHotInviteForAtRiskAppointment(appointmentId: string): Promise<{ sent: number; skippedRecent: number }> {
  if (!env.RESEND_API_KEY) {
    return { sent: 0, skippedRecent: 0 };
  }

  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organization: true, patient: true },
  });
  if (!apt?.patientId || !apt.organization) {
    return { sent: 0, skippedRecent: 0 };
  }

  const orgId = apt.organizationId;
  const excludePatientId = apt.patientId;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const cooldownSince = new Date(now.getTime() - HOT_INVITE_COOLDOWN_HOURS * 3600 * 1000);

  const poolRows = await prisma.patientPoolEntry.findMany({
    where: {
      organizationId: orgId,
      OR: [{ wantsEarlierSlot: true }, { isOnWaitingList: true }],
      patientId: { not: excludePatientId },
      patient: { email: { not: null } },
    },
    include: { patient: true },
    orderBy: { lastInteractionAt: "desc" },
    take: 200,
  });

  let sent = 0;
  let skippedRecent = 0;

  for (const row of poolRows) {
    if (sent >= HOT_INVITE_MAX_PER_BROADCAST) break;

    const patient = row.patient;
    if (!patient?.email?.trim()) continue;

    const recent = await prisma.poolInviteToken.findFirst({
      where: {
        organizationId: orgId,
        patientId: patient.id,
        purpose: "HOT_PRIORITY",
        createdAt: { gte: cooldownSince },
      },
      select: { id: true },
    });
    if (recent) {
      skippedRecent++;
      continue;
    }

    const raw = await createPoolInviteToken({
      organizationId: orgId,
      patientId: patient.id,
      purpose: "HOT_PRIORITY",
      expiresAt,
      relatedAppointmentId: appointmentId,
    });

    const priorityUrl = publicUrl(`/api/public/pool/invite/${encodeURIComponent(raw)}`);
    const { subject, html } = buildPoolHotPriorityEmail({
      organizationName: apt.organization.name,
      patientName: patient.name,
      priorityUrl,
    });

    await sendHtmlEmail({ to: patient.email.trim(), subject, html });
    sent++;
  }

  return { sent, skippedRecent };
}
