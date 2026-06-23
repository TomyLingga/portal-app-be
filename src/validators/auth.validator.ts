// ─── Validators: Auth ─────────────────────────────────────────────────────────
import { z } from 'zod'

export const loginSchema = z.object({
  email:    z.string().email('Email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

export type LoginInput = z.infer<typeof loginSchema>

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token wajib diisi'),
})

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>

