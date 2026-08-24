require('dotenv').config();

const postgres = require('postgres');

const newAppId = '5a38b04e-89ce-4f63-bde5-5aef2f7c9a77';

async function main() {
  const sql = postgres({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 1,
  });

  await sql.unsafe(
    `
      insert into aplikasi
        (id, nama, url, auth_mode, icon, deskripsi, urutan, is_active, warna, kategori)
      values
        ('${newAppId}', 'MeeTrip', 'http://localhost:3004/sso-callback', 'sso', 'Calendar',
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
    `
  );

  await sql.unsafe(`update aplikasi set is_active = false, updated_at = now() where id = '${oldDummyAppId}'`);

  await sql.end();
  console.log(newAppId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
