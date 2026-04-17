import { Resend } from "resend";
import { env } from "../../config.js";

export async function sendHtmlEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY_MANQUANTE");
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) {
    throw new Error(error.message);
  }
}
