// import fs from 'fs'; // for later use of Aiven's CA certificate
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Aiven PostgreSQL 
    // we can later enforce the use of aiven's CA certificate
    // ca: fs.readFileSync(new URL('../../certs/ca.pem', import.meta.url)).toString(),
  },
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL (Aiven)');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err.message);
  process.exit(-1);
});

export default {
  query: (text, params) => pool.query(text, params),
};
