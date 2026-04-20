import { DateTime } from "luxon";
import {
  extractCandidateEmails,
  extractCandidatePhones,
  tryParseSlotDate,
} from "./matchAppointmentFromEmail.js";

/**
 * Parse un e-mail Doctolib (confirmation forwardée par le praticien) pour en extraire
 * les champs nécessaires à la création d’un RDV : identité patient, date, motif.
 *
 * Principe : on ne valide pas « strictement » le format Doctolib (il évolue) ; on
 * cherche des signaux redondants (date + email OU téléphone) et on renvoie `null`
 * si on ne peut pas créer un RDV crédible. C’est du « meilleur effort » — un
 * UNKNOWN est préférable à une création bancale (cf. CALENDAIR_PRINCIPES §6).
 */

const MONTH_FR_BASE: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Format FR long : "15 mai 2026 à 14h30" ou "vendredi 15 mai à 14h30".
 * Tolère absence d’année (utilise l’année courante, cabinet).
 */
export function tryParseFrenchLongDate(blob: string, zone: string): Date | null {
  const norm = stripAccents(blob);
  const re = /(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)(?:\s+(\d{4}))?\s*(?:a|,)?\s*(\d{1,2})\s*[h:]\s*(\d{2})?/i;
  const m = norm.match(re);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTH_FR_BASE[m[2]!];
  if (!month) return null;
  const year = m[3] ? Number(m[3]) : DateTime.now().setZone(zone).year;
  const hour = Number(m[4]);
  const minute = m[5] ? Number(m[5]) : 0;
  const dt = DateTime.fromObject({ year, month, day, hour, minute }, { zone });
  if (!dt.isValid) return null;
  return dt.toUTC().toJSDate();
}

/**
 * Essaye les formats supportés successivement : DD/MM/YYYY puis FR long.
 * Factorisé pour que `matchAppointmentForInbound` puisse aussi en bénéficier plus tard.
 */
export function tryParseAnyFrenchDate(blob: string, zone: string): Date | null {
  return tryParseSlotDate(blob, zone) ?? tryParseFrenchLongDate(blob, zone);
}

const NAME_PATTERNS: RegExp[] = [
  /([A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'`\-.]+(?:\s+[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'`\-.]+)+)\s+a\s+(?:pris|confirm[ée])\s+(?:un\s+)?(?:rendez-?vous|rdv)/,
  /(?:rendez-?vous|rdv)\s+(?:de|avec|pour)\s+([A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'`\-.]+(?:\s+[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'`\-.]+)+)/i,
  /patient\s*:\s*([A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'`\-.]+(?:\s+[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'`\-.]+)+)/i,
  /nouveau\s+(?:rendez-?vous|rdv)\s*[\-–—:]\s*([A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'`\-.]+(?:\s+[A-ZÀ-ÖØ-Þ][\wÀ-ÖØ-öø-ÿ'`\-.]+)+)/i,
];

export function extractPatientName(subject: string, body: string): string | null {
  const text = `${subject}\n${body}`;
  for (const re of NAME_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      const clean = m[1].replace(/\s+/g, " ").trim();
      if (clean.length >= 3 && clean.length <= 80) return clean;
    }
  }
  return null;
}

export function extractMotif(body: string): string | null {
  const m = body.match(/(?:motif|type\s+de\s+(?:consultation|rendez-?vous))\s*:\s*([^\n\r]{2,80})/i);
  return m?.[1]?.trim() ?? null;
}

export function extractDurationMinutes(body: string): number | null {
  const m = body.match(/dur[ée]e\s*[:=]?\s*(\d{1,3})\s*(?:min|minutes|mn|m\b)/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 240) return null;
  return n;
}

export type ParsedDoctolibAppointment = {
  patientName: string | null;
  email: string | null;
  phone: string | null;
  startsAt: Date;
  endsAt: Date;
  title: string;
};

export type ParseDoctolibReason =
  | "NO_DATE"
  | "NO_PATIENT_IDENTITY"
  | "PAST_DATE";

export type ParseDoctolibResult =
  | { ok: true; data: ParsedDoctolibAppointment }
  | { ok: false; reason: ParseDoctolibReason };

/**
 * Extrait un RDV depuis un e-mail Doctolib (confirmation). Refuse si :
 *  - aucune date parsable (NO_DATE),
 *  - ni email ni téléphone patient identifiables (NO_PATIENT_IDENTITY),
 *  - date dans le passé (PAST_DATE) — on n’injecte pas de vieux RDV.
 */
export function parseDoctolibAppointment(params: {
  subject: string;
  body: string;
  fromHeader: string;
  timezone: string;
  now?: Date;
}): ParseDoctolibResult {
  const startsAt = tryParseAnyFrenchDate(params.body, params.timezone);
  if (!startsAt) return { ok: false, reason: "NO_DATE" };

  const now = params.now ?? new Date();
  if (startsAt.getTime() < now.getTime() - 10 * 60 * 1000) {
    return { ok: false, reason: "PAST_DATE" };
  }

  const emails = extractCandidateEmails(params.fromHeader, params.body);
  const phones = extractCandidatePhones(params.body);
  const email = emails[0] ?? null;
  const phone = phones[0] ?? null;
  if (!email && !phone) return { ok: false, reason: "NO_PATIENT_IDENTITY" };

  const patientName = extractPatientName(params.subject, params.body);
  const motif = extractMotif(params.body);
  const durationMin = extractDurationMinutes(params.body) ?? 30;
  const endsAt = new Date(startsAt.getTime() + durationMin * 60 * 1000);

  const title = motif ?? (patientName ? `RDV ${patientName}` : "RDV (Doctolib)");

  return {
    ok: true,
    data: { patientName, email, phone, startsAt, endsAt, title },
  };
}
