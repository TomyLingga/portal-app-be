// ─── Utils: Standard Response ─────────────────────────────────────────────────

export interface SuccessResponse<T = unknown> {
  success: true
  data:    T
  meta?:   Record<string, unknown>
}

export interface ErrorResponse {
  success: false
  error:   string
  details?: Array<{ field: string; message: string }>
}

export function ok<T>(data: T, meta?: Record<string, unknown>): SuccessResponse<T> {
  return meta ? { success: true, data, meta } : { success: true, data }
}

export function err(message: string, details?: Array<{ field: string; message: string }>): ErrorResponse {
  return details ? { success: false, error: message, details } : { success: false, error: message }
}
