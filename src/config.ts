import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  /// Chaîne Prisma PostgreSQL (éviter `.url()` : mots de passe avec caractères spéciaux)
  DATABASE_URL: z.string().min(1),
  /// URL publique de l’API (liens Confirmer / Annuler), sans slash final
  PUBLIC_APP_URL: z.string().min(1).default("http://localhost:3000"),
  /// Expéditeur Resend (domaine vérifié en prod), ex. Calend'Air <rdv@votredomaine.com>
  EMAIL_FROM: z.string().min(1).default("Calend'Air <onboarding@resend.dev>"),
  /// Si absent, les envois sont ignorés (logs seulement) — pratique en dev sans Resend
  RESEND_API_KEY: z.string().optional(),
  /// Optionnel : protège POST /api/internal/run-reminders
  CRON_SECRET: z.string().optional(),
  /// Heure locale (fuseau Organization) d’envoi du rapport quotidien
  DAILY_REPORT_LOCAL_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  /// Heure locale d’envoi de l’e-mail « importez le planning de demain » (anti-doublon par jour)
  PLANNING_IMPORT_EMAIL_LOCAL_HOUR: z.coerce.number().int().min(0).max(23).default(18),
  /// Secret JWT (≥16 caractères ; en production utilisez une valeur longue et aléatoire)
  JWT_SECRET: z.string().min(16).default("calendair-dev-jwt-secret-change-in-prod"),
  /// Durée de vie du JWT d’accès (ex. 15m, 1h) — le refresh permet de renouveler sans se reconnecter
  JWT_ACCESS_EXPIRES: z.string().min(1).default("15m"),
  /// Durée de vie du refresh token (rotation à chaque POST /auth/refresh)
  JWT_REFRESH_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /// Optionnel : structuration des RDV après OCR (import image) via OpenAI
  OPENAI_API_KEY: z.string().optional(),
  /// Optionnel : webhook POST (WhatsApp / vocal) — JSON { channel, phone, message, appointmentId }
  REMINDER_WEBHOOK_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
