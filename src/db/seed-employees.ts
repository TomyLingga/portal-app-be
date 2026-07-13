// ─── Seed: Import Karyawan dari Excel + Rebuild Unit Organisasi ──────────────
// Jalankan: npx tsx src/db/seed-employees.ts
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { eq, sql } from 'drizzle-orm'
import {
  refGrade,
  refStatusKaryawan,
  refPendidikan,
  refStatusPernikahan,
  refPenempatanArea,
  user,
  employee,
  unitOrganisasi,
} from './schema'

const client = postgres({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'inl_portal',
  max: 1,
})

const db = drizzle(client)

// ─── Normalizers ─────────────────────────────────────────────────────────────
function normalizeGradeKode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const g = raw.trim().toLowerCase()
  if (g === 'bod') return 'BOD'
  if (g === 'bom') return 'BOM'
  if (g === 'bom 1' || g === 'bom-1') return 'BOM-1'
  if (g === 'bom 2' || g === 'bom-2') return 'BOM-2'
  if (g === 'bom 3' || g === 'bom-3') return 'BOM-3'
  if (g === 'bom 4' || g === 'bom-4') return 'BOM-4'
  if (g === 'pkl') return 'PKL'
  return null
}

function normalizeStatusKaryawan(raw: string | null | undefined): string | null {
  if (!raw || raw === '-') return null
  const s = raw.trim().toLowerCase()
  if (s.includes('tetap')) return 'TETAP'
  if (s.includes('pkwt') || s.includes('kontrak')) return 'KONTRAK'
  if (s.includes('magang') || s.includes('pkl')) return 'MAGANG'
  if (s.includes('outsource')) return 'OUTSOURCE'
  return 'TETAP'
}

function normalizePendidikan(raw: string | null | undefined): string | null {
  if (!raw || raw === '-') return null
  const p = raw.trim().toLowerCase()
  if (p.includes('s3') || p === 'doktor') return 'S3'
  if (p.includes('s2') || p === 'magister') return 'S2'
  if (p.includes('d4') || p.includes('s1') || p === 'd4/s1') return 'S1'
  if (p.includes('d3')) return 'D3'
  if (p.includes('d2')) return 'D2'
  if (p.includes('d1') || p.includes('akadem')) return 'D1'
  if (p.includes('sma') || p.includes('smk') || p.includes('slta') || p.includes('ma')) return 'SMA'
  if (p.includes('smp')) return 'SMP'
  if (p.includes('sd')) return 'SD'
  return null
}

function normalizeStatusPernikahan(raw: string | number | null | undefined): string | null {
  if (!raw || raw === '-') return null
  if (typeof raw === 'number') {
    if (raw === 1) return 'BELUM_NIKAH'
    if (raw === 2) return 'MENIKAH'
    return null
  }
  const s = raw.trim().toLowerCase()
  if (s.includes('belum') || s === '1') return 'BELUM_NIKAH'
  if (s.includes('menikah') || s.includes('kawin') || s === '2') return 'MENIKAH'
  if (s.includes('cerai')) return 'CERAI'
  return null
}

function normalizeGender(raw: string | null | undefined): string {
  if (!raw) return 'L'
  const g = raw.trim().toLowerCase()
  if (g === 'wanita' || g === 'pr' || g === 'p' || g === 'perempuan') return 'P'
  return 'L'
}

function normalizeNrk(raw: string | number | null | undefined, rowIdx: number): string {
  if (!raw || raw === '-') return `EMP-${String(rowIdx).padStart(4, '0')}`
  if (typeof raw === 'number') return String(Math.round(raw))
  return String(raw).trim()
}

function normalizeNik(raw: string | number | null | undefined): string | null {
  if (!raw || raw === '-') return null
  if (typeof raw === 'number') return String(Math.round(raw))
  const s = String(raw).trim()
  return s === '-' ? null : s
}

