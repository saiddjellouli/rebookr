/** Normalise un en-tête CSV pour comparaison (accents, casse). */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}
