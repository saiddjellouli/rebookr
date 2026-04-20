import { DateTime } from "luxon";
import { PRODUCT_NAME } from "../../product.js";
import { escapeHtml } from "../../lib/publicHtml.js";

export function buildRebookEmail(params: {
  organizationName: string;
  patientName: string | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  claimUrl: string;
  /** Liste d’attente vs successeur confirmé vs liste chaude (opt-in anticipation). */
  offerKind?: "waitlist" | "successor" | "hot_list";
}): { subject: string; html: string } {
  const start = DateTime.fromJSDate(params.startsAt, { zone: "utc" }).setZone(params.timezone);
  const end = DateTime.fromJSDate(params.endsAt, { zone: "utc" }).setZone(params.timezone);
  const label = `${start.setLocale("fr").toLocaleString(DateTime.DATETIME_MED)} – ${end.toLocaleString(DateTime.TIME_SIMPLE)}`;

  const kind = params.offerKind ?? "waitlist";
  const extra =
    kind === "successor"
      ? `<p style="margin:0 0 16px;color:#374151;line-height:1.55;">Vous avez déjà un rendez-vous confirmé plus tard : vous pouvez en un clic <strong>décaler votre horaire</strong> sur ce créneau plus tôt (votre ancien créneau sera libéré pour d’autres patients).</p>`
      : kind === "hot_list"
        ? `<p style="margin:0 0 16px;color:#374151;line-height:1.55;">Vous aviez indiqué être <strong>disponible en priorité</strong> : un créneau vient de se libérer. Réservez-le maintenant (premier arrivé, premier servi).</p>`
        : "";

  const subject = `${PRODUCT_NAME} — Un créneau s’est libéré (${start.toLocaleString(DateTime.DATE_MED)})`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /></head>
<body style="font-family: Inter, system-ui, sans-serif; background:#F3F4F6; margin:0; padding:24px;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:32px;">
    <tr><td>
      <p style="margin:0 0 16px;color:#2563EB;font-weight:700;font-size:18px;">${escapeHtml(PRODUCT_NAME)}</p>
      <p style="margin:0 0 12px;color:#111827;line-height:1.5;">Bonjour${params.patientName ? ` ${escapeHtml(params.patientName)}` : ""}, un créneau vient de se libérer chez <strong>${escapeHtml(params.organizationName)}</strong>.</p>
      ${extra}
      <p style="margin:0 0 24px;color:#374151;"><strong>${escapeHtml(label)}</strong></p>
      <p style="margin:0 0 12px;">
        <a href="${params.claimUrl}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Réserver ce créneau</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">Premier arrivé, premier servi. Si le bouton ne fonctionne pas, copiez le lien dans votre navigateur.</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