function normalizePhone(raw: string | number | null | undefined): string | null {
  if (!raw || raw === 0 || raw === '-') return null
  if (typeof raw === 'number') {
    const s = String(raw)
    return s.startsWith('0') ? s : '0' + s
  }
  const s = String(raw).trim().replace(/\s+/g, '')
  if (s === '0' || s === '1' || s === '-') return null
  return s.startsWith('0') ? s : '0' + s
}

function normalizePenempatan(raw: string | number | null | undefined): string | null {
  if (!raw || raw === '-') return null
  if (typeof raw === 'number') return null
  const p = raw.trim().toLowerCase()
  // MO_INL = Manufacturing Operation INL (kantor & pabrik utama di KEK Sei Mangkei)
  if (p.includes('mo_inl') || p.includes('mo inl') || p.includes('sei mangkei') || p.includes('head office')) return 'PKS_SEI_MANGKEI'
  if (p.includes('medan') || p.includes('ro medan')) return 'KDI_MEDAN'
  if (p.includes('kuala tanjung') || p.includes('pti kuala tanjung')) return 'GDG_KUALA_TANJUNG'
  return null
}

// ─── Raw employee interface ──────────────────────────────────────────────────
interface RawEmployee {
  id: number | null
  name: string | null
  email: string | null
  noHP: string | number | null
  jabatan: string | null
  parent: string | null
  bagian: string | null
  subBagian: string | null
  seksi: string | null
  grade: string | null
  nrk: string | number | null
  nik: string | number | null
  tglMasuk: string | null
  tempatLahir: string | null
  tglLahir: string | null
  kelamin: string | null
  statusKaryawan: string | null
  pendidikan: string | null
  agama: string | null
  penempatan: string | number | null
  statusPerkawinan: string | number | null
  alamatKtp: string | null
  alamatDomisili: string | null
}

// ─── Normalize bagian name for consistency ───────────────────────────────────
function normalizeBagianName(raw: string): string {
  const s = raw.trim()
  // "SDM & SISTEM" → "SDM & Sistem"
  if (s.toLowerCase() === 'sdm & sistem') return 'SDM & Sistem'
  // "Refinery & Fractionation PMG II" → "Refinery & Fractionation PMG 2"
  if (s === 'Refinery & Fractionation PMG II') return 'Refinery & Fractionation PMG 2'
  return s
}

