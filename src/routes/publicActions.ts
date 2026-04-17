import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { htmlPage } from "../lib/publicHtml.js";
import { loadActionToken } from "../services/actions/consumeToken.js";
import { notifyWaitlistForFreeSlot } from "../services/rebooking/notifyWaitlist.js";
import { revokeUnfilledFreeSlotsForAppointment } from "../services/rebooking/revokePreventiveFreeSlots.js";

export const publicActionRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { token: string }; Querystring: { reason?: string } }>(
    "/public/confirm/:token",
    async (request, reply) => {
      const raw = request.params.token;
      const row = await loadActionToken(raw, "CONFIRM");
      if (!row) {
        return reply
          .code(404)
          .type("text/html; charset=utf-8")
          .send(htmlPage({ title: "Lien invalide", message: "Ce lien de confirmation n’existe pas.", ok: false }));
      }
      if (row.usedAt) {
        return reply
          .code(410)
          .type("text/html; charset=utf-8")
          .send(htmlPage({ title: "Lien déjà utilisé", message: "Ce lien a déjà été utilisé.", ok: false }));
      }
      if (row.expiresAt < new Date()) {
        return reply
          .code(410)
          .type("text/html; charset=utf-8")
          .send(htmlPage({ title: "Lien expiré", message: "Ce lien n’est plus valide.", ok: false }));
      }

      const apt = row.appointment;
      if (apt.status !== "PENDING" && apt.status !== "AT_RISK" && apt.status !== "NO_SHOW_PROBABLE") {
        return reply
          .type("text/html; charset=utf-8")
          .send(
            htmlPage({
              title: "Déjà traité",
              message: "Ce rendez-vous ne peut plus être confirmé via ce lien.",
              ok: false,
            }),
          );
      }

      await prisma.$transaction(async (tx) => {
        await revokeUnfilledFreeSlotsForAppointment(tx, apt.id);
        await tx.appointment.update({
          where: { id: apt.id },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            confirmationScore: Math.min(100, (apt.confirmationScore ?? 0) + 50),
          },
        });
        await tx.actionToken.update({
          where: { id: row.id },
          data: { usedAt: new Date() },
        });
        await tx.actionToken.deleteMany({
          where: { appointmentId: apt.id, id: { not: row.id } },
        });
      });

      return reply
        .type("text/html; charset=utf-8")
        .send(
          htmlPage({
            title: "Merci !",
            message: "Votre rendez-vous est confirmé. À bientôt.",
            ok: true,
          }),
        );
    },
  );

  app.get<{ Params: { token: string }; Querystring: { reason?: string } }>(
    "/public/cancel/:token",
    async (request, reply) => {
      const raw = request.params.token;
      const reason = request.query.reason?.trim() || null;
      const row = await loadActionToken(raw, "CANCEL");
      if (!row) {
        return reply
          .code(404)
          .type("text/html; charset=utf-8")
          .send(htmlPage({ title: "Lien invalide", message: "Ce lien d’annulation n’existe pas.", ok: false }));
      }
      if (row.usedAt) {
        return reply
          .code(410)
          .type("text/html; charset=utf-8")
          .send(htmlPage({ title: "Lien déjà utilisé", message: "Ce lien a déjà été utilisé.", ok: false }));
      }
      if (row.expiresAt < new Date()) {
        return reply
          .code(410)
          .type("text/html; charset=utf-8")
          .send(htmlPage({ title: "Lien expiré", message: "Ce lien n’est plus valide.", ok: false }));
      }

      const apt = row.appointment;
      if (apt.status === "CANCELLED") {
        return reply
          .type("text/html; charset=utf-8")
          .send(htmlPage({ title: "Déjà annulé", message: "Ce rendez-vous est déjà annulé.", ok: false }));
      }
      if (apt.status !== "PENDING" && apt.status !== "AT_RISK" && apt.status !== "NO_SHOW_PROBABLE") {
        return reply
          .type("text/html; charset=utf-8")
          .send(
            htmlPage({
              title: "Action impossible",
              message: "Ce rendez-vous ne peut plus être annulé via ce lien.",
              ok: false,
            }),
          );
      }

      const freeSlotId = await prisma.$transaction(async (tx) => {
        await tx.appointment.update({
          where: { id: apt.id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancellationReason: reason,
          },
        });
        await tx.actionToken.update({
          where: { id: row.id },
          data: { usedAt: new Date() },
        });
        await tx.actionToken.deleteMany({
          where: { appointmentId: apt.id, id: { not: row.id } },
        });

        const existing = await tx.freeSlot.findFirst({
          where: { sourceAppointmentId: apt.id },
        });
        if (existing) return existing.id;
        const created = await tx.freeSlot.create({
          data: {
            organizationId: apt.organizationId,
            sourceAppointmentId: apt.id,
            startsAt: apt.startsAt,
            endsAt: apt.endsAt,
          },
        });
        return created.id;
      });

      notifyWaitlistForFreeSlot(freeSlotId).catch((err) => {
        request.log.error({ err }, "notifyWaitlistForFreeSlot");
      });

      return reply
        .type("text/html; charset=utf-8")
        .send(
          htmlPage({
            title: "Annulation enregistrée",
            message: "Le créneau a été libéré. Merci d’avoir prévenu à l’avance.",
            ok: true,
          }),
        );
    },
  );
};
