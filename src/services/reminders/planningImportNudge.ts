import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { buildPlanningImportReminderEmail } from "../email/planningImportReminderTemplate.js";
import { sendHtmlEmail } from "../email/sendViaResend.js";

export async function sendPlanningImportReminderForOrg(params: {
  organizationId: string;
  dayKey: string;
}): Promise<{ sent: number; skippedNoResend: boolean; skippedNoRecipients: boolean }> {
  if (!env.RESEND_API_KEY) {
    return { sent: 0, skippedNoResend: true, skippedNoRecipients: false };
  }

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
    include: { users: { where: { role: "OWNER" } } },
  });
  if (!org) {
    return { sent: 0, skippedNoResend: false, skippedNoRecipients: false };
  }

  const recipients = [...new Set(org.users.map((u) => u.email.trim()).filter(Boolean))];
  if (recipients.length === 0) {
    return { sent: 0, skippedNoResend: false, skippedNoRecipients: true };
  }

  const dashboardUrl = `${env.PUBLIC_APP_URL}/dashboard/${org.id}`;
  const { subject, html } = buildPlanningImportReminderEmail({
    organizationName: org.name,
    dashboardUrl,
  });

  let sent = 0;
  for (const toAddr of recipients) {
    try {
      await sendHtmlEmail({ to: toAddr, subject, html });
      sent++;
    } catch {
      /* un destinataire en erreur : on continue */
    }
  }

  return { sent, skippedNoResend: false, skippedNoRecipients: false };
}

export async function runPlanningImportNudgesForAllOrgs(
  now = new Date(),
  options?: { force?: boolean },
): Promise<{
  processed: number;
  sent: number;
  details: { organizationId: string; dayKey: string; result: string }[];
}> {
  const orgs = await prisma.organization.findMany();
  const details: { organizationId: string; dayKey: string; result: string }[] = [];
  let sent = 0;
  let processed = 0;

  for (const org of orgs) {
    const local = DateTime.fromJSDate(now, { zone: "utc" }).setZone(org.timezone);
    if (!options?.force && local.hour !== env.PLANNING_IMPORT_EMAIL_LOCAL_HOUR) {
      continue;
    }

    const dayKey = local.toFormat("yyyy-MM-dd");

    const existing = await prisma.planningImportReminderLog.findUnique({
      where: {
        organizationId_dayKey: { organizationId: org.id, dayKey },
      },
    });
    if (existing) {
      details.push({ organizationId: org.id, dayKey, result: "already_sent" });
      continue;
    }

    processed++;
    const r = await sendPlanningImportReminderForOrg({ organizationId: org.id, dayKey });

    if (r.skippedNoResend) {
      details.push({ organizationId: org.id, dayKey, result: "no_resend" });
      continue;
    }
    if (r.skippedNoRecipients) {
      details.push({ organizationId: org.id, dayKey, result: "no_owner_email" });
      continue;
    }
    if (r.sent === 0) {
      details.push({ organizationId: org.id, dayKey, result: "send_failed" });
      continue;
    }

    await prisma.planningImportReminderLog.create({
      data: { organizationId: org.id, dayKey },
    });
    sent += r.sent;
    details.push({ organizationId: org.id, dayKey, result: `sent_${r.sent}` });
  }

  return { processed, sent, details };
}
