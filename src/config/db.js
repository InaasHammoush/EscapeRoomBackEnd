import fs from 'node:fs';
import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

dotenv.config();

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function isRemoteDatabase(connectionString) {
  if (!connectionString) return false;

  try {
    const { hostname } = new URL(connectionString);
    return !['localhost', '127.0.0.1', 'postgres'].includes(
      hostname.toLowerCase()
    );
  } catch {
    return process.env.NODE_ENV === 'production';
  }
}

function buildSslConfig() {
  const connectionString = process.env.DATABASE_URL;
  const defaultSslEnabled = isRemoteDatabase(connectionString);
  const sslEnabled = parseBoolean(
    process.env.DATABASE_SSL_ENABLED,
    defaultSslEnabled
  );

  if (!sslEnabled) {
    return false;
  }

  const rejectUnauthorized = parseBoolean(
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    defaultSslEnabled
  );
  const inlineCa = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  const caPath = process.env.DATABASE_CA_CERT_PATH?.trim();

  return {
    rejectUnauthorized,
    ...(inlineCa ? { ca: inlineCa } : {}),
    ...(!inlineCa && caPath ? { ca: fs.readFileSync(caPath, 'utf8') } : {}),
  };
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig(),
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err.message);
  process.exit(-1);
});

export default {
  query: (text, params) => pool.query(text, params),
};
