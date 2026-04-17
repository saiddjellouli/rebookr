import { prisma } from "../../lib/prisma.js";
import { env } from "../../config.js";
import { hashActionToken, newActionSecret, tokenExpiresAt } from "./tokenCrypto.js";

export type IssuedPair = {
  confirmRaw: string;
  cancelRaw: string;
  confirmUrl: string;
  cancelUrl: string;
};

function publicUrl(path: string): string {
  const base = env.PUBLIC_APP_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

export async function replaceActionTokensForAppointment(params: {
  appointmentId: string;
  startsAt: Date;
}): Promise<IssuedPair> {
  const expiresAt = tokenExpiresAt(params.startsAt);

  await prisma.actionToken.deleteMany({
    where: { appointmentId: params.appointmentId, usedAt: null },
  });

  const confirmRaw = newActionSecret();
  const cancelRaw = newActionSecret();

  await prisma.actionToken.createMany({
    data: [
      {
        appointmentId: params.appointmentId,
        tokenHash: hashActionToken(confirmRaw),
        purpose: "CONFIRM",
        expiresAt,
      },
      {
        appointmentId: params.appointmentId,
        tokenHash: hashActionToken(cancelRaw),
        purpose: "CANCEL",
        expiresAt,
      },
    ],
  });

  return {
    confirmRaw,
    cancelRaw,
    confirmUrl: publicUrl(`/api/public/confirm/${encodeURIComponent(confirmRaw)}`),
    cancelUrl: publicUrl(`/api/public/cancel/${encodeURIComponent(cancelRaw)}`),
  };
}
