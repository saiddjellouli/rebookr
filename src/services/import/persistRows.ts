import type { AppointmentSource } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { parseAppointmentStart, parseDurationMinutes } from "../csv/parseSchedule.js";
import { refreshPoolHasFutureAppointment } from "../pool/patientPool.js";

const MAX_ROWS = 2000;

export type ImportAppointmentInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  date?: string | null;
  time?: string | null;
  datetime?: string | null;
  duration?: string | null;
  title?: string | null;
};

function simpleEmailOk(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function normalizeEmail(raw: string | undefined | null): string | null {
  const t = raw?.trim().toLowerCase();
  if (!t) return null;
  return simpleEmailOk(t) ? t : null;
}

function normalizePhone(raw: string | undefined | null): string | null {
  const t = raw?.trim();
  return t || null;
}

function phoneDigits(raw: string | undefined): string | null {
  const d = raw?.replace(/\D/g, "") ?? "";
  return d.length >= 8 ? d : null;
}

async function findOrCreatePatient(params: {
  organizationId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  cache: Map<string, string>;
}): Promise<string> {
  const { organizationId, name, email, phone, cache } = params;

  const emailKey = email ? `e:${email}` : null;
  if (emailKey && cache.has(emailKey)) return cache.get(emailKey)!;

  const pKey = phone ? `p:${phoneDigits(phone) ?? phone}` : null;
  if (pKey && cache.has(pKey)) return cache.get(pKey)!;

  if (email) {
    const found = await prisma.patient.findFirst({
      where: { organizationId, email },
    });
    if (found) {
      if (emailKey) cache.set(emailKey, found.id);
      if (pKey) cache.set(pKey, found.id);
      return found.id;
    }
  }

  if (phone) {
    const found = await prisma.patient.findFirst({
      where: { organizationId, phone },
    });
    if (found) {
      if (emailKey) cache.set(emailKey, found.id);
      if (pKey) cache.set(pKey, found.id);
      return found.id;
    }
  }

  const created = await prisma.patient.create({
    data: {
      organizationId,
      name,
      email,
      phone,
    },
  });
  if (emailKey) cache.set(emailKey, created.id);
  if (pKey) cache.set(pKey, created.id);
  return created.id;
}

export async function persistAppointmentImportRows(params: {
  organizationId: string;
  rows: ImportAppointmentInput[];
  source: AppointmentSource;
  importBatchId?: string;
  defaultTime?: string;
  defaultDurationMinutes?: number;
  /** Numéro de ligne de départ pour les messages d’erreur (ex. 1). */
  firstLineNumber?: number;
}): Promise<{
  importBatchId: string;
  created: number;
  skipped: number;
  errors: { line: number; message: string }[];
}> {
  const defaultTime = params.defaultTime ?? "09:00";
  const defaultDurationMinutes = Math.min(
    480,
    Math.max(5, params.defaultDurationMinutes ?? 30),
  );
  const firstLine = params.firstLineNumber ?? 1;

  const org = await prisma.organization.findUnique({
    where: { id: params.organizationId },
  });
  if (!org) {
    throw new Error("ORG_NOT_FOUND");
  }

  if (params.rows.length > MAX_ROWS) {
    return {
      importBatchId: randomUUID(),
      created: 0,
      skipped: 0,
      errors: [
        {
          line: 0,
          message: `Trop de lignes (max ${MAX_ROWS}). Fractionnez l’import.`,
        },
      ],
    };
  }

  const importBatchId = params.importBatchId ?? randomUUID();
  const patientCache = new Map<string, string>();
  const touchedPatientIds = new Set<string>();
  let created = 0;
  let skipped = 0;
  const errors: { line: number; message: string }[] = [];

  for (let i = 0; i < params.rows.length; i++) {
    const row = params.rows[i]!;
    const line = firstLine + i;

    const name = row.name?.trim() || null;
    const email = normalizeEmail(row.email ?? undefined);
    const phone = normalizePhone(row.phone ?? undefined);

    if (!name && !email && !phone) {
      skipped++;
      errors.push({ line, message: "Nom, email ou téléphone requis" });
      continue;
    }

    const datetimeStr = row.datetime?.trim() || undefined;
    const dateStr = row.date?.trim() || undefined;
    const timeStr = row.time?.trim() || undefined;

    if (!datetimeStr && !dateStr) {
      skipped++;
      errors.push({ line, message: "Date ou date-heure requise" });
      continue;
    }

    const startsAt = parseAppointmentStart({
      zone: org.timezone,
      datetimeStr,
      dateStr,
      timeStr,
      defaultTime,
    });

    if (!startsAt) {
      skipped++;
      errors.push({ line, message: "Date ou heure invalide" });
      continue;
    }

    const rowDuration = parseDurationMinutes(row.duration?.trim()) ?? defaultDurationMinutes;
    const endsAt = new Date(startsAt.getTime() + rowDuration * 60 * 1000);

    const titleCell = row.title?.trim();
    const title =
      titleCell ||
      (name ? `Rendez-vous — ${name}` : email ? `Rendez-vous — ${email}` : `Rendez-vous — ${phone}`);

    try {
      const patientId = await findOrCreatePatient({
        organizationId: org.id,
        name,
        email,
        phone,
        cache: patientCache,
      });

      await prisma.appointment.create({
        data: {
          organizationId: org.id,
          patientId,
          title,
          startsAt,
          endsAt,
          source: params.source,
          importBatchId,
        },
      });
      created++;
    } catch (e) {
      skipped++;
      errors.push({
        line,
        message: e instanceof Error ? e.message : "Erreur à l’enregistrement",
      });
    }
  }

  for (const patientId of touchedPatientIds) {
    await refreshPoolHasFutureAppointment(patientId, org.id);
  }

  return {
    importBatchId,
    created,
    skipped,
    errors,
  };
}