// ─── Generate unique kode from name ──────────────────────────────────────────
function generateKode(name: string, tipe: string, usedKodes: Set<string>): string {
  // Take first letters of each word, uppercase, max 10 chars
  let kode = name
    .replace(/[&()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 8)

  if (!kode) kode = 'U'

  // Add tipe prefix for uniqueness
  const prefix = tipe === 'seksi' ? 'S_' : tipe === 'sub_bagian' ? 'SB_' : ''
  kode = prefix + kode

  // Ensure uniqueness
  let candidate = kode
  let suffix = 1
  while (usedKodes.has(candidate)) {
    candidate = `${kode}${suffix}`
    suffix++
  }
  usedKodes.add(candidate)
  return candidate
}

// ─── Build the org hierarchy from employee data ─────────────────────────────
interface OrgUnit {
  nama: string
  kode: string
  tipe: 'direktorat' | 'sevp' | 'bagian' | 'sub_bagian' | 'seksi'
  parentKey: string | null
  key: string
}

function buildOrgTree(employees: RawEmployee[]): OrgUnit[] {
  const usedKodes = new Set<string>()
  const unitMap = new Map<string, OrgUnit>()

  // Helper to add a unit if not already present
  function addUnit(
    nama: string,
    tipe: OrgUnit['tipe'],
    parentKey: string | null,
  ): string {
    const normalNama = normalizeBagianName(nama)
    const key = `${tipe}::${normalNama}::${parentKey ?? 'ROOT'}`
    if (!unitMap.has(key)) {
      const kode = generateKode(normalNama, tipe, usedKodes)
      unitMap.set(key, { nama: normalNama, kode, tipe, parentKey, key })
    }
    return key
  }

  // Level 1: Direktur Utama (root)
  const rootKey = addUnit('Direktur Utama', 'direktorat', null)

  // Level 2: SEVP
  const sevpBsKey = addUnit('SEVP Business Support', 'sevp', rootKey)
  const sevpOpKey = addUnit('SEVP Operation', 'sevp', rootKey)

  // Map parent values from Excel to SEVP keys
  const parentToSevp: Record<string, string> = {
    'Business Support': sevpBsKey,
    'Operation': sevpOpKey,
    'Direktur': rootKey,
  }

  // Determine which SEVP each bagian belongs to
  const bagianToParent = new Map<string, string>()

  for (const emp of employees) {
    if (!emp.bagian) continue
    const bagian = normalizeBagianName(emp.bagian)
    if (bagian === 'Direktur' || bagian === 'Business Support') continue

    if (emp.parent && parentToSevp[emp.parent]) {
      bagianToParent.set(bagian, parentToSevp[emp.parent])
    }
  }

  // Bagian directly under Direktur (from data analysis)
  const direkturBagian = ['SPI', 'Sekretariat Perusahaan', 'Sales & Marketing', 'Sourcing CPO']
  for (const b of direkturBagian) {
    if (!bagianToParent.has(b)) bagianToParent.set(b, rootKey)
  }

  // Bagian under Business Support
  const bsBagian = ['SDM & Sistem', 'Keuangan & Akuntansi', 'Pengadaan']
  for (const b of bsBagian) {
    if (!bagianToParent.has(b)) bagianToParent.set(b, sevpBsKey)
  }

  // Bagian under Operation
  const opBagian = ['Production', 'Supply Chain Management', 'Engineering', 'Quality Assurance & Control', 'Business Product']
  for (const b of opBagian) {
    if (!bagianToParent.has(b)) bagianToParent.set(b, sevpOpKey)
  }

  // Level 3: Bagian — collect all unique bagian names
  const bagianKeys = new Map<string, string>()
  for (const emp of employees) {
    if (!emp.bagian) continue
    const bagian = normalizeBagianName(emp.bagian)
    if (bagian === 'Direktur' || bagian === 'Business Support') continue
    if (bagianKeys.has(bagian)) continue

    const parentKey = bagianToParent.get(bagian) ?? rootKey
    const key = addUnit(bagian, 'bagian', parentKey)
    bagianKeys.set(bagian, key)
  }

  // Level 4: Sub-Bagian
  const subBagianKeys = new Map<string, string>()
  for (const emp of employees) {
    if (!emp.subBagian || !emp.bagian) continue
    const subBagian = normalizeBagianName(emp.subBagian)
    const bagian = normalizeBagianName(emp.bagian)
    const compositeKey = `${bagian}/${subBagian}`

    if (subBagianKeys.has(compositeKey)) continue

    const parentBagianKey = bagianKeys.get(bagian)
    if (!parentBagianKey) continue

    const key = addUnit(subBagian, 'sub_bagian', parentBagianKey)
    subBagianKeys.set(compositeKey, key)
  }

  // Level 5: Seksi
  for (const emp of employees) {
    if (!emp.seksi || !emp.subBagian || !emp.bagian) continue
    const seksi = normalizeBagianName(emp.seksi)
    const subBagian = normalizeBagianName(emp.subBagian)
    const bagian = normalizeBagianName(emp.bagian)
    const compositeKey = `${bagian}/${subBagian}/${seksi}`

    const parentSubKey = subBagianKeys.get(`${bagian}/${subBagian}`)
    if (!parentSubKey) continue

    addUnit(seksi, 'seksi', parentSubKey)
  }

  return Array.from(unitMap.values())
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function seedEmployees() {
  console.log('🌱  Seeding employees + unit organisasi...\n')

  const fs = await import('fs')
  const path = await import('path')
  const dataPath = path.join(__dirname, 'employee-data.json')

  let employees: RawEmployee[]
  if (fs.existsSync(dataPath)) {
    employees = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    console.log(`   → Loaded ${employees.length} employees from JSON`)
  } else {
    console.error('❌  employee-data.json not found!')
    await client.end()
    process.exit(1)
  }

  // ── Fetch reference IDs ────────────────────────────────────────────────────
  console.log('   → Fetching reference data...')
  const grades = await db.select().from(refGrade)
  const statuses = await db.select().from(refStatusKaryawan)
  const pendidikans = await db.select().from(refPendidikan)
  const pernikahans = await db.select().from(refStatusPernikahan)
  const areas = await db.select().from(refPenempatanArea)

  const gradeMap = new Map(grades.map(g => [g.kode, g.id]))
  const statusMap = new Map(statuses.map(s => [s.kode, s.id]))
  const pendidikanMap = new Map(pendidikans.map(p => [p.kode, p.id]))
  const pernikahanMap = new Map(pernikahans.map(p => [p.kode, p.id]))
  const areaMap = new Map(areas.map(a => [a.kode, a.id]))

  // ── Rebuild unit_organisasi ────────────────────────────────────────────────
  console.log('   → Rebuilding unit organisasi...')

  // Unlink employees from units first
  await db.execute(sql`UPDATE "employee" SET unit_organisasi_id = NULL WHERE unit_organisasi_id IS NOT NULL`)
  // Delete all existing units
  await db.delete(unitOrganisasi)
  console.log('   ✅ Old unit organisasi cleared')

  const orgUnits = buildOrgTree(employees)
  console.log(`   → Inserting ${orgUnits.length} unit organisasi...`)

  // Insert in order: direktorat → sevp → bagian → sub_bagian → seksi
  const tipeOrder: OrgUnit['tipe'][] = ['direktorat', 'sevp', 'bagian', 'sub_bagian', 'seksi']
  const keyToId = new Map<string, string>()

  for (const tipe of tipeOrder) {
    const units = orgUnits.filter(u => u.tipe === tipe)
    for (const unit of units) {
      const parentId = unit.parentKey ? keyToId.get(unit.parentKey) ?? null : null
      const [result] = await db.insert(unitOrganisasi).values({
        nama: unit.nama,
        kode: unit.kode,
        tipe: unit.tipe,
        parentId,
        isActive: true,
      }).returning({ id: unitOrganisasi.id })
      keyToId.set(unit.key, result.id)
    }
  }
  console.log(`   ✅ Inserted ${orgUnits.length} unit organisasi\n`)

  // Build lookup for employee → unit mapping
  // We need to find the unit ID for each employee's most specific level
  function getEmployeeUnitKey(emp: RawEmployee): string | null {
    const bagian = emp.bagian ? normalizeBagianName(emp.bagian) : null
    const subBagian = emp.subBagian ? normalizeBagianName(emp.subBagian) : null
    const seksi = emp.seksi ? normalizeBagianName(emp.seksi) : null

    // Map Direktur to "Direktur Utama" direktorat unit
    if (bagian === 'Direktur') {
      return orgUnits.find(u => u.tipe === 'direktorat' && u.nama === 'Direktur Utama')?.key ?? null
    }

    // Map SEVP Business Support to its sevp unit
    if (bagian === 'Business Support') {
      return orgUnits.find(u => u.tipe === 'sevp' && u.nama === 'SEVP Business Support')?.key ?? null
    }

    if (!bagian) return null

    // Try seksi first (most specific)
    if (seksi && subBagian) {
      for (const unit of orgUnits) {
        if (unit.tipe === 'seksi' && unit.nama === seksi) {
          const parentSub = orgUnits.find(u => u.key === unit.parentKey)
          if (parentSub && parentSub.nama === subBagian) return unit.key
        }
      }
    }

    // Try sub_bagian
    if (subBagian) {
      for (const unit of orgUnits) {
        if (unit.tipe === 'sub_bagian' && unit.nama === subBagian) {
          const parentBag = orgUnits.find(u => u.key === unit.parentKey)
          if (parentBag && parentBag.nama === bagian) return unit.key
        }
      }
    }

    // Fall back to bagian
    for (const unit of orgUnits) {
      if (unit.tipe === 'bagian' && unit.nama === bagian) return unit.key
    }

    return null
  }

  // ── Clear existing employees ───────────────────────────────────────────────
  console.log('   → Clearing existing employees...')
  await db.execute(sql`UPDATE "user" SET employee_id = NULL WHERE employee_id IS NOT NULL`)
  await db.delete(employee)
  console.log('   ✅ Employees cleared\n')

  // ── Insert employees ───────────────────────────────────────────────────────
  const usedNrks = new Set<string>()
  const insertedEmployees: { nrk: string; id: string; name: string; jabatan: string; email: string | null }[] = []

  console.log('   → Inserting employees...')
  let inserted = 0
  let skipped = 0

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i]

    if (!emp.name) { skipped++; continue }
    const nama = emp.name.trim().replace(/\xa0/g, ' ')
    if (!nama) { skipped++; continue }

    let nrk = normalizeNrk(emp.nrk, i + 1)
    if (usedNrks.has(nrk)) nrk = `${nrk}-${i}`
    usedNrks.add(nrk)

    const gradeKode = normalizeGradeKode(emp.grade)
    const gradeId = gradeKode ? gradeMap.get(gradeKode) ?? null : null
    const statusKode = normalizeStatusKaryawan(emp.statusKaryawan)
    const statusKaryawanId = statusKode ? statusMap.get(statusKode) ?? null : null
    const pendidikanKode = normalizePendidikan(emp.pendidikan)
    const pendidikanId = pendidikanKode ? pendidikanMap.get(pendidikanKode) ?? null : null
    const pernikahanKode = normalizeStatusPernikahan(emp.statusPerkawinan)
    const pernikahanId = pernikahanKode ? pernikahanMap.get(pernikahanKode) ?? null : null
    const penempatanKode = normalizePenempatan(emp.penempatan)
    const penempatanAreaId = penempatanKode ? areaMap.get(penempatanKode) ?? null : null

    let jabatan = emp.jabatan?.trim() || 'Karyawan'
    if (jabatan === 'al') jabatan = 'Supervisor Refinery & Fractionation PMG 2'

    const nik = normalizeNik(emp.nik)
    const nomorHp = normalizePhone(emp.noHP)
    const jenisKelamin = normalizeGender(emp.kelamin)
    const tanggalMasuk = emp.tglMasuk || null
    const tanggalLahir = emp.tglLahir || null
    const tempatLahir = emp.tempatLahir?.trim() || null

    let alamat = emp.alamatKtp?.trim() || emp.alamatDomisili?.trim() || null
    if (alamat === '-' || alamat === '1') alamat = null

    let agama = emp.agama?.trim() || null
    if (agama === '-') agama = null
    if (agama) {
      const ag = agama.toLowerCase()
      if (ag === 'islam') agama = 'Islam'
      else if (ag.includes('protestan')) agama = 'Kristen Protestan'
      else if (ag.includes('katolik')) agama = 'Kristen Katolik'
      else if (ag === 'hindu') agama = 'Hindu'
      else if (ag === 'buddha' || ag === 'budha') agama = 'Buddha'
      else if (ag.includes('khonghucu')) agama = 'Khonghucu'
    }

    // Map employee to unit organisasi
    const unitKey = getEmployeeUnitKey(emp)
    const unitOrganisasiId = unitKey ? keyToId.get(unitKey) ?? null : null

    const result = await db.insert(employee).values({
      nrk,
      nik,
      nama,
      jenisKelamin,
      jabatan,
      gradeId,
      atasanId: null,
      unitOrganisasiId,
      tanggalMasuk,
      tempatLahir,
      tanggalLahir,
      statusKaryawanId,
      pendidikanTerakhirId: pendidikanId,
      statusPernikahanId: pernikahanId,
      penempatanAreaId,
      nomorHp,
      agama,
      alamat,
      isActive: true,
    }).returning({ id: employee.id })

    const email = emp.email?.trim().toLowerCase() || null
    insertedEmployees.push({ nrk, id: result[0].id, name: nama, jabatan, email })
    inserted++
  }

  console.log(`   ✅ Inserted ${inserted} employees (skipped ${skipped} empty rows)\n`)

  // ── Pass 2: Set hierarchy (atasan_id) ──────────────────────────────────────
  console.log('   → Setting hierarchy (atasan_id)...')

  const direktur = insertedEmployees.find(e => e.jabatan === 'Direktur')
  const sevpBs = insertedEmployees.find(e => e.jabatan === 'SEVP Business Support')

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i]
    if (!emp.name || !emp.parent) continue

    const parentKey = emp.parent.trim()
    let atasanId: string | undefined

    if (parentKey === 'Direktur') atasanId = direktur?.id
    else if (parentKey === 'Business Support') atasanId = sevpBs?.id
    else if (parentKey === 'Operation') atasanId = direktur?.id

    if (atasanId) {
      const empName = emp.name.trim().replace(/\xa0/g, ' ')
      const target = insertedEmployees.find(e => e.name === empName)
      if (target) {
        await db.update(employee)
          .set({ atasanId })
          .where(eq(employee.id, target.id))
      }
    }
  }

  if (sevpBs && direktur) {
    await db.update(employee)
      .set({ atasanId: direktur.id })
      .where(eq(employee.id, sevpBs.id))
  }

  console.log('   ✅ Hierarchy set\n')

  // ── Pass 3: Create user accounts for ALL employees with email ──────────────
  console.log('   → Creating user accounts for all employees with email...')
  const { hashPassword } = await import('../utils/hash')
  const defaultPasswordHash = await hashPassword('User@123')

  let usersCreated = 0
  let usersLinked = 0

  for (const emp of insertedEmployees) {
    if (!emp.email) continue

    // Check if user already exists with this email
    const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, emp.email))
    if (existing.length > 0) {
      await db.update(user).set({ employeeId: emp.id }).where(eq(user.email, emp.email))
      usersLinked++
    } else {
      await db.insert(user).values({
        email: emp.email,
        passwordHash: defaultPasswordHash,
        role: 'user',
        isActive: true,
        tokenVersion: 1,
        employeeId: emp.id,
      }).onConflictDoNothing()
      usersCreated++
    }
  }

  console.log(`   ✅ ${usersCreated} user accounts created, ${usersLinked} existing accounts linked`)
  console.log(`      Default password: User@123\n`)

  // ── Re-link admin user ─────────────────────────────────────────────────────
  const adminExists = await db.select({ id: user.id }).from(user).where(eq(user.email, 'admin@inl.co.id'))
  if (adminExists.length === 0) {
    const adminHash = await hashPassword('Admin@123')
    await db.insert(user).values({
      email: 'admin@inl.co.id',
      passwordHash: adminHash,
      role: 'super_admin',
      isActive: true,
      tokenVersion: 1,
      employeeId: null,
    })
    console.log('   → Re-created super_admin account (admin@inl.co.id / Admin@123)')
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const unitsWithEmployees = insertedEmployees.filter(e => {
    const emp = employees.find(r => r.name?.trim().replace(/\xa0/g, ' ') === e.name)
    return emp && getEmployeeUnitKey(emp)
  }).length

  console.log('\n✅  Seeding complete!')
  console.log(`   Employees: ${inserted}`)
  console.log(`   Unit organisasi: ${orgUnits.length}`)
  console.log(`   Employees mapped to units: ${unitsWithEmployees}`)
  console.log(`   User accounts: ${usersCreated} new + ${usersLinked} linked`)
  console.log(`   Direktur (root): ${direktur?.name ?? 'N/A'}`)
  console.log(`   SEVP BS: ${sevpBs?.name ?? 'N/A'}`)

  await client.end()
}

seedEmployees().catch(err => {
  console.error('❌  Seed failed:', err)
  process.exit(1)
})
