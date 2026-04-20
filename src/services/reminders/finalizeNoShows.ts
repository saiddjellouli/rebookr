import { prisma } from "../../lib/prisma.js";

const GRACE_MIN = 15;

/**
 * Après la fin du RDV + 15 min : sans confirmation explicite → NO_SHOW définitif.
 */
export async function finalizeNoShowsAfterGrace(now = new Date()): Promise<{ finalized: number }> {
  const cutoff = new Date(now.getTime() - GRACE_MIN * 60 * 1000);

  /** Une seule requête : évite la course liste d’ids → update qui pouvait écraser un CONFIRMED
   *  écrit entre-temps (ex. clic Confirmer pendant le cron). */
  const result = await prisma.appointment.updateMany({
    where: {
      endsAt: { lt: cutoff },
      status: { in: ["PENDING", "AT_RISK", "NO_SHOW_PROBABLE"] },
    },
    data: { status: "NO_SHOW" },
  });

  return { finalized: result.count };
}
