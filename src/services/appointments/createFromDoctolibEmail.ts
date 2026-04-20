import type { Appointment, Patient } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { ParsedDoctolibAppointment } from "../inbound/parseDoctolibAppointment.js";
import { recalculateRiskForAppointment } from "../risk/appointmentRisk.js";

/**
 * Crée (ou réutilise) le Patient et insère un Appointment PENDING à partir du mail Doctolib
 * forwardé par le praticien. Source = EMAIL_FORWARD. C’est le nouveau point d’entrée
 * principal du produit (cf. nouveau workflow) : plus besoin d’import CSV préalable.
 *
 * Règles :
 *  - Upsert Patient par (orgId, email) prioritaire, sinon (orgId, phone), sinon création.
 *  - Si un RDV existe déjà pour ce patient à ±10 min de `startsAt` : on ne duplique pas.
 *  - On émet `planningLastUpdateSource=EMAIL` pour tracer la provenance du signal.
 */

export type CreateFromDoctolibResult =
  | {
      ok: true;
      appointment: Appointment;
      patient: Patient;
      patientCreated: boolean;
      appointmentReused: boolean;
    }
  | { ok: false; error: "DUPLICATE_RECENT" | "MISSING_IDENTITY" };

const DUPLICATE_WINDOW_MINUTES = 10;

export async function createAppointmentFromDoctolibEmail(params: {
  organizationId: string;
  extracted: ParsedDoctolibAppointment;
}): Promise<CreateFromDoctolibResult> {
  const { organizationId, extracted } = params;

  if (!extracted.email && !extracted.phone) {
    return { ok: false, error: "MISSING_IDENTITY" };
  }

  const patient = await upsertPatient(organizationId, extracted);

  // Anti-duplicate : même patient, même créneau à ±10 min → on renvoie le RDV existant.
  const windowMs = DUPLICATE_WINDOW_MINUTES * 60 * 1000;
  const existing = await prisma.appointment.findFirst({
    where: {
      organizationId,
      patientId: patient.id,
      startsAt: {
        gte: new Date(extracted.startsAt.getTime() - windowMs),
        lte: new Date(extracted.startsAt.getTime() + windowMs),
      },
      status: { in: ["PENDING", "CONFIRMED", "AT_RISK", "NO_SHOW_PROBABLE"] },
    },
    orderBy: { startsAt: "asc" },
  });

  if (existing) {
    return {
      ok: true,
      appointment: existing,
      patient,
      patientCreated: false,
      appointmentReused: true,
    };
  }

  const created = await prisma.appointment.create({
    data: {
      organizationId,
      patientId: patient.id,
      title: extracted.title,
      startsAt: extracted.startsAt,
      endsAt: extracted.endsAt,
      status: "PENDING",
      source: "EMAIL_FORWARD",
      planningLastUpdateSource: "EMAIL",
    },
  });

  // Score de risque initial calé sur le statut / l’heure de début, pour que le RDV
  // soit immédiatement visible correctement sur le dashboard (évite un 50 neutre
  // jusqu’au prochain passage de recalcul).
  await recalculateRiskForAppointment(created.id).catch(() => {});

  return {
    ok: true,
    appointment: created,
    patient,
    patientCreated: !patient.updatedAt || patient.updatedAt.getTime() === patient.createdAt.getTime(),
    appointmentReused: false,
  };
}

async function upsertPatient(
  organizationId: string,
  extracted: ParsedDoctolibAppointment,
): Promise<Patient> {
  const email = extracted.email?.toLowerCase().trim() || null;
  const phone = extracted.phone?.trim() || null;
  const name = extracted.patientName?.trim() || null;

  // 1) Match par email (prioritaire, plus fiable) puis téléphone.
  let patient: Patient | null = null;
  if (email) {
    patient = await prisma.patient.findFirst({
      where: { organizationId, email: { equals: email, mode: "insensitive" } },
    });
  }
  if (!patient && phone) {
    patient = await prisma.patient.findFirst({
      where: { organizationId, phone },
    });
  }

  if (patient) {
    // Complète les champs manquants sans écraser ceux déjà saisis par le cabinet.
    const patch: Record<string, unknown> = {};
    if (!patient.email && email) patch.email = email;
    if (!patient.phone && phone) patch.phone = phone;
    if (!patient.name && name) patch.name = name;
    if (Object.keys(patch).length > 0) {
      patient = await prisma.patient.update({
        where: { id: patient.id },
        data: patch,
      });
    }
    return patient;
  }

  return prisma.patient.create({
    data: {
      organizationId,
      email,
      phone,
      name,
    },
  });
}
