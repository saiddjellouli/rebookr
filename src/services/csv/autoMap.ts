import type { CanonicalField, ColumnMapping } from "./canonical.js";
import { normalizeHeader } from "./normalizeHeader.js";

type Rule = { field: CanonicalField; test: (h: string) => boolean };

const rules: Rule[] = [
  {
    field: "datetime",
    test: (h) =>
      /^(date[\s_-]?heure|datetime|dateheure|debut|début|start|horaire[\s_-]?complet)$/.test(h) ||
      (h.includes("date") && h.includes("heure")),
  },
  { field: "name", test: (h) => /^(nom|name|client|patient|fullname|contact|prenom)$/.test(h) },
  { field: "email", test: (h) => h.includes("email") || h.includes("mail") || h === "courriel" },
  {
    field: "phone",
    test: (h) =>
      h.includes("telephone") ||
      h.includes("téléphone") ||
      h.includes("tel") ||
      h.includes("phone") ||
      h.includes("mobile") ||
      h.includes("portable"),
  },
  { field: "date", test: (h) => h === "date" || h === "jour" || h === "day" },
  { field: "time", test: (h) => h === "heure" || h === "time" || h === "hour" },
  { field: "duration", test: (h) => h.includes("duree") || h.includes("durée") || h === "duration" || h === "minutes" },
  { field: "title", test: (h) => h === "titre" || h === "title" || h === "motif" || h === "objet" },
];

/** Détecte un mapping à partir des libellés de colonnes du fichier. */
export function autoMapHeaders(headers: string[]): ColumnMapping {
  const normalizedToOriginal = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !normalizedToOriginal.has(n)) normalizedToOriginal.set(n, h);
  }

  const mapping: ColumnMapping = {};
  const usedOriginals = new Set<string>();

  for (const rule of rules) {
    for (const [norm, original] of normalizedToOriginal) {
      if (usedOriginals.has(original)) continue;
      if (rule.test(norm)) {
        mapping[rule.field] = original;
        usedOriginals.add(original);
        break;
      }
    }
  }

  return mapping;
}

export function mergeMappings(base: ColumnMapping, override: ColumnMapping): ColumnMapping {
  return { ...base, ...override };
}

/** Il faut une colonne « datetime » ou « date » (l’heure peut être absente : défaut côté API). */
export function listMissingForSchedule(mapping: ColumnMapping): CanonicalField[] {
  const hasSchedule = Boolean(mapping.datetime) || Boolean(mapping.date);
  if (hasSchedule) return [];
  return ["date"];
}
