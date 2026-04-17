import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { htmlPage } from "../lib/publicHtml.js";
import { hashActionToken } from "../services/actions/tokenCrypto.js";

export const publicRebookRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { token: string } }>("/public/rebook/:token", async (request, reply) => {
    const raw = request.params.token;
    const tokenHash = hashActionToken(raw);

    const offer = await prisma.rebookingOffer.findUnique({
      where: { tokenHash },
      include: {
        freeSlot: true,
        waitlistEntry: { include: { patient: true } },
      },
    });

    if (!offer || !offer.tokenHash) {
      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send(htmlPage({ title: "Lien invalide", message: "Ce lien de réservation n’existe pas.", ok: false }));
    }

    if (offer.claimedAt) {
      return reply
        .type("text/html; charset=utf-8")
        .send(
          htmlPage({
            title: "C’est noté",
            message: "Ce créneau vous a déjà été attribué. Pensez à vérifier vos emails pour la suite.",
            ok: true,
          }),
        );
    }

    if (offer.expiresAt && offer.expiresAt < new Date()) {
      return reply
        .code(410)
        .type("text/html; charset=utf-8")
        .send(htmlPage({ title: "Lien expiré", message: "Ce lien n’est plus valide.", ok: false }));
    }

    const slot = offer.freeSlot;
    if (slot.filledAt) {
      return reply
        .type("text/html; charset=utf-8")
        .send(
          htmlPage({
            title: "Créneau déjà pris",
            message: "Quelqu’un d’autre a réservé ce créneau avant vous. Nous vous recontacterons si une nouvelle place se libère.",
            ok: false,
          }),
        );
    }

    const patient = offer.waitlistEntry.patient;
    if (!patient?.id) {
      return reply
        .code(400)
        .type("text/html; charset=utf-8")
        .send(htmlPage({ title: "Erreur", message: "Patient introuvable pour cette offre.", ok: false }));
    }

    try {
      await prisma.$transaction(async (tx) => {
        const lock = await tx.freeSlot.updateMany({
          where: { id: slot.id, filledAt: null },
          data: { filledAt: new Date() },
        });
        if (lock.count !== 1) {
          throw new Error("RACE_LOST");
        }

        if (slot.sourceAppointmentId) {
          const src = await tx.appointment.findUnique({ where: { id: slot.sourceAppointmentId } });
          if (src && !["CANCELLED", "NO_SHOW"].includes(src.status)) {
            await tx.appointment.update({
              where: { id: src.id },
              data: {
                status: "CANCELLED",
                cancelledAt: new Date(),
                cancellationReason: "REBOOK_FILLED",
              },
            });
          }
        }

        const title =
          patient.name?.trim() ? `Rendez-vous — ${patient.name.trim()}` : "Rendez-vous (liste d’attente)";

        await tx.appointment.create({
          data: {
            organizationId: slot.organizationId,
            patientId: patient.id,
            title,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            status: "PENDING",
            source: "MANUAL",
          },
        });

        await tx.rebookingOffer.update({
          where: { id: offer.id },
          data: { claimedAt: new Date() },
        });

        await tx.waitlistEntry.update({
          where: { id: offer.waitlistEntryId },
          data: { active: false },
        });
      });
    } catch (e) {
      if (e instanceof Error && e.message === "RACE_LOST") {
        return reply
          .type("text/html; charset=utf-8")
          .send(
            htmlPage({
              title: "Créneau déjà pris",
              message: "Un autre patient a réservé ce créneau une seconde avant vous.",
              ok: false,
            }),
          );
      }
      throw e;
    }

    return reply
      .type("text/html; charset=utf-8")
      .send(
        htmlPage({
          title: "Réservation confirmée",
          message: "Le créneau est à vous. Vous recevrez un rappel pour le confirmer.",
          ok: true,
        }),
      );
  });
};
