// ─── Migration Runner ─────────────────────────────────────────────────────────
import 'dotenv/config'
import { migrate }  from 'drizzle-orm/postgres-js/migrator'
import { drizzle }  from 'drizzle-orm/postgres-js'
import postgres     from 'postgres'
import path         from 'path'

async function runMigrations() {
  const client = postgres({
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER     ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME     ?? 'inl_portal',
    max:      1,
  })

  const db = drizzle(client)

  console.log('🔄  Running migrations...')
  await migrate(db, {
    migrationsFolder: path.join(__dirname, 'migrations'),
  })
  console.log('✅  Migrations complete!')

  await client.end()
}

runMigrations().catch(err => {
  console.error('❌  Migration failed:', err)
  process.exit(1)
})
