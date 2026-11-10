import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Charge le .env local UNIQUEMENT hors production : en production (Vercel),
// les variables viennent de la plateforme et un éventuel fichier .env
// uploadé par erreur ne doit jamais être lu (défense en profondeur,
// complémentaire au .vercelignore qui l'exclut de l'upload).
if (process.env.NODE_ENV !== 'production') {
  loadDotenv();
}

const DEV_JWT_SECRET = 'dev-only-finiko-access-secret-change-me-32';
const DEV_OTP_PEPPER = 'dev-only-otp-pepper-change-me';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SERVICE_VERSION: z.string().default('2.0.0-alpha.0'),
    MONGODB_URI: z
      .string()
      .min(1)
      .default('mongodb://localhost:27017/finiko?replicaSet=rs0&directConnection=true'),
    CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),

    /** Secret de signature des access tokens. En production, fournir un secret >= 32 caractères. */
    JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(24 * 3600)
      .default(900),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    /** Poivre HMAC des codes OTP. Les codes ne sont jamais stockés en clair. */
    OTP_PEPPER: z.string().min(16).default(DEV_OTP_PEPPER),
    OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(3600).default(60),
    OTP_EXPOSE_CODE: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) =>
        value === undefined ? process.env.NODE_ENV !== 'production' : value === 'true',
      ),

    /** Fournisseur de SMS. `console` écrit le code dans les logs de dev uniquement. */
    SMS_PROVIDER: z.enum(['console', 'noop']).default('console'),

    ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).max(1_048_576).default(19_456),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).max(10).default(2),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(8).default(1),

    /** Durée de vie d'une réservation de quota avant libération par le job. */
    QUOTA_RESERVATION_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(20),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (value.JWT_ACCESS_SECRET === DEV_JWT_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'Secret JWT de développement interdit en production',
      });
    }

    if (value.OTP_PEPPER === DEV_OTP_PEPPER) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_PEPPER'],
        message: 'Poivre OTP de développement interdit en production',
      });
    }

    if (value.OTP_EXPOSE_CODE) {
      ctx.addIssue({
        code: 'custom',
        path: ['OTP_EXPOSE_CODE'],
        message: 'OTP_EXPOSE_CODE doit être false en production',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables d'environnement invalides :");
  for (const issue of parsed.error.issues) {
    console.error(`- ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
