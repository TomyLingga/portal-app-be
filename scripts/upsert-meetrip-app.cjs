require('dotenv').config();

const postgres = require('postgres');

const appId = '11111111-2222-4333-8444-555555555555';

async function main() {
  const sql = postgres({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 1,
  });

  await sql.unsafe(`
    insert into aplikasi
      (id, nama, url, auth_mode, icon, deskripsi, urutan, is_active, warna, kategori)
    values
      ('${appId}', 'MeeTrip', 'http://localhost:3004', 'sso', 'Calendar',
       'Calendar of Meeting and Business Trip', 2, true, '#059669', 'Operasional')
    on conflict (id) do update set
      nama = excluded.nama,
      url = excluded.url,
      auth_mode = excluded.auth_mode,
      icon = excluded.icon,
      deskripsi = excluded.deskripsi,
      urutan = excluded.urutan,
      is_active = true,
      warna = excluded.warna,
      kategori = excluded.kategori,
      updated_at = now()
  `);

  await sql.end();
  console.log(appId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
