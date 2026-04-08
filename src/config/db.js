import fs from 'node:fs';
import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

dotenv.config();

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const TLS_ERROR_CODES = new Set([
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'CERT_HAS_EXPIRED',
]);

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function parseDatabaseUrl(connectionString) {
  if (!connectionString) return null;

  try {
    return new URL(connectionString);
  } catch {
    return null;
  }
}

function isRemoteDatabase(connectionString) {
  const parsed = parseDatabaseUrl(connectionString);
  if (!parsed) {
    return process.env.NODE_ENV === 'production';
  }

  return !['localhost', '127.0.0.1', 'postgres'].includes(
    parsed.hostname.toLowerCase()
  );
}

function resolveDatabaseConfig() {
  const connectionString = process.env.DATABASE_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const parsedUrl = parseDatabaseUrl(connectionString);
  const remoteDatabase = isRemoteDatabase(connectionString);
  const sslEnabled = parseBoolean(
    process.env.DATABASE_SSL_ENABLED,
    remoteDatabase
  );
  const sslRejectUnauthorized = sslEnabled
    ? parseBoolean(
        process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
        isProduction
      )
    : false;
  const inlineCa = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n') || null;
  const caPath = process.env.DATABASE_CA_CERT_PATH?.trim() || null;

  return Object.freeze({
    connectionString,
    host: parsedUrl?.hostname || null,
    database: parsedUrl?.pathname?.replace(/^\//, '') || null,
    remoteDatabase,
    sslEnabled,
    sslRejectUnauthorized,
    sslCaConfigured: Boolean(inlineCa || caPath),
    sslInlineCa: inlineCa,
    sslCaPath: caPath,
  });
}

function buildSslConfig(config) {
  if (!config.sslEnabled) {
    return false;
  }

  return {
    rejectUnauthorized: config.sslRejectUnauthorized,
    ...(config.sslInlineCa ? { ca: config.sslInlineCa } : {}),
    ...(!config.sslInlineCa && config.sslCaPath
      ? { ca: fs.readFileSync(config.sslCaPath, 'utf8') }
      : {}),
  };
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function getDatabaseErrorHint(err) {
  const message = String(err?.message ?? '');
  const lower = message.toLowerCase();
  const code = String(err?.code ?? '').toUpperCase();

  if (
    TLS_ERROR_CODES.has(code) ||
    lower.includes('self-signed certificate') ||
    lower.includes('certificate chain') ||
    lower.includes('unable to verify the first certificate') ||
    lower.includes('unable to get local issuer certificate')
  ) {
    return 'TLS certificate validation failed. In local dev either provide DATABASE_CA_CERT_PATH / DATABASE_CA_CERT or set DATABASE_SSL_REJECT_UNAUTHORIZED=false.';
  }

  if (lower.includes('certificate has expired')) {
    return 'The database TLS certificate appears expired. Refresh the provider CA bundle or update the configured certificate.';
  }

  if (code === 'ECONNREFUSED' || lower.includes('connect econnrefused')) {
    return 'The database connection was refused. Check DATABASE_URL, the running Postgres service, and local port bindings.';
  }

  if (code === 'ENOTFOUND' || lower.includes('getaddrinfo enotfound')) {
    return 'The database host could not be resolved. Check the host name inside DATABASE_URL.';
  }

  return null;
}

function logDatabaseError(context, err, config) {
  console.error(`[db] ${context}: ${err.message}`);

  const hint = getDatabaseErrorHint(err);
  if (hint) {
    console.error(`[db] Hint: ${hint}`);
  }

  if (config.sslEnabled || hint) {
    console.error(
      `[db] TLS config: enabled=${yesNo(config.sslEnabled)}, rejectUnauthorized=${yesNo(config.sslRejectUnauthorized)}, caConfigured=${yesNo(config.sslCaConfigured)}`
    );
  }
}

export const databaseConfig = resolveDatabaseConfig();

const pool = new Pool({
  connectionString: databaseConfig.connectionString,
  ssl: buildSslConfig(databaseConfig),
});

pool.on('connect', () => {
  console.log(
    `[db] Connected to PostgreSQL (ssl=${yesNo(databaseConfig.sslEnabled)}, rejectUnauthorized=${yesNo(databaseConfig.sslRejectUnauthorized)})`
  );
});

pool.on('error', (err) => {
  logDatabaseError('PostgreSQL pool error', err, databaseConfig);
  process.exit(-1);
});

export function describeDatabaseConfiguration() {
  return {
    host: databaseConfig.host,
    database: databaseConfig.database,
    sslEnabled: databaseConfig.sslEnabled,
    sslRejectUnauthorized: databaseConfig.sslRejectUnauthorized,
    sslCaConfigured: databaseConfig.sslCaConfigured,
  };
}

export default {
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      const hint = getDatabaseErrorHint(err);
      if (hint) {
        logDatabaseError('PostgreSQL query failed', err, databaseConfig);
      }
      throw err;
    }
  },
};
