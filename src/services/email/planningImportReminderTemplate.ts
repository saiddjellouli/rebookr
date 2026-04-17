import { PRODUCT_NAME } from "../../product.js";

export function buildPlanningImportReminderEmail(params: {
  organizationName: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const subject = `${PRODUCT_NAME} — Pensez à importer votre planning de demain`;
  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;color:#111827;max-width:520px;margin:0 auto;padding:24px;">
  <p style="margin:0 0 12px;font-size:18px;font-weight:600;color:#2563EB;">${PRODUCT_NAME}</p>
  <p style="margin:0 0 16px;">Bonjour,</p>
  <p style="margin:0 0 16px;">C’est le bon moment pour <strong>importer le planning de demain</strong> en quelques secondes (CSV, photo ou copier-coller) — ainsi vos patients recevront les bonnes relances.</p>
  <p style="margin:0 0 24px;">
    <a href="${params.dashboardUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Ouvrir le tableau de bord</a>
  </p>
  <p style="margin:0;font-size:13px;color:#6B7280;">${params.organizationName}</p>
</body>
</html>`;
  return { subject, html };
}
