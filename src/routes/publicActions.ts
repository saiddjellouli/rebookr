import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { htmlPage } from "../lib/publicHtml.js";
import { env } from "../config.js";
import { loadActionToken } from "../services/actions/consumeToken.js";
import { confirmAppointmentFromPatient, cancelAppointmentFromPatient } from "../services/appointments/patientSelfService.js";
import { refreshPoolHasFutureAppointment, setPoolHotPriority, setPoolWantsEarlierSlot } from "../services/pool/patientPool.js";
import { createPoolInviteToken, loadPoolInviteToken } from "../services/pool/poolInvites.js";
import { buildWantsEarlierFollowupEmail } from "../services/email/poolInviteTemplate.js";
import { sendHtmlEmail } from "../services/email/sendViaResend.js";

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

      const confirmed = await confirmAppointmentFromPatient({
        appointmentId: apt.id,
        organizationId: apt.organizationId,
        planningMeta: { lastUpdateSource: "PATIENT_LINK", incrementConfirmationSignal: true },
      });
      if (!confirmed.ok) {
        return reply
          .type("text/html; charset=utf-8")
          .send(
            htmlPage({
              title: "Action impossible",
              message: "La confirmation n’a pas pu être enregistrée.",
              ok: false,
            }),
          );
      }

      let extraBodyHtml: string | undefined;
      if (apt.patientId && apt.patient?.email?.trim()) {
        const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
        const rawInvite = await createPoolInviteToken({
          organizationId: apt.organizationId,
          patientId: apt.patientId,
          purpose: "WANTS_EARLIER_SLOT",
          expiresAt,
          relatedAppointmentId: apt.id,
        });
        const base = env.PUBLIC_APP_URL.replace(/\/$/, "");
        const wantsUrl = `${base}/api/public/pool/invite/${encodeURIComponent(rawInvite)}`;
        extraBodyHtml = `<div style="margin:24px 0 0;padding-top:20px;border-top:1px solid #E5E7EB;text-align:left;">
          <p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.5;">Souhaitez-vous être informé·e si un <strong>créneau plus tôt</strong> se libère ? (Sans engagement — vous rejoignez le pool du cabinet.)</p>
          <a href="${wantsUrl}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Oui, tenir compte de mon intérêt</a>
        </div>`;

        // Envoi e-mail en parallèle (durable) — même lien que le bouton inline, pour que le
        // patient puisse rejoindre le pool même après avoir fermé la page.
        const orgRow = await prisma.organization.findUnique({
          where: { id: apt.organizationId },
          select: { name: true },
        });
        if (orgRow) {
          const { subject, html } = buildWantsEarlierFollowupEmail({
            organizationName: orgRow.name,
            patientName: apt.patient.name,
            wantsEarlierUrl: wantsUrl,
          });
          sendHtmlEmail({ to: apt.patient.email.trim(), subject, html }).catch((err) => {
            console.error("[publicActions/confirm] wants-earlier follow-up email", err);
          });
        }
      }

      return reply
        .type("text/html; charset=utf-8")
        .send(
          htmlPage({
            title: "Merci !",
            message: "Votre rendez-vous est confirmé. À bientôt.",
            ok: true,
            extraBodyHtml,
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
      if (
        apt.status !== "PENDING" &&
        apt.status !== "CONFIRMED" &&
        apt.status !== "AT_RISK" &&
        apt.status !== "NO_SHOW_PROBABLE"
      ) {
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

      const cancelled = await cancelAppointmentFromPatient({
        appointmentId: apt.id,
        organizationId: apt.organizationId,
        cancellationReason: reason,
        planningMeta: { lastUpdateSource: "PATIENT_LINK", incrementConfirmationSignal: false },
      });
      if (!cancelled.ok) {
        return reply
          .type("text/html; charset=utf-8")
          .send(
            htmlPage({
              title: "Action impossible",
              message: "L’annulation n’a pas pu être enregistrée.",
              ok: false,
            }),
          );
      }

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

  app.get<{ Params: { token: string } }>("/public/pool/invite/:token", async (request, reply) => {
    const raw = request.params.token;
    const row = await loadPoolInviteToken(raw);
    if (!row) {
      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send(htmlPage({ title: "Lien invalide", message: "Ce lien n’existe pas ou a expiré.", ok: false }));
    }
    if (row.usedAt) {
      return reply
        .code(410)
        .type("text/html; charset=utf-8")
        .send(htmlPage({ title: "Lien déjà utilisé", message: "Cette action a déjà été enregistrée.", ok: false }));
    }
    if (row.expiresAt < new Date()) {
      return reply
        .code(410)
        .type("text/html; charset=utf-8")
        .send(htmlPage({ title: "Lien expiré", message: "Ce lien n’est plus valide.", ok: false }));
    }

    if (row.purpose === "WANTS_EARLIER_SLOT") {
      await setPoolWantsEarlierSlot({ organizationId: row.organizationId, patientId: row.patientId });
      await prisma.poolInviteToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      await refreshPoolHasFutureAppointment(row.patientId, row.organizationId);
      return reply
        .type("text/html; charset=utf-8")
        .send(
          htmlPage({
            title: "C’est noté",
            message:
              "Nous avons enregistré votre intérêt pour un créneau plus tôt. Vous ferez partie du pool du cabinet pour les propositions.",
            ok: true,
          }),
        );
    }

    if (row.purpose === "HOT_PRIORITY") {
      await setPoolHotPriority({
        organizationId: row.organizationId,
        patientId: row.patientId,
        hotTtlHours: env.POOL_HOT_TTL_HOURS,
      });
      await prisma.poolInviteToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
      return reply
        .type("text/html; charset=utf-8")
        .send(
          htmlPage({
            title: "Merci !",
            message:
              "Vous serez prioritaire si un créneau se libère pendant la période indiquée par le cabinet. Ce lien ne peut être utilisé qu’une fois.",
            ok: true,
          }),
        );
    }

    return reply
      .code(400)
      .type("text/html; charset=utf-8")
      .send(htmlPage({ title: "Lien incorrect", message: "Type d’invitation non reconnu.", ok: false }));
  });
};
