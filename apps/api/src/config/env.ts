import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_VERSION: z.string().default('2.0.0-alpha.0'),
  MONGODB_URI: z
    .string()
    .min(1)
    .default('mongodb://localhost:27017/finiko?replicaSet=rs0&directConnection=true'),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
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
