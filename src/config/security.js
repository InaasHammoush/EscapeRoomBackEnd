import dotenv from 'dotenv';

dotenv.config();

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const DEFAULT_ALLOWED_ORIGIN = 'http://localhost:5173';
const DEFAULT_HSTS_MAX_AGE = 60 * 60 * 24 * 180;
const DEFAULT_SOCKET_BUFFER_SIZE = 64 * 1024;
const DEFAULT_REFRESH_COOKIE_NAME = 'refreshToken';

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

function normalizeSameSite(value, fallback = 'strict') {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  return ['strict', 'lax', 'none'].includes(normalized) ? normalized : fallback;
}

function parseOrigins(value) {
  return String(value ?? DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function resolveTrustProxy(value) {
  if (value == null || value === '') {
    return process.env.NODE_ENV === 'production' ? 1 : false;
  }

  const normalized = String(value).trim();
  const lowered = normalized.toLowerCase();

  if (TRUE_VALUES.has(lowered)) return true;
  if (FALSE_VALUES.has(lowered)) return false;

  const numeric = Number.parseInt(normalized, 10);
  return Number.isFinite(numeric) ? numeric : normalized;
}

const allowedOrigins = Object.freeze(parseOrigins(process.env.ORIGIN));
const cookieDomain = process.env.COOKIE_DOMAIN?.trim() || undefined;
const secureCookies = parseBoolean(
  process.env.COOKIE_SECURE,
  process.env.NODE_ENV === 'production'
);
const sameSite = normalizeSameSite(process.env.COOKIE_SAME_SITE, 'strict');
const refreshCookieName =
  secureCookies && !cookieDomain
    ? '__Host-refreshToken'
    : DEFAULT_REFRESH_COOKIE_NAME;
const refreshCookieNames = Object.freeze(
  refreshCookieName === DEFAULT_REFRESH_COOKIE_NAME
    ? [DEFAULT_REFRESH_COOKIE_NAME]
    : [refreshCookieName, DEFAULT_REFRESH_COOKIE_NAME]
);
const refreshCookieOptions = Object.freeze({
  httpOnly: true,
  secure: secureCookies,
  sameSite,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
});

export const securityConfig = Object.freeze({
  isProduction: process.env.NODE_ENV === 'production',
  allowedOrigins,
  trustProxy: resolveTrustProxy(process.env.TRUST_PROXY),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT?.trim() || '32kb',
  urlencodedBodyLimit: process.env.URLENCODED_BODY_LIMIT?.trim() || '16kb',
  socketMaxHttpBufferSize: parseInteger(
    process.env.SOCKET_MAX_HTTP_BUFFER_SIZE,
    DEFAULT_SOCKET_BUFFER_SIZE
  ),
  hstsMaxAge: parseInteger(process.env.HSTS_MAX_AGE, DEFAULT_HSTS_MAX_AGE),
  tokenIssuer: process.env.JWT_ISSUER?.trim() || 'escape-room-backend',
  tokenAudience: process.env.JWT_AUDIENCE?.trim() || 'escape-room-clients',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL?.trim() || '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL?.trim() || '7d',
  refreshCookieName,
  refreshCookieNames,
  refreshCookieOptions,
  socketDebugLogsEnabled: parseBoolean(process.env.SOCKET_DEBUG_LOGS, false),
});

export function validateSecurityConfiguration() {
  const missingSecrets = ['JWT_SECRET', 'REFRESH_SECRET'].filter(
    name => !process.env[name]
  );

  if (missingSecrets.length > 0) {
    const message = `Missing required auth secrets: ${missingSecrets.join(', ')}`;
    if (securityConfig.isProduction) {
      throw new Error(message);
    }
    console.warn(message);
  }

  for (const secretName of ['JWT_SECRET', 'REFRESH_SECRET']) {
    const secret = process.env[secretName];
    if (!secret) continue;

    if (secret.length < 32) {
      const message = `${secretName} should be at least 32 characters long`;
      if (securityConfig.isProduction) {
        throw new Error(message);
      }
      console.warn(message);
    }
  }

  if (securityConfig.allowedOrigins.length === 0) {
    throw new Error('ORIGIN must contain at least one allowed origin');
  }

  if (
    securityConfig.isProduction &&
    securityConfig.allowedOrigins.some(origin => origin === '*')
  ) {
    throw new Error('Wildcard CORS origins are not allowed in production');
  }

  if (refreshCookieName.startsWith('__Host-') && cookieDomain) {
    throw new Error('__Host- cookies cannot be used together with COOKIE_DOMAIN');
  }

  if (sameSite === 'none' && !secureCookies) {
    throw new Error('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
  }
}

export function isOriginAllowed(origin) {
  const normalizedOrigin = typeof origin === 'string'
    ? origin.trim().replace(/\/+$/, '')
    : origin;

  return !normalizedOrigin || securityConfig.allowedOrigins.includes(normalizedOrigin);
}

export function buildCorsOptions() {
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS_ORIGIN_FORBIDDEN'));
    },
    credentials: true,
    optionsSuccessStatus: 204,
  };
}

export function setRefreshTokenCookie(res, token) {
  res.cookie(
    securityConfig.refreshCookieName,
    token,
    securityConfig.refreshCookieOptions
  );
}

export function clearRefreshTokenCookie(res) {
  const clearOptions = {
    httpOnly: true,
    secure: securityConfig.refreshCookieOptions.secure,
    sameSite: securityConfig.refreshCookieOptions.sameSite,
    path: securityConfig.refreshCookieOptions.path,
    ...(securityConfig.refreshCookieOptions.domain
      ? { domain: securityConfig.refreshCookieOptions.domain }
      : {}),
  };

  for (const cookieName of securityConfig.refreshCookieNames) {
    res.clearCookie(cookieName, clearOptions);
  }
}

export function readRefreshTokenCookie(req) {
  for (const cookieName of securityConfig.refreshCookieNames) {
    const value = req.cookies?.[cookieName];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}
