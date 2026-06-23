// ─── Validators: User ─────────────────────────────────────────────────────────
import { z } from 'zod'

const passwordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .regex(/[A-Z]/, 'Password harus mengandung huruf kapital')
  .regex(/[0-9]/, 'Password harus mengandung angka')

export const createUserSchema = z.object({
  email:      z.string().email('Email tidak valid'),
  password:   passwordSchema,
  role:       z.enum(['user', 'super_admin']).default('user'),
  isActive:   z.boolean().default(true),
  employeeId: z.string().uuid('employeeId tidak valid').optional().nullable(),
})

export const updateUserSchema = z.object({
  email:      z.string().email('Email tidak valid').optional(),
  password:   passwordSchema.optional(),
  role:       z.enum(['user', 'super_admin']).optional(),
  isActive:   z.boolean().optional(),
  employeeId: z.string().uuid('employeeId tidak valid').optional().nullable(),
})

export const grantAppSchema = z.object({
  appId: z.string().uuid('appId tidak valid'),
})

export const listUserQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().optional(),
  role:   z.enum(['user', 'super_admin']).optional(),
})

export type CreateUserInput  = z.infer<typeof createUserSchema>
export type UpdateUserInput  = z.infer<typeof updateUserSchema>
export type GrantAppInput    = z.infer<typeof grantAppSchema>
export type ListUserQuery    = z.infer<typeof listUserQuerySchema>
