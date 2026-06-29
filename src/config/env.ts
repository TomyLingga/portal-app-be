import 'dotenv/config'
import { z } from 'zod'

// ─── Schema validasi env ──────────────────────────────────────────────────────
const envSchema = z.object({
  // Database
  DB_HOST:     z.string().default('localhost'),
  DB_PORT:     z.string().default('5432'),
  DB_NAME:     z.string().default('inl_portal'),
  DB_USER:     z.string().default('postgres'),
  DB_PASSWORD: z.string().default(''),

  // App
  PORT:         z.string().default('3000'),
  HOST:         z.string().default('0.0.0.0'),
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:3002'),

  // JWT
  JWT_SECRET:     z.string().min(32, 'JWT_SECRET harus minimal 32 karakter'),
  JWT_EXPIRES_IN: z.string().default('15m'),

  // Refresh Token
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // SSO
  SSO_TOKEN_EXPIRES_IN: z.string().default('5m'),

  // Upload
  UPLOAD_DIR: z.string().default('uploads'),
  UPLOAD_URL: z.string().url().default('http://localhost:3000/uploads'),

  // Seed
  SEED_ADMIN_EMAIL:    z.string().email().default('admin@inl.co.id'),
  SEED_ADMIN_PASSWORD: z.string().min(6).default('Admin@123'),

  // WebAuthn / Passkey
  WEBAUTHN_RP_ID:            z.string().default('localhost'),
  WEBAUTHN_RP_NAME:          z.string().default('PT Industri Nabati Lestari'),
  WEBAUTHN_EXPECTED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3052'),

  // Mail
  MAIL_MAILER:       z.string().default('smtp'),
  MAIL_HOST:         z.string().default('sandbox.smtp.mailtrap.io'),
  MAIL_PORT:         z.string().default('2525'),
  MAIL_USERNAME:     z.string().default(''),
  MAIL_PASSWORD:     z.string().default(''),
  MAIL_ENCRYPTION:   z.string().default('tls'),
  MAIL_FROM_ADDRESS: z.string().email().default('info@inl.co.id'),
  MAIL_FROM_NAME:    z.string().default('Portal INL'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌  Invalid environment variables:')
  parsed.error.issues.forEach(issue => {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`)
  })
  process.exit(1)
}

const env = parsed.data

export const config = {
  db: {
    host:     env.DB_HOST,
    port:     Number(env.DB_PORT),
    name:     env.DB_NAME,
    user:     env.DB_USER,
    password: env.DB_PASSWORD,
  },
  app: {
    port:        Number(env.PORT),
    host:        env.HOST,
    nodeEnv:     env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL,
  },
  jwt: {
    secret:    env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  refreshToken: {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  },
  sso: {
    tokenExpiresIn: env.SSO_TOKEN_EXPIRES_IN,
  },
  upload: {
    dir: env.UPLOAD_DIR,
    url: env.UPLOAD_URL,
  },
  seed: {
    adminEmail:    env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
  },
  webauthn: {
    rpId:            env.WEBAUTHN_RP_ID,
    rpName:          env.WEBAUTHN_RP_NAME,
    expectedOrigins: env.WEBAUTHN_EXPECTED_ORIGINS.split(',').map(o => o.trim()),
  },
  mail: {
    host:        env.MAIL_HOST,
    port:        Number(env.MAIL_PORT),
    encryption:  env.MAIL_ENCRYPTION,
    username:    env.MAIL_USERNAME,
    password:    env.MAIL_PASSWORD,
    fromAddress: env.MAIL_FROM_ADDRESS,
    fromName:    env.MAIL_FROM_NAME,
  },
} as const

