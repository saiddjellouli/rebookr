import { prisma } from "../../lib/prisma.js";
import { isIrrecoverableZone } from "../risk/irrecoverableZone.js";

export type PreventiveOfferResult =
  | { freeSlotId: string; shouldNotifyWaitlist: boolean; irrecoverableZone?: false }
  | { freeSlotId: null; shouldNotifyWaitlist: false; irrecoverableZone: true };

/**
 * T-1h : no-show probable + créneau proposé à la liste d’attente (RDV source non annulé).
 * Si le patient confirme ensuite, les FreeSlot non pourvus sont révoqués.
 *
 * Zone irrécupérable (RDV matinal < 10h ET booké < 18h à l’avance) : on bascule quand
 * même en NO_SHOW_PROBABLE pour le suivi, mais on ne publie **aucun** FreeSlot car
 * personne n’a le temps d’être prévenu et de venir. C’est un signal honnête au
 * praticien : « pas de rebook tenté ici, le timing est trop court ».
 */
export async function offerPreventiveRebookForAppointment(
  appointmentId: string,
): Promise<PreventiveOfferResult | null> {
  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { organization: { select: { timezone: true } } },
  });
  if (!apt || (apt.status !== "PENDING" && apt.status !== "AT_RISK")) {
    return null;
  }

  const irrecoverable = isIrrecoverableZone({
    startsAt: apt.startsAt,
    createdAt: apt.createdAt,
    timezone: apt.organization.timezone,
  });

  if (irrecoverable) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status: "NO_SHOW_PROBABLE",
        preventiveRebookOfferedAt: new Date(),
      },
    });
    return { freeSlotId: null, shouldNotifyWaitlist: false, irrecoverableZone: true };
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
