// ─── Service: SSO ─────────────────────────────────────────────────────────────
import crypto           from 'crypto'
import { eq, and }      from 'drizzle-orm'
import { alias }        from 'drizzle-orm/pg-core'
import { db }           from '../db'
import {
  ssoToken,
  aplikasi,
  user as userTable,
  activityLog,
  employee,
  refGrade,
  unitOrganisasi,
  refPenempatanArea,
} from '../db/schema'
import { config }       from '../config/env'
import { buildFileUrl } from '../utils/file'

/**
 * Generate SSO token untuk user yang klik aplikasi SSO di portal.
 * Token berlaku hanya 5 menit (dari SSO_TOKEN_EXPIRES_IN di .env).
 */
export async function generateSSOTokenService(userId: string, appId: string) {
  // Cek aplikasi ada & bertipe SSO
  const [app] = await db
    .select({ id: aplikasi.id, authMode: aplikasi.authMode, url: aplikasi.url, nama: aplikasi.nama })
    .from(aplikasi)
    .where(and(eq(aplikasi.id, appId), eq(aplikasi.isActive, true)))
    .limit(1)

  if (!app) throw new Error('Aplikasi tidak ditemukan atau tidak aktif')
  if (app.authMode !== 'sso') throw new Error('Aplikasi ini tidak menggunakan mode SSO')

  // Cek status user & employee link
  const [u] = await db
    .select({ role: userTable.role, isActive: userTable.isActive, employeeId: userTable.employeeId })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)

  if (!u || !u.isActive) {
    throw new Error('User tidak aktif atau tidak ditemukan')
  }

  // SSO hanya untuk user yang terhubung ke data karyawan (employee)
  if (!u.employeeId) {
    throw new Error('Akses SSO hanya tersedia untuk akun yang terhubung ke data karyawan. Hubungi administrator untuk menghubungkan akun Anda.')
  }

  // Parse expiry (misal '5m' → 5 * 60000 ms)
  const expMs = parseExpiry(config.sso.tokenExpiresIn)
  const expiresAt = new Date(Date.now() + expMs)

  // Generate token random & simpan hash-nya
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  await db.insert(ssoToken).values({
    userId,
    appId,
    tokenHash,
    expiresAt,
  })

  // Log activity to database
  try {
    await db.insert(activityLog).values({
      userId,
      appId,
      action: 'access_app',
      details: `Login Single Sign-On (SSO) ke aplikasi "${app.nama}"`,
    })
  } catch (err) {
    // Ignore activity log error
  }

  return { token: rawToken, expiresAt, redirectUrl: app.url }
}

/**
 * Verifikasi SSO token dari aplikasi client.
 * Kembalikan data user jika valid.
 */
