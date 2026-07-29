import { eq } from 'drizzle-orm'
import { db } from '../db'
import { activityLog, portalBranding } from '../db/schema'
import type { PortalBrandingInput } from '../validators/portal-branding.validator'

const PORTAL_BRANDING_ID = 'primary'

export const DEFAULT_PORTAL_BRANDING: PortalBrandingInput = {
  portalName: 'InTes (Integrated Enterprise System)',
  adminPanelName: 'InTes Admin Panel',
  adminHeroTitle: 'Pusat Administrasi Portal SSO PT INL',
  adminHeroDescription:
    'Kelola seluruh aspek sistem portal dari satu pusat kontrol yang terintegrasi dan aman. Memastikan operasional aplikasi PT Industri Nabati Lestari (KEK Sei Mangkei) berjalan lancar.',
}

export async function getPortalBrandingService(): Promise<PortalBrandingInput> {
  const [stored] = await db
    .select({
      portalName: portalBranding.portalName,
      adminPanelName: portalBranding.adminPanelName,
      adminHeroTitle: portalBranding.adminHeroTitle,
      adminHeroDescription: portalBranding.adminHeroDescription,
    })
    .from(portalBranding)
    .where(eq(portalBranding.id, PORTAL_BRANDING_ID))
    .limit(1)

  return stored ?? DEFAULT_PORTAL_BRANDING
}

async function persistPortalBranding(
  input: PortalBrandingInput,
  userId: string,
): Promise<PortalBrandingInput> {
  const [stored] = await db
    .insert(portalBranding)
    .values({
      id: PORTAL_BRANDING_ID,
      ...input,
      updatedBy: userId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: portalBranding.id,
      set: {
        ...input,
        updatedBy: userId,
        updatedAt: new Date(),
      },
    })
    .returning({
      portalName: portalBranding.portalName,
      adminPanelName: portalBranding.adminPanelName,
      adminHeroTitle: portalBranding.adminHeroTitle,
      adminHeroDescription: portalBranding.adminHeroDescription,
    })

  return stored
}

export async function updatePortalBrandingService(
  input: PortalBrandingInput,
  userId: string,
): Promise<PortalBrandingInput> {
  const stored = await persistPortalBranding(input, userId)

  await db.insert(activityLog).values({
    userId,
    action: 'update_portal_branding',
    details: 'Memperbarui identitas dan penamaan Portal SSO.',
  })

  return stored
}

export async function restorePortalBrandingService(userId: string): Promise<PortalBrandingInput> {
  const stored = await persistPortalBranding(DEFAULT_PORTAL_BRANDING, userId)

  await db.insert(activityLog).values({
    userId,
    action: 'restore_portal_branding',
    details: 'Mengembalikan identitas dan penamaan Portal SSO ke nilai default.',
  })

  return stored
}
