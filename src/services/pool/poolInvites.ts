import type { PoolInvitePurpose } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hashActionToken, newActionSecret } from "../actions/tokenCrypto.js";

export async function createPoolInviteToken(params: {
  organizationId: string;
  patientId: string;
  purpose: PoolInvitePurpose;
  expiresAt: Date;
  relatedAppointmentId?: string | null;
}): Promise<string> {
  const raw = newActionSecret();
  await prisma.poolInviteToken.create({
    data: {
      organizationId: params.organizationId,
      patientId: params.patientId,
      purpose: params.purpose,
      tokenHash: hashActionToken(raw),
      expiresAt: params.expiresAt,
      relatedAppointmentId: params.relatedAppointmentId ?? null,
    },
  });
  return raw;
}

export async function loadPoolInviteToken(raw: string) {
  const tokenHash = hashActionToken(raw);
  return prisma.poolInviteToken.findUnique({
    where: { tokenHash },
    include: { patient: true, organization: true },
  });
}
