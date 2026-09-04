import pool from './src/config/db.js';

async function migrate() {
  try {
    await pool.query('ALTER TABLE lab_tests ADD COLUMN show_in_report BOOLEAN DEFAULT 1');
    console.log('Added show_in_report to lab_tests');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') console.error(e);
  }
  
  try {
    await pool.query('ALTER TABLE lab_results ADD COLUMN is_printable BOOLEAN DEFAULT 1');
    console.log('Added is_printable to lab_results');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME') console.error(e);
  }
  
  process.exit(0);
}
migrate();
