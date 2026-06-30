const postgres = require('postgres');
require('dotenv').config();

const sql = postgres({
  host: process.env.DB_HOST || '103.193.145.61',
  port: parseInt(process.env.DB_PORT || '6881'),
  database: process.env.DB_NAME || 'inl_portal',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Salvaco@24',
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
