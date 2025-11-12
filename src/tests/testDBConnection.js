import db from '../config/db.js';

async function testConnection() {
  try {
    const result = await db.query('SELECT NOW() AS current_time');
    console.log('Database connection successful!');
    console.log('Server time:', result.rows[0].current_time);
    process.exit(0);
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
}

testConnection();
