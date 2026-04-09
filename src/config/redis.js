import fs from 'node:fs';
import { createClient } from 'redis';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRedisUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function maskRedisUrl(value) {
  const parsed = parseRedisUrl(value);
  if (!parsed) return value || '(invalid)';

  if (parsed.password) {
    parsed.password = '***';
  }

  return parsed.toString();
}

function resolveRedisConfig() {
  const url = process.env.REDIS_URL?.trim() || DEFAULT_REDIS_URL;
  const parsedUrl = parseRedisUrl(url);
  const isProduction = process.env.NODE_ENV === 'production';
  const inlineCa = process.env.REDIS_CA_CERT?.replace(/\\n/g, '\n') || null;
  const caPath = process.env.REDIS_CA_CERT_PATH?.trim() || null;
  const tlsEnabled = parseBoolean(
    process.env.REDIS_TLS_ENABLED,
    parsedUrl?.protocol === 'rediss:'
  );

  return Object.freeze({
    url,
    maskedUrl: maskRedisUrl(url),
    host: parsedUrl?.hostname || null,
    tlsEnabled,
    tlsRejectUnauthorized: tlsEnabled
      ? parseBoolean(process.env.REDIS_TLS_REJECT_UNAUTHORIZED, isProduction)
      : false,
    tlsInlineCa: inlineCa,
    tlsCaPath: caPath,
    tlsCaConfigured: Boolean(inlineCa || caPath),
    connectTimeoutMs: parseInteger(process.env.REDIS_CONNECT_TIMEOUT_MS, 10_000),
    keyPrefix: process.env.REDIS_KEY_PREFIX?.trim() || 'escape-room',
  });
}

function buildRedisSocketOptions(config) {
  const socket = {
    connectTimeout: config.connectTimeoutMs,
  };

  if (!config.tlsEnabled) {
    return socket;
  }

  return {
    ...socket,
    tls: true,
    rejectUnauthorized: config.tlsRejectUnauthorized,
    ...(config.tlsInlineCa ? { ca: config.tlsInlineCa } : {}),
    ...(!config.tlsInlineCa && config.tlsCaPath
      ? { ca: fs.readFileSync(config.tlsCaPath, 'utf8') }
      : {}),
  };
}

function attachRedisLogging(client, label) {
  client.on('error', err => {
    console.error(`[redis:${label}] ${err.message}`);
  });

  client.on('reconnecting', () => {
    console.warn(`[redis:${label}] reconnecting`);
  });
}

export const redisConfig = resolveRedisConfig();

export function createRedisConnection(label = 'default') {
  const client = createClient({
    url: redisConfig.url,
    socket: buildRedisSocketOptions(redisConfig),
  });

  attachRedisLogging(client, label);
  return client;
}

const sharedRedisClient = createRedisConnection('shared');
let sharedConnectPromise = null;

export async function getRedisClient() {
  if (sharedRedisClient.isOpen) {
    return sharedRedisClient;
  }

  if (!sharedConnectPromise) {
    sharedConnectPromise = sharedRedisClient.connect().catch(err => {
      sharedConnectPromise = null;
      throw err;
    });
  }

  await sharedConnectPromise;
  return sharedRedisClient;
}

export function describeRedisConfiguration() {
  return {
    url: redisConfig.maskedUrl,
    host: redisConfig.host,
    tlsEnabled: redisConfig.tlsEnabled,
    tlsRejectUnauthorized: redisConfig.tlsRejectUnauthorized,
    tlsCaConfigured: redisConfig.tlsCaConfigured,
    keyPrefix: redisConfig.keyPrefix,
  };
}
