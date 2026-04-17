import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function resolveDashboardPeriod(
  organizationId: string,
  fromQ: string | undefined,
  toQ: string | undefined,
  defaultDays: number,
): Promise<{ from: Date; to: Date } | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  if (!org) return null;

  const tz = org.timezone;

  const toDay = toQ && ISO_DATE.test(toQ)
    ? DateTime.fromISO(toQ, { zone: tz })
    : DateTime.now().setZone(tz);
  if (!toDay.isValid) return null;
  const to = toDay.endOf("day");

  const fromDay = fromQ && ISO_DATE.test(fromQ)
    ? DateTime.fromISO(fromQ, { zone: tz })
    : to.startOf("day").minus({ days: defaultDays });
  if (!fromDay.isValid) return null;
  const from = fromDay.startOf("day");

  if (from > to) return null;

  const spanDays = to.diff(from, "days").days;
  if (spanDays > 366) return null;

  return {
    from: from.toUTC().toJSDate(),
    to: to.toUTC().toJSDate(),
  };
}
