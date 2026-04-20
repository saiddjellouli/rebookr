import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { markAppointmentNoShowAndReleaseSlot } from "../rebooking/markNoShowAndReleaseSlot.js";
import { recalculateRisksForOrganization } from "../risk/appointmentRisk.js";

/** Identifiant d’import fixe pour supprimer / recréer le jeu démo sans toucher aux vrais patients. */
export const DEMO_SCENARIO_IMPORT_BATCH = "a0000000-0000-4000-8000-0000000000d1";

const DEMO_EMAIL_DOMAIN = "@calendair.invalid";

type SeedPatient = { name: string; localPart: string };

const DEMO_PATIENTS: SeedPatient[] = [
  { name: "Alice Démo", localPart: "alice.demo.inbound" },
  { name: "Bob Démo", localPart: "bob.demo.inbound" },
  { name: "Chloé Démo", localPart: "chloe.demo.inbound" },
  { name: "David Démo", localPart: "david.demo.inbound" },
  { name: "Eva Démo", localPart: "eva.demo.inbound" },
  { name: "Farid Démo", localPart: "farid.demo.inbound" },
];

export const SCENARIO_PRESETS = ["wow_rebook", "calm", "busy_normal", "chaotic", "noshow_wave"] as const;
export type ScenarioPreset = (typeof SCENARIO_PRESETS)[number];

export const SCENARIO_PRESET_LABELS: Record<ScenarioPreset, string> = {
  // Préset narratif minimaliste : tout part de PENDING (= « ce que Doctolib m’a forwardé
  // ce matin »). Le praticien va vivre, pas-à-pas, le scénario qui justifie le produit.
  wow_rebook: "Scénario WOW — 3 RDV PENDING, on raconte le rebooking pas à pas",
  calm: "Cabinet calme — 4 RDV PENDING, signal léger",
  busy_normal: "Journée normale — 7 RDV PENDING répartis sur 4 jours",
  chaotic: "Vendredi tendu — 9 RDV PENDING, beaucoup de signaux à venir",
  noshow_wave: "Vague de no-shows — 3 absences d’hier (déjà NO_SHOW) + 3 RDV PENDING futurs",
};

type AppointmentSpec = {
  patientIdx: number;
  /** Heure locale (cabinet). */
  hour: number;
  minute: number;
  /** Décalage en jours par rapport à `aujourd’hui` (négatif = passé). 0 par défaut. */
  dayOffset?: number;
  status: "PENDING" | "CONFIRMED" | "AT_RISK" | "NO_SHOW_PROBABLE";
  title: string;
  /** Si défini, on positionne `confirmedAt` (en heures avant maintenant). */
  confirmedHoursAgo?: number;
  /** Compteurs de signaux (e-mails, clics) déjà observés. */
  confirmationSignalCount?: number;
  /** Post-traitement : transformer en NO_SHOW + libérer le créneau (utile pour `noshow_wave`). */
  thenMarkNoShow?: boolean;
};

type PresetDefinition = {
  description: string;
  patientCount: number;
  appointments: AppointmentSpec[];
};

