import { prisma } from "../../lib/prisma.js";

/**
 * Compteurs réels du pool d’un cabinet — pas de promesses, pas d’extrapolation.
 * Sert au dashboard, au mode démo, et à toute UI qui doit montrer « voici la liquidité réelle dont on dispose ».
 */
export type PoolStats = {
  /** Patients ayant cliqué « plus tôt si possible » (opt-in long terme). */
  wantsEarlierSlotCount: number;
  /** Patients sur la liste d’attente classique (intention manuelle du cabinet ou patient). */
  isOnWaitingListCount: number;
  /** Patients « hot » avec TTL encore actif (les seuls qu’on contacte quand un slot se libère vraiment). */
  isHotActiveCount: number;
  /** Union (sans doublon) des éligibles à recevoir une offre future. */
  totalEligibleCount: number;
  /** Sous-population avec un RDV à venir (utile pour comprendre l’interaction pool ↔ planning). */
  withFutureAppointmentCount: number;
  /** Sous-population sans RDV à venir (les vrais demandeurs latents). */
  withoutFutureAppointmentCount: number;
};

export async function getPoolStats(organizationId: string): Promise<PoolStats> {
  const now = new Date();

  const [wants, waiting, hot, eligible, withFuture] = await Promise.all([
    prisma.patientPoolEntry.count({
      where: { organizationId, wantsEarlierSlot: true },
    }),
    prisma.patientPoolEntry.count({
      where: { organizationId, isOnWaitingList: true },
    }),
    prisma.patientPoolEntry.count({
      where: { organizationId, isHot: true, poolHotExpiresAt: { gt: now } },
    }),
    prisma.patientPoolEntry.count({
      where: {
        organizationId,
        OR: [
          { wantsEarlierSlot: true },
          { isOnWaitingList: true },
          { isHot: true, poolHotExpiresAt: { gt: now } },
        ],
      },
    }),
    prisma.patientPoolEntry.count({
      where: {
        organizationId,
        hasFutureAppointment: true,
        OR: [{ wantsEarlierSlot: true }, { isOnWaitingList: true }],
      },
    }),
  ]);

  return {
    wantsEarlierSlotCount: wants,
    isOnWaitingListCount: waiting,
    isHotActiveCount: hot,
    totalEligibleCount: eligible,
    withFutureAppointmentCount: withFuture,
    withoutFutureAppointmentCount: Math.max(0, eligible - withFuture),
  };
}
