import postgres from 'postgres';

const portalSql = postgres({
  host: '103.193.145.61',
  port: 6881,
  database: 'inl_portal',
  username: 'postgres',
  password: 'Salvaco@24',
});

const meetripSql = postgres({
  host: '103.193.145.61',
  port: 6881,
  database: 'meetrip_db',
  username: 'postgres',
  password: 'Salvaco@24',
});

async function run() {
  try {
    // 1. Get the admin employee ID by looking at admin@inl.co.id user
    const resAdmin = await portalSql`SELECT employee_id FROM "users" WHERE email = 'admin@inl.co.id'`;
    if (resAdmin.length === 0) {
      console.log('Error: admin@inl.co.id not found in users.');
      return;
    }
    const adminEmployeeId = resAdmin[0].employee_id;
    console.log('Admin Employee ID:', adminEmployeeId);

    // 2. Link ayamsaya85@gmail.com to the admin employee
    const resUser = await portalSql`SELECT id FROM "users" WHERE email = 'ayamsaya85@gmail.com'`;
    if (resUser.length === 0) {
      console.log('Error: ayamsaya85@gmail.com not found in users.');
      return;
    }
    const userId = resUser[0].id;
    console.log('User ID for ayamsaya85@gmail.com:', userId);

    await portalSql`UPDATE "users" SET employee_id = ${adminEmployeeId} WHERE id = ${userId}`;
    console.log('Updated user ayamsaya85@gmail.com to have employee_id of admin@inl.co.id');

    // 3. Add to meetrip_user_role in meetrip_db
    const resRole = await meetripSql`SELECT id FROM meetrip_user_role WHERE portal_user_id = ${userId}`;
    if (resRole.length > 0) {
      await meetripSql`UPDATE meetrip_user_role SET role = 'super_admin' WHERE portal_user_id = ${userId}`;
      console.log('Updated meetrip_user_role to super_admin for ayamsaya85@gmail.com');
    } else {
      await meetripSql`INSERT INTO meetrip_user_role (portal_user_id, role) VALUES (${userId}, 'super_admin')`;
      console.log('Inserted meetrip_user_role super_admin for ayamsaya85@gmail.com');
    }

    console.log('Success!');
  } catch (err) {
    console.error(err);
  } finally {
    await portalSql.end();
    await meetripSql.end();
  }
}

run();
