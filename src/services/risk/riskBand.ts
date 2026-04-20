export type RiskBand = "LOW" | "MEDIUM" | "HIGH";

/** Seuils volontairement simples : à ajuster une fois qu’on a des vraies stats terrain. */
export function classifyRisk(score: number): RiskBand {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

export const RISK_BAND_LABEL_FR: Record<RiskBand, string> = {
  LOW: "Faible",
  MEDIUM: "Moyen",
  HIGH: "Élevé",
};
