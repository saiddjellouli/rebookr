import { prisma } from "../../lib/prisma.js";

export type PreventiveOfferResult = { freeSlotId: string; shouldNotifyWaitlist: boolean };

/**
 * T-1h : no-show probable + créneau proposé à la liste d’attente (RDV source non annulé).
 * Si le patient confirme ensuite, les FreeSlot non pourvus sont révoqués.
 */
export async function offerPreventiveRebookForAppointment(
  appointmentId: string,
): Promise<PreventiveOfferResult | null> {
  const apt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!apt || (apt.status !== "PENDING" && apt.status !== "AT_RISK")) {
    return null;
  }

  const existing = await prisma.freeSlot.findFirst({
    where: { sourceAppointmentId: appointmentId },
  });
  if (existing) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "NO_SHOW_PROBABLE",
        preventiveRebookOfferedAt: new Date(),
      },
    });
    return { freeSlotId: existing.id, shouldNotifyWaitlist: false };
  }

  const slotId = await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "NO_SHOW_PROBABLE",
        preventiveRebookOfferedAt: new Date(),
      },
    });
    const slot = await tx.freeSlot.create({
      data: {
        organizationId: apt.organizationId,
        sourceAppointmentId: apt.id,
        startsAt: apt.startsAt,
        endsAt: apt.endsAt,
      },
    });
    return slot.id;
  });
  return { freeSlotId: slotId, shouldNotifyWaitlist: true };
}
