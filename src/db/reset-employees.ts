// ─── Reset Employee + User Karyawan ───────────────────────────────────────────
// Menghapus SELURUH employee dan user yang tertaut employee (akun karyawan),
// untuk persiapan import ulang dari Excel. User TANPA employeeId (admin/seed)
// DIPERTAHANKAN. unit_organisasi TIDAK disentuh.
//
// Sebelum menghapus, script membuat backup JSON ke src/db/backups/.
// Cascade otomatis membersihkan: refresh_token, sso_token, user_passkey,
// app_user_access, dan activity_log milik user yang dihapus.
//
// Jalankan: npx tsx src/db/reset-employees.ts
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { isNotNull, sql } from 'drizzle-orm'
import { db } from './index'
import { employee, user } from './schema'

async function main() {
  console.log('🔎  Menghitung data saat ini...')
  const [{ emp }]     = await db.select({ emp: sql<number>`count(*)::int` }).from(employee)
  const [{ usrLink }] = await db.select({ usrLink: sql<number>`count(*)::int` }).from(user).where(isNotNull(user.employeeId))
  const [{ usrKeep }] = await db.select({ usrKeep: sql<number>`count(*)::int` }).from(user).where(sql`${user.employeeId} IS NULL`)
  console.log(`   employee                : ${emp}`)
  console.log(`   user tertaut employee   : ${usrLink}  (akan dihapus)`)
  console.log(`   user tanpa employee     : ${usrKeep}  (DIPERTAHANKAN)`)

  // ── Backup ──────────────────────────────────────────────────────────────────
  const backupDir = join(__dirname, 'backups')
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const employeesData = await db.select().from(employee)
  const usersData     = await db.select().from(user)
  const backupPath = join(backupDir, `pre-reset-${stamp}.json`)
  writeFileSync(backupPath, JSON.stringify({ employees: employeesData, users: usersData }, null, 2), 'utf-8')
  console.log(`\n💾  Backup ditulis: ${backupPath}`)
  console.log(`   (${employeesData.length} employee, ${usersData.length} user)`)

  // ── Hapus (dalam transaksi) ──────────────────────────────────────────────────
  await db.transaction(async (tx) => {
    // 1. Hapus akun user karyawan → cascade token/passkey/akses/activity_log user tsb.
    const delUsers = await tx.delete(user).where(isNotNull(user.employeeId)).returning({ id: user.id })
    // 2. Hapus seluruh employee (atasan_id self-ref ikut terhapus serentak).
    const delEmp = await tx.delete(employee).returning({ id: employee.id })
    console.log(`\n🗑️   User karyawan dihapus : ${delUsers.length}`)
    console.log(`🗑️   Employee dihapus      : ${delEmp.length}`)
  })

  // ── Verifikasi ────────────────────────────────────────────────────────────────
  const [{ empAfter }] = await db.select({ empAfter: sql<number>`count(*)::int` }).from(employee)
  const [{ usrAfter }] = await db.select({ usrAfter: sql<number>`count(*)::int` }).from(user)
  console.log(`\n✅  Selesai. Sisa employee: ${empAfter}, sisa user: ${usrAfter} (admin/seed).`)
  console.log('   Silakan import ulang data dari Excel via modal Import Employee.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌  Gagal reset:', err)
  process.exit(1)
})
