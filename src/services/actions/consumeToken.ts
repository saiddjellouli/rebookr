import type { ActionTokenPurpose } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hashActionToken } from "./tokenCrypto.js";

export async function loadActionToken(raw: string, purpose: ActionTokenPurpose) {
  const tokenHash = hashActionToken(raw);
  const row = await prisma.actionToken.findUnique({
    where: { tokenHash },
    include: {
      appointment: {
        include: { organization: true, patient: true },
      },
    },
  });
  if (!row || row.purpose !== purpose) return null;
  return row;
}
