import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { activityLog as activityLogTable, user as userTable } from './db/schema'
import { desc, eq } from 'drizzle-orm'

async function main() {
  const client = postgres({
    host:     process.env.DB_HOST || 'localhost',
    port:     Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'inl_portal',
  })

  const db = drizzle(client)

  try {
    const logs = await db
      .select({
        id: activityLogTable.id,
        userId: activityLogTable.userId,
        appId: activityLogTable.appId,
        action: activityLogTable.action,
        details: activityLogTable.details,
        timestamp: activityLogTable.createdAt,
      })
      .from(activityLogTable)
      .orderBy(desc(activityLogTable.createdAt))
      .limit(15)

    console.log('Last 15 Activity Logs:')
    for (const l of logs) {
      let email = 'unknown'
      if (l.userId) {
        const [u] = await db.select({ email: userTable.email }).from(userTable).where(eq(userTable.id, l.userId)).limit(1)
        email = u?.email || 'unknown'
      }
      console.log(`[${l.timestamp.toLocaleString('id-ID')}] User: ${email}, Action: ${l.action}, Details: ${l.details}`)
    }
  } catch (err: any) {
    console.error('Error fetching logs:', err)
  }

  await client.end()
}

main()