// Principe directeur : par défaut tout est **PENDING** — c’est l’état brut que le praticien
// reçoit de Doctolib (forward e-mail). La couleur (vert/jaune/rouge) doit *naître* des
// actions et du temps qui passe pendant la démo, pas être posée à l’avance. C’est ce qui
// fait l’effet « regarde, le système a évolué seul ».
//
// Étalement J+0 → J+3 pour rester *utilisable toute la journée* (sauts T-1, T-6, T-24).
// Heures placées en fin d’après-midi pour J+0 afin de rester dans le futur même si la
// démo est jouée vers 16-17h.
const PRESET_DEFINITIONS: Record<ScenarioPreset, PresetDefinition> = {
  // ──────────────────────────────────────────────────────────────────
  // Préset narratif phare : 3 RDV PENDING, scénario wow rebooking guidé.
  // Pédagogie : Alice confirme + accepte le pool ; Bob reste silencieux ;
  // à T-1 le système détecte NO_SHOW_PROBABLE et propose à Alice → wow.
  // ──────────────────────────────────────────────────────────────────
  wow_rebook: {
    description: SCENARIO_PRESET_LABELS.wow_rebook,
    patientCount: 3,
    appointments: [
      // Bob — le RDV qui sera libéré (silence prolongé puis NO_SHOW_PROBABLE).
      { patientIdx: 1, dayOffset: 1, hour: 10, minute: 0, status: "PENDING", title: "Démo WOW — Bob demain 10h" },
      // Alice — celle qui voudra venir plus tôt (confirme + opt-in pool).
      { patientIdx: 0, dayOffset: 1, hour: 14, minute: 0, status: "PENDING", title: "Démo WOW — Alice demain 14h" },
      // Chloé — un 3ᵉ RDV pour réalisme (planning non vide).
      { patientIdx: 2, dayOffset: 1, hour: 16, minute: 30, status: "PENDING", title: "Démo WOW — Chloé demain 16h30" },
    ],
  },

  calm: {
    description: SCENARIO_PRESET_LABELS.calm,
    patientCount: 4,
    appointments: [
      // J+1 : journée tranquille, tout en attente côté Calend’Air.
      { patientIdx: 0, dayOffset: 1, hour: 9, minute: 0, status: "PENDING", title: "Démo (calme) — Alice 9h" },
      { patientIdx: 1, dayOffset: 1, hour: 11, minute: 0, status: "PENDING", title: "Démo (calme) — Bob 11h" },
      { patientIdx: 2, dayOffset: 1, hour: 14, minute: 30, status: "PENDING", title: "Démo (calme) — Chloé 14h30" },
      { patientIdx: 3, dayOffset: 2, hour: 16, minute: 0, status: "PENDING", title: "Démo (calme) — David J+2 16h" },
    ],
  },

  busy_normal: {
    description: SCENARIO_PRESET_LABELS.busy_normal,
    patientCount: 6,
    appointments: [
      // Ce soir (J+0, 19h) — utile pour tester un saut T-1 immédiat.
      { patientIdx: 0, dayOffset: 0, hour: 19, minute: 0, status: "PENDING", title: "Démo — Alice ce soir 19h" },
      { patientIdx: 1, dayOffset: 1, hour: 9, minute: 0, status: "PENDING", title: "Démo — Bob demain 9h" },
      { patientIdx: 2, dayOffset: 1, hour: 10, minute: 30, status: "PENDING", title: "Démo — Chloé demain 10h30" },
      { patientIdx: 3, dayOffset: 1, hour: 14, minute: 0, status: "PENDING", title: "Démo — David demain 14h" },
      { patientIdx: 4, dayOffset: 1, hour: 17, minute: 0, status: "PENDING", title: "Démo — Eva demain 17h" },
      { patientIdx: 5, dayOffset: 2, hour: 9, minute: 0, status: "PENDING", title: "Démo — Farid J+2 9h" },
      { patientIdx: 0, dayOffset: 3, hour: 15, minute: 30, status: "PENDING", title: "Démo — Alice J+3 15h30" },
    ],
  },

  chaotic: {
    description: SCENARIO_PRESET_LABELS.chaotic,
    patientCount: 6,
    appointments: [
      // Vendredi tendu : 9 RDV PENDING — le chaos vient du nombre & de l’horaire serré.
      // L’escalade vers AT_RISK / NO_SHOW_PROBABLE doit naître du jeu (sauts + silences).
      { patientIdx: 0, dayOffset: 0, hour: 17, minute: 0, status: "PENDING", title: "Démo (chaos) — Alice ce soir 17h" },
      { patientIdx: 1, dayOffset: 0, hour: 19, minute: 30, status: "PENDING", title: "Démo (chaos) — Bob ce soir 19h30" },
      { patientIdx: 2, dayOffset: 1, hour: 9, minute: 0, status: "PENDING", title: "Démo (chaos) — Chloé demain 9h" },
      { patientIdx: 3, dayOffset: 1, hour: 9, minute: 30, status: "PENDING", title: "Démo (chaos) — David demain 9h30" },
      { patientIdx: 4, dayOffset: 1, hour: 11, minute: 0, status: "PENDING", title: "Démo (chaos) — Eva demain 11h" },
      { patientIdx: 5, dayOffset: 1, hour: 14, minute: 30, status: "PENDING", title: "Démo (chaos) — Farid demain 14h30" },
      { patientIdx: 0, dayOffset: 1, hour: 17, minute: 30, status: "PENDING", title: "Démo (chaos) — Alice demain 17h30" },
      { patientIdx: 1, dayOffset: 2, hour: 14, minute: 0, status: "PENDING", title: "Démo (chaos) — Bob J+2 14h" },
      { patientIdx: 2, dayOffset: 3, hour: 16, minute: 30, status: "PENDING", title: "Démo (chaos) — Chloé J+3 16h30" },
    ],
  },

  noshow_wave: {
    description: SCENARIO_PRESET_LABELS.noshow_wave,
    patientCount: 6,
    appointments: [
      // 3 RDV d’hier (J-1) — marqués NO_SHOW immédiatement pour le contexte « vague récente ».
      // (Statut AT_RISK temporaire requis par la fonction de marquage.)
      { patientIdx: 0, dayOffset: -1, hour: 9, minute: 0, status: "AT_RISK", title: "Démo (no-shows) — Alice hier 9h", thenMarkNoShow: true },
      { patientIdx: 1, dayOffset: -1, hour: 11, minute: 30, status: "AT_RISK", title: "Démo (no-shows) — Bob hier 11h30", thenMarkNoShow: true },
      { patientIdx: 2, dayOffset: -1, hour: 14, minute: 30, status: "AT_RISK", title: "Démo (no-shows) — Chloé hier 14h30", thenMarkNoShow: true },
      // RDV PENDING futurs : à partir d’ici le système peut redistribuer si Eva / Farid annulent.
      { patientIdx: 3, dayOffset: 0, hour: 18, minute: 30, status: "PENDING", title: "Démo (no-shows) — David ce soir 18h30" },
      { patientIdx: 4, dayOffset: 1, hour: 10, minute: 0, status: "PENDING", title: "Démo (no-shows) — Eva demain 10h" },
      { patientIdx: 5, dayOffset: 1, hour: 15, minute: 0, status: "PENDING", title: "Démo (no-shows) — Farid demain 15h" },
    ],
  },
};

