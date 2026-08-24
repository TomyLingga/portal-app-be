import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import type { MultipartFile } from '@fastify/multipart'
import { config } from '../config/env'
import { httpError } from '../utils/httpError'

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
}

const APP_ROOT = path.resolve(__dirname, '..', '..')

function documentRoots(): string[] {
  if (path.isAbsolute(config.documents.dir)) {
    return [path.normalize(config.documents.dir)]
  }

  return [...new Set([
    path.resolve(APP_ROOT, config.documents.dir),
    path.resolve(process.cwd(), config.documents.dir),
    path.resolve(APP_ROOT, '..', config.documents.dir),
  ])]
}

function documentRoot(): string {
  return documentRoots()[0]
}

function isKnownSignature(mimeType: string, bytes: Buffer): boolean {
  const headerStr = bytes.subarray(0, 1024).toString('latin1')
  return headerStr.includes('%PDF-')
}

function assertInsideRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw httpError(400, 'Path dokumen tidak valid')
  }
}

function resolveFromRoot(root: string, filePath: string): string {
  const resolved = path.resolve(root, filePath)
  assertInsideRoot(root, resolved)
  return resolved
}

export function resolveDocumentFile(filePath: string): string {
  return resolveFromRoot(documentRoot(), filePath)
}

export function resolveExistingDocumentFile(filePath: string): string | null {
  for (const root of documentRoots()) {
    const candidate = resolveFromRoot(root, filePath)
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

export function assertDocumentFileAvailable(filePath: string): string {
  const absolutePath = resolveExistingDocumentFile(filePath)
  if (!absolutePath) {
    throw httpError(
      404,
      'Berkas dokumen tidak tersedia pada storage server. Pastikan volume dokumen terpasang pada backend.',
    )
  }
  return absolutePath
}

export function getDocumentFile(filePath: string) {
  const absolutePath = assertDocumentFileAvailable(filePath)
  return {
    absolutePath,
    stream: fs.createReadStream(absolutePath),
  }
}

export async function saveDocumentFile(file: MultipartFile) {
  const extension = MIME_EXTENSIONS[file.mimetype]
  const sourceExtension = path.extname(file.filename || '').toLowerCase()
  if (!extension || sourceExtension !== extension) {
    throw httpError(422, 'Format file dokumen wajib PDF (.pdf)')
  }

  const now = new Date()
  const relativeDir = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'))
  const targetDir = resolveDocumentFile(relativeDir)
  fs.mkdirSync(targetDir, { recursive: true })

  const relativePath = path.join(relativeDir, `${crypto.randomUUID()}${extension}`).replace(/\\/g, '/')
  const absolutePath = resolveDocumentFile(relativePath)
  let size = 0
  let signature = Buffer.alloc(0)

  try {
    await pipeline(
      file.file,
      async function* (source) {
        for await (const value of source) {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array)
          size += chunk.length
          if (size > config.documents.maxFileSizeBytes) {
            throw httpError(413, `Ukuran dokumen melebihi ${Math.round(config.documents.maxFileSizeBytes / 1024 / 1024)} MB`)
          }
          if (signature.length < 8) signature = Buffer.concat([signature, chunk]).subarray(0, 8)
          yield chunk
        }
      },
      fs.createWriteStream(absolutePath, { flags: 'wx' }),
    )

    if (size === 0) throw httpError(422, 'File dokumen kosong')
    if (!isKnownSignature(file.mimetype, signature)) {
      throw httpError(422, 'Isi file tidak sesuai dengan format dokumen yang dipilih')
    }

    return { filePath: relativePath, fileSize: size, mimeType: file.mimetype, extension }
  } catch (error) {
    if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath)
    throw error
  }
}

export function deleteDocumentFile(filePath: string): void {
  const absolutePath = resolveExistingDocumentFile(filePath) || resolveDocumentFile(filePath)
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath)
}

export function documentDownloadName(title: string, mimeType: string): string {
  const safeTitle = title.replace(/[^a-zA-Z0-9._ -]+/g, '').trim().replace(/\s+/g, '_') || 'dokumen'
  return `${safeTitle}${MIME_EXTENSIONS[mimeType] || ''}`
}
