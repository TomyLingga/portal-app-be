import 'dotenv/config'
import postgres from 'postgres'
import { config } from '../config/env'

const expectedTables = [
  'document_access_rules',
  'document_approvers',
  'document_audit_log',
  'document_categories',
  'document_download_requests',
  'documents',
  'portal_notification',
]
const expectedCategories = ['ANNUAL', 'LK', 'PB', 'SOP']

async function verify() {
  const client = postgres({
    host: config.db.host,
    port: config.db.port,
    username: config.db.user,
    password: config.db.password,
    database: config.db.name,
    max: 1,
  })
  try {
    const tables = await client<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name LIKE 'document%' OR table_name = 'portal_notification')
      ORDER BY table_name
    `
    const categories = await client<{ code: string }[]>`
      SELECT code FROM document_categories ORDER BY code
    `
    const indexes = await client<{ indexname: string }[]>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('unit_organisasi_parent_id_idx', 'ref_grade_level_unique')
    `

    const tableNames = tables.map(row => row.table_name)
    const categoryCodes = categories.map(row => row.code)
    const indexNames = new Set(indexes.map(row => row.indexname))
    const missingTables = expectedTables.filter(name => !tableNames.includes(name))
    const missingCategories = expectedCategories.filter(code => !categoryCodes.includes(code))
    const failures = [
      missingTables.length ? `Tabel belum tersedia: ${missingTables.join(', ')}` : null,
      missingCategories.length ? `Seed kategori belum tersedia: ${missingCategories.join(', ')}` : null,
      !indexNames.has('unit_organisasi_parent_id_idx') ? 'Index parent unit organisasi belum tersedia' : null,
      !indexNames.has('ref_grade_level_unique') ? 'Unique index grade level belum tersedia' : null,
    ].filter(Boolean)

    if (failures.length) throw new Error(failures.join('\n'))
    console.log(`Document module verified: ${expectedTables.length} tables, ${expectedCategories.length} categories, required indexes present.`)
  } finally {
    await client.end()
  }
}

verify().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
