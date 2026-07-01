// ─── Utils: File Upload ───────────────────────────────────────────────────────
import fs       from 'fs'
import path     from 'path'
import { pipeline } from 'stream/promises'
import { MultipartFile } from '@fastify/multipart'
import { config } from '../config/env'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE_MB  = 5

/**
 * Simpan file upload ke disk.
 * Nama file di-rename ke: {timestamp}_{random}_{ext}
 * Kembalikan nama file saja (bukan full path).
 */
export async function saveUploadedFile(file: MultipartFile, subDir: string = ''): Promise<string> {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    throw new Error(`Tipe file tidak didukung. Hanya: ${ALLOWED_MIME.join(', ')}`)
  }

  const uploadDir = path.join(path.resolve(config.upload.dir), subDir)

  // Buat folder uploads jika belum ada
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  // Ambil ekstensi dari mimetype (lebih aman dari filename)
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png':  '.png',
    'image/webp': '.webp',
    'image/gif':  '.gif',
  }
  const ext      = extMap[file.mimetype] ?? '.bin'
  const rand     = Math.random().toString(36).slice(2, 8)
  const filename = `${Date.now()}_${rand}${ext}`
  const filepath = path.join(uploadDir, filename)

  // Cek ukuran file via stream (track bytes)
  let bytes = 0
  const maxBytes = MAX_SIZE_MB * 1024 * 1024

  await pipeline(
    file.file,
    async function* (source) {
      for await (const chunk of source) {
        bytes += (chunk as Buffer).length
        if (bytes > maxBytes) {
          throw new Error(`Ukuran file melebihi ${MAX_SIZE_MB}MB`)
        }
        yield chunk
      }
    },
    fs.createWriteStream(filepath),
  )

  return subDir ? `${subDir}/${filename}` : filename
}

/**
 * Hapus file dari disk jika ada.
 */
export function deleteFile(filename: string): void {
  if (!filename) return
  const filepath = path.join(path.resolve(config.upload.dir), filename)
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath)
  }
}

/**
 * Bangun URL publik dari nama file.
 * URL base diambil dari UPLOAD_URL di .env
 */
export function buildFileUrl(filename: string | null | undefined): string | null {
  if (!filename) return null
  return `${config.upload.url}/${filename}`
}

/**
 * Simpan file audio upload (.mp3) ke front-end public/audio directory.
 * Nama file di-rename ke: {timestamp}_{random}.mp3
 * Kembalikan nama file saja (bukan full path).
 */
export async function saveUploadedAudioFile(file: MultipartFile): Promise<string> {
  const allowedMime = ['audio/mpeg', 'audio/mp3']
  if (!allowedMime.includes(file.mimetype) && !file.filename.endsWith('.mp3')) {
    throw new Error('Tipe file tidak didukung. Hanya file .mp3')
  }

  // Path ke frontend public/audio
  const audioDir = path.join(process.cwd(), '../portal-fe/public/audio')

  // Buat folder jika belum ada
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true })
  }

  const rand     = Math.random().toString(36).slice(2, 8)
  const filename = `${Date.now()}_${rand}.mp3`
  const filepath = path.join(audioDir, filename)

  // Cek ukuran file via stream (track bytes) - batas 20MB untuk audio
  let bytes = 0
  const maxBytes = 20 * 1024 * 1024 // 20 MB

  await pipeline(
    file.file,
    async function* (source) {
      for await (const chunk of source) {
        bytes += (chunk as Buffer).length
        if (bytes > maxBytes) {
          throw new Error('Ukuran file audio melebihi 20MB')
        }
        yield chunk
      }
    },
    fs.createWriteStream(filepath),
  )

  return filename
}

/**
 * Hapus file audio dari frontend public/audio jika ada.
 */
export function deleteAudioFile(filename: string): void {
  if (!filename) return
  const filepath = path.join(process.cwd(), '../portal-fe/public/audio', filename)
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath)
  }
}

