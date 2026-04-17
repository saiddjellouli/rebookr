import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { replaceActionTokensForAppointment } from "../actions/issueTokens.js";
import { buildReminderEmail } from "../email/reminderTemplate.js";
import { sendHtmlEmail } from "../email/sendViaResend.js";
import { notifyWaitlistForFreeSlot } from "../rebooking/notifyWaitlist.js";
import { offerPreventiveRebookForAppointment } from "../rebooking/offerPreventiveRebook.js";
import { sendOutOfBandReminder } from "./outOfBand.js";

function hoursBeforeStart(startsAt: Date, tz: string, now: Date): number {
  const start = DateTime.fromJSDate(startsAt, { zone: "utc" }).setZone(tz);
  const n = DateTime.fromJSDate(now, { zone: "utc" }).setZone(tz);
  return start.diff(n, "hours").hours;
}

function minutesBeforeStart(startsAt: Date, tz: string, now: Date): number {
  const start = DateTime.fromJSDate(startsAt, { zone: "utc" }).setZone(tz);
  const n = DateTime.fromJSDate(now, { zone: "utc" }).setZone(tz);
  return start.diff(n, "minutes").minutes;
}

function clampScore(s: number): number {
  return Math.max(-100, Math.min(100, s));
}

async function syncLegacyFields(apt: {
  id: string;
  reminderT24SentAt: Date | null;
  reminderT6SentAt: Date | null;
  reminderT3SentAt: Date | null;
  reminderJ1SentAt: Date | null;
  reminderH3SentAt: Date | null;
}): Promise<void> {
  const data: {
    reminderT24SentAt?: Date;
    reminderT6SentAt?: Date;
    reminderT3SentAt?: Date;
  } = {};
  if (!apt.reminderT24SentAt && apt.reminderJ1SentAt) {
    data.reminderT24SentAt = apt.reminderJ1SentAt;
  }
  if (!apt.reminderT6SentAt && apt.reminderH3SentAt) {
    data.reminderT6SentAt = apt.reminderH3SentAt;
  }
  if (!apt.reminderT3SentAt && apt.reminderH3SentAt) {
    data.reminderT3SentAt = apt.reminderH3SentAt;
  }
  if (Object.keys(data).length === 0) return;
  await prisma.appointment.update({ where: { id: apt.id }, data });
}

export type DispatchResult = {
  t24: number;
  t6: number;
  t3: number;
  t1: number;
  skippedNoResend: boolean;
  j1: number;
  h3: number;
};

