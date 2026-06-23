// ─── Schema: Employee ─────────────────────────────────────────────────────────
import { pgTable, uuid, varchar, boolean, date, text, timestamp } from 'drizzle-orm/pg-core'
import { relations }                  from 'drizzle-orm'
import { bagian, subBagian }          from './organisasi'
import { refStatusKaryawan, refPendidikan, refStatusPernikahan } from './master'

export const employee = pgTable('employee', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  nrk:                  varchar('nrk',       { length: 50  }).notNull().unique(),
  nik:                  varchar('nik',       { length: 20  }).notNull().unique(),
  nama:                 varchar('nama',      { length: 150 }).notNull(),
  jenisKelamin:         varchar('jenis_kelamin', { length: 1 }).notNull(), // 'L' | 'P'
  jabatan:              varchar('jabatan',   { length: 150 }).notNull(),
  grade:                varchar('grade',     { length: 10  }),
  atasanId:             uuid('atasan_id').references((): any => employee.id),
  bagianId:             uuid('bagian_id').references(() => bagian.id),
  subBagianId:          uuid('sub_bagian_id').references(() => subBagian.id),
  tanggalMasuk:         date('tanggal_masuk'),
  tempatLahir:          varchar('tempat_lahir',  { length: 100 }),
  tanggalLahir:         date('tanggal_lahir'),
  // Hanya simpan nama file; URL = UPLOAD_URL + '/' + fotoProfil
  fotoProfil:           varchar('foto_profil',   { length: 255 }),
  statusKaryawanId:     uuid('status_karyawan_id').references(() => refStatusKaryawan.id),
  pendidikanTerakhirId: uuid('pendidikan_terakhir_id').references(() => refPendidikan.id),
  statusPernikahanId:   uuid('status_pernikahan_id').references(() => refStatusPernikahan.id),
  nomorHp:              varchar('nomor_hp',  { length: 20  }),
  alamat:               text('alamat'),
  isActive:             boolean('is_active').notNull().default(true),
  createdAt:            timestamp('created_at').notNull().defaultNow(),
  updatedAt:            timestamp('updated_at').notNull().defaultNow(),
})

// ─── Relations ────────────────────────────────────────────────────────────────
export const employeeRelations = relations(employee, ({ one, many }) => ({
  atasan:             one(employee,            { fields: [employee.atasanId],             references: [employee.id],             relationName: 'atasan' }),
  bawahan:            many(employee,           { relationName: 'atasan' }),
  bagian:             one(bagian,              { fields: [employee.bagianId],             references: [bagian.id] }),
  subBagian:          one(subBagian,           { fields: [employee.subBagianId],          references: [subBagian.id] }),
  statusKaryawan:     one(refStatusKaryawan,   { fields: [employee.statusKaryawanId],     references: [refStatusKaryawan.id] }),
  pendidikanTerakhir: one(refPendidikan,       { fields: [employee.pendidikanTerakhirId], references: [refPendidikan.id] }),
  statusPernikahan:   one(refStatusPernikahan, { fields: [employee.statusPernikahanId],   references: [refStatusPernikahan.id] }),
}))
