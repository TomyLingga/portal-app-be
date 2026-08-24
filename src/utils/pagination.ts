// ─── Utils: Pagination ────────────────────────────────────────────────────────

export const DEFAULT_LIMIT = 50

export interface PaginationQuery {
  page?:  number
  limit?: number
}

export interface PaginationMeta extends Record<string, unknown> {
  page:       number
  limit:      number
  total:      number
  totalPages: number
}

export function getPaginationParams(query: PaginationQuery) {
  const page  = Math.max(1, query.page  ?? 1)
  const limit = Math.min(1000, Math.max(1, query.limit ?? DEFAULT_LIMIT))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

export function buildMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  }
}
