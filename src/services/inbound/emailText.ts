export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildInboundBlob(text: string | undefined, html: string | undefined): string {
  const t = text?.trim();
  if (t) return t;
  if (html?.trim()) return stripHtmlToText(html);
  return "";
}