export type SeedDemoScenarioResult = {
  preset: ScenarioPreset;
  alreadySeeded: boolean;
  patients: number;
  appointments: number;
  noShowsTriggered: number;
  freeSlotsCreated: number;
};

async function ensureDemoPatients(organizationId: string, count: number): Promise<{ id: string; email: string; name: string }[]> {
  const slice = DEMO_PATIENTS.slice(0, count);
  const out: { id: string; email: string; name: string }[] = [];
  for (const p of slice) {
    const email = `${p.localPart}${DEMO_EMAIL_DOMAIN}`;
    const existing = await prisma.patient.findFirst({
      where: { organizationId, email },
    });
    if (existing) {
      out.push({ id: existing.id, email, name: p.name });
    } else {
      const created = await prisma.patient.create({
        data: { organizationId, name: p.name, email, phone: "+33600000000" },
      });
      out.push({ id: created.id, email, name: p.name });
    }
  }
  return out;
}

export async function seedDemoScenario(
  organizationId: string,
  preset: ScenarioPreset = "busy_normal",
): Promise<SeedDemoScenarioResult> {
  const def = PRESET_DEFINITIONS[preset];

  const existing = await prisma.appointment.count({
    where: { organizationId, importBatchId: DEMO_SCENARIO_IMPORT_BATCH },
  });
  if (existing > 0) {
    return {
      preset,
      alreadySeeded: true,
      patients: def.patientCount,
      appointments: existing,
      noShowsTriggered: 0,
      freeSlotsCreated: 0,
    };
  }

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timezone: true },
  });
  if (!org) throw new Error("ORG_NOT_FOUND");

  const tz = org.timezone;
  const dayBase = DateTime.now().setZone(tz).startOf("day");
  const now = new Date();

  const patientRows = await ensureDemoPatients(organizationId, def.patientCount);

  const slot = (dayOffset: number, hour: number, minute: number) =>
    dayBase.plus({ days: dayOffset }).set({ hour, minute, second: 0, millisecond: 0 }).toUTC().toJSDate();
  const end30 = (start: Date) => new Date(start.getTime() + 30 * 60 * 1000);

  type CreatedSpec = { appointmentId: string; markNoShow: boolean };
  const created: CreatedSpec[] = [];

  // Marge mini avant le présent pour qu’un RDV reste *cliquable* (saut T-1, choix patient…) :
  // si on joue la démo tard (ex. 21h) un slot du soir (ex. 19h) serait passé → on le décale
  // automatiquement de +1 jour. Ne s’applique pas aux RDV explicitement passés (`thenMarkNoShow`
  // ou `dayOffset` négatif), qui doivent rester dans le passé.
  const MIN_FUTURE_MS = 30 * 60 * 1000;
  for (const s of def.appointments) {
    const p = patientRows[s.patientIdx]!;
    let effectiveOffset = s.dayOffset ?? 0;
    let startsAt = slot(effectiveOffset, s.hour, s.minute);
    const wantsPast = s.thenMarkNoShow === true || (s.dayOffset ?? 0) < 0;
    if (!wantsPast && startsAt.getTime() < now.getTime() + MIN_FUTURE_MS) {
      effectiveOffset += 1;
      startsAt = slot(effectiveOffset, s.hour, s.minute);
    }
    const confirmedAt =
      s.confirmedHoursAgo != null ? new Date(now.getTime() - s.confirmedHoursAgo * 3600 * 1000) : null;

    const apt = await prisma.appointment.create({
      data: {
        organizationId,
        patientId: p.id,
        title: s.title,
        startsAt,
        endsAt: end30(startsAt),
        status: s.status,
        source: "MANUAL",
        importBatchId: DEMO_SCENARIO_IMPORT_BATCH,
        planningLastUpdateSource: "DEMO",
        confirmedAt,
        confirmationSignalCount: s.confirmationSignalCount ?? (s.status === "CONFIRMED" ? 1 : 0),
      },
    });
    created.push({ appointmentId: apt.id, markNoShow: Boolean(s.thenMarkNoShow) });
  }

  let noShowsTriggered = 0;
  let freeSlotsCreated = 0;
  for (const c of created) {
    if (!c.markNoShow) continue;
    const r = await markAppointmentNoShowAndReleaseSlot({
      organizationId,
      appointmentId: c.appointmentId,
    });
    if (r.ok) {
      noShowsTriggered++;
      if (r.freeSlotId) freeSlotsCreated++;
    }
  }

  await recalculateRisksForOrganization(organizationId);

  return {
    preset,
    alreadySeeded: false,
    patients: patientRows.length,
    appointments: created.length,
    noShowsTriggered,
    freeSlotsCreated,
  };
}

