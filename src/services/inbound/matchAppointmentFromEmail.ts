import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi;
const PHONE_RE = /(?:\+?33\s?[1-9](?:[\s.-]?\d{2}){4}|0[1-9](?:[\s.-]?\d{2}){4})/g;

function isNoiseEmail(addr: string): boolean {
  const a = addr.toLowerCase();
  return (
    a.startsWith("no-reply@") ||
    a.startsWith("noreply@") ||
    a.startsWith("notifications@") ||
    a.includes("@doctolib.") ||
    a.includes("mailer-daemon")
  );
}

export function extractCandidateEmails(fromHeader: string, blob: string): string[] {
  const raw = `${fromHeader} ${blob}`;
  const found = new Set<string>();
  for (const m of raw.matchAll(EMAIL_RE)) {
    const e = m[0].toLowerCase();
    if (!isNoiseEmail(e)) found.add(e);
  }
  return [...found];
}

/** Normalise un numéro français : +33X XXXX -> 0XXXXXXXXX. Retourne null si non plausible. */
export function normalizeFrenchPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  let n = digits;
  if (n.startsWith("+33")) n = `0${n.slice(3)}`;
  else if (n.startsWith("33") && n.length === 11) n = `0${n.slice(2)}`;
  if (!/^0[1-9]\d{8}$/.test(n)) return null;
  return n;
}

export function extractCandidatePhones(blob: string): string[] {
  const found = new Set<string>();
  for (const m of blob.matchAll(PHONE_RE)) {
    const n = normalizeFrenchPhone(m[0]);
    if (n) found.add(n);
  }
  return [...found];
}

/** Première date/heure « française » plausible dans le corps (fuseau cabinet). */
export function tryParseSlotDate(blob: string, zone: string): Date | null {
  const dmyhm = blob.match(
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b[^\d]{0,12}(\d{1,2})[h:](\d{2})\b/i,
  );
  if (dmyhm) {
    const d = Number(dmyhm[1]);
    const mo = Number(dmyhm[2]);
    let y = Number(dmyhm[3]);
    if (y < 100) y += 2000;
    const h = Number(dmyhm[4]);
    const mi = Number(dmyhm[5]);
    const dt = DateTime.fromObject({ year: y, month: mo, day: d, hour: h, minute: mi }, { zone });
    if (dt.isValid) return dt.toUTC().toJSDate();
  }

  const dmy = blob.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmy) {
    const d = Number(dmy[1]);
    const mo = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const dt = DateTime.fromObject({ year: y, month: mo, day: d, hour: 9, minute: 0 }, { zone });
    if (dt.isValid) return dt.toUTC().toJSDate();
  }

  return null;
}

export type InboundMatchResult =
  | { ok: true; appointmentId: string; patientId: string | null }
  | { ok: false; reason: "NO_EMAIL" | "NO_PATIENT" | "NO_APPOINTMENT" };

export async function matchAppointmentForInbound(params: {
  organizationId: string;
  timezone: string;
  fromHeader: string;
  blob: string;
}): Promise<InboundMatchResult> {
  const emails = extractCandidateEmails(params.fromHeader, params.blob);
  const phones = extractCandidatePhones(params.blob);

  // Recherche élargie : e-mail principal, puis, en repli, téléphone FR normalisé.
  // Justifie l’existence même de ces signaux : les accusés Doctolib ne contiennent pas toujours l’e-mail patient.
  const orClauses: Array<Record<string, unknown>> = [];
  for (const email of emails) {
    orClauses.push({ email: { equals: email, mode: "insensitive" as const } });
  }
  for (const phone of phones) {
    orClauses.push({ phone: { equals: phone } });
  }

  if (orClauses.length === 0) {
    return { ok: false, reason: "NO_EMAIL" };
  }

  const patients = await prisma.patient.findMany({
    where: {
      organizationId: params.organizationId,
      OR: orClauses,
    },
  });
  if (patients.length === 0) return { ok: false, reason: "NO_PATIENT" };

  const patientIds = patients.map((p) => p.id);
  const now = new Date();
  const horizonStart = new Date(now.getTime() - 36 * 3600 * 1000);

  const candidates = await prisma.appointment.findMany({
    where: {
      organizationId: params.organizationId,
      patientId: { in: patientIds },
      status: { in: ["PENDING", "CONFIRMED", "AT_RISK", "NO_SHOW_PROBABLE"] },
      startsAt: { gte: horizonStart },
    },
    orderBy: { startsAt: "asc" },
    take: 40,
  });

  if (candidates.length === 0) return { ok: false, reason: "NO_APPOINTMENT" };

  const parsed = tryParseSlotDate(params.blob, params.timezone);
  if (parsed) {
    const dayKey = DateTime.fromJSDate(parsed, { zone: "utc" }).setZone(params.timezone).toISODate();
    const sameDay = candidates.filter((a) => {
      const k = DateTime.fromJSDate(a.startsAt, { zone: "utc" }).setZone(params.timezone).toISODate();
      return k === dayKey;
    });
    if (sameDay.length === 1) {
      const a = sameDay[0]!;
      return { ok: true, appointmentId: a.id, patientId: a.patientId };
    }
    if (sameDay.length > 1) {
      let best = sameDay[0]!;
      let bestDiff = Math.abs(sameDay[0]!.startsAt.getTime() - parsed.getTime());
      for (const a of sameDay.slice(1)) {
        const diff = Math.abs(a.startsAt.getTime() - parsed.getTime());
        if (diff < bestDiff) {
          best = a;
          bestDiff = diff;
        }
      }
      return { ok: true, appointmentId: best.id, patientId: best.patientId };
    }
  }

  if (candidates.length === 1) {
    const a = candidates[0]!;
    return { ok: true, appointmentId: a.id, patientId: a.patientId };
  }

  return { ok: false, reason: "NO_APPOINTMENT" };
}
