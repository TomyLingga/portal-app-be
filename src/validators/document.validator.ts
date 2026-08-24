import { z } from 'zod'

export const documentAccessTypes = ['view', 'edit', 'approve'] as const
export const documentAuditActions = [
  'view',
  'download_request',
  'download_approved',
  'download_rejected',
  'downloaded',
  'uploaded',
  'edited',
  'deleted',
] as const

export const createDocumentCategorySchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/, 'Kode hanya boleh berisi huruf kapital, angka, underscore, atau strip'),
  defaultConfidentialityLevel: z.coerce.number().int().min(1).max(4).optional().default(1),
  autoApproveGradeLevel: z.coerce.number().int().positive().nullable().optional(),
})

export const updateDocumentCategorySchema = createDocumentCategorySchema.partial()

export const createDocumentSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(5000).nullable().optional(),
  ownerUnitId: z.string().uuid().nullable().optional(),
  targetUnitIds: z.array(z.string().uuid()).optional(),
  includeDescendants: z.coerce.boolean().optional().default(true),
  fileSize: z.coerce.number().int().positive(),
  mimeType: z.string().trim().min(1).max(150),
})

export const updateDocumentSchema = z.object({
  categoryId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(300).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  ownerUnitId: z.string().uuid().nullable().optional(),
  targetUnitIds: z.array(z.string().uuid()).optional(),
  includeDescendants: z.coerce.boolean().optional().default(true),
})

export const createAccessRuleSchema = z.object({
  documentId: z.string().uuid().nullable().optional(),
  documentCategoryId: z.string().uuid().nullable().optional(),
  unitOrganisasiId: z.string().uuid().nullable().optional(),
  includeDescendants: z.coerce.boolean().default(true),
  minGradeLevel: z.coerce.number().int().positive().nullable().optional(),
  accessType: z.enum(documentAccessTypes),
}).refine(data => Boolean(data.documentId || data.documentCategoryId), {
  message: 'Dokumen atau kategori dokumen wajib dipilih',
  path: ['documentId'],
})

export const updateAccessRuleSchema = createAccessRuleSchema

export const createDocumentApproverSchema = z.object({
  documentCategoryId: z.string().uuid().nullable().optional(),
  unitOrganisasiId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid(),
  approvalOrder: z.coerce.number().int().min(1).default(1),
}).refine(data => Boolean(data.documentCategoryId || data.unitOrganisasiId), {
  message: 'Kategori dokumen atau unit organisasi wajib dipilih',
  path: ['documentCategoryId'],
})

export const downloadRequestSchema = z.object({
  reason: z.string().trim().max(2000).nullable().optional(),
})

export const approveRejectRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().trim().max(2000).nullable().optional(),
  validityDays: z.coerce.number().int().min(1).max(365).optional(),
}).superRefine((data, ctx) => {
  if (data.action === 'reject' && !data.rejectionReason) {
    ctx.addIssue({
      code: 'custom',
      path: ['rejectionReason'],
      message: 'Alasan penolakan wajib diisi',
    })
  }
})

export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  ownerUnitId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
  scope: z.enum(['accessible', 'manage', 'mine']).default('accessible'),
})

export const documentTreeQuerySchema = listDocumentsQuerySchema.pick({
  search: true,
  categoryId: true,
  isActive: true,
  scope: true,
})

export const listAccessRulesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  documentId: z.string().uuid().optional(),
  documentCategoryId: z.string().uuid().optional(),
  accessType: z.enum(documentAccessTypes).optional(),
})

export const listApproversQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  documentCategoryId: z.string().uuid().optional(),
  unitOrganisasiId: z.string().uuid().optional(),
})

export const listDownloadRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  status: z.enum(['pending', 'approved', 'rejected', 'expired', 'used', 'history']).optional(),
  scope: z.enum(['pending', 'approved', 'history']).optional(),
  documentId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
})

export const listDocumentAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  documentId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  action: z.enum(documentAuditActions).optional(),
  search: z.string().trim().max(200).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
})

export const createGlobalViewerSchema = z.object({
  unitOrganisasiId: z.string().uuid().nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
  includeDescendants: z.coerce.boolean().optional().default(true),
  notes: z.string().trim().max(300).nullable().optional(),
}).refine(
  data => (data.unitOrganisasiId && !data.employeeId) || (!data.unitOrganisasiId && data.employeeId),
  { message: 'Harus memilih salah satu: unit organisasi atau karyawan' }
)

export type CreateDocumentCategoryInput = z.infer<typeof createDocumentCategorySchema>
export type UpdateDocumentCategoryInput = z.infer<typeof updateDocumentCategorySchema>
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>
export type CreateAccessRuleInput = z.infer<typeof createAccessRuleSchema>
export type CreateDocumentApproverInput = z.infer<typeof createDocumentApproverSchema>
export type CreateGlobalViewerInput = z.infer<typeof createGlobalViewerSchema>
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>
export type DocumentTreeQuery = z.infer<typeof documentTreeQuerySchema>
export type ListAccessRulesQuery = z.infer<typeof listAccessRulesQuerySchema>
export type ListApproversQuery = z.infer<typeof listApproversQuerySchema>
export type ListDownloadRequestsQuery = z.infer<typeof listDownloadRequestsQuerySchema>
export type ListDocumentAuditQuery = z.infer<typeof listDocumentAuditQuerySchema>

