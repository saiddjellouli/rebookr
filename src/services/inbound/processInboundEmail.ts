import type { InboundEmailOutcome } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  cancelAppointmentFromPatient,
  registerInboundConfirmationSignal,
} from "../appointments/patientSelfService.js";
import { createAppointmentFromDoctolibEmail } from "../appointments/createFromDoctolibEmail.js";
import { buildInboundBlob } from "./emailText.js";
import { passesDoctolibGate } from "./doctolibGate.js";
import { inferPatientIntentFromBody } from "./inferPatientIntent.js";
import { matchAppointmentForInbound } from "./matchAppointmentFromEmail.js";
import { parseDoctolibAppointment } from "./parseDoctolibAppointment.js";

export type InboundEmailPayload = {
  from: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
};

export type ProcessInboundResult = {
  outcome: InboundEmailOutcome;
  detail?: string;
  appointmentId?: string;
};

function preview(blob: string): string {
  return blob.length > 8000 ? `${blob.slice(0, 8000)}…` : blob;
}

export async function processInboundEmailForOrganization(params: {
  organizationId: string;
  timezone: string;
  payload: InboundEmailPayload;
}): Promise<ProcessInboundResult> {
  const subject = params.payload.subject?.trim() ?? "";
  const blob = buildInboundBlob(params.payload.text, params.payload.html);
  const from = params.payload.from.trim();
  const messageId = params.payload.messageId?.trim() || null;

  if (messageId) {
    const dup = await prisma.inboundEmailEvent.findUnique({
      where: {
        organizationId_messageId: {
          organizationId: params.organizationId,
          messageId,
        },
      },
    });
    if (dup) {
      return { outcome: "DUPLICATE_SKIPPED", detail: messageId };
    }
  }

  async function log(
    outcome: InboundEmailOutcome,
    extra?: { matchedPatientId?: string | null; matchedAppointmentId?: string | null; detail?: string },
  ) {
    await prisma.inboundEmailEvent.create({
      data: {
        organizationId: params.organizationId,
        messageId,
        fromAddress: from,
        toAddress: params.payload.to?.trim() ?? null,
        subject: subject || null,
        bodyPreview: preview(blob || "(vide)"),
        outcome,
        matchedPatientId: extra?.matchedPatientId ?? null,
        matchedAppointmentId: extra?.matchedAppointmentId ?? null,
        detail: extra?.detail ?? null,
      },
    });
  }

  if (!passesDoctolibGate({ from, subject, body: blob })) {
    await log("FILTERED_OUT_NOT_DOCTOLIB");
    return { outcome: "FILTERED_OUT_NOT_DOCTOLIB" };
  }

  const intent = inferPatientIntentFromBody(subject, blob);
  if (intent === "UNKNOWN") {
    await log("UNKNOWN_INTENT");
    return { outcome: "UNKNOWN_INTENT" };
  }

  // NEW_BOOKING : mail « X a pris rendez-vous » → création directe, sans passer par le
  // match d’un RDV existant (il n’y en a pas). C’est le cas nominal du nouveau flow :
  // Doctolib → Gmail praticien (forward) → webhook → Patient + Appointment PENDING.
  if (intent === "NEW_BOOKING") {
    return tryCreateFromInboundEmail({
      organizationId: params.organizationId,
      timezone: params.timezone,
      subject,
      blob,
      from,
      log,
    });
  }

  const match = await matchAppointmentForInbound({
    organizationId: params.organizationId,
    timezone: params.timezone,
    fromHeader: from,
    blob,
  });

  if (!match.ok) {
    // Filet de sécurité : un mail « confirm » qui ne matche aucun RDV peut être une
    // première notification mal détectée (Doctolib varie ses formulations). On tente
    // quand même la création opportuniste (cf. CALENDAIR_PRINCIPES §6 : signal partiel).
    if (intent === "CONFIRM") {
      const fallback = await tryCreateFromInboundEmail({
        organizationId: params.organizationId,
        timezone: params.timezone,
        subject,
        blob,
        from,
        log,
        suppressLogOnFailure: true, // on logguera plus bas si on retombe
      });
      if (fallback.outcome === "CREATED") return fallback;
    }

    if (match.reason === "NO_EMAIL" || match.reason === "NO_PATIENT") {
      await log("NO_PATIENT_MATCH", { detail: `${match.reason}:${intent}` });
      return { outcome: "NO_PATIENT_MATCH", detail: match.reason };
    }
    await log("NO_APPOINTMENT_MATCH", { detail: intent });
    return { outcome: "NO_APPOINTMENT_MATCH", detail: intent };
  }

  try {
    if (intent === "CONFIRM") {
      // Architecture : un e-mail Doctolib « confirmé » n’est **qu’un signal**.
      // On n’écrit jamais CONFIRMED depuis ici — on incrémente confirmationSignalCount
      // et, si le RDV était escaladé, on le redescend en PENDING. C’est notre système
      // (risque + clic patient sur le lien Calend’Air) qui juge la fiabilité.
      const r = await registerInboundConfirmationSignal({
        appointmentId: match.appointmentId,
        organizationId: params.organizationId,
      });
      if (!r.ok) {
        await log("ERROR", {
          matchedPatientId: match.patientId,
          matchedAppointmentId: match.appointmentId,
          detail: r.error ?? "SIGNAL_FAILED",
        });
        return { outcome: "ERROR", detail: r.error, appointmentId: match.appointmentId };
      }
      const signalDetail = `signal=doctolib_confirm count=${r.confirmationSignalCount ?? "?"} ${r.previousStatus}->${r.newStatus}`;
      await log("CONFIRMED", {
        matchedPatientId: match.patientId,
        matchedAppointmentId: match.appointmentId,
        detail: signalDetail,
      });
      return { outcome: "CONFIRMED", detail: signalDetail, appointmentId: match.appointmentId };
    }

    const r = await cancelAppointmentFromPatient({
      appointmentId: match.appointmentId,
      organizationId: params.organizationId,
      cancellationReason: "Annulation signalée via e-mail (Doctolib / transfert)",
      planningMeta: { lastUpdateSource: "EMAIL", incrementConfirmationSignal: true },
    });
    if (!r.ok) {
      await log("ERROR", {
        matchedPatientId: match.patientId,
        matchedAppointmentId: match.appointmentId,
        detail: r.error ?? "CANCEL_FAILED",
      });
      return { outcome: "ERROR", detail: r.error, appointmentId: match.appointmentId };
    }
    await log("CANCELLED", {
      matchedPatientId: match.patientId,
      matchedAppointmentId: match.appointmentId,
    });
    return { outcome: "CANCELLED", appointmentId: match.appointmentId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log("ERROR", {
      matchedPatientId: match.patientId,
      matchedAppointmentId: match.appointmentId,
      detail: msg,
    });
    return { outcome: "ERROR", detail: msg, appointmentId: match.appointmentId };
  }
}

type LogFn = (
  outcome: InboundEmailOutcome,
  extra?: { matchedPatientId?: string | null; matchedAppointmentId?: string | null; detail?: string },
) => Promise<void>;

/**
 * Tente l’extraction + création d’un RDV depuis le corps du mail Doctolib.
 * Factorisé car utilisé à la fois :
 *  1. en chemin principal quand intent=NEW_BOOKING (toujours logué),
 *  2. en filet de sécurité quand intent=CONFIRM + pas de RDV existant
 *     (`suppressLogOnFailure` = true pour laisser l’appelant logger à sa façon).
 */
async function tryCreateFromInboundEmail(params: {
  organizationId: string;
  timezone: string;
  subject: string;
  blob: string;
  from: string;
  log: LogFn;
  suppressLogOnFailure?: boolean;
}): Promise<ProcessInboundResult> {
  const parsed = parseDoctolibAppointment({
    subject: params.subject,
    body: params.blob,
    fromHeader: params.from,
    timezone: params.timezone,
  });

  if (!parsed.ok) {
    if (!params.suppressLogOnFailure) {
      await params.log("NO_APPOINTMENT_MATCH", { detail: `create:parse=${parsed.reason}` });
    }
    return { outcome: "NO_APPOINTMENT_MATCH", detail: `parse=${parsed.reason}` };
  }

  const createResult = await createAppointmentFromDoctolibEmail({
    organizationId: params.organizationId,
    extracted: parsed.data,
  });

  if (!createResult.ok) {
    if (!params.suppressLogOnFailure) {
      await params.log("ERROR", { detail: `create:${createResult.error}` });
    }
    return { outcome: "ERROR", detail: createResult.error };
  }

  const reuseFlag = createResult.appointmentReused ? "reused" : "new";
  const patientFlag = createResult.patientCreated ? "patient=new" : "patient=existing";
  const detail = `created:${reuseFlag}:${patientFlag}`;
  await params.log("CREATED", {
    matchedPatientId: createResult.patient.id,
    matchedAppointmentId: createResult.appointment.id,
    detail,
  });
  return {
    outcome: "CREATED",
    detail,
    appointmentId: createResult.appointment.id,
  };
}