export async function verifySSOTokenService(rawToken: string, appId: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  const [found] = await db
    .select()
    .from(ssoToken)
    .where(and(
      eq(ssoToken.tokenHash, tokenHash),
      eq(ssoToken.appId, appId),
      eq(ssoToken.isRevoked, false),
    ))
    .limit(1)

  if (!found) throw new Error('Token tidak valid')
  if (found.expiresAt < new Date()) throw new Error('Token sudah expired')

  // Revoke token (satu kali pakai)
  await db
    .update(ssoToken)
    .set({ isRevoked: true })
    .where(eq(ssoToken.id, found.id))

  // Ambil profil kerja employee. Data personal sensitif seperti NIK, alamat,
  // nomor HP, tanggal lahir, agama, dan status pernikahan tidak dikirim lewat SSO.
  const atasan = alias(employee, 'sso_employee_atasan')
  const [userData] = await db
    .select({
      id:        userTable.id,
      email:     userTable.email,
      role:      userTable.role,
      isActive:  userTable.isActive,
      employeeId:userTable.employeeId,
      employeeNrk: employee.nrk,
      employeeNama: employee.nama,
      employeeJenisKelamin: employee.jenisKelamin,
      employeeJabatan: employee.jabatan,
      employeeTanggalMasuk: employee.tanggalMasuk,
      employeeFoto: employee.fotoProfil,
      employeeIsActive: employee.isActive,
      employeeAtasanId: employee.atasanId,
      atasanNrk: atasan.nrk,
      atasanNama: atasan.nama,
      atasanJabatan: atasan.jabatan,
      gradeId: refGrade.id,
      gradeKode: refGrade.kode,
      gradeLabel: refGrade.label,
      gradeLevel: refGrade.level,
      unitId: unitOrganisasi.id,
      unitNama: unitOrganisasi.nama,
      unitKode: unitOrganisasi.kode,
      unitTipe: unitOrganisasi.tipe,
      unitParentId: unitOrganisasi.parentId,
      penempatanAreaId: refPenempatanArea.id,
      penempatanAreaKode: refPenempatanArea.kode,
      penempatanAreaNama: refPenempatanArea.nama,
      penempatanLatitude: refPenempatanArea.latitude,
      penempatanLongitude: refPenempatanArea.longitude,
    })
    .from(userTable)
    .leftJoin(employee, eq(userTable.employeeId, employee.id))
    .leftJoin(atasan, eq(employee.atasanId, atasan.id))
    .leftJoin(refGrade, eq(employee.gradeId, refGrade.id))
    .leftJoin(unitOrganisasi, eq(employee.unitOrganisasiId, unitOrganisasi.id))
    .leftJoin(refPenempatanArea, eq(employee.penempatanAreaId, refPenempatanArea.id))
    .where(eq(userTable.id, found.userId))
    .limit(1)

  if (!userData || !userData.isActive) throw new Error('User tidak aktif')

  const organizationRows = userData.unitId
    ? await db
        .select({
          id: unitOrganisasi.id,
          kode: unitOrganisasi.kode,
          nama: unitOrganisasi.nama,
          tipe: unitOrganisasi.tipe,
          parentId: unitOrganisasi.parentId,
        })
        .from(unitOrganisasi)
    : []
  const organizationById = new Map(organizationRows.map(unit => [unit.id, unit]))
  const organizationHierarchy: typeof organizationRows = []
  const visitedUnitIds = new Set<string>()
  let currentUnitId: string | null = userData.unitId
  while (currentUnitId && !visitedUnitIds.has(currentUnitId)) {
    visitedUnitIds.add(currentUnitId)
    const currentUnit = organizationById.get(currentUnitId)
    if (!currentUnit) break
    organizationHierarchy.unshift(currentUnit)
    currentUnitId = currentUnit.parentId
  }

  return {
    id: userData.id,
    email: userData.email,
    role: userData.role,
    isActive: userData.isActive,
    employeeId: userData.employeeId,
    employee: userData.employeeId ? {
      id: userData.employeeId,
      nrk: userData.employeeNrk,
      nama: userData.employeeNama,
      namaLengkap: userData.employeeNama,
      jenisKelamin: userData.employeeJenisKelamin,
      jabatan: userData.employeeJabatan,
      tanggalMasuk: userData.employeeTanggalMasuk,
      fotoProfil: buildFileUrl(userData.employeeFoto),
      isActive: userData.employeeIsActive,
      atasan: userData.employeeAtasanId ? {
        id: userData.employeeAtasanId,
        nrk: userData.atasanNrk,
        nama: userData.atasanNama,
        jabatan: userData.atasanJabatan,
      } : null,
      grade: userData.gradeId ? {
        id: userData.gradeId,
        kode: userData.gradeKode,
        label: userData.gradeLabel,
        level: userData.gradeLevel,
      } : null,
      unit: userData.unitId ? {
        id: userData.unitId,
        kode: userData.unitKode,
        nama: userData.unitNama,
        tipe: userData.unitTipe,
        parentId: userData.unitParentId,
        path: organizationHierarchy.map(unit => unit.nama).join(' / '),
        hierarchy: organizationHierarchy,
      } : null,
      penempatanArea: userData.penempatanAreaId ? {
        id: userData.penempatanAreaId,
        kode: userData.penempatanAreaKode,
        nama: userData.penempatanAreaNama,
        latitude: userData.penempatanLatitude,
        longitude: userData.penempatanLongitude,
      } : null,
    } : null,
  }
}

// Helper: parse expiry string (e.g. '5m', '1h', '30s') → milliseconds
function parseExpiry(str: string): number {
  const unit = str.slice(-1)
  const val  = parseInt(str.slice(0, -1), 10)
  switch (unit) {
    case 's': return val * 1000
    case 'm': return val * 60 * 1000
    case 'h': return val * 3600 * 1000
    default:  return 5 * 60 * 1000 // default 5 menit
  }
}
