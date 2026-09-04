import pool from './src/config/db.js';
async function main() {
  try {
    await pool.query("INSERT IGNORE INTO permissions (code, name, menu_key) VALUES ('tests.view', 'Lihat Master Tes', 'tests'), ('tests.manage', 'Kelola Master Tes', 'tests')");
    await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_id) SELECT 1, id FROM permissions WHERE menu_key='tests'");
    console.log('Permissions inserted');
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
main();
