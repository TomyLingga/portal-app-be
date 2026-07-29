// ─── Utils: Global Error Handler ──────────────────────────────────────────────
import { FastifyRequest, FastifyReply } from 'fastify'
import { ZodError } from 'zod'
import { config } from '../config/env'

const validationFieldLabels: Record<string, string> = {
  title: 'Judul',
  name: 'Nama',
  code: 'Kode',
  description: 'Deskripsi',
  categoryId: 'Kategori dokumen',
  documentId: 'Dokumen',
  documentCategoryId: 'Kategori dokumen',
  ownerUnitId: 'Unit pemilik',
  unitOrganisasiId: 'Unit organisasi',
  confidentialityLevel: 'Level kerahasiaan',
  defaultConfidentialityLevel: 'Level kerahasiaan default',
  autoApproveGradeLevel: 'Level grade persetujuan otomatis',
  minGradeLevel: 'Grade minimum',
  accessType: 'Jenis akses',
  includeDescendants: 'Unit turunan',
  employeeId: 'Karyawan',
  approvalOrder: 'Urutan persetujuan',
  file: 'Berkas',
  fileSize: 'Ukuran berkas',
  mimeType: 'Format berkas',
  reason: 'Alasan',
  action: 'Tindakan',
  rejectionReason: 'Alasan penolakan',
  page: 'Halaman',
  limit: 'Jumlah data',
  search: 'Pencarian',
  startDate: 'Tanggal mulai',
  endDate: 'Tanggal selesai',
}

function validationFieldLabel(path: PropertyKey[]) {
  const field = String(path.at(-1) ?? 'data')
  const knownLabel = validationFieldLabels[field]
  if (knownLabel) return knownLabel

  const readable = field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()

  return readable
    ? readable.charAt(0).toUpperCase() + readable.slice(1).toLowerCase()
    : 'Data'
}

function formatValidationMessage(issue: ZodError['issues'][number]) {
  const label = validationFieldLabel(issue.path)
  const detail = issue as typeof issue & {
    origin?: string
    minimum?: number
    maximum?: number
    expected?: string
    format?: string
    keys?: string[]
  }

  if (/received (undefined|null)/i.test(issue.message)) {
    return `${label} wajib diisi.`
  }

  switch (issue.code) {
    case 'too_small':
      if (detail.origin === 'string') return `${label} minimal ${detail.minimum} karakter.`
      if (detail.origin === 'array' || detail.origin === 'set') return `${label} minimal berisi ${detail.minimum} item.`
      return `${label} minimal bernilai ${detail.minimum}.`
    case 'too_big':
      if (detail.origin === 'string') return `${label} maksimal ${detail.maximum} karakter.`
      if (detail.origin === 'array' || detail.origin === 'set') return `${label} maksimal berisi ${detail.maximum} item.`
      return `${label} maksimal bernilai ${detail.maximum}.`
    case 'invalid_type': {
      const expectedType: Record<string, string> = {
        string: 'teks',
        number: 'angka',
        boolean: 'pilihan benar atau salah',
        array: 'daftar',
        object: 'objek',
        date: 'tanggal',
      }
      return `${label} harus berupa ${expectedType[detail.expected ?? ''] ?? 'data dengan format yang benar'}.`
    }
    case 'invalid_format':
      if (detail.format === 'email') return `${label} harus berupa alamat email yang valid.`
      if (detail.format === 'uuid') return `${label} tidak valid.`
      if (detail.format === 'url') return `${label} harus berupa alamat URL yang valid.`
      if (detail.format === 'date') return `${label} harus menggunakan format tanggal yang valid.`
      return `Format ${label.toLowerCase()} tidak valid.`
    case 'invalid_value':
      return `${label} berisi pilihan yang tidak valid.`
    case 'unrecognized_keys':
      return `Terdapat field yang tidak dikenali: ${(detail.keys ?? []).join(', ')}.`
    case 'custom':
      return issue.message
    default:
      return /^[A-Za-z ]+: expected|^Invalid |^Too (small|big)/i.test(issue.message)
        ? `${label} tidak valid.`
        : issue.message
  }
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.code(422).send({
      success: false,
      error:   'Validasi gagal',
      details: error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: formatValidationMessage(issue),
      })),
    })
  }

  const err = error as any

  // Handle foreign key constraint violation (linked to other data)
  const isForeignKeyError =
    err.code === '23503' ||
    err.cause?.code === '23503' ||
    err.originalError?.code === '23503' ||
    String(err.message || '').includes('violates foreign key constraint') ||
    String(err.cause?.message || '').includes('violates foreign key constraint') ||
    String(err.originalError?.message || '').includes('violates foreign key constraint') ||
    String(err.message || '').includes('foreign key constraint') ||
    String(err.cause?.message || '').includes('foreign key constraint') ||
    String(err.detail || '').includes('referenced from table');

  if (isForeignKeyError) {
    return reply.code(400).send({
      success: false,
      error: 'Data tidak dapat dihapus karena sedang digunakan atau terikat dengan data lain.'
    })
  }

  if (err.message && !err.statusCode) {
    if (String(err.message).startsWith('Failed query:')) {
      console.error('[DB Error Detail]:', err.cause || err.message);
    }
    // If it's a raw query failure error message, sanitize it so SQL queries are not leaked
    const cleanMessage = String(err.message).startsWith('Failed query:')
      ? (config.app.nodeEnv === 'development' ? `DB Error: ${err.cause?.message || err.message}` : 'Gagal memproses permintaan database.')
      : err.message;
    return reply.code(400).send({ success: false, error: cleanMessage })
  }

  request.log.error(err)
  
  return reply.code(err.statusCode ?? 500).send({
    success: false,
    error: config.app.nodeEnv === 'production' ? 'Internal server error' : err.message,
  })
}