export async function dispatchReminders(now = new Date()): Promise<DispatchResult> {
  const noop = (): DispatchResult => ({
    t24: 0,
    t6: 0,
    t3: 0,
    t1: 0,
    skippedNoResend: !env.RESEND_API_KEY,
    j1: 0,
    h3: 0,
  });

  if (!env.RESEND_API_KEY) {
    return noop();
  }

  let t24 = 0;
  let t6 = 0;
  let t3 = 0;
  let t1 = 0;

  const candidates = await prisma.appointment.findMany({
    where: {
      status: { in: ["PENDING", "AT_RISK"] },
      startsAt: { gt: now },
      patient: { email: { not: null } },
    },
    include: { patient: true, organization: true },
  });

  for (const apt of candidates) {
    await syncLegacyFields(apt);

    const fresh = await prisma.appointment.findUnique({
      where: { id: apt.id },
      include: { patient: true, organization: true },
    });
    if (!fresh || (fresh.status !== "PENDING" && fresh.status !== "AT_RISK")) continue;

    const tz = fresh.organization.timezone;
    const email = fresh.patient!.email!.trim();
    if (!email) continue;

    const h = hoursBeforeStart(fresh.startsAt, tz, now);
    const m = minutesBeforeStart(fresh.startsAt, tz, now);

    if (h < 0 || m < 0) continue;

    const t24done = Boolean(fresh.reminderT24SentAt);
    const t6done = Boolean(fresh.reminderT6SentAt);
    const t3done = Boolean(fresh.reminderT3SentAt);
    const t1done = Boolean(fresh.reminderT1SentAt);

    if (!t24done && h <= 25 && h >= 23) {
      const urls = await replaceActionTokensForAppointment({
        appointmentId: fresh.id,
        startsAt: fresh.startsAt,
      });
      const { subject, html } = buildReminderEmail({
        kind: "T24",
        organizationName: fresh.organization.name,
        patientName: fresh.patient!.name,
        title: fresh.title,
        startsAt: fresh.startsAt,
        timezone: tz,
        confirmUrl: urls.confirmUrl,
        cancelUrl: urls.cancelUrl,
      });
      await sendHtmlEmail({ to: email, subject, html });
      await prisma.appointment.update({
        where: { id: fresh.id },
        data: {
          reminderT24SentAt: now,
          reminderJ1SentAt: now,
        },
      });
      t24++;
      continue;
    }

    if (!t24done) continue;

    if (!t6done && h <= 7 && h >= 0.25) {
      const urls = await replaceActionTokensForAppointment({
        appointmentId: fresh.id,
        startsAt: fresh.startsAt,
      });
      const { subject, html } = buildReminderEmail({
        kind: "T6",
        organizationName: fresh.organization.name,
        patientName: fresh.patient!.name,
        title: fresh.title,
        startsAt: fresh.startsAt,
        timezone: tz,
        confirmUrl: urls.confirmUrl,
        cancelUrl: urls.cancelUrl,
      });
      await sendHtmlEmail({ to: email, subject, html });

      const waMsg = `Merci de confirmer votre présence pour votre RDV chez ${fresh.organization.name}. Ouvrez l’e-mail reçu pour Confirmer ou Annuler.`;
      await sendOutOfBandReminder({
        channel: "whatsapp",
        phone: fresh.patient!.phone,
        message: waMsg,
        appointmentId: fresh.id,
      }).catch(() => {});

      const score = clampScore(fresh.confirmationScore - 30);
      await prisma.appointment.update({
        where: { id: fresh.id },
        data: {
          reminderT6SentAt: now,
          status: fresh.status === "PENDING" ? "AT_RISK" : fresh.status,
          confirmationScore: score,
        },
      });
      t6++;
      continue;
    }

    if (!t6done) continue;

    if (!t3done && m <= 200 && m >= 150) {
      const urls = await replaceActionTokensForAppointment({
        appointmentId: fresh.id,
        startsAt: fresh.startsAt,
      });
      const { subject, html } = buildReminderEmail({
        kind: "T3",
        organizationName: fresh.organization.name,
        patientName: fresh.patient!.name,
        title: fresh.title,
        startsAt: fresh.startsAt,
        timezone: tz,
        confirmUrl: urls.confirmUrl,
        cancelUrl: urls.cancelUrl,
      });
      await sendHtmlEmail({ to: email, subject, html });

      await sendOutOfBandReminder({
        channel: "voice",
        phone: fresh.patient!.phone,
        message: `Rappel vocal (stub) : confirmez votre rendez-vous chez ${fresh.organization.name}.`,
        appointmentId: fresh.id,
      }).catch(() => {});

      const score = clampScore(fresh.confirmationScore - 30);
      await prisma.appointment.update({
        where: { id: fresh.id },
        data: {
          reminderT3SentAt: now,
          reminderH3SentAt: now,
          confirmationScore: score,
        },
      });
      t3++;
      continue;
    }

    if (!t3done) continue;

    if (!t1done && m <= 75 && m >= 40) {
      const urls = await replaceActionTokensForAppointment({
        appointmentId: fresh.id,
        startsAt: fresh.startsAt,
      });
      const { subject, html } = buildReminderEmail({
        kind: "T1",
        organizationName: fresh.organization.name,
        patientName: fresh.patient!.name,
        title: fresh.title,
        startsAt: fresh.startsAt,
        timezone: tz,
        confirmUrl: urls.confirmUrl,
        cancelUrl: urls.cancelUrl,
      });
      await sendHtmlEmail({ to: email, subject, html });

      const hourLabel = DateTime.fromJSDate(fresh.startsAt, { zone: "utc" }).setZone(tz).toFormat("HH:mm");
      await sendOutOfBandReminder({
        channel: "whatsapp",
        phone: fresh.patient!.phone,
        message: `Dernière relance : confirmez votre RDV aujourd’hui à ${hourLabel}.`,
        appointmentId: fresh.id,
      }).catch(() => {});

      const score = clampScore(fresh.confirmationScore - 30);
      await prisma.appointment.update({
        where: { id: fresh.id },
        data: {
          reminderT1SentAt: now,
          confirmationScore: score,
        },
      });

      const preventive = await offerPreventiveRebookForAppointment(fresh.id);
      if (preventive?.shouldNotifyWaitlist) {
        notifyWaitlistForFreeSlot(preventive.freeSlotId).catch((err) => {
          console.error("[dispatchReminders] notifyWaitlistForFreeSlot", err);
        });
      }

      t1++;
    }
  }

  return {
    t24,
    t6,
    t3,
    t1,
    skippedNoResend: false,
    j1: t24,
    h3: t3,
  };
}
