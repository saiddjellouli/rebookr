import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { getInboundEmailSummary } from "../inbound/inboundStats.js";
import { getPoolStats } from "../pool/poolStats.js";
import { silenceDurationHours } from "../risk/appointmentRisk.js";
import { classifyRisk } from "../risk/riskBand.js";
import { isIrrecoverableZone } from "../risk/irrecoverableZone.js";
import {
  DEMO_SCENARIO_IMPORT_BATCH,
  listScenarioPresets,
  SCENARIO_PRESETS,
  type ScenarioPreset,
} from "./demoScenario.js";

/** Devine le préset actif à partir des titres des RDV démo (chacun préfixe son nom dans `title`). */
function detectCurrentPreset(titles: string[]): ScenarioPreset | null {
  const blob = titles.join(" ").toLowerCase();
  if (blob.includes("(no-shows)")) return "noshow_wave";
  if (blob.includes("(chaos)")) return "chaotic";
  if (blob.includes("(calme)")) return "calm";
  if (titles.length > 0) return "busy_normal";
  return null;
}

/** Format attendu par le parseur d’e-mail (date JJ/MM/AAAA + heure HH:mm). */
export function buildInboundDateLine(startsAt: Date, timezone: string): string {
  const local = DateTime.fromJSDate(startsAt, { zone: "utc" }).setZone(timezone);
  return `du ${local.toFormat("dd/MM/yyyy")} à ${local.toFormat("HH:mm")}`;
}

export async function getDemoPlanningSnapshot(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true, sessionPriceCents: true, name: true },
  });
  if (!org) return null;

  const now = new Date();
  const dayStart = DateTime.now().setZone(org.timezone).startOf("day").toUTC().toJSDate();
  const dayEnd = DateTime.now().setZone(org.timezone).endOf("day").toUTC().toJSDate();

  const [appointments, poolStats, demoApptCount, inboundRecent, inboundSummary] = await Promise.all([
    prisma.appointment.findMany({
      where: { organizationId, startsAt: { gte: dayStart, lte: dayEnd } },
      include: { patient: true },
      orderBy: { startsAt: "asc" },
    }),
    getPoolStats(organizationId),
    prisma.appointment.count({
      where: { organizationId, importBatchId: DEMO_SCENARIO_IMPORT_BATCH },
    }),
    prisma.inboundEmailEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        createdAt: true,
        outcome: true,
        subject: true,
        matchedAppointmentId: true,
      },
    }),
    getInboundEmailSummary(organizationId, 7),
  ]);

  const inboundSimulateExamples = appointments
    .filter((a) => a.patient?.email)
    .map((a) => {
      const patientEmail = a.patient!.email!;
      const dateLine = buildInboundDateLine(a.startsAt, org.timezone);
      return {
        appointmentId: a.id,
        title: a.title,
        status: a.status,
        patientName: a.patient!.name,
        patientEmail,
        dateLine,
        postSimulateConfirm: {
          action: "confirm" as const,
          patientEmail,
          dateLine,
          messageId: `demo-manuel-confirm-${a.id}`,
        },
        postSimulateCancel: {
          action: "cancel" as const,
          patientEmail,
          dateLine,
          messageId: `demo-manuel-cancel-${a.id}`,
        },
      };
    });

  return {
    organizationName: org.name,
    timezone: org.timezone,
    sessionPriceEuros: Math.round((org.sessionPriceCents / 100) * 100) / 100,
    demoScenarioAppointmentCount: demoApptCount,
    currentPreset: detectCurrentPreset(appointments.map((a) => a.title)),
    availablePresets: listScenarioPresets(),
    poolStats,
    demoHowTo: {
      fr: [
        `1) Choisir un scénario : POST /api/organizations/{orgId}/demo/scenario/preset/{${SCENARIO_PRESETS.join("|")}}`,
        "   (équivalent : POST /api/organizations/{orgId}/demo/scenario/seed?preset=...&clearFirst=true)",
        "2) GET /api/organizations/{orgId}/demo/state — inboundSimulateExamples = JSON prêt à coller, riskTopAppointments = vue risque.",
        "3) POST /api/organizations/{orgId}/demo/simulate/inbound-email — coller postSimulateConfirm ou postSimulateCancel pour exercer le pipeline e-mail.",
        "4) DELETE /api/organizations/{orgId}/demo/scenario — pour repartir de zéro à la fin.",
        "Authorization: Bearer <token>. Le dateLine est calculé pour le fuseau timezone du cabinet.",
      ],
    },
    inboundSimulateExamples,
    appointments: appointments.map((a) => ({
      id: a.id,
      title: a.title,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      status: a.status,
      riskScore: a.riskScore,
      riskBand: classifyRisk(a.riskScore),
      confirmationSignalCount: a.confirmationSignalCount,
      planningLastUpdateSource: a.planningLastUpdateSource,
      silenceDurationHours: Math.round(silenceDurationHours(a, now) * 10) / 10,
      irrecoverableZone: isIrrecoverableZone({
        startsAt: a.startsAt,
        createdAt: a.createdAt,
        timezone: org.timezone,
      }),
      patient: a.patient
        ? { name: a.patient.name, email: a.patient.email }
        : null,
    })),
    riskTopAppointments: [...appointments]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5)
      .map((a) => ({
        id: a.id,
        title: a.title,
        startsAt: a.startsAt.toISOString(),
        riskScore: a.riskScore,
        riskBand: classifyRisk(a.riskScore),
        status: a.status,
        patientName: a.patient?.name ?? null,
      })),
    recentInboundEvents: inboundRecent,
    inboundSummary,
  };
}
