import { z } from 'zod';

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required').default('postgresql://jobhunt:jobhunt_dev_pwd@localhost:5432/jobhunt_os'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required').default('redis://localhost:6379/0'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long').default('dev-jwt-secret-replace-in-production-min-32-chars'),
  GEMINI_API_KEY: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export interface EnvValidationResult {
  success: boolean;
  data?: AppEnv;
  errors?: Record<string, string[]>;
}

/**
 * Validates provided environment or process.env against the strict JobHunt OS schema.
 */
export function validateEnv(rawEnv: Record<string, string | undefined> = process.env): EnvValidationResult {
  const result = EnvSchema.safeParse(rawEnv);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    return {
      success: false,
      errors: formatted,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

/**
 * Safe accessor that validates and returns environment, throwing a clear error if critical config is missing.
 */
export function getEnv(rawEnv: Record<string, string | undefined> = process.env): AppEnv {
  const validation = validateEnv(rawEnv);
  if (!validation.success || !validation.data) {
    const errorDetails = JSON.stringify(validation.errors, null, 2);
    throw new Error(`[JobHunt OS] Invalid environment configuration:\n${errorDetails}`);
  }
  return validation.data;
}