export async function clearDemoScenario(organizationId: string): Promise<{ deletedAppointments: number }> {
  // Les FreeSlot pointant sur un RDV démo (sourceAppointmentId) seront cascade-supprimés
  // ou orphelinés selon la relation Prisma (onDelete: SetNull / Cascade) ; on nettoie surtout
  // les RDV et patients démo. Les InboundEmailEvent restent : journal historique utile pour la démo.
  const del = await prisma.appointment.deleteMany({
    where: { organizationId, importBatchId: DEMO_SCENARIO_IMPORT_BATCH },
  });

  await prisma.patientPoolEntry.deleteMany({
    where: {
      organizationId,
      patient: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
    },
  });

  await prisma.patient.deleteMany({
    where: {
      organizationId,
      email: { endsWith: DEMO_EMAIL_DOMAIN },
    },
  });

  return { deletedAppointments: del.count };
}

export function isDemoPatientEmail(email: string | null | undefined): boolean {
  return Boolean(email?.endsWith(DEMO_EMAIL_DOMAIN));
}

export function listScenarioPresets(): { name: ScenarioPreset; description: string; appointmentCount: number; patientCount: number }[] {
  return SCENARIO_PRESETS.map((name) => ({
    name,
    description: PRESET_DEFINITIONS[name].description,
    appointmentCount: PRESET_DEFINITIONS[name].appointments.length,
    patientCount: PRESET_DEFINITIONS[name].patientCount,
  }));
}
