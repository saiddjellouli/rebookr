import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireOwner } from "../auth/preHandlers.js";
import { prisma } from "../lib/prisma.js";

const orgIdSchema = z.string().uuid();

const createStaffBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const orgUsersRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/users",
    { preHandler: [requireOwner] },
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) {
        return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });
      }

      const users = await prisma.user.findMany({
        where: { organizationId: orgId.data },
        select: { id: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      return reply.send({ users });
    },
  );

  app.post<{ Params: { organizationId: string } }>(
    "/organizations/:organizationId/users",
    { preHandler: [requireOwner] },
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) {
        return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });
      }

      const parsed = createStaffBody.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }
      const email = parsed.data.email.trim().toLowerCase();
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);

      try {
        const user = await prisma.user.create({
          data: {
            organizationId: orgId.data,
            email,
            passwordHash,
            role: "STAFF",
          },
          select: { id: true, email: true, role: true, createdAt: true },
        });
        return reply.code(201).send({ user });
      } catch (e: unknown) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          (e as { code: string }).code === "P2002"
        ) {
          return reply.code(409).send({ error: "EMAIL_TAKEN" });
        }
        throw e;
      }
    },
  );

  app.delete<{ Params: { organizationId: string; userId: string } }>(
    "/organizations/:organizationId/users/:userId",
    { preHandler: [requireOwner] },
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      const userId = z.string().uuid().safeParse(request.params.userId);
      if (!orgId.success || !userId.success) {
        return reply.code(400).send({ error: "INVALID_ID" });
      }

      const actor = request.user as { sub?: string };
      if (actor.sub === userId.data) {
        return reply.code(400).send({ error: "CANNOT_DELETE_SELF" });
      }

      const target = await prisma.user.findFirst({
        where: { id: userId.data, organizationId: orgId.data },
      });
      if (!target) {
        return reply.code(404).send({ error: "USER_NOT_FOUND" });
      }
      if (target.role !== "STAFF") {
        return reply.code(400).send({ error: "CANNOT_DELETE_OWNER" });
      }

      await prisma.user.delete({ where: { id: userId.data } });
      return reply.code(204).send();
    },
  );
};
