import { prisma } from "../../lib/prisma.js";

const GRACE_MIN = 15;

/**
 * Après la fin du RDV + 15 min : sans confirmation explicite → NO_SHOW définitif.
 */
export async function finalizeNoShowsAfterGrace(now = new Date()): Promise<{ finalized: number }> {
  const cutoff = new Date(now.getTime() - GRACE_MIN * 60 * 1000);

  const candidates = await prisma.appointment.findMany({
    where: {
      endsAt: { lt: cutoff },
      status: { in: ["PENDING", "AT_RISK", "NO_SHOW_PROBABLE"] },
    },
    select: { id: true },
  });

  if (candidates.length === 0) {
    return { finalized: 0 };
  }

  await prisma.appointment.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { status: "NO_SHOW" },
  });

  return { finalized: candidates.length };
}
