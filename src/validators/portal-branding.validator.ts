import { z } from 'zod'

const requiredText = (label: string, max: number) =>
  z.string()
    .trim()
    .min(1, `${label} wajib diisi.`)
    .max(max, `${label} maksimal ${max} karakter.`)

export const updatePortalBrandingSchema = z.object({
  portalName: requiredText('Nama portal', 120),
  adminPanelName: requiredText('Nama Admin Panel', 100),
  adminHeroTitle: requiredText('Judul halaman admin', 160),
  adminHeroDescription: requiredText('Deskripsi halaman admin', 700),
}).strict()

export type PortalBrandingInput = z.infer<typeof updatePortalBrandingSchema>
