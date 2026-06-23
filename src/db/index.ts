// ─── Drizzle Client ───────────────────────────────────────────────────────────
import { drizzle }  from 'drizzle-orm/postgres-js'
import postgres     from 'postgres'
import * as schema  from './schema'
import { config }   from '../config/env'

const client = postgres({
  host:     config.db.host,
  port:     config.db.port,
  username: config.db.user,
  password: config.db.password,
  database: config.db.name,
  max:      10,
})

export const db = drizzle(client, { schema })
