import { DateTime } from "luxon";
import { PRODUCT_NAME } from "../../product.js";

export type ReminderKind = "T24" | "T6" | "T3" | "T1";

export function buildReminderEmail(params: {
  kind: ReminderKind;
  organizationName: string;
  patientName: string | null;
  title: string;
  startsAt: Date;
  timezone: string;
   confirmUrl: string;
  cancelUrl: string;
}): { subject: string; html: string } {
  const start = DateTime.fromJSDate(params.startsAt, { zone: "utc" }).setZone(params.timezone);
  const dateLabel = start.setLocale("fr").toLocaleString(DateTime.DATETIME_MED);
  const hourLabel = start.setLocale("fr").toFormat("HH:mm");

  const greet = params.patientName ? ` ${escapeHtml(params.patientName)}` : "";

  const subjectByKind: Record<ReminderKind, string> = {
    T24: `${PRODUCT_NAME} — Confirmez votre rendez-vous (${dateLabel})`,
    T6: `${PRODUCT_NAME} — Merci de confirmer votre présence pour aujourd’hui`,
    T3: `${PRODUCT_NAME} — Dernière relance avant votre rendez-vous`,
    T1: `${PRODUCT_NAME} — Urgent : confirmez votre rendez-vous à ${hourLabel}`,
  };

  const introByKind: Record<ReminderKind, string> = {
    T24: `Bonjour${greet}, veuillez <strong>confirmer ou annuler</strong> votre rendez-vous chez <strong>${escapeHtml(params.organizationName)}</strong>.`,
    T6: `Bonjour${greet}, merci de <strong>confirmer votre présence pour aujourd’hui</strong> chez <strong>${escapeHtml(params.organizationName)}</strong>. Sans réponse, votre créneau pourra être proposé à d’autres patients.`,
    T3: `Bonjour${greet}, nous n’avons toujours pas votre confirmation pour le rendez-vous prévu <strong>${escapeHtml(dateLabel)}</strong> chez <strong>${escapeHtml(params.organizationName)}</strong>. Merci de répondre maintenant.`,
    T1: `Bonjour${greet}, merci de confirmer <strong>immédiatement</strong> votre rendez-vous prévu <strong>aujourd’hui à ${escapeHtml(hourLabel)}</strong> chez <strong>${escapeHtml(params.organizationName)}</strong>. Sans confirmation, le créneau pourra être attribué à la liste d’attente.`,
  };

  const subject = subjectByKind[params.kind];
  const intro = introByKind[params.kind];

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /></head>
<body style="font-family: Inter, system-ui, sans-serif; background:#F3F4F6; margin:0; padding:24px;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:32px;">
    <tr><td>
      <p style="margin:0 0 16px;color:#2563EB;font-weight:700;font-size:18px;">${escapeHtml(PRODUCT_NAME)}</p>
      <p style="margin:0 0 12px;color:#111827;line-height:1.5;">${intro}</p>
      <p style="margin:0 0 8px;color:#374151;"><strong>${escapeHtml(params.title)}</strong></p>
      <p style="margin:0 0 24px;color:#6B7280;font-size:15px;">${escapeHtml(dateLabel)}</p>
      <p style="margin:0 0 12px;">
        <a href="${params.confirmUrl}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;margin-right:8px;">Confirmer</a>
        <a href="${params.cancelUrl}" style="display:inline-block;background:#DC2626;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Annuler</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">Si les boutons ne fonctionnent pas, copiez-collez les liens dans votre navigateur.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
