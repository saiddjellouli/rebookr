import { DateTime } from "luxon";

const DATETIME_FORMATS = [
  "dd/MM/yyyy HH:mm",
  "dd/MM/yyyy HH:mm:ss",
  "dd/MM/yyyy",
  "d/M/yyyy HH:mm",
  "d/M/yyyy",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd'T'HH:mm",
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "yyyy-MM-dd",
  "dd-MM-yyyy HH:mm",
  "dd-MM-yyyy",
  "dd.MM.yyyy HH:mm",
  "dd.MM.yyyy",
];

const TIME_FORMATS = ["HH:mm", "H:mm", "HH:mm:ss", "H:mm:ss"];

function tryParseDateTimeInZone(raw: string, zone: string): DateTime | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const iso = DateTime.fromISO(trimmed, { zone });
  if (iso.isValid) return iso;

  for (const fmt of DATETIME_FORMATS) {
    const dt = DateTime.fromFormat(trimmed, fmt, { zone });
    if (dt.isValid) return dt;
  }

  return null;
}

function tryParseTime(raw: string, zone: string, baseDate: DateTime): DateTime | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  for (const fmt of TIME_FORMATS) {
    const t = DateTime.fromFormat(trimmed, fmt, { zone });
    if (t.isValid) {
      return baseDate.set({
        hour: t.hour,
        minute: t.minute,
        second: t.second,
        millisecond: 0,
      });
    }
  }
  return null;
}

export type ScheduleParseInput = {
  zone: string;
  dateStr?: string;
  timeStr?: string;
  datetimeStr?: string;
  defaultTime: string;
};

/** Retourne le début du RDV en UTC (stockage Prisma) ou null si invalide. */
export function parseAppointmentStart(input: ScheduleParseInput): Date | null {
  const { zone, dateStr, timeStr, datetimeStr, defaultTime } = input;

  if (datetimeStr?.trim()) {
    const dt = tryParseDateTimeInZone(datetimeStr, zone);
    return dt?.toUTC().toJSDate() ?? null;
  }

  if (!dateStr?.trim()) return null;

  let day = tryParseDateTimeInZone(dateStr, zone);
  if (!day) {
    day = DateTime.fromISO(dateStr.trim(), { zone });
    if (!day.isValid) return null;
  }

  if (day.hour !== 0 || day.minute !== 0 || day.second !== 0) {
    return day.toUTC().toJSDate();
  }

  if (timeStr?.trim()) {
    const withTime = tryParseTime(timeStr, zone, day);
    if (withTime) return withTime.toUTC().toJSDate();
  }

  const defaultT = tryParseTime(defaultTime, zone, day);
  if (defaultT) return defaultT.toUTC().toJSDate();

  return day.toUTC().toJSDate();
}

export function parseDurationMinutes(raw: string | undefined): number | null {
  if (raw == null || !String(raw).trim()) return null;
  const n = Number.parseInt(String(raw).replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
