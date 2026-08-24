import 'dotenv/config'
import postgres from 'postgres'
import { config } from '../config/env'

async function run() {
  console.log('🚀 Running DB Migration for access_mode column...')
  const sql = postgres({
    host: config.db.host,
    port: config.db.port,
    username: config.db.user,
    password: config.db.password,
    database: config.db.name,
    max: 1,
  })

  try {
    await sql`
      DO $$ BEGIN
        CREATE TYPE access_mode AS ENUM ('all_employees', 'all_except', 'specific_only', 'by_unit');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `
    console.log('   ✅ Type access_mode created/verified.')

    await sql`
      ALTER TABLE "aplikasi" ADD COLUMN IF NOT EXISTS "access_mode" access_mode NOT NULL DEFAULT 'all_employees';
    `
    console.log('   ✅ Column access_mode added to aplikasi table.')

    await sql`
      ALTER TABLE "aplikasi" ADD COLUMN IF NOT EXISTS "target_unit_ids" text;
    `
    console.log('   ✅ Column target_unit_ids added to aplikasi table.')

    console.log('🎉 DB Migration completed successfully!')
  } catch (err) {
    console.error('❌ Migration failed:', err)
  } finally {
    await sql.end()
  }
}

run()
