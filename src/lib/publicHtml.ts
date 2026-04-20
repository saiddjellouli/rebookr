import { PRODUCT_NAME } from "../product.js";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function htmlPage(params: { title: string; message: string; ok: boolean; extraBodyHtml?: string }): string {
  const accent = params.ok ? "#16A34A" : "#DC2626";
  const extra = params.extraBodyHtml ?? "";
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(params.title)}</title></head>
<body style="margin:0;font-family:Inter,system-ui,sans-serif;background:#F3F4F6;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;">
  <div style="max-width:420px;background:#fff;padding:32px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center;">
    <p style="margin:0 0 8px;color:#2563EB;font-weight:700;">${escapeHtml(PRODUCT_NAME)}</p>
    <h1 style="margin:0 0 16px;font-size:1.25rem;color:${accent};">${escapeHtml(params.title)}</h1>
    <p style="margin:0;color:#374151;line-height:1.5;">${escapeHtml(params.message)}</p>
    ${extra}
  </div>
</body>
</html>`;
}
