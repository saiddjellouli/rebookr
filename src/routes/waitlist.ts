import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { syncPoolFromWaitlist } from "../services/pool/patientPool.js";

const orgIdSchema = z.string().uuid();

const bodySchema = z
  .object({
    patientId: z.string().uuid().optional(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    serviceType: z.string().optional(),
    priority: z.coerce.number().int().default(0),
  })
  .refine((b) => b.patientId != null || (b.email != null && b.name != null), {
    message: "Fournir patientId ou bien name + email",
  });

export const waitlistRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { organizationId: string }; Body: z.infer<typeof bodySchema> }>(
    "/organizations/:organizationId/waitlist",
    async (request, reply) => {
      const orgId = orgIdSchema.safeParse(request.params.organizationId);
      if (!orgId.success) {
        return reply.code(400).send({ error: "INVALID_ORGANIZATION_ID" });
      }

      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "INVALID_BODY", details: parsed.error.flatten() });
      }
      const body = parsed.data;

      const org = await prisma.organization.findUnique({ where: { id: orgId.data } });
      if (!org) {
        return reply.code(404).send({ error: "ORG_NOT_FOUND" });
      }

      let patientId = body.patientId ?? null;
      if (!patientId) {
        const created = await prisma.patient.create({
          data: {
            organizationId: org.id,
            name: body.name!,
            email: body.email!,
            phone: body.phone?.trim() || null,
          },
        });
        patientId = created.id;
      } else {
        const patient = await prisma.patient.findFirst({
          where: { id: patientId, organizationId: org.id },
        });
        if (!patient) {
          return reply.code(400).send({ error: "PATIENT_NOT_IN_ORG" });
        }
      }

      const entry = await prisma.waitlistEntry.create({
        data: {
          organizationId: org.id,
          patientId,
          serviceType: body.serviceType?.trim() || null,
          priority: body.priority,
          active: true,
        },
      });

      await syncPoolFromWaitlist({ organizationId: org.id, patientId, active: true });

      return reply.code(201).send({ id: entry.id, patientId });
    },
  );
};
