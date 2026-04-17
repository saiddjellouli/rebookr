import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { getDashboardSummary } from "../dashboard/aggregates.js";
import { buildDailyReportEmail } from "../email/dailyReportTemplate.js";
import { sendHtmlEmail } from "../email/sendViaResend.js";

/** Bornes UTC du jour calendaire `dayKey` (YYYY-MM-DD) dans le fuseau `timezone`. */
export function utcBoundsForOrgDay(dayKey: string, timezone: string): { from: Date; to: Date } {
  const start = DateTime.fromISO(dayKey, { zone: timezone }).startOf("day");
  const end = start.endOf("day");
  return { from: start.toUTC().toJSDate(), to: end.toUTC().toJSDate() };
}

export async function sendDailyReportForOrg(params: {
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

  const { from, to } = utcBoundsForOrgDay(params.dayKey, org.timezone);
  const summary = await getDashboardSummary(org.id, from, to);
  if (!summary) {
    return { sent: 0, skippedNoResend: false, skippedNoRecipients: false };
  }

  const { subject, html } = buildDailyReportEmail({
    organizationName: org.name,
    dayKey: params.dayKey,
    summary,
  });

  let sent = 0;
  for (const toAddr of recipients) {
    await sendHtmlEmail({ to: toAddr, subject, html });
    sent++;
  }

  return { sent, skippedNoResend: false, skippedNoRecipients: false };
}

export async function runDailyReportsForAllOrgs(
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
    if (!options?.force && local.hour !== env.DAILY_REPORT_LOCAL_HOUR) {
      continue;
    }

    const yesterdayKey = local.minus({ days: 1 }).toFormat("yyyy-MM-dd");

    const existing = await prisma.dailyReportLog.findUnique({
      where: {
        organizationId_dayKey: { organizationId: org.id, dayKey: yesterdayKey },
      },
    });
    if (existing) {
      details.push({ organizationId: org.id, dayKey: yesterdayKey, result: "already_sent" });
      continue;
    }

    processed++;
    const r = await sendDailyReportForOrg({ organizationId: org.id, dayKey: yesterdayKey });

    if (r.skippedNoResend) {
      details.push({ organizationId: org.id, dayKey: yesterdayKey, result: "no_resend" });
      continue;
    }
    if (r.skippedNoRecipients) {
      details.push({ organizationId: org.id, dayKey: yesterdayKey, result: "no_owner_email" });
      continue;
    }

    await prisma.dailyReportLog.create({
      data: { organizationId: org.id, dayKey: yesterdayKey },
    });
    sent += r.sent;
    details.push({ organizationId: org.id, dayKey: yesterdayKey, result: `sent_${r.sent}` });
  }

  return { processed, sent, details };
}
