// ─── Drizzle Client ───────────────────────────────────────────────────────────
import { drizzle }  from 'drizzle-orm/postgres-js'
import postgres     from 'postgres'
import * as schema  from './schema'
import { config }   from '../config/env'

/*
 * TLS & batas waktu.
 *
 * DB_HOST di deployment ini bukan localhost, jadi kredensial dan data karyawan
 * melintas jaringan. Aktifkan enkripsi dengan `DB_SSL=require` (atau `verify-full`
 * bila sertifikat server sudah dipercaya). Default dibiarkan mati agar dev lokal
 * tidak ikut terganggu.
 *
 * statement_timeout memastikan query liar dibunuh, bukan menahan koneksi pool.
 */
const sslMode = process.env.DB_SSL
const client = postgres({
  host:     config.db.host,
  port:     config.db.port,
  username: config.db.user,
  password: config.db.password,
  database: config.db.name,
  max:      20,
  max_lifetime: 60 * 30, // 30 minutes connection recycling
  ssl: sslMode === 'require'
    ? { rejectUnauthorized: false }
    : sslMode === 'verify-full'
      ? 'verify-full'
      : undefined,
  connect_timeout: 10,
  idle_timeout: 30,
  onnotice: () => {},
  connection: {
    statement_timeout: 20_000,
  },
})

export const db = drizzle(client, { schema })
