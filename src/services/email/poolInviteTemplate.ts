import { PRODUCT_NAME } from "../../product.js";
import { escapeHtml } from "../../lib/publicHtml.js";

export function buildWantsEarlierFollowupEmail(params: {
  organizationName: string;
  patientName: string | null;
  wantsEarlierUrl: string;
}): { subject: string; html: string } {
  const greet = params.patientName ? ` ${escapeHtml(params.patientName)}` : "";
  const subject = `${PRODUCT_NAME} — Créneau plus tôt possible ?`;
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#F3F4F6;margin:0;padding:24px;">
  <table style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
    <tr><td>
      <p style="margin:0 0 12px;color:#2563EB;font-weight:700;">${escapeHtml(PRODUCT_NAME)}</p>
      <p style="margin:0 0 16px;color:#111827;line-height:1.55;">Bonjour${greet}, merci pour votre confirmation chez <strong>${escapeHtml(params.organizationName)}</strong>.</p>
      <p style="margin:0 0 20px;color:#374151;line-height:1.55;">Souhaitez-vous être <strong>informé·e en priorité</strong> si un créneau <strong>plus tôt</strong> se libère ? Cela vous ajoute au pool du cabinet — sans garantie de place, uniquement des propositions réelles.</p>
      <a href="${params.wantsEarlierUrl}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Oui, me tenir au courant</a>
      <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">Vous ne serez contacté·e que si une place correspondante se libère.</p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}

/**
 * Invitation envoyée ~2 min après la création d’un RDV via forward Doctolib (étape 2
 * du nouveau workflow). But : alimenter le pool « wantsEarlierSlot » dès la prise de RDV,
 * au moment où le patient est encore *mentalement engagé* sur sa démarche.
 *
 * Sujet imposé côté produit : « [Votre RDV chez <cabinet>] ».
 */
export function buildPoolOptInPostBookingEmail(params: {
  organizationName: string;
  patientName: string | null;
  wantsEarlierUrl: string;
}): { subject: string; html: string } {
  const greet = params.patientName ? ` ${escapeHtml(params.patientName)}` : "";
  const subject = `[Votre RDV chez ${params.organizationName}]`;
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#F3F4F6;margin:0;padding:24px;">
  <table style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
    <tr><td>
      <p style="margin:0 0 12px;color:#2563EB;font-weight:700;">${escapeHtml(PRODUCT_NAME)}</p>
      <p style="margin:0 0 16px;color:#111827;line-height:1.55;">Bonjour${greet},</p>
      <p style="margin:0 0 16px;color:#111827;line-height:1.55;">Suite à votre confirmation de rendez-vous chez <strong>${escapeHtml(params.organizationName)}</strong> : des créneaux sont susceptibles de se libérer <strong>avant votre rendez-vous</strong>.</p>
      <p style="margin:0 0 22px;color:#374151;line-height:1.55;">Si vous souhaitez éventuellement en profiter, cliquez sur <strong>Confirmer</strong> ci-dessous — nous vous préviendrons uniquement en cas de place réelle.</p>
      <a href="${params.wantsEarlierUrl}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;">Confirmer</a>
      <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">Sans engagement, vous restez libre d’accepter ou non une proposition.</p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}

export function buildPoolHotPriorityEmail(params: {
  organizationName: string;
  patientName: string | null;
  priorityUrl: string;
}): { subject: string; html: string } {
  const greet = params.patientName ? ` ${escapeHtml(params.patientName)}` : "";
  const subject = `${PRODUCT_NAME} — Priorité si un créneau se libère aujourd’hui`;
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"/></head>
<body style="font-family:Inter,system-ui,sans-serif;background:#F3F4F6;margin:0;padding:24px;">
  <table style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;">
    <tr><td>
      <p style="margin:0 0 12px;color:#2563EB;font-weight:700;">${escapeHtml(PRODUCT_NAME)}</p>
      <p style="margin:0 0 16px;color:#111827;line-height:1.55;">Bonjour${greet}, des créneaux <strong>pourraient se libérer</strong> aujourd’hui ou très bientôt chez <strong>${escapeHtml(params.organizationName)}</strong>.</p>
      <p style="margin:0 0 20px;color:#374151;line-height:1.55;">Si vous pouvez vous déplacer rapidement, indiquez-le en un clic : vous serez <strong>prioritaire</strong> sur la prochaine place réellement disponible (premier arrivé, premier servi).</p>
      <a href="${params.priorityUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">Oui, je suis disponible en priorité</a>
      <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">Aucun créneau n’est réservé tant qu’une place ne s’ouvre pas réellement.</p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, html };
}
