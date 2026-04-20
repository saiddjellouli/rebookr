import { prisma } from "../../lib/prisma.js";

/** Patient dans le pool si wantsEarlierSlot OU liste d’attente active (aligné spec §5). */
export async function ensurePatientPoolEntry(params: {
  organizationId: string;
  patientId: string;
}): Promise<void> {
  await prisma.patientPoolEntry.upsert({
    where: {
      organizationId_patientId: {
        organizationId: params.organizationId,
        patientId: params.patientId,
      },
    },
    create: {
      organizationId: params.organizationId,
      patientId: params.patientId,
    },
    update: {},
  });
}

export async function setPoolWantsEarlierSlot(params: {
  organizationId: string;
  patientId: string;
}): Promise<void> {
  await ensurePatientPoolEntry(params);
  await prisma.patientPoolEntry.update({
    where: {
      organizationId_patientId: {
        organizationId: params.organizationId,
        patientId: params.patientId,
      },
    },
    data: {
      wantsEarlierSlot: true,
      lastInteractionAt: new Date(),
    },
  });
}

export async function setPoolHotPriority(params: {
  organizationId: string;
  patientId: string;
  hotTtlHours: number;
}): Promise<void> {
  await ensurePatientPoolEntry(params);
  const until = new Date(Date.now() + params.hotTtlHours * 3600 * 1000);
  await prisma.patientPoolEntry.update({
    where: {
      organizationId_patientId: {
        organizationId: params.organizationId,
        patientId: params.patientId,
      },
    },
    data: {
      isHot: true,
      poolHotExpiresAt: until,
      lastInteractionAt: new Date(),
    },
  });
}

export async function syncPoolFromWaitlist(params: {
  organizationId: string;
  patientId: string;
  active: boolean;
}): Promise<void> {
  if (!params.active) {
    await prisma.patientPoolEntry.updateMany({
      where: { organizationId: params.organizationId, patientId: params.patientId },
      data: { isOnWaitingList: false, lastInteractionAt: new Date() },
    });
    return;
  }
  await ensurePatientPoolEntry({ organizationId: params.organizationId, patientId: params.patientId });
  await prisma.patientPoolEntry.update({
    where: {
      organizationId_patientId: {
        organizationId: params.organizationId,
        patientId: params.patientId,
      },
    },
    data: {
      isOnWaitingList: true,
      lastInteractionAt: new Date(),
    },
  });
}

export async function refreshPoolHasFutureAppointment(patientId: string, organizationId: string): Promise<void> {
  const now = new Date();
  const count = await prisma.appointment.count({
    where: {
      patientId,
      organizationId,
      startsAt: { gt: now },
      status: { in: ["PENDING", "CONFIRMED", "AT_RISK", "NO_SHOW_PROBABLE"] },
    },
  });
  const has = count > 0;
  await prisma.patientPoolEntry.updateMany({
    where: { organizationId, patientId },
    data: { hasFutureAppointment: has },
  });
}
