import { escapeHtml } from "../../lib/publicHtml.js";
import { PRODUCT_NAME } from "../../product.js";
import type { DashboardSummary } from "../dashboard/aggregates.js";

export function buildDailyReportEmail(params: {
  organizationName: string;
  dayKey: string;
  summary: DashboardSummary;
}): { subject: string; html: string } {
  const s = params.summary;
  const rate =
    s.confirmationRate == null ? "—" : `${Math.round(s.confirmationRate * 1000) / 10} %`;

  const subject = `${PRODUCT_NAME} — Rapport du ${params.dayKey}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /></head>
<body style="font-family: Inter, system-ui, sans-serif; background:#F3F4F6; margin:0; padding:24px;">
  <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:32px;">
    <tr><td>
      <p style="margin:0 0 16px;color:#2563EB;font-weight:700;font-size:18px;">${escapeHtml(PRODUCT_NAME)}</p>
      <p style="margin:0 0 20px;color:#111827;">Bonjour, voici le bilan pour <strong>${escapeHtml(params.organizationName)}</strong> — <strong>${escapeHtml(params.dayKey)}</strong>.</p>
      <p style="margin:0 0 20px;font-size:15px;color:#111827;line-height:1.5;font-weight:600;">${escapeHtml(s.recoveryKpiSentence)}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">Tarif séance : ${escapeHtml(s.sessionPriceEuros.toFixed(2))} €</p>
      <table style="width:100%;border-collapse:collapse;font-size:15px;margin-top:16px;">
        <tr><td style="padding:8px 0;color:#6B7280;">Engagements (confirm. + rebooks)</td><td style="padding:8px 0;text-align:right;font-weight:700;">${s.noShowsAvoidedProxy}</td></tr>
        <tr><td style="padding:8px 0;color:#6B7280;">RDV rebookés</td><td style="padding:8px 0;text-align:right;font-weight:700;">${s.rebookedCount}</td></tr>
        <tr><td style="padding:8px 0;color:#6B7280;">Taux de confirmation</td><td style="padding:8px 0;text-align:right;font-weight:700;">${rate}</td></tr>
        <tr><td style="padding:8px 0;color:#6B7280;">Confirmations / annulations</td><td style="padding:8px 0;text-align:right;">${s.confirmedCount} / ${s.cancelledCount}</td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:12px;color:#9CA3AF;">Fenêtre du rapport : ${escapeHtml(s.period.from)} → ${escapeHtml(s.period.to)}</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
