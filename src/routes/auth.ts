import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { requireJwt } from "../auth/preHandlers.js";
import {
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
} from "../services/auth/refreshToken.js";

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug : minuscules, chiffres et tirets uniquement");

const registerBody = z.object({
  organizationName: z.string().min(1).max(200),
  organizationSlug: slugSchema,
  ownerEmail: z.string().email(),
  ownerPassword: z.string().min(8).max(200),
  timezone: z.string().min(1).optional(),
  sessionPriceCents: z.coerce.number().int().min(0).optional(),
});

const loginBody = z.object({
  organizationSlug: slugSchema,
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshBody = z.object({
  refreshToken: z.string().min(1),
});

const jwtSignOpts = { expiresIn: env.JWT_ACCESS_EXPIRES };

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const email = b.ownerEmail.trim().toLowerCase();
    const slug = b.organizationSlug.toLowerCase();

    const exists = await prisma.organization.findUnique({ where: { slug } });
    if (exists) {
      return reply.code(409).send({ error: "ORG_SLUG_TAKEN" });
    }

    const passwordHash = await bcrypt.hash(b.ownerPassword, 10);

    const org = await prisma.organization.create({
      data: {
        name: b.organizationName.trim(),
        slug,
        timezone: b.timezone ?? "Europe/Paris",
        sessionPriceCents: b.sessionPriceCents ?? 0,
        users: {
          create: {
            email,
            passwordHash,
            role: "OWNER",
          },
        },
      },
      include: { users: true },
    });

    const owner = org.users[0]!;
    const { raw: refreshToken } = await issueRefreshToken({
      userId: owner.id,
      ttlDays: env.JWT_REFRESH_DAYS,
    });
    const token = await reply.jwtSign(
      {
        sub: owner.id,
        orgId: org.id,
        email: owner.email,
        role: owner.role,
      },
      jwtSignOpts,
    );

    return reply.code(201).send({
      token,
      refreshToken,
      organization: { id: org.id, name: org.name, slug: org.slug },
      user: { id: owner.id, email: owner.email, role: owner.role },
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const email = b.email.trim().toLowerCase();
    const slug = b.organizationSlug.toLowerCase();

    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }

    const user = await prisma.user.findUnique({
      where: { organizationId_email: { organizationId: org.id, email } },
    });
    if (!user?.passwordHash) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }

    const ok = await bcrypt.compare(b.password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }

    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const { raw: refreshToken } = await issueRefreshToken({
      userId: user.id,
      ttlDays: env.JWT_REFRESH_DAYS,
    });
    const token = await reply.jwtSign(
      {
        sub: user.id,
        orgId: org.id,
        email: user.email,
        role: user.role,
      },
      jwtSignOpts,
    );

    return reply.send({
      token,
      refreshToken,
      organization: { id: org.id, name: org.name, slug: org.slug },
      user: { id: user.id, email: user.email, role: user.role },
    });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
    }
    const rotated = await rotateRefreshToken(parsed.data.refreshToken, env.JWT_REFRESH_DAYS);
    if (!rotated) {
      return reply.code(401).send({ error: "INVALID_REFRESH" });
    }
    const { user, newRefreshRaw } = rotated;
    const token = await reply.jwtSign(
      {
        sub: user.id,
        orgId: user.organizationId,
        email: user.email,
        role: user.role,
      },
      jwtSignOpts,
    );
    return reply.send({
      token,
      refreshToken: newRefreshRaw,
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      user: { id: user.id, email: user.email, role: user.role },
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    const parsed = refreshBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
    }
    await revokeRefreshToken(parsed.data.refreshToken);
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: [requireJwt] }, async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: sub },
      include: { organization: true },
    });
    if (!user) {
      return reply.code(401).send({ error: "USER_NOT_FOUND" });
    }
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        timezone: user.organization.timezone,
        sessionPriceCents: user.organization.sessionPriceCents,
      },
    });
  });
};
