export type InboundPatientIntent = "CONFIRM" | "CANCEL" | "NEW_BOOKING" | "UNKNOWN";

/**
 * Heuristiques FR / EN sur les accusés Doctolib — extensible.
 * Principe : en cas d’ambigüité (ex. « reporté »), on renvoie UNKNOWN plutôt que deviner.
 * Aucune des heuristiques n’est critique : un UNKNOWN est logué proprement et un opérateur peut retry.
 *
 * 3 intents produits :
 *  - NEW_BOOKING : mail « X a pris rendez-vous » / « Nouveau rendez-vous » → création directe
 *    (c’est le cas nominal du nouveau flow : Doctolib → Gmail praticien → webhook Calend’Air).
 *  - CONFIRM : accusé patient pour un RDV existant (« Je confirme », « Rendez-vous confirmé »).
 *  - CANCEL : accusé d’annulation.
 */
export function inferPatientIntentFromBody(subject: string, body: string): InboundPatientIntent {
  const blob = `${subject}\n${body}`.toLowerCase();

  // Création de RDV : détection prioritaire (un mail « a pris rendez-vous » est souvent
  // accompagné d’une phrase type « rendez-vous confirmé » générique de Doctolib — on ne
  // veut pas le classer CONFIRM, ce serait un match sur un RDV existant voué à l’échec).
  const newBookingHints =
    blob.includes("a pris rendez-vous") ||
    blob.includes("a pris un rendez-vous") ||
    blob.includes("a réservé un rendez-vous") ||
    blob.includes("a reserve un rendez-vous") ||
    /nouveau\s+rendez-?vous/.test(blob) ||
    /nouvelle\s+prise\s+de\s+rendez-?vous/.test(blob) ||
    blob.includes("booked an appointment") ||
    blob.includes("new appointment with");

  const rescheduleHints =
    /\bdépla(?:cé|cement)/.test(blob) ||
    /\breport(?:é|er|é·e)/.test(blob) ||
    blob.includes("rescheduled") ||
    blob.includes("nouvelle date");

  const cancelHints =
    /\bannul/.test(blob) ||
    blob.includes("a été annulé") ||
    blob.includes("a annulé") ||
    blob.includes("avez annulé") ||
    blob.includes("rendez-vous annulé") ||
    blob.includes("rdv annulé") ||
    blob.includes("je ne pourrai pas venir") ||
    blob.includes("je ne peux pas venir") ||
    blob.includes("n'est plus disponible") ||
    blob.includes("n’est plus disponible") ||
    blob.includes("appointment cancelled") ||
    blob.includes("canceled");

  const confirmHints =
    blob.includes("confirm") ||
    blob.includes("a bien été enregistré") ||
    blob.includes("rendez-vous confirmé") ||
    blob.includes("vous avez confirmé") ||
    blob.includes("confirmation de votre rendez-vous") ||
    blob.includes("je confirme") ||
    blob.includes("je serai présent") ||
    blob.includes("bien noté");

  // Priorité 1 : création (ne jamais redescendre un NEW_BOOKING en CONFIRM, cf. commentaire ci-dessus).
  if (newBookingHints && !cancelHints) return "NEW_BOOKING";

  // Report/déplacement : sémantiquement ni confirm ni cancel → on laisse un humain trancher.
  if (rescheduleHints && !cancelHints && !confirmHints) return "UNKNOWN";

  if (cancelHints && !confirmHints) return "CANCEL";
  if (confirmHints && !cancelHints) return "CONFIRM";
  if (cancelHints) return "CANCEL";
  if (confirmHints) return "CONFIRM";
  return "UNKNOWN";
}
