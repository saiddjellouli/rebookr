import type { Prisma } from "@prisma/client";

/** Annule les offres de rebook préventif si le patient confirme en dernier instant. */
export async function revokeUnfilledFreeSlotsForAppointment(
  tx: Prisma.TransactionClient,
  appointmentId: string,
): Promise<void> {
  const slots = await tx.freeSlot.findMany({
    where: { sourceAppointmentId: appointmentId, filledAt: null },
  });
  for (const s of slots) {
    await tx.rebookingOffer.deleteMany({ where: { freeSlotId: s.id } });
    await tx.freeSlot.delete({ where: { id: s.id } });
  }
}
