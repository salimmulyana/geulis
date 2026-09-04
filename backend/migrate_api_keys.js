import pool from './src/config/db.js';

async function migrate() {
  try {
    const conn = await pool.getConnection();
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          api_key VARCHAR(100) NOT NULL UNIQUE,
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        )
      `);
      console.log('Table api_keys created or verified');
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('Migration failed:', err);
  }
  process.exit();
}

migrate();
