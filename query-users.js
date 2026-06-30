const postgres = require('postgres');
require('dotenv').config();

const sql = postgres({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'inl_portal',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function main() {
  await sql`UPDATE "user" SET password_hash = '$2b$12$bVTLRYQUSLIvfoJbAgvO4O9cv..ujPzbJMr2WySXII1Q7iSlunqIG' WHERE email = 'tomy@inl.co.id'`;
  console.log('Updated tomy@inl.co.id password hash successfully!');
  process.exit(0);
}
main().catch(err => {
  console.error(err);
  process.exit(1);
});
