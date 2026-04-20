/**
 * On ne traite que les messages identifiables comme liés à Doctolib (accusés patient).
 * Réduit la surface : pas de lecture « générique » de la boîte praticien.
 */
export function passesDoctolibGate(params: { from: string; subject: string; body: string }): boolean {
  const blob = `${params.from}\n${params.subject}\n${params.body}`.toLowerCase();
  if (blob.includes("doctolib")) return true;
  if (/[@.]doctolib\./i.test(params.from)) return true;
  return false;
}
