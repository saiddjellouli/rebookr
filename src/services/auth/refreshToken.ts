import { createHash, randomBytes } from "node:crypto";
import type { Organization, User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueRefreshToken(params: {
  userId: string;
  ttlDays: number;
}): Promise<{ raw: string; expiresAt: Date }> {
  const raw = generateRefreshTokenRaw();
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + params.ttlDays);
  await prisma.refreshToken.create({
    data: {
      userId: params.userId,
      tokenHash,
      expiresAt,
    },
  });
  return { raw, expiresAt };
}

export type RotateResult = {
  user: User & { organization: Organization };
  newRefreshRaw: string;
  newExpiresAt: Date;
};

export async function rotateRefreshToken(
  raw: string,
  ttlDays: number,
): Promise<RotateResult | null> {
  const tokenHash = hashRefreshToken(raw);
  return prisma.$transaction(async (tx) => {
    const row = await tx.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { organization: true } } },
    });
    const now = new Date();
    if (!row || row.revokedAt || row.expiresAt <= now || !row.user.passwordHash) {
      return null;
    }
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: now },
    });
    const newRaw = generateRefreshTokenRaw();
    const newHash = hashRefreshToken(newRaw);
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + ttlDays);
    await tx.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: newHash,
        expiresAt,
      },
    });
    return {
      user: row.user,
      newRefreshRaw: newRaw,
      newExpiresAt: expiresAt,
    };
  });
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const tokenHash = hashRefreshToken(raw);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
