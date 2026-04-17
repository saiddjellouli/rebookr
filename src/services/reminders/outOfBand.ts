import { env } from "../../config.js";

/**
 * Stubs multi-canal (WhatsApp / appel) — brancher Twilio, Meta, etc. via env.
 * Sans configuration : log uniquement (ne bloque pas le flux e-mail).
 */
export async function sendOutOfBandReminder(params: {
  channel: "whatsapp" | "voice";
  phone: string | null;
  message: string;
  appointmentId: string;
}): Promise<void> {
  const webhook = env.REMINDER_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: params.channel,
          phone: params.phone,
          message: params.message,
          appointmentId: params.appointmentId,
        }),
      });
    } catch {
      /* webhook optionnel */
    }
  }
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[Calend'Air] out-of-band ${params.channel} (stub) appt=${params.appointmentId} phone=${params.phone ?? "—"}`,
    );
  }
}
