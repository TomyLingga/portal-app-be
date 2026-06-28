// ─── Seed: Data Awal ──────────────────────────────────────────────────────────
import 'dotenv/config'
import { drizzle }              from 'drizzle-orm/postgres-js'
import postgres                  from 'postgres'
import { eq, and }               from 'drizzle-orm'
import bcrypt                    from 'bcryptjs'
import crypto                    from 'crypto'
import {
  refStatusKaryawan,
  refPendidikan,
  refStatusPernikahan,
  refGrade,
  refTipeUnit,
  refPenempatanArea,
  user,
  unitOrganisasi,
  employee,
  aplikasi,
  appUserAccess,
  ssoToken,
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

  const statusKaryawanRows = await db.select().from(refStatusKaryawan)
  const statusKaryawanMap = new Map(statusKaryawanRows.map(r => [r.kode, r.id]))

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

  const pendidikanRows = await db.select().from(refPendidikan)
  const pendidikanMap = new Map(pendidikanRows.map(r => [r.kode, r.id]))

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

  const statusPernikahanRows = await db.select().from(refStatusPernikahan)
  const statusPernikahanMap = new Map(statusPernikahanRows.map(r => [r.kode, r.id]))

  // ── Ref Grade ──────────────────────────────────────────────────────────────
  console.log('   → ref_grade')
  const gradeData = [
    { kode: 'BOD',   label: 'Board of Director',     level: 20,  keterangan: 'Direksi Utama / Komisaris' },
    { kode: 'BOM',   label: 'Board of Management',   level: 10,  keterangan: 'Senior Executive Vice President' },
    { kode: 'BOM-1', label: 'Manager',               level: 9,  keterangan: 'Kepala Bagian' },
    { kode: 'BOM-2', label: 'Asst. Manager',         level: 8,  keterangan: 'Kepala Sub Bagian' },
    { kode: 'BOM-3', label: 'Supervisor',             level: 7,  keterangan: 'Supervisor / Kepala Seksi' },
    { kode: 'BOM-4', label: 'Senior Staff',           level: 6,  keterangan: 'Staff Senior' },
    { kode: 'STAFF', label: 'Staff',                 level: 5,  keterangan: 'Staff Operasional / Pelaksana' },
    { kode: 'OPERATOR', label: 'Operator',           level: 4,  keterangan: 'Operator Pabrik / Teknikal' },
    { kode: 'JUNIOR-STAFF', label: 'Junior Staff',   level: 3,  keterangan: 'Staff Magang / Junior' },
  ]
  for (const data of gradeData) {
    await db.insert(refGrade).values(data).onConflictDoNothing()
  }

  const gradeRows = await db.select().from(refGrade)
  const gradeMap = new Map(gradeRows.map(r => [r.kode, r.id]))

  // ── Ref Tipe Unit ──────────────────────────────────────────────────────────
  console.log('   → ref_tipe_unit')
  const tipeUnitData = [
    { kode: 'direktorat', label: 'Direktorat', level: 5, warna: '#8b5cf6' },
    { kode: 'sevp',       label: 'SEVP',       level: 4, warna: '#3b82f6' },
    { kode: 'bagian',     label: 'Bagian',     level: 3, warna: '#10b981' },
    { kode: 'sub_bagian', label: 'Sub Bagian', level: 2, warna: '#f59e0b' },
    { kode: 'seksi',      label: 'Seksi',      level: 1, warna: '#ec4899' },
  ]
  for (const data of tipeUnitData) {
    await db.insert(refTipeUnit).values(data).onConflictDoNothing()
  }

  const tipeUnitRows = await db.select().from(refTipeUnit)
  const tipeUnitMap = new Map(tipeUnitRows.map(r => [r.kode, r.id]))

  // ── Ref Penempatan Area ────────────────────────────────────────────────────
  console.log('   → ref_penempatan_area')
  const penempatanAreaData = [
    { nama: 'PKS Sei Mangkei', longitude: '99.3732', latitude: '3.1972' },
    { nama: 'Kantor Direksi Medan', longitude: '98.6782', latitude: '3.5852' },
    { nama: 'Gudang Logistik Kuala Tanjung', longitude: '99.4445', latitude: '3.3855' },
    { nama: 'Pabrik Minyak Goreng Sei Mangkei', longitude: '99.3750', latitude: '3.1980' },
    { nama: 'Kawasan Industri Sei Mangkei', longitude: '99.3710', latitude: '3.1950' },
  ]
  for (const data of penempatanAreaData) {
    await db.insert(refPenempatanArea).values(data).onConflictDoNothing()
  }

  const penempatanAreaRows = await db.select().from(refPenempatanArea)
  const penempatanAreaMap = new Map(penempatanAreaRows.map(r => [r.nama, r.id]))

  // ── Unit Organisasi ────────────────────────────────────────────────────────
  console.log('   → unit_organisasi')
  const unitData = [
    // Level 1 (Root)
    { kode: 'DIRUT', nama: 'Direktorat Utama', tipe: 'direktorat' as const, parent: null },
    // Level 2 (SEVP)
    { kode: 'SEVP-OPS', nama: 'SEVP Operasional', tipe: 'sevp' as const, parent: 'DIRUT' },
    { kode: 'SEVP-CORP', nama: 'SEVP Korporat & Keuangan', tipe: 'sevp' as const, parent: 'DIRUT' },
    // Level 3 (Bagian under SEVP-OPS)
    { kode: 'BAG-PROD', nama: 'Bagian Produksi & Pabrik', tipe: 'bagian' as const, parent: 'SEVP-OPS' },
    { kode: 'BAG-MAINT', nama: 'Bagian Pemeliharaan & Maintenance', tipe: 'bagian' as const, parent: 'SEVP-OPS' },
    // Level 3 (Bagian under SEVP-CORP)
    { kode: 'BAG-FIN', nama: 'Bagian Keuangan & Akuntansi', tipe: 'bagian' as const, parent: 'SEVP-CORP' },
    { kode: 'BAG-HR', nama: 'Bagian SDM & Umum', tipe: 'bagian' as const, parent: 'SEVP-CORP' },
    { kode: 'BAG-IT', nama: 'Bagian Teknologi Informasi', tipe: 'bagian' as const, parent: 'SEVP-CORP' },
    // Level 4 (Sub-Bagian under BAG-PROD)
    { kode: 'SUBBAG-FRAC', nama: 'Sub-Bagian Fractionation & Refining', tipe: 'sub_bagian' as const, parent: 'BAG-PROD' },
    { kode: 'SUBBAG-PACK', nama: 'Sub-Bagian Packaging / Pengemasan', tipe: 'sub_bagian' as const, parent: 'BAG-PROD' },
    // Level 4 (Sub-Bagian under BAG-MAINT)
    { kode: 'SUBBAG-MECH', nama: 'Sub-Bagian Mekanikal & Fabrikasi', tipe: 'sub_bagian' as const, parent: 'BAG-MAINT' },
    { kode: 'SUBBAG-ELEC', nama: 'Sub-Bagian Elektrikal & Instrumentasi', tipe: 'sub_bagian' as const, parent: 'BAG-MAINT' },
    // Level 4 (Sub-Bagian under BAG-FIN)
    { kode: 'SUBBAG-TAX', nama: 'Sub-Bagian Perpajakan & Kas', tipe: 'sub_bagian' as const, parent: 'BAG-FIN' },
    // Level 4 (Sub-Bagian under BAG-HR)
    { kode: 'SUBBAG-RECRUIT', nama: 'Sub-Bagian Rekrutmen & Pelatihan', tipe: 'sub_bagian' as const, parent: 'BAG-HR' },
    { kode: 'SUBBAG-GA', nama: 'Sub-Bagian General Affairs & Rumah Tangga', tipe: 'sub_bagian' as const, parent: 'BAG-HR' },
    // Level 4 (Sub-Bagian under BAG-IT)
    { kode: 'SUBBAG-NET', nama: 'Sub-Bagian Network & Infrastructure', tipe: 'sub_bagian' as const, parent: 'BAG-IT' },
    { kode: 'SUBBAG-APP', nama: 'Sub-Bagian Application Development', tipe: 'sub_bagian' as const, parent: 'BAG-IT' },
    // Level 5 (Seksi under Sub-Bagian)
    { kode: 'SEK-REF-OPS', nama: 'Seksi Refining Operation', tipe: 'seksi' as const, parent: 'SUBBAG-FRAC' },
    { kode: 'SEK-FRAC-OPS', nama: 'Seksi Fractionation Operation', tipe: 'seksi' as const, parent: 'SUBBAG-FRAC' },
    { kode: 'SEK-PACK-LINE', nama: 'Seksi Packing Line', tipe: 'seksi' as const, parent: 'SUBBAG-PACK' },
    { kode: 'SEK-FAB', nama: 'Seksi Fabrikasi & Workshop', tipe: 'seksi' as const, parent: 'SUBBAG-MECH' },
    { kode: 'SEK-INST', nama: 'Seksi Instrumentasi & Kalibrasi', tipe: 'seksi' as const, parent: 'SUBBAG-ELEC' },
    { kode: 'SEK-HELP', nama: 'Seksi Helpdesk & Support', tipe: 'seksi' as const, parent: 'SUBBAG-NET' },
    { kode: 'SEK-DEV', nama: 'Seksi Software Development & QA', tipe: 'seksi' as const, parent: 'SUBBAG-APP' },
  ]
  for (const u of unitData) {
    await db.insert(unitOrganisasi).values({
      kode: u.kode,
      nama: u.nama,
      tipe: u.tipe,
      isActive: true,
    }).onConflictDoNothing()
  }

  const allUnits = await db.select().from(unitOrganisasi)
  const unitMap = new Map(allUnits.map(u => [u.kode, u.id]))

  // Connect parent-child hierarchies
  for (const u of unitData) {
    if (u.parent) {
      const childId = unitMap.get(u.kode)
      const parentId = unitMap.get(u.parent)
      if (childId && parentId) {
        await db.update(unitOrganisasi).set({ parentId }).where(eq(unitOrganisasi.id, childId))
      }
    }
  }

  // ── Employees & Users mock lists (Exactly 40 entries) ──────────────────────
  console.log('   → employees & users (40 sets)')

  // Pre-hash common password to ensure fast execution
  const commonPasswordHash = await bcrypt.hash('User@123', 10)

  const rawEmployees = [
    // Directors & SEVPs
    { nrk: 'NRK-001', nik: '3201011505950001', nama: 'Budi Santoso, S.T.', jk: 'L', jab: 'IT Administrator', grade: 'BOM-4', unit: 'SUBBAG-APP', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'admin@inl.co.id', role: 'super_admin', active: true },
    { nrk: 'NRK-002', nik: '3201011505950002', nama: 'Ir. H. Ahmad Fauzi', jk: 'L', jab: 'Direktur Utama', grade: 'BOD', unit: 'DIRUT', st: 'TETAP', pd: 'S2', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'ahmad.fauzi@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-003', nik: '3201011505950003', nama: 'Bambang Wijaya, M.M.', jk: 'L', jab: 'SEVP Operasional', grade: 'BOM', unit: 'SEVP-OPS', st: 'TETAP', pd: 'S2', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'bambang.wijaya@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-004', nik: '3201011505950004', nama: 'Riana Kartika, M.B.A.', jk: 'P', jab: 'SEVP Korporat & Keuangan', grade: 'BOM', unit: 'SEVP-CORP', st: 'TETAP', pd: 'S2', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'riana.kartika@inl.co.id', role: 'user', active: true },
    
    // Managers (BOM-1)
    { nrk: 'NRK-005', nik: '3201011505950005', nama: 'Dedi Kusnadi, S.T.', jk: 'L', jab: 'Manager Produksi & Pabrik', grade: 'BOM-1', unit: 'BAG-PROD', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'dedi.kusnadi@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-006', nik: '3201011505950006', nama: 'Eko Prasetyo, S.T.', jk: 'L', jab: 'Manager Pemeliharaan', grade: 'BOM-1', unit: 'BAG-MAINT', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'eko.prasetyo@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-007', nik: '3201011505950007', nama: 'Fitri Handayani, S.E.', jk: 'P', jab: 'Manager Keuangan', grade: 'BOM-1', unit: 'BAG-FIN', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'fitri.handayani@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-008', nik: '3201011505950008', nama: 'Gita Lestari, S.Psi.', jk: 'P', jab: 'Manager SDM & Umum', grade: 'BOM-1', unit: 'BAG-HR', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'gita.lestari@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-009', nik: '3201011505950009', nama: 'Hendra Wijaya, S.Kom.', jk: 'L', jab: 'Manager IT', grade: 'BOM-1', unit: 'BAG-IT', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'hendra.wijaya@inl.co.id', role: 'user', active: true },

    // Asst. Managers (BOM-2)
    { nrk: 'NRK-010', nik: '3201011505950010', nama: 'Indra Gunawan, S.T.', jk: 'L', jab: 'Asst. Manager Fractionation', grade: 'BOM-2', unit: 'SUBBAG-FRAC', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'indra.gunawan@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-011', nik: '3201011505950011', nama: 'Joko Susilo, S.T.', jk: 'L', jab: 'Asst. Manager Packaging', grade: 'BOM-2', unit: 'SUBBAG-PACK', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'joko.susilo@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-012', nik: '3201011505950012', nama: 'Kurniawan, S.T.', jk: 'L', jab: 'Asst. Manager Mekanikal', grade: 'BOM-2', unit: 'SUBBAG-MECH', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'kurniawan@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-013', nik: '3201011505950013', nama: 'Lestari Ningsih, S.T.', jk: 'P', jab: 'Asst. Manager Elektrikal', grade: 'BOM-2', unit: 'SUBBAG-ELEC', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'lestari.ningsih@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-014', nik: '3201011505950014', nama: 'Muhammad Rizky, S.E.', jk: 'L', jab: 'Asst. Manager Perpajakan', grade: 'BOM-2', unit: 'SUBBAG-TAX', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'muhammad.rizky@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-015', nik: '3201011505950015', nama: 'Novianti, S.Psi.', jk: 'P', jab: 'Asst. Manager Rekrutmen', grade: 'BOM-2', unit: 'SUBBAG-RECRUIT', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'novianti@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-016', nik: '3201011505950016', nama: 'Oki Setiawan, S.T.', jk: 'L', jab: 'Asst. Manager GA & Logistik', grade: 'BOM-2', unit: 'SUBBAG-GA', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Gudang Logistik Kuala Tanjung', email: 'oki.setiawan@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-017', nik: '3201011505950017', nama: 'Pratiwi Wulandari, S.T.', jk: 'P', jab: 'Asst. Manager Network', grade: 'BOM-2', unit: 'SUBBAG-NET', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'pratiwi.w@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-018', nik: '3201011505950018', nama: 'Qori Amalia, S.Kom.', jk: 'P', jab: 'Asst. Manager App Dev', grade: 'BOM-2', unit: 'SUBBAG-APP', st: 'TETAP', pd: 'S1', nk: 'MENIKAH', area: 'Kantor Direksi Medan', email: 'qori.amalia@inl.co.id', role: 'user', active: true },

    // Supervisors & Staff (BOM-3, BOM-4, STAFF, OPERATOR)
    { nrk: 'NRK-019', nik: '3201011505950019', nama: 'Rudi Hermawan', jk: 'L', jab: 'Supervisor Fractionation', grade: 'BOM-3', unit: 'SEK-FRAC-OPS', st: 'TETAP', pd: 'D3', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'rudi.hermawan@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-020', nik: '3201011505950020', nama: 'Siti Aminah', jk: 'P', jab: 'Supervisor Packaging', grade: 'BOM-3', unit: 'SEK-PACK-LINE', st: 'TETAP', pd: 'D3', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'siti.aminah@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-021', nik: '3201011505950021', nama: 'Triyono Sakti', jk: 'L', jab: 'Supervisor Mekanikal', grade: 'BOM-3', unit: 'SEK-FAB', st: 'TETAP', pd: 'D3', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'triyono.s@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-022', nik: '3201011505950022', nama: 'Utomo Wijoyo', jk: 'L', jab: 'Supervisor Elektrikal', grade: 'BOM-3', unit: 'SEK-INST', st: 'TETAP', pd: 'D3', nk: 'MENIKAH', area: 'PKS Sei Mangkei', email: 'utomo.w@inl.co.id', role: 'user', active: true },
    
    { nrk: 'NRK-023', nik: '3201011505950023', nama: 'Vivi Alfianti, A.Md.', jk: 'P', jab: 'Staff Pajak', grade: 'STAFF', unit: 'SUBBAG-TAX', st: 'KONTRAK', pd: 'D3', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'vivi.alfianti@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-024', nik: '3201011505950024', nama: 'Wahyu Hidayat, S.H.', jk: 'L', jab: 'Staff Recruitment', grade: 'STAFF', unit: 'SUBBAG-RECRUIT', st: 'KONTRAK', pd: 'S1', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'wahyu.h@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-025', nik: '3201011505950025', nama: 'Yuni Lestari, S.E.', jk: 'P', jab: 'Staff General Affairs', grade: 'STAFF', unit: 'SUBBAG-GA', st: 'KONTRAK', pd: 'S1', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'yuni.l@inl.co.id', role: 'user', active: false }, // Suspended 1
    { nrk: 'NRK-026', nik: '3201011505950026', nama: 'Zulkifli Lubis, S.T.', jk: 'L', jab: 'Staff Network Infra', grade: 'STAFF', unit: 'SEK-HELP', st: 'KONTRAK', pd: 'S1', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'zulkifli.l@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-027', nik: '3201011505950027', nama: 'Ade Putra, S.Kom.', jk: 'L', jab: 'Junior Developer', grade: 'JUNIOR-STAFF', unit: 'SEK-DEV', st: 'KONTRAK', pd: 'S1', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'ade.putra@inl.co.id', role: 'user', active: true },
    
    { nrk: 'NRK-028', nik: '3201011505950028', nama: 'Bayu Pratama', jk: 'L', jab: 'Operator Fractionation A', grade: 'OPERATOR', unit: 'SUBBAG-FRAC', st: 'KONTRAK', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'PKS Sei Mangkei', email: 'bayu.p@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-029', nik: '3201011505950029', nama: 'Candra Buana', jk: 'L', jab: 'Operator Fractionation B', grade: 'OPERATOR', unit: 'SUBBAG-FRAC', st: 'KONTRAK', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'PKS Sei Mangkei', email: 'candra.b@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-030', nik: '3201011505950030', nama: 'Dewi Sartika', jk: 'P', jab: 'Operator Packing Line 1', grade: 'OPERATOR', unit: 'SUBBAG-PACK', st: 'KONTRAK', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'PKS Sei Mangkei', email: 'dewi.s@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-031', nik: '3201011505950031', nama: 'Erwin Syahputra', jk: 'L', jab: 'Operator Packing Line 2', grade: 'OPERATOR', unit: 'SUBBAG-PACK', st: 'KONTRAK', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'PKS Sei Mangkei', email: 'erwin.s@inl.co.id', role: 'user', active: false }, // Suspended 2
    { nrk: 'NRK-032', nik: '3201011505950032', nama: 'Fajar Nugroho', jk: 'L', jab: 'Operator Mekanik Boiler', grade: 'OPERATOR', unit: 'SUBBAG-MECH', st: 'KONTRAK', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'Pabrik Minyak Goreng Sei Mangkei', email: 'fajar.n@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-033', nik: '3201011505950033', nama: 'Guntur Pamungkas', jk: 'L', jab: 'Operator Mekanik Turbine', grade: 'OPERATOR', unit: 'SUBBAG-MECH', st: 'KONTRAK', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'PKS Sei Mangkei', email: 'guntur.p@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-034', nik: '3201011505950034', nama: 'Hani Susilowati', jk: 'P', jab: 'Operator Panel Kontrol', grade: 'OPERATOR', unit: 'SUBBAG-ELEC', st: 'KONTRAK', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'PKS Sei Mangkei', email: 'hani.s@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-035', nik: '3201011505950035', nama: 'Irfan Hakim', jk: 'L', jab: 'Operator Instrumentasi', grade: 'OPERATOR', unit: 'SUBBAG-ELEC', st: 'KONTRAK', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'Pabrik Minyak Goreng Sei Mangkei', email: 'irfan.h@inl.co.id', role: 'user', active: true },
    
    // Trainees, Outsource & Admins (MAGANG, OUTSOURCE)
    { nrk: 'NRK-036', nik: '3201011505950036', nama: 'Junaedi', jk: 'L', jab: 'Magang Support Network', grade: 'JUNIOR-STAFF', unit: 'SEK-HELP', st: 'MAGANG', pd: 'D3', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'junaedi@inl.co.id', role: 'user', active: false }, // Suspended 3
    { nrk: 'NRK-037', nik: '3201011505950037', nama: 'Krisna Bayu', jk: 'L', jab: 'Magang HR Operations', grade: 'JUNIOR-STAFF', unit: 'SUBBAG-RECRUIT', st: 'MAGANG', pd: 'D3', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'krisna.b@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-038', nik: '3201011505950038', nama: 'Lisa Permatasari', jk: 'P', jab: 'Magang Finance Admin', grade: 'JUNIOR-STAFF', unit: 'SUBBAG-TAX', st: 'MAGANG', pd: 'D3', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'lisa.p@inl.co.id', role: 'user', active: false }, // Suspended 4
    { nrk: 'NRK-039', nik: '3201011505950039', nama: 'Maman Budiman', jk: 'L', jab: 'Driver Direksi', grade: 'STAFF', unit: 'SUBBAG-GA', st: 'OUTSOURCE', pd: 'SMA', nk: 'CERAI', area: 'Kantor Direksi Medan', email: 'maman.b@inl.co.id', role: 'user', active: true },
    { nrk: 'NRK-040', nik: '3201011505950040', nama: 'Nita Rahmawati', jk: 'P', jab: 'Resepsionis Kantor Medan', grade: 'STAFF', unit: 'SUBBAG-GA', st: 'OUTSOURCE', pd: 'SMA', nk: 'BELUM_NIKAH', area: 'Kantor Direksi Medan', email: 'nita.r@inl.co.id', role: 'user', active: true },
  ]

  // Clear existing tables in correct order to avoid foreign key violations
  await db.delete(ssoToken)
  await db.delete(appUserAccess)
  await db.delete(user)
  await db.delete(employee)

  for (const emp of rawEmployees) {
    const gradeId = gradeMap.get(emp.grade) || null
    const unitId = unitMap.get(emp.unit) || null
    const statusKaryawanId = statusKaryawanMap.get(emp.st) || null
    const pendidikanTerakhirId = pendidikanMap.get(emp.pd) || null
    const statusPernikahanId = statusPernikahanMap.get(emp.nk) || null
    const penempatanAreaId = penempatanAreaMap.get(emp.area) || null

    // 1. Insert Employee
    const [insertedEmp] = await db.insert(employee).values({
      nrk: emp.nrk,
      nik: emp.nik,
      nama: emp.nama,
      jenisKelamin: emp.jk,
      jabatan: emp.jab,
      gradeId,
      unitOrganisasiId: unitId,
      statusKaryawanId,
      pendidikanTerakhirId,
      statusPernikahanId,
      penempatanAreaId,
      isActive: true,
    }).returning()

    // 2. Insert User
    await db.insert(user).values({
      email: emp.email,
      passwordHash: commonPasswordHash,
      role: emp.role as any,
      isActive: emp.active,
      employeeId: insertedEmp.id,
    })
  }

  // Connect manager reporting hierarchies (atasan_id)
  const allEmps = await db.select().from(employee)
  const empMap = new Map(allEmps.map(e => [e.nrk, e.id]))

  const updateReport = async (subordinateNrk: string, managerNrk: string) => {
    const subId = empMap.get(subordinateNrk)
    const mgrId = empMap.get(managerNrk)
    if (subId && mgrId) {
      await db.update(employee).set({ atasanId: mgrId }).where(eq(employee.id, subId))
    }
  }

  // DIRUT reports to nobody
  // SEVPs report to DIRUT
  await updateReport('NRK-003', 'NRK-002') // SEVP-OPS -> DIRUT
  await updateReport('NRK-004', 'NRK-002') // SEVP-CORP -> DIRUT
  
  // Managers report to SEVPs
  await updateReport('NRK-005', 'NRK-003') // BAG-PROD Manager -> SEVP-OPS
  await updateReport('NRK-006', 'NRK-003') // BAG-MAINT Manager -> SEVP-OPS
  await updateReport('NRK-007', 'NRK-004') // BAG-FIN Manager -> SEVP-CORP
  await updateReport('NRK-008', 'NRK-004') // BAG-HR Manager -> SEVP-CORP
  await updateReport('NRK-009', 'NRK-004') // BAG-IT Manager -> SEVP-CORP

  // Asst Managers report to Managers
  await updateReport('NRK-010', 'NRK-005') // SUBBAG-FRAC Asst -> BAG-PROD Manager
  await updateReport('NRK-011', 'NRK-005') // SUBBAG-PACK Asst -> BAG-PROD Manager
  await updateReport('NRK-012', 'NRK-006') // SUBBAG-MECH Asst -> BAG-MAINT Manager
  await updateReport('NRK-013', 'NRK-006') // SUBBAG-ELEC Asst -> BAG-MAINT Manager
  await updateReport('NRK-014', 'NRK-007') // SUBBAG-TAX Asst -> BAG-FIN Manager
  await updateReport('NRK-015', 'NRK-008') // SUBBAG-RECRUIT Asst -> BAG-HR Manager
  await updateReport('NRK-016', 'NRK-008') // SUBBAG-GA Asst -> BAG-HR Manager
  await updateReport('NRK-017', 'NRK-009') // SUBBAG-NET Asst -> BAG-IT Manager
  await updateReport('NRK-018', 'NRK-001') // SUBBAG-APP Asst -> Budi Santoso (Admin / BOM-4) - let's make Budi Santoso direct report to IT Manager
  await updateReport('NRK-001', 'NRK-009') // Budi Santoso (Admin) -> BAG-IT Manager

  // Staff report to Asst Managers
  await updateReport('NRK-019', 'NRK-010') // Rudi (SPV) -> Fractionation Asst
  await updateReport('NRK-020', 'NRK-011') // Siti (SPV) -> Packaging Asst
  await updateReport('NRK-021', 'NRK-012') // Triyono (SPV) -> Mechanical Asst
  await updateReport('NRK-022', 'NRK-013') // Utomo (SPV) -> Electrical Asst
  await updateReport('NRK-023', 'NRK-014') // Vivi (Staff) -> Tax Asst
  await updateReport('NRK-024', 'NRK-015') // Wahyu (Staff) -> Recruit Asst
  await updateReport('NRK-025', 'NRK-016') // Yuni (Staff) -> GA Asst
  await updateReport('NRK-026', 'NRK-017') // Zulkifli (Staff) -> Net Asst
  await updateReport('NRK-027', 'NRK-018') // Ade (Developer) -> App Asst

  // Operators report to Supervisors
  await updateReport('NRK-028', 'NRK-019') // Operator -> Fractionation SPV
  await updateReport('NRK-029', 'NRK-019') // Operator -> Fractionation SPV
  await updateReport('NRK-030', 'NRK-020') // Operator -> Packaging SPV
  await updateReport('NRK-031', 'NRK-020') // Operator -> Packaging SPV
  await updateReport('NRK-032', 'NRK-021') // Operator -> Mechanical SPV
  await updateReport('NRK-033', 'NRK-021') // Operator -> Mechanical SPV
  await updateReport('NRK-034', 'NRK-022') // Operator -> Electrical SPV
  await updateReport('NRK-035', 'NRK-022') // Operator -> Electrical SPV

  // Interns and Outsource report to Asst Managers / Supervisors
  await updateReport('NRK-036', 'NRK-017') // Magang IT -> Net Asst
  await updateReport('NRK-037', 'NRK-015') // Magang HR -> Recruit Asst
  await updateReport('NRK-038', 'NRK-014') // Magang Fin -> Tax Asst
  await updateReport('NRK-039', 'NRK-016') // Driver -> GA Asst
  await updateReport('NRK-040', 'NRK-016') // Resepsionis -> GA Asst

  console.log('   ✅ Employees and Users loaded successfully')

  // ── Aplikasi ───────────────────────────────────────────────────────────────
  console.log('   → aplikasi')
  await db.delete(aplikasi)

  const appData = [
    {
      nama: 'E-Office INL',
      url: 'http://localhost:4001',
      authMode: 'sso' as const,
      warna: '#10b981',
      deskripsi: 'Sistem informasi persuratan resmi dan tata kelola administrasi dokumen kantor.',
      urutan: 1,
      isActive: true,
    },
    {
      nama: 'HRIS Portal',
      url: 'http://localhost:4002',
      authMode: 'sso' as const,
      warna: '#6366f1',
      deskripsi: 'Portal layanan kepegawaian mandiri (Employee Self Service), cuti, lembur, dan absensi.',
      urutan: 2,
      isActive: true,
    },
    {
      nama: 'E-Procurement',
      url: 'http://localhost:4003',
      authMode: 'independent' as const,
      warna: '#f59e0b',
      deskripsi: 'Sistem pengadaan barang dan jasa elektronik PT. Industri Nabati Lestari.',
      urutan: 3,
      isActive: true,
    },
  ]
  for (const app of appData) {
    await db.insert(aplikasi).values(app).onConflictDoNothing()
  }

  const allApps = await db.select().from(aplikasi)
  const appMap = new Map(allApps.map(a => [a.nama, a.id]))

  // ── App User Access ────────────────────────────────────────────────────────
  console.log('   → app_user_access')
  await db.delete(appUserAccess)

  const dbUsers = await db.select().from(user)
  const eOfficeId = appMap.get('E-Office INL')
  const hrisId = appMap.get('HRIS Portal')
  const eProcId = appMap.get('E-Procurement')
  const superAdminUser = dbUsers.find(u => u.role === 'super_admin')

  if (superAdminUser && eOfficeId && hrisId && eProcId) {
    // Give all users access to E-Office and HRIS, and some to E-Proc
    for (const u of dbUsers) {
      await db.insert(appUserAccess).values({
        userId: u.id,
        appId: eOfficeId,
        grantedById: superAdminUser.id,
      })
      await db.insert(appUserAccess).values({
        userId: u.id,
        appId: hrisId,
        grantedById: superAdminUser.id,
      })

      // Randomly grant E-Procurement access to 50% of the users
      if (Math.random() > 0.5) {
        await db.insert(appUserAccess).values({
          userId: u.id,
          appId: eProcId,
          grantedById: superAdminUser.id,
        })
      }
    }
  }

  // ── SSO Token Daily Logs (June 2026) ────────────────────────────────────────
  console.log('   → sso_token (Daily Logs for June 2026)')
  await db.delete(ssoToken)
  
  const ssoLogs: any[] = []
  
  // Deterministic randomizer helper
  let seedVal = 12345
  const rand = () => {
    seedVal = (seedVal * 9301 + 49297) % 233280
    return seedVal / 233280
  }

  const appIds = [eOfficeId, hrisId, eProcId].filter(Boolean) as string[]
  const userIds = dbUsers.map(u => u.id)

  if (appIds.length > 0 && userIds.length > 0) {
    for (let day = 1; day <= 30; day++) {
      // Generate between 15 and 40 tokens per day
      const count = 15 + Math.floor(rand() * 25)
      for (let i = 0; i < count; i++) {
        const uId = userIds[Math.floor(rand() * userIds.length)]
        const appId = appIds[Math.floor(rand() * appIds.length)]
        const hour = 8 + Math.floor(rand() * 9) // 08:00 to 17:00
        const min = Math.floor(rand() * 60)
        const sec = Math.floor(rand() * 60)
        
        const issuedAt = new Date(2026, 5, day, hour, min, sec) // Month is 0-indexed, so 5 is June
        const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000) // +5 min

        ssoLogs.push({
          userId: uId,
          appId: appId,
          tokenHash: crypto.createHash('sha256').update(crypto.randomBytes(40).toString('hex')).digest('hex'),
          issuedAt,
          expiresAt,
          isRevoked: false,
        })
      }
    }

    // Insert daily logs in chunks of 100 to avoid query parameter limit issues
    const chunkSize = 100
    for (let i = 0; i < ssoLogs.length; i += chunkSize) {
      const chunk = ssoLogs.slice(i, i + chunkSize)
      await db.insert(ssoToken).values(chunk)
    }
    console.log(`   ✅ Seeded ${ssoLogs.length} login logs for June 2026`)
  }

  console.log('\n✅  Seeding complete!\n')
  await client.end()
}

seed().catch(err => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
