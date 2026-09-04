import pool from './src/config/db.js';
async function main() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT
      )
    `);
    const initialSettings = {
      clinic_name: 'LABORATORIUM KLINIK KHANZA',
      clinic_address: 'Jl. Kesehatan No. 123, Kota Medis',
      clinic_phone: '08123456789',
      clinic_email: 'info@geulis.local'
    };
    for (const [key, value] of Object.entries(initialSettings)) {
      await pool.query('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
    }
    console.log('Settings table initialized');
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
main();
