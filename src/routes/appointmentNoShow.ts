import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { markAppointmentNoShowAndReleaseSlot } from "../services/rebooking/markNoShowAndReleaseSlot.js";

const uuid = z.string().uuid();

export const appointmentNoShowRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { organizationId: string; appointmentId: string } }>(
    "/organizations/:organizationId/appointments/:appointmentId/no-show",
    async (request, reply) => {
      const orgId = uuid.safeParse(request.params.organizationId);
      const aptId = uuid.safeParse(request.params.appointmentId);
      if (!orgId.success || !aptId.success) {
        return reply.code(400).send({ error: "INVALID_ID" });
      }

      const result = await markAppointmentNoShowAndReleaseSlot({
        organizationId: orgId.data,
        appointmentId: aptId.data,
      });

      if (!result.ok) {
        const code =
          result.error === "NOT_FOUND"
            ? 404
            : result.error === "FORBIDDEN_ORG"
              ? 403
              : 409;
        return reply.code(code).send({ error: result.error });
      }

      return reply.send({
        freeSlotId: result.freeSlotId,
        message:
          "Rendez-vous marqué comme non honoré ; le créneau est proposé à la liste d’attente (e-mail rebook si Resend est configuré).",
      });
    },
  );
};
