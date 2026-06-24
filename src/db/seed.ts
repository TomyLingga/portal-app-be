// ─── Seed: Data Awal ──────────────────────────────────────────────────────────
import 'dotenv/config'
import { drizzle }              from 'drizzle-orm/postgres-js'
import postgres                  from 'postgres'
import { eq }                    from 'drizzle-orm'
import bcrypt                    from 'bcryptjs'
import {
  refStatusKaryawan,
  refPendidikan,
  refStatusPernikahan,
  refGrade,
  user,
} from './schema'

const client = postgres({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER     ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME     ?? 'inl_portal',
  max:      1,
})

const db = drizzle(client)

async function seed() {
  console.log('🌱  Seeding database...\n')

  // ── Ref Status Karyawan ────────────────────────────────────────────────────
  console.log('   → ref_status_karyawan')
  const statusKaryawanData = [
    { kode: 'TETAP',    label: 'Karyawan Tetap' },
    { kode: 'KONTRAK',  label: 'Karyawan Kontrak' },
    { kode: 'MAGANG',   label: 'Magang / PKL' },
    { kode: 'OUTSOURCE',label: 'Outsource' },
  ]
  for (const data of statusKaryawanData) {
    await db.insert(refStatusKaryawan).values(data).onConflictDoNothing()
  }

  // ── Ref Pendidikan ─────────────────────────────────────────────────────────
  console.log('   → ref_pendidikan')
  const pendidikanData = [
    { kode: 'SD',    label: 'SD',                        urutan: 1 },
    { kode: 'SMP',   label: 'SMP',                       urutan: 2 },
    { kode: 'SMA',   label: 'SMA / SMK / Sederajat',     urutan: 3 },
    { kode: 'D1',    label: 'Diploma I (D1)',             urutan: 4 },
    { kode: 'D2',    label: 'Diploma II (D2)',            urutan: 5 },
    { kode: 'D3',    label: 'Diploma III (D3)',           urutan: 6 },
    { kode: 'D4',    label: 'Diploma IV (D4)',            urutan: 7 },
    { kode: 'S1',    label: 'Sarjana (S1)',               urutan: 8 },
    { kode: 'S2',    label: 'Magister (S2)',              urutan: 9 },
    { kode: 'S3',    label: 'Doktor (S3)',                urutan: 10 },
  ]
  for (const data of pendidikanData) {
    await db.insert(refPendidikan).values(data).onConflictDoNothing()
  }

  // ── Ref Status Pernikahan ──────────────────────────────────────────────────
  console.log('   → ref_status_pernikahan')
  const statusPernikahanData = [
    { kode: 'BELUM_NIKAH', label: 'Belum Menikah' },
    { kode: 'MENIKAH',     label: 'Menikah' },
    { kode: 'CERAI',       label: 'Cerai' },
  ]
  for (const data of statusPernikahanData) {
    await db.insert(refStatusPernikahan).values(data).onConflictDoNothing()
  }

  // ── Ref Grade ──────────────────────────────────────────────────────────────
  console.log('   → ref_grade')
  const gradeData = [
    { kode: 'BOD',   label: 'Board of Director',     level: 1,  keterangan: 'Direktur' },
    { kode: 'BOM',   label: 'Board of Management',   level: 2,  keterangan: 'SEVP' },
    { kode: 'BOM-1', label: 'Manager',               level: 3,  keterangan: 'Kepala Bagian' },
    { kode: 'BOM-2', label: 'Asst. Manager',         level: 4,  keterangan: 'Kepala Sub Bagian' },
    { kode: 'BOM-3', label: 'Supervisor',             level: 5,  keterangan: 'Supervisor / Kepala Seksi' },
    { kode: 'BOM-4', label: 'Senior Staff',           level: 6,  keterangan: 'Staff Senior' },
    { kode: '3A',    label: 'Staff III-A',            level: 7,  keterangan: 'Staff' },
    { kode: '3B',    label: 'Staff III-B',            level: 8,  keterangan: 'Staff' },
    { kode: '2A',    label: 'Staff II-A',             level: 9,  keterangan: 'Staff Junior' },
    { kode: '2B',    label: 'Staff II-B',             level: 10, keterangan: 'Staff Junior' },
    { kode: '1A',    label: 'Staff I-A',              level: 11, keterangan: 'Staff Pemula' },
    { kode: '1B',    label: 'Staff I-B',              level: 12, keterangan: 'Staff Pemula' },
  ]
  for (const data of gradeData) {
    await db.insert(refGrade).values(data).onConflictDoNothing()
  }

  // ── Super Admin User ───────────────────────────────────────────────────────
  const adminEmail    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@inl.co.id'
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123'

  console.log(`   → user super_admin (${adminEmail})`)
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, adminEmail))

  if (existing.length === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    await db.insert(user).values({
      email:        adminEmail,
      passwordHash: passwordHash,
      role:         'super_admin',
      isActive:     true,
    })
    console.log(`   ✅  Admin created — email: ${adminEmail} | password: ${adminPassword}`)
  } else {
    console.log('   ℹ️   Admin sudah ada, skip.')
  }

  console.log('\n✅  Seeding complete!\n')
  await client.end()
}

seed().catch(err => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
