import { z } from 'zod';

const envSchema = z.object({
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),
  COGNITO_USER_POOL_ID: z.string().min(1, 'COGNITO_USER_POOL_ID is required'),
  COGNITO_CLIENT_ID: z.string().min(1, 'COGNITO_CLIENT_ID is required'),
  COGNITO_CLIENT_SECRET: z.string().min(1, 'COGNITO_CLIENT_SECRET is required'),
  API_ENDPOINT: z.string().url('API_ENDPOINT must be a valid URL'),
  AWS_REGION: z.string().default('us-east-1'),
  COGNITO_DOMAIN_PREFIX: z.string().optional(),
  COGNITO_OAUTH_DOMAIN: z.string().optional(),
  AUTH_URL: z.string().optional(),
  COGNITO_REGION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

export function env(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const formatted = result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Missing or invalid environment variables:\n${formatted}`);
    }
    _env = result.data;
  }
  return _env;
}
