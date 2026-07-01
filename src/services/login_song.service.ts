// ─── Service: Login Song ──────────────────────────────────────────────────────
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { loginSongs, activityLog } from '../db/schema'
import { deleteAudioFile } from '../utils/file'

export async function listLoginSongsService() {
  const rows = await db
    .select()
    .from(loginSongs)
    .orderBy(loginSongs.title)

  return rows
}

export async function getActiveLoginSongService() {
  const [active] = await db
    .select()
    .from(loginSongs)
    .where(eq(loginSongs.isActive, true))
    .limit(1)

  return active || null
}

export async function createLoginSongService(input: { title: string }, userId: string) {
  const [created] = await db
    .insert(loginSongs)
    .values({
      title: input.title,
      isActive: false,
    })
    .returning()

  await db.insert(activityLog).values({
    userId,
    action: 'create_login_song',
    details: `Menambahkan metadata lagu login baru: "${created.title}"`,
  })

  return created
}

export async function updateLoginSongService(id: string, input: { title: string }, userId: string) {
  const [updated] = await db
    .update(loginSongs)
    .set({
      title: input.title,
    })
    .where(eq(loginSongs.id, id))
    .returning()

  if (!updated) throw new Error('Lagu login tidak ditemukan')

  await db.insert(activityLog).values({
    userId,
    action: 'update_login_song',
    details: `Memperbarui judul lagu login: "${updated.title}"`,
  })

  return updated
}

export async function updateLoginSongFileService(id: string, filename: string, userId: string) {
  const [existing] = await db
    .select()
    .from(loginSongs)
    .where(eq(loginSongs.id, id))
    .limit(1)

  if (!existing) throw new Error('Lagu login tidak ditemukan')

  // Jika ada file lama, hapus file lamanya terlebih dahulu
  if (existing.filename) {
    deleteAudioFile(existing.filename)
  }

  const [updated] = await db
    .update(loginSongs)
    .set({ filename })
    .where(eq(loginSongs.id, id))
    .returning()

  await db.insert(activityLog).values({
    userId,
    action: 'update_login_song_file',
    details: `Mengunggah file audio baru untuk lagu: "${updated.title}"`,
  })

  return updated
}

export async function deleteLoginSongService(id: string, userId: string) {
  const [existing] = await db
    .select()
    .from(loginSongs)
    .where(eq(loginSongs.id, id))
    .limit(1)

  if (!existing) throw new Error('Lagu login tidak ditemukan')

  // Hapus file fisiknya
  if (existing.filename) {
    deleteAudioFile(existing.filename)
  }

  // Hapus dari DB
  await db
    .delete(loginSongs)
    .where(eq(loginSongs.id, id))

  await db.insert(activityLog).values({
    userId,
    action: 'delete_login_song',
    details: `Menghapus lagu login: "${existing.title}"`,
  })

  return { success: true }
}

export async function activateLoginSongService(id: string, userId: string) {
  const [target] = await db
    .select()
    .from(loginSongs)
    .where(eq(loginSongs.id, id))
    .limit(1)

  if (!target) throw new Error('Lagu login tidak ditemukan')

  // Jalankan transaksi: nonaktifkan semua, aktifkan target
  await db.transaction(async (tx) => {
    await tx
      .update(loginSongs)
      .set({ isActive: false })

    await tx
      .update(loginSongs)
      .set({ isActive: true })
      .where(eq(loginSongs.id, id))
  })

  await db.insert(activityLog).values({
    userId,
    action: 'activate_login_song',
    details: `Mengaktifkan lagu login: "${target.title}"`,
  })

  const [updated] = await db
    .select()
    .from(loginSongs)
    .where(eq(loginSongs.id, id))
    .limit(1)

  return updated
}
