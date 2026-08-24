// ─── Seed: Data Awal ──────────────────────────────────────────────────────────
import 'dotenv/config'
import { drizzle }              from 'drizzle-orm/postgres-js'
import postgres                  from 'postgres'
import { eq }                    from 'drizzle-orm'
import {
  refStatusKaryawan,
  refPendidikan,
  refStatusPernikahan,
  refGrade,
  refTipeUnit,
  refPenempatanArea,
  refKategoriAplikasi,
  refAgama,
  user,
  unitOrganisasi,
  employee,
  aplikasi,
  appUserAccess,
  ssoToken,
  activityLog,
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

  // Clear existing tables in correct order to avoid foreign key violations
  console.log('   → Clearing existing data...')
  await db.delete(activityLog)
  await db.delete(ssoToken)
  await db.delete(appUserAccess)
  await db.delete(user)
  await db.delete(employee)
  await db.delete(unitOrganisasi)
  await db.delete(aplikasi)
  await db.delete(refStatusKaryawan)
  await db.delete(refPendidikan)
  await db.delete(refStatusPernikahan)
  await db.delete(refGrade)
  await db.delete(refTipeUnit)
  await db.delete(refPenempatanArea)
  await db.delete(refKategoriAplikasi)
  await db.delete(refAgama)
  console.log('   ✅ Clean slate ready\n')

  // ── Ref Status Karyawan ────────────────────────────────────────────────────
  console.log('   → ref_status_karyawan')
  const statusKaryawanData = [
    { id: '4345a076-dda0-4120-825c-03e841d30cdf', kode: 'TETAP',    label: 'Karyawan Tetap' },
    { id: '2a4fcf67-9335-4337-b578-902b5d1e6641', kode: 'KONTRAK',  label: 'Karyawan Kontrak' },
    { id: '9bcc4704-599b-40d9-ba98-1e7cf82491a1', kode: 'MAGANG',   label: 'Magang / PKL' },
    { id: '077b047f-4dec-473a-82f6-4704195c9788', kode: 'OUTSOURCE',label: 'Outsource' },
    { id: '534477f6-8f9c-48a6-bf56-7c8c6635091c', kode: 'DFLO',     label: 'Karyawan Dalam Masa' },
  ]
  for (const data of statusKaryawanData) {
    await db.insert(refStatusKaryawan).values(data).onConflictDoNothing()
  }

  // ── Ref Pendidikan ─────────────────────────────────────────────────────────
  console.log('   → ref_pendidikan')
  const pendidikanData = [
    { id: '2c76f8f6-02e9-4c70-ad81-eb42c49336fe', kode: 'SD',    label: 'SD',                        urutan: 1 },
    { id: '7da92c56-e7d2-422e-bcd4-e2aa3ac583ec', kode: 'SMP',   label: 'SMP',                       urutan: 2 },
    { id: '71720f63-e7df-4ad1-a6ca-91940fa042f9', kode: 'SMA',   label: 'SMA / SMK / Sederajat',     urutan: 3 },
    { id: '68d5d09f-4c2a-45a4-8deb-44309bb66ae7', kode: 'D1',    label: 'Diploma I (D1)',             urutan: 4 },
    { id: 'f22ea169-56a1-4378-aee4-37632c99846e', kode: 'D2',    label: 'Diploma II (D2)',            urutan: 5 },
    { id: 'e58d8128-fb4f-4b34-a421-74ee354e2f25', kode: 'D3',    label: 'Diploma III (D3)',           urutan: 6 },
    { id: 'c2121010-9cdd-4c10-8aeb-273200668855', kode: 'D4',    label: 'Diploma IV (D4)',            urutan: 7 },
    { id: '7ac99029-3162-4399-b289-74f9b86ed391', kode: 'S1',    label: 'Sarjana (S1)',               urutan: 8 },
    { id: 'b9134c4a-66ac-4bf6-804f-ca793cc1c55c', kode: 'S2',    label: 'Magister (S2)',              urutan: 9 },
    { id: '76638846-8f34-45f2-929f-ec5b807e61ae', kode: 'S3',    label: 'Doktor (S3)',                urutan: 10 },
    { id: 'ba2f59c6-7535-463e-9333-4f6da4b7c245', kode: 'TK',    label: 'Taman Kanak Kanaks',        urutan: 11 },
  ]
  for (const data of pendidikanData) {
    await db.insert(refPendidikan).values(data).onConflictDoNothing()
  }

  // ── Ref Status Pernikahan ──────────────────────────────────────────────────
  console.log('   → ref_status_pernikahan')
  const statusPernikahanData = [
    { id: '928affb8-687a-4d46-91c5-45fdf2512ea8', kode: 'BELUM_NIKAH', label: 'Belum Menikah' },
    { id: '8324ee8e-cc67-42b0-8910-4f7377cf50c1', kode: 'MENIKAH',     label: 'Menikah' },
    { id: '24ef60ef-1c48-404d-8372-8517191d4bb5', kode: 'CERAI',       label: 'Cerai' },
    { id: 'ead0bcbc-9a76-46a2-adfe-10df959be0e2', kode: 'TIDAK_MENIKAH', label: 'Tidak Menikah' },
  ]
  for (const data of statusPernikahanData) {
    await db.insert(refStatusPernikahan).values(data).onConflictDoNothing()
  }

  // ── Ref Agama ─────────────────────────────────────────────────────────────
  console.log('   → ref_agama')
  const agamaData = [
    { kode: 'ISLAM',    label: 'Islam' },
    { kode: 'PROTESTAN',label: 'Kristen Protestan' },
    { kode: 'KATOLIK',  label: 'Kristen Katolik' },
    { kode: 'HINDU',    label: 'Hindu' },
    { kode: 'BUDDHA',   label: 'Buddha' },
    { kode: 'KHONGHUCU',label: 'Khonghucu' },
  ]
  for (const data of agamaData) {
    await db.insert(refAgama).values(data).onConflictDoNothing()
  }

  // ── Ref Grade ──────────────────────────────────────────────────────────────
  console.log('   → ref_grade')
  const gradeData = [
    { id: '28924a99-6921-4773-b34d-55de2d72cea3', kode: 'BOD',     label: 'Board of Director',     level: 20, keterangan: 'Direktur' },
    { id: 'ce2c1d4d-ff2e-49c5-8f72-3625fa7bb6b7', kode: 'BOM',     label: 'Board of Management',   level: 15, keterangan: 'SEVP' },
    { id: '69ed633e-3a10-4806-b0bb-69012c2759c4', kode: 'PKL',     label: 'PKL',                   level: 1,  keterangan: 'Praktek Kerja Lapangan' },
    { id: '8384b160-711f-43f9-97b7-647beae89137', kode: 'BOM-4',   label: 'Admin/Operator',        level: 5,  keterangan: 'Admin/Operator' },
    { id: '944de528-71cc-4c40-a946-4256d37d16f0', kode: 'BOM-1',   label: 'Kabag/Manager',         level: 13, keterangan: 'Kepala Bagian/Manager' },
    { id: '711cbb4a-938d-4405-ad08-cd19d80e0cce', kode: 'BOM-2',   label: 'Kasubag/Jr. Manager',   level: 10, keterangan: 'Kepala Sub Bagian/Junior Manager' },
    { id: 'c9dc4f45-3b5f-428c-a9dc-acdfe961a13f', kode: 'BOM-3',   label: 'Assisten/Supervisor',   level: 8,  keterangan: 'Assisten/Supervisor' },
  ]
  for (const data of gradeData) {
    await db.insert(refGrade).values(data).onConflictDoNothing()
  }

  // ── Ref Tipe Unit ──────────────────────────────────────────────────────────
  console.log('   → ref_tipe_unit')
  const tipeUnitData = [
    { id: 'b7051c21-69d0-4f35-ae82-cd2251191436', kode: 'direktorat', label: 'Direktorat', level: 5, warna: '#f59e0b' },
    { id: 'eee00912-4a6a-43f4-9ae6-16e0b2bcd59e', kode: 'sevp',       label: 'SEVP',       level: 4, warna: '#6366f1' },
    { id: '28b09266-ef42-4cd1-88f6-2eff011efcc5', kode: 'bagian',     label: 'Bagian',     level: 3, warna: '#10b981' },
    { id: '0e46c3da-562c-4f0d-99ed-83600378811c', kode: 'sub_bagian', label: 'Sub Bagian', level: 2, warna: '#3b82f6' },
    { id: 'f9819d41-2a4d-412c-b07e-d9f40dbba8ef', kode: 'seksi',      label: 'Seksi',      level: 1, warna: '#ec4899' },
  ]
  for (const data of tipeUnitData) {
    await db.insert(refTipeUnit).values(data).onConflictDoNothing()
  }

  // ── Ref Penempatan Area ────────────────────────────────────────────────────
  console.log('   → ref_penempatan_area')
  const penempatanAreaData = [
    { id: 'e39ae5ed-9965-44f4-8d42-3b05682a6f1b', kode: 'PKS_SEI_MANGKEI', nama: 'PKS Sei Mangkei', longitude: '99.3732', latitude: '3.1972' },
    { id: 'ca59ec54-880a-4e1f-b53b-c07d2ddbca60', kode: 'KDI_MEDAN', nama: 'Kantor Direksi Medan', longitude: '98.6782', latitude: '3.5852' },
    { id: 'b75182a4-4a79-4789-8641-c3989c363bd0', kode: 'GDG_KUALA_TANJUNG', nama: 'Gudang Logistik Kuala Tanjung', longitude: '99.4445', latitude: '3.3855' },
  ]
  for (const data of penempatanAreaData) {
    await db.insert(refPenempatanArea).values(data).onConflictDoNothing()
  }

  // ── Ref Kategori Aplikasi ──────────────────────────────────────────────────
  console.log('   → ref_kategori_aplikasi')
  const kategoriAplikasiData = [
    { kode: 'PRODUKTIVITAS', label: 'Produktivitas' },
    { kode: 'KOMUNIKASI',    label: 'Komunikasi' },
    { kode: 'OPERASIONAL',   label: 'Operasional' },
    { kode: 'SDM',           label: 'SDM' },
    { kode: 'MEDIA',         label: 'Media' },
    { kode: 'KEUANGAN',      label: 'Keuangan' },
    { kode: 'LAINNYA',       label: 'Lainnya' },
  ]
  for (const data of kategoriAplikasiData) {
    await db.insert(refKategoriAplikasi).values(data).onConflictDoNothing()
  }


  // ── Unit Organisasi ────────────────────────────────────────────────────────
  console.log('   → unit_organisasi')
  const unitData = [
    { id: 'e3eb44c1-ad1d-4a50-8254-299499f52084', nama: 'Direktur Utama', kode: 'DIRUT', tipe: 'direktorat' as const, parentId: null },
    { id: '7eb2cb37-57db-48ad-835e-eb734a834e24', nama: 'SEVP Business Support', kode: 'SEVPBS', tipe: 'sevp' as const, parentId: 'e3eb44c1-ad1d-4a50-8254-299499f52084' },
    { id: 'e371a958-c8e0-4077-9c6e-71fd46d5b249', nama: 'SEVP Operation', kode: 'SEVPO', tipe: 'sevp' as const, parentId: 'e3eb44c1-ad1d-4a50-8254-299499f52084' },
    { id: 'b4b93737-035e-443c-ba27-12e0a1b49138', nama: 'Sistem & IT', kode: 'SIH', tipe: 'sub_bagian' as const, parentId: '428b2964-4bb2-4f95-baa7-f78c86c22411' },
    { id: '428b2964-4bb2-4f95-baa7-f78c86c22411', nama: 'SDM & SISTEM', kode: 'SB_SIT', tipe: 'bagian' as const, parentId: '7eb2cb37-57db-48ad-835e-eb734a834e24' },
    { id: '656cf00b-f705-4333-8b85-6d418dcae199', nama: 'MANAJEMEN RISIKO', kode: 'RM', tipe: 'bagian' as const, parentId: 'e3eb44c1-ad1d-4a50-8254-299499f52084' },
    { id: '645f087a-ee8e-4366-9dcb-2bf0d6c0acf0', nama: 'SPI', kode: 'SPI', tipe: 'bagian' as const, parentId: 'e3eb44c1-ad1d-4a50-8254-299499f52084' },
    { id: '4b24e016-8082-4c1b-8c89-60544cb4d8a6', nama: 'Sekretariat Perusahaan', kode: 'SPE', tipe: 'sub_bagian' as const, parentId: 'e3eb44c1-ad1d-4a50-8254-299499f52084' },
    { id: 'ffd12d59-bd95-40e2-a2b8-9fc55145dc1b', nama: 'Pengadaan', kode: 'PND', tipe: 'sub_bagian' as const, parentId: '7eb2cb37-57db-48ad-835e-eb734a834e24' },
    { id: '665734c9-7feb-4775-9134-a2017277a185', nama: 'Keuangan & Akuntansi', kode: 'KUAK', tipe: 'bagian' as const, parentId: '7eb2cb37-57db-48ad-835e-eb734a834e24' },
    { id: 'dccf0d20-930a-44e2-931d-0ae811558806', nama: 'Produksi', kode: 'MPR', tipe: 'bagian' as const, parentId: 'e371a958-c8e0-4077-9c6e-71fd46d5b249' },
    { id: '9d577b6e-8216-4a92-80f7-cb95e8b65c11', nama: 'Supply Chain Management', kode: 'SCM', tipe: 'bagian' as const, parentId: 'e371a958-c8e0-4077-9c6e-71fd46d5b249' },
    { id: 'e99e6ad8-6897-4b5a-bf2a-903f687f7daa', nama: 'Enginering', kode: 'EM', tipe: 'bagian' as const, parentId: 'e371a958-c8e0-4077-9c6e-71fd46d5b249' },
    { id: '56fb2470-b30c-406b-bffa-c1b4be9e2643', nama: 'Quality Assurance & Control', kode: 'QACR', tipe: 'sub_bagian' as const, parentId: 'e371a958-c8e0-4077-9c6e-71fd46d5b249' },
    { id: '03079178-5279-4443-bde3-cef8b5fe79c5', nama: 'Business Product ', kode: 'JMBP', tipe: 'sub_bagian' as const, parentId: 'e371a958-c8e0-4077-9c6e-71fd46d5b249' },
    { id: '9f582ec1-6dea-4fc4-8dfe-6475c42d245d', nama: 'Marketing & Sales', kode: 'MS', tipe: 'bagian' as const, parentId: 'e3eb44c1-ad1d-4a50-8254-299499f52084' },
    { id: '234508a8-2b07-4885-ad29-7202c119fd1f', nama: 'Health Safety Security Environtment', kode: 'HSSE', tipe: 'seksi' as const, parentId: 'b4b93737-035e-443c-ba27-12e0a1b49138' },
    { id: '55a98475-bcd3-4c02-b931-2eea08fbe0ec', nama: 'Sdm & Umum', kode: 'SUM', tipe: 'sub_bagian' as const, parentId: '428b2964-4bb2-4f95-baa7-f78c86c22411' },
    { id: 'f29a9427-d6b6-4b23-8a6c-5cdf84e08024', nama: 'Legal', kode: 'LG', tipe: 'sub_bagian' as const, parentId: '428b2964-4bb2-4f95-baa7-f78c86c22411' },
    { id: '6c16ea15-648c-4a5a-b298-04b208cf2722', nama: 'Manager Sourcing CPO', kode: 'MSC', tipe: 'bagian' as const, parentId: 'e3eb44c1-ad1d-4a50-8254-299499f52084' },
    { id: 'e3ff63c3-c05f-4dd7-8d91-c26be4337727', nama: 'IT', kode: 'IT', tipe: 'seksi' as const, parentId: 'b4b93737-035e-443c-ba27-12e0a1b49138' },
  ]

  for (const u of unitData) {
    await db.insert(unitOrganisasi).values({
      id: u.id,
      kode: u.kode,
      nama: u.nama,
      tipe: u.tipe,
      isActive: true,
    }).onConflictDoNothing()
  }

  // Connect parent-child hierarchies
  for (const u of unitData) {
    if (u.parentId) {
      await db.update(unitOrganisasi).set({ parentId: u.parentId }).where(eq(unitOrganisasi.id, u.id))
    }
  }

  // ── Employees ──────────────────────────────────────────────────────────────
  console.log('   → employees')
  const employeeData = [
    {
      id: '2fd4e52c-9d02-422c-b687-bcd220dc83b6',
      nrk: 'NRK-12132142131',
      nik: '1231288979898442',
      nama: 'Oka Aritonang',
      jenisKelamin: 'L',
      jabatan: 'Admin HSSE',
      gradeId: '944de528-71cc-4c40-a946-4256d37d16f0',
      atasanId: null,
      unitOrganisasiId: 'b4b93737-035e-443c-ba27-12e0a1b49138',
      tanggalMasuk: '2026-06-30',
      tempatLahir: 'Medan',
      tanggalLahir: '2026-05-31',
      fotoProfil: '1782438704136_vsv7pr.png',
      statusKaryawanId: '4345a076-dda0-4120-825c-03e841d30cdf',
      pendidikanTerakhirId: '76638846-8f34-45f2-929f-ec5b807e61ae',
      statusPernikahanId: '8324ee8e-cc67-42b0-8910-4f7377cf50c1',
      nomorHp: '11111',
      alamat: '22223',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: '1397517d-f78e-4827-b124-c6dc987103b9',
      nrk: '11111111',
      nik: '1111111111111111',
      nama: 'Fitri Febriadi Turnip',
      jenisKelamin: 'P',
      jabatan: 'Pj. Asisten MR & HSSE',
      gradeId: 'c9dc4f45-3b5f-428c-a9dc-acdfe961a13f',
      atasanId: null,
      unitOrganisasiId: '234508a8-2b07-4885-ad29-7202c119fd1f',
      tanggalMasuk: '2026-06-26',
      tempatLahir: 'Jakarta',
      tanggalLahir: '2026-06-26',
      fotoProfil: '1782440353080_c0iyfa.png',
      statusKaryawanId: '4345a076-dda0-4120-825c-03e841d30cdf',
      pendidikanTerakhirId: '76638846-8f34-45f2-929f-ec5b807e61ae',
      statusPernikahanId: '928affb8-687a-4d46-91c5-45fdf2512ea8',
      nomorHp: '0000000000000000000',
      alamat: '00000000000000000000',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'f3e415ee-f7e3-4c21-99d8-2dd6bde057cd',
      nrk: 'NRK-13872471823',
      nik: '2394023478454312',
      nama: 'Achmad Fadil',
      jenisKelamin: 'L',
      jabatan: 'IT Listrik',
      gradeId: '8384b160-711f-43f9-97b7-647beae89137',
      atasanId: null,
      unitOrganisasiId: '428b2964-4bb2-4f95-baa7-f78c86c22411',
      tanggalMasuk: '2026-06-15',
      tempatLahir: 'Medan',
      tanggalLahir: '1990-12-09',
      fotoProfil: '1782432299181_28k3ko.png',
      statusKaryawanId: '4345a076-dda0-4120-825c-03e841d30cdf',
      pendidikanTerakhirId: 'ba2f59c6-7535-463e-9333-4f6da4b7c245',
      statusPernikahanId: '928affb8-687a-4d46-91c5-45fdf2512ea8',
      nomorHp: '0817283123531',
      alamat: 'Batu Bara',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: '35fe5623-5369-4657-9788-80912576014b',
      nrk: 'NRK-129918274391',
      nik: '7847194687364781',
      nama: 'Darwin',
      jenisKelamin: 'L',
      jabatan: 'IT Keuangan',
      gradeId: '28924a99-6921-4773-b34d-55de2d72cea3',
      atasanId: null,
      unitOrganisasiId: 'e3eb44c1-ad1d-4a50-8254-299499f52084',
      tanggalMasuk: '2026-06-13',
      tempatLahir: 'Jakarta',
      tanggalLahir: '1990-12-09',
      fotoProfil: '1782432615569_mwpbtt.png',
      statusKaryawanId: '2a4fcf67-9335-4337-b578-902b5d1e6641',
      pendidikanTerakhirId: 'b9134c4a-66ac-4bf6-804f-ca793cc1c55c',
      statusPernikahanId: '928affb8-687a-4d46-91c5-45fdf2512ea8',
      nomorHp: '-',
      alamat: '-',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'ec96fb22-0bc3-418d-a9ec-67fc10e3e52a',
      nrk: '0127398719231',
      nik: '2109047982174872',
      nama: 'Zulianto',
      jenisKelamin: 'L',
      jabatan: 'Bisnis Support',
      gradeId: '944de528-71cc-4c40-a946-4256d37d16f0',
      atasanId: null,
      unitOrganisasiId: '7eb2cb37-57db-48ad-835e-eb734a834e24',
      tanggalMasuk: '2026-06-26',
      tempatLahir: 'Medan',
      tanggalLahir: '2026-06-26',
      fotoProfil: null,
      statusKaryawanId: '2a4fcf67-9335-4337-b578-902b5d1e6641',
      pendidikanTerakhirId: '7ac99029-3162-4399-b289-74f9b86ed391',
      statusPernikahanId: 'ead0bcbc-9a76-46a2-adfe-10df959be0e2',
      nomorHp: 'a',
      alamat: 'a',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: '45d81ecb-5357-41dc-8bb4-7d1e7aa7a1a9',
      nrk: 'NRK-10389812378',
      nik: '1982638712947981',
      nama: 'Tommy Inri',
      jenisKelamin: 'L',
      jabatan: 'Asisten IT',
      gradeId: 'c9dc4f45-3b5f-428c-a9dc-acdfe961a13f',
      atasanId: null,
      unitOrganisasiId: 'e3ff63c3-c05f-4dd7-8d91-c26be4337727',
      tanggalMasuk: '2026-06-17',
      tempatLahir: 'Batu Bara',
      tanggalLahir: '2026-07-01',
      fotoProfil: '1782439198277_25zppb.jpg',
      statusKaryawanId: '9bcc4704-599b-40d9-ba98-1e7cf82491a1',
      pendidikanTerakhirId: '7ac99029-3162-4399-b289-74f9b86ed391',
      statusPernikahanId: '8324ee8e-cc67-42b0-8910-4f7377cf50c1',
      nomorHp: '-',
      alamat: '-',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'a21b8125-2118-4739-a78a-b74f344d3367',
      nrk: 'NRK-2903719728391',
      nik: '3238478198734321',
      nama: 'Salman WIjaya S',
      jenisKelamin: 'L',
      jabatan: 'Admin Network & Data Center',
      gradeId: '8384b160-711f-43f9-97b7-647beae89137',
      atasanId: null,
      unitOrganisasiId: 'e3ff63c3-c05f-4dd7-8d91-c26be4337727',
      tanggalMasuk: '2026-06-04',
      tempatLahir: 'Medan',
      tanggalLahir: '1000-12-09',
      fotoProfil: '1782439041856_km9n9a.webp',
      statusKaryawanId: '9bcc4704-599b-40d9-ba98-1e7cf82491a1',
      pendidikanTerakhirId: '7ac99029-3162-4399-b289-74f9b86ed391',
      statusPernikahanId: '8324ee8e-cc67-42b0-8910-4f7377cf50c1',
      nomorHp: '-',
      alamat: '-',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'b6c1259e-3032-49c3-a9ca-becafb2d3d5c',
      nrk: '193281234123',
      nik: '1293941222222222',
      nama: 'Aundry',
      jenisKelamin: 'L',
      jabatan: 'Admin Network & Data Center',
      gradeId: '8384b160-711f-43f9-97b7-647beae89137',
      atasanId: null,
      unitOrganisasiId: 'e3ff63c3-c05f-4dd7-8d91-c26be4337727',
      tanggalMasuk: '2026-06-26',
      tempatLahir: 'Jakarta',
      tanggalLahir: '2026-06-26',
      fotoProfil: null,
      statusKaryawanId: '2a4fcf67-9335-4337-b578-902b5d1e6641',
      pendidikanTerakhirId: 'b9134c4a-66ac-4bf6-804f-ca793cc1c55c',
      statusPernikahanId: '928affb8-687a-4d46-91c5-45fdf2512ea8',
      nomorHp: '1',
      alamat: '1',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: '841c1eb4-f34d-47e4-a4e2-0015d0766c3a',
      nrk: '0000000000000000',
      nik: '0000000000000000',
      nama: 'Reffan Damanik',
      jenisKelamin: 'L',
      jabatan: 'PKL',
      gradeId: '69ed633e-3a10-4806-b0bb-69012c2759c4',
      atasanId: null,
      unitOrganisasiId: 'e3ff63c3-c05f-4dd7-8d91-c26be4337727',
      tanggalMasuk: '2026-07-01',
      tempatLahir: 'Medan',
      tanggalLahir: '2026-06-09',
      fotoProfil: null,
      statusKaryawanId: '9bcc4704-599b-40d9-ba98-1e7cf82491a1',
      pendidikanTerakhirId: '71720f63-e7df-4ad1-a6ca-91940fa042f9',
      statusPernikahanId: '24ef60ef-1c48-404d-8372-8517191d4bb5',
      nomorHp: '000000000000',
      alamat: '000000000000000',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'a49bc411-dde4-4f4e-9537-1bdfbc976262',
      nrk: '00000000000',
      nik: '0000000000000001',
      nama: 'Herbiana',
      jenisKelamin: 'P',
      jabatan: 'Admin MR & HSSE',
      gradeId: 'c9dc4f45-3b5f-428c-a9dc-acdfe961a13f',
      atasanId: null,
      unitOrganisasiId: '234508a8-2b07-4885-ad29-7202c119fd1f',
      tanggalMasuk: '2026-06-25',
      tempatLahir: 'Sei Mangkei',
      tanggalLahir: '2026-06-01',
      fotoProfil: '1782445796370_11m7gk.jpg',
      statusKaryawanId: '4345a076-dda0-4120-825c-03e841d30cdf',
      pendidikanTerakhirId: 'b9134c4a-66ac-4bf6-804f-ca793cc1c55c',
      statusPernikahanId: '928affb8-687a-4d46-91c5-45fdf2512ea8',
      nomorHp: '00000',
      alamat: '00000',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'd1065e77-06ea-470d-b7d6-465ff9152469',
      nrk: '0348182831234',
      nik: '0000000000000002',
      nama: 'Gilang Syafrizal',
      jenisKelamin: 'L',
      jabatan: 'Admin HSSE',
      gradeId: '8384b160-711f-43f9-97b7-647beae89137',
      atasanId: null,
      unitOrganisasiId: '234508a8-2b07-4885-ad29-7202c119fd1f',
      tanggalMasuk: '2026-06-25',
      tempatLahir: 'Mangkei',
      tanggalLahir: '2026-06-12',
      fotoProfil: null,
      statusKaryawanId: '4345a076-dda0-4120-825c-03e841d30cdf',
      pendidikanTerakhirId: '7ac99029-3162-4399-b289-74f9b86ed391',
      statusPernikahanId: '8324ee8e-cc67-42b0-8910-4f7377cf50c1',
      nomorHp: '-',
      alamat: '-',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'd77c4b41-cf2f-4a4c-a5f2-56df3af427c9',
      nrk: '00000000000000000',
      nik: '0000000000000003',
      nama: 'Agung Prayoga',
      jenisKelamin: 'L',
      jabatan: 'Admin HSSE',
      gradeId: '8384b160-711f-43f9-97b7-647beae89137',
      atasanId: null,
      unitOrganisasiId: '234508a8-2b07-4885-ad29-7202c119fd1f',
      tanggalMasuk: '2026-06-26',
      tempatLahir: 'Sei Mangkei',
      tanggalLahir: '2026-06-25',
      fotoProfil: '1782446876286_p01pd6.jpg',
      statusKaryawanId: '2a4fcf67-9335-4337-b578-902b5d1e6641',
      pendidikanTerakhirId: '7ac99029-3162-4399-b289-74f9b86ed391',
      statusPernikahanId: '8324ee8e-cc67-42b0-8910-4f7377cf50c1',
      nomorHp: '-',
      alamat: '-',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'e2c086f0-8046-49aa-8260-2a2c4c01dde2',
      nrk: '012479812798389021',
      nik: '0000000000000004',
      nama: 'Hendry Suheri',
      jenisKelamin: 'L',
      jabatan: 'Danton',
      gradeId: '8384b160-711f-43f9-97b7-647beae89137',
      atasanId: null,
      unitOrganisasiId: '234508a8-2b07-4885-ad29-7202c119fd1f',
      tanggalMasuk: '2026-06-26',
      tempatLahir: 'Mangkei',
      tanggalLahir: '2026-06-07',
      fotoProfil: '1782447061065_h4mx8h.png',
      statusKaryawanId: '4345a076-dda0-4120-825c-03e841d30cdf',
      pendidikanTerakhirId: 'b9134c4a-66ac-4bf6-804f-ca793cc1c55c',
      statusPernikahanId: '8324ee8e-cc67-42b0-8910-4f7377cf50c1',
      nomorHp: '0',
      alamat: '0',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: 'a2461203-96a3-45c1-85ba-7c547b253090',
      nrk: '11111111111111',
      nik: '1111111111211212',
      nama: 'Raihan',
      jenisKelamin: 'P',
      jabatan: 'IT SS',
      gradeId: '69ed633e-3a10-4806-b0bb-69012c2759c4',
      atasanId: '45d81ecb-5357-41dc-8bb4-7d1e7aa7a1a9',
      unitOrganisasiId: 'e3ff63c3-c05f-4dd7-8d91-c26be4337727',
      tanggalMasuk: '2026-06-02',
      tempatLahir: 'Medan',
      tanggalLahir: '2026-06-30',
      fotoProfil: '1782528216635_kpnsje.png',
      statusKaryawanId: '9bcc4704-599b-40d9-ba98-1e7cf82491a1',
      pendidikanTerakhirId: 'c2121010-9cdd-4c10-8aeb-273200668855',
      statusPernikahanId: '24ef60ef-1c48-404d-8372-8517191d4bb5',
      nomorHp: '0182903',
      alamat: '124132412',
      isActive: true,
      penempatanAreaId: null,
    },
    {
      id: '34ab76d8-fc76-4089-8cb4-79300217a55f',
      nrk: '179817242178398',
      nik: '0000000000000011',
      nama: 'M RInko Wing Kurniawan',
      jenisKelamin: 'L',
      jabatan: 'IT',
      gradeId: '8384b160-711f-43f9-97b7-647beae89137',
      atasanId: null,
      unitOrganisasiId: 'e3ff63c3-c05f-4dd7-8d91-c26be4337727',
      tanggalMasuk: '2026-06-18',
      tempatLahir: 'Medan',
      tanggalLahir: '2026-06-03',
      fotoProfil: '1782480949033_44x699.png',
      statusKaryawanId: '4345a076-dda0-4120-825c-03e841d30cdf',
      pendidikanTerakhirId: '76638846-8f34-45f2-929f-ec5b807e61ae',
      statusPernikahanId: '928affb8-687a-4d46-91c5-45fdf2512ea8',
      nomorHp: '087868895920',
      alamat: '111',
      isActive: true,
      penempatanAreaId: null,
    },
  ]

  for (const emp of employeeData) {
    await db.insert(employee).values(emp).onConflictDoNothing()
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log('   → users')
  const userData = [
    {
      id: '3eae0052-e443-47d3-aff7-aa6aa818abb9',
      email: 'tonang@inl.co.id',
      passwordHash: '$2b$12$4zWcZ3krsCh4KRkvU4i6E.dMYBrgiUmrkHUDbtzkSIbC2eqUPO09i',
      role: 'user' as const,
      isActive: true,
      lastLogin: null,
      tokenVersion: 1,
      employeeId: '2fd4e52c-9d02-422c-b687-bcd220dc83b6',
      totpSecret: null,
      totpEnabled: false,
    },
    {
      id: '24d9198f-e074-42c6-88df-e13ac45aba42',
      email: 'salman@inl.co.id',
      passwordHash: '$2b$12$RvMqsqC.dPCbBmD/HJ4BFOjduTb9UNOXLZiuMLdqPzem.fXz4zZdK',
      role: 'user' as const,
      isActive: true,
      lastLogin: null,
      tokenVersion: 1,
      employeeId: 'a21b8125-2118-4739-a78a-b74f344d3367',
      totpSecret: null,
      totpEnabled: false,
    },
    {
      id: '8f193598-c1e4-4fb7-a143-2a6a139cfe37',
      email: 'ringkoaja@gmail.com',
      passwordHash: '$2b$12$ua/bx8MYwF3qWOppkyjOlO2iIYjqyGxFqgsXAlPcsjqNmGruKhx0a',
      role: 'user' as const,
      isActive: true,
      lastLogin: new Date('2026-06-26T14:00:26.63Z'),
      tokenVersion: 3,
      employeeId: '34ab76d8-fc76-4089-8cb4-79300217a55f',
      totpSecret: 'JPRPPA77CPPZHDDY',
      totpEnabled: false,
    },
    {
      id: '8670eacc-3420-47b3-a6e0-646c20506d89',
      email: 'tomy@inl.co.id',
      passwordHash: '$2b$12$7ai8lWUEHZKvBo3fym41aemjHSy.794UryxR4OtFkxZDpvhbdbN1m',
      role: 'user' as const,
      isActive: true,
      lastLogin: new Date('2026-06-26T13:26:22.122Z'),
      tokenVersion: 8,
      employeeId: '45d81ecb-5357-41dc-8bb4-7d1e7aa7a1a9',
      totpSecret: null,
      totpEnabled: false,
    },
    {
      id: 'e7016a86-7cc3-4b0b-a02f-7557373bdbac',
      email: 'admin@inl.co.id',
      passwordHash: '$2b$12$bVTLRYQUSLIvfoJbAgvO4O9cv..ujPzbJMr2WySXII1Q7iSlunqIG',
      role: 'super_admin' as const,
      isActive: true,
      lastLogin: new Date('2026-06-28T02:28:08.012Z'),
      tokenVersion: 10,
      employeeId: null,
      totpSecret: null,
      totpEnabled: false,
    },
  ]

  for (const u of userData) {
    await db.insert(user).values(u).onConflictDoNothing()
  }

  // ── Aplikasi ───────────────────────────────────────────────────────────────
  console.log('   → aplikasi')
  const aplikasiData = [
    {
      id: '2de877fe-8e91-4511-8d11-9f1979668802',
      nama: 'Google',
      url: 'google.com',
      authMode: 'independent' as const,
      icon: '1782480835216_x8dy2t.png',
      deskripsi: 'apk untuk google',
      urutan: 1,
      isActive: true,
      warna: '#3b82f6',
    },
    {
      id: '79864e1a-233b-4196-a6da-909ff7490f6f',
      nama: 'Sistem Absensi',
      url: 'https://absensi.inl.co.id',
      authMode: 'sso' as const,
      icon: '1782480852938_k0glts.png',
      deskripsi: 'Sistem pencatatan kehadiran karyawan',
      urutan: 1,
      isActive: true,
      warna: '#3b82f6',
    },
    {
      id: '8f252b13-9e8f-447d-80e4-0919a2cf2b43',
      nama: 'MeeTrip',
      url: 'http://localhost:3004',
      authMode: 'sso' as const,
      icon: 'meetrip_icon.png',
      deskripsi: 'Sistem Perjalanan Dinas & Calendar of Meeting',
      urutan: 2,
      isActive: true,
      warna: '#10b981',
    },
  ]

  for (const app of aplikasiData) {
    await db.insert(aplikasi).values(app).onConflictDoNothing()
  }

  // ── Activity Logs ──────────────────────────────────────────────────────────
  console.log('   → activity_log')
  // Ambil beberapa user untuk di-link ke log
  const allUsers = await db.select({ id: user.id, email: user.email }).from(user)
  const adminUser = allUsers.find(u => u.email === 'admin@inl.co.id')
  const normalUser = allUsers.find(u => u.email === 'hendra.gunawan@inl.co.id') || allUsers.find(u => u.email !== 'admin@inl.co.id')

  if (adminUser) {
    await db.insert(activityLog).values([
      {
        userId: adminUser!.id,
        action: 'login',
        details: 'Login ke Portal SSO',
        createdAt: new Date(Date.now() - 3600000 * 5),
      },
      {
        userId: adminUser!.id,
        action: 'access_app',
        appId: '79864e1a-233b-4196-a6da-909ff7490f6f', // Sistem Absensi
        details: 'Login Single Sign-On (SSO) ke aplikasi "Sistem Absensi"',
        createdAt: new Date(Date.now() - 3600000 * 4.5),
      },
      {
        userId: adminUser!.id,
        action: 'update_profile_photo',
        details: 'Mengubah foto profil karyawan',
        createdAt: new Date(Date.now() - 3600000 * 3),
      },
    ])
  }

  if (normalUser) {
    await db.insert(activityLog).values([
      {
        userId: normalUser!.id,
        action: 'login',
        details: 'Login ke Portal SSO (IP: 192.168.10.42)',
        createdAt: new Date(Date.now() - 3600000 * 2),
      },
      {
        userId: normalUser!.id,
        action: 'access_app',
        appId: '2de877fe-8e91-4511-8d11-9f1979668802', // Google
        details: 'Mengakses aplikasi Independent "Google"',
        createdAt: new Date(Date.now() - 3600000 * 1.8),
      },
      {
        userId: normalUser!.id,
        action: 'logout',
        details: 'Logout dari portal',
        createdAt: new Date(Date.now() - 3600000 * 0.5),
      },
    ])
  }
  
  console.log('\n✅  Seeding complete!\n')
  await client.end()
}
seed().catch(err => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
