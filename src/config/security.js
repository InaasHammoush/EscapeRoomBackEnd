import dotenv from 'dotenv';

dotenv.config();

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const DEFAULT_HSTS_MAX_AGE = 60 * 60 * 24 * 180;
const DEFAULT_SOCKET_BUFFER_SIZE = 64 * 1024;
const DEFAULT_REFRESH_COOKIE_NAME = 'refreshToken';
const DEFAULT_REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_DEV_ALLOWED_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

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

function resolveCookieSameSite(value, cookieSecure) {
  if (value != null && String(value).trim() !== '') {
    return normalizeSameSite(value, cookieSecure ? 'strict' : 'lax');
  }

  return cookieSecure ? 'strict' : 'lax';
}

function normalizeUrl(value) {
  const normalized = String(value ?? '').trim().replace(/\/+$/, '');
  return normalized || null;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseOrigins(value) {
  return uniqueValues(
    String(value ?? '')
      .split(',')
      .map(origin => normalizeUrl(origin))
  );
}

function getOriginHost(origin) {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hasLoopbackHostMix(origins) {
  const hosts = new Set(origins.map(getOriginHost).filter(Boolean));
  return hosts.has('localhost') && hosts.has('127.0.0.1');
}

function decodeJwtPayload(token) {
  const payloadPart = String(token ?? '').split('.')[1];
  if (!payloadPart) return null;

  try {
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const paddedLength = Math.ceil(normalized.length / 4) * 4;
    const padded = normalized.padEnd(paddedLength, '=');
    const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

function resolveTrustProxy(value, isProduction) {
  if (value == null || value === '') {
    return isProduction ? 1 : false;
  }

  const normalized = String(value).trim();
  const lowered = normalized.toLowerCase();

  if (TRUE_VALUES.has(lowered)) return true;
  if (FALSE_VALUES.has(lowered)) return false;

  const numeric = Number.parseInt(normalized, 10);
  return Number.isFinite(numeric) ? numeric : normalized;
}

function resolveAllowedOrigins(rawOrigins, isProduction) {
  if (rawOrigins) {
    return parseOrigins(rawOrigins);
  }

  if (isProduction) {
    return [];
  }

  return [...DEFAULT_DEV_ALLOWED_ORIGINS];
}

function resolveFrontendUrl(rawFrontendUrl, isProduction, allowedOrigins) {
  if (rawFrontendUrl) {
    return normalizeUrl(rawFrontendUrl);
  }

  if (allowedOrigins.length > 0) {
    return allowedOrigins[0];
  }

  if (!isProduction) {
    return DEFAULT_DEV_ALLOWED_ORIGINS[0];
  }

  return null;
}

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = Object.freeze(resolveAllowedOrigins(process.env.ORIGIN, isProduction));
const frontendUrl = resolveFrontendUrl(process.env.FRONTEND_URL, isProduction, allowedOrigins);
const cookieDomain = process.env.COOKIE_DOMAIN?.trim() || null;
const cookieSecure = parseBoolean(process.env.COOKIE_SECURE, isProduction);
const cookieSameSite = resolveCookieSameSite(process.env.COOKIE_SAME_SITE, cookieSecure);
const refreshCookieName =
  cookieSecure && !cookieDomain
    ? '__Host-refreshToken'
    : DEFAULT_REFRESH_COOKIE_NAME;
const refreshCookieNames = Object.freeze(
  refreshCookieName === DEFAULT_REFRESH_COOKIE_NAME
    ? [DEFAULT_REFRESH_COOKIE_NAME]
    : [refreshCookieName, DEFAULT_REFRESH_COOKIE_NAME]
);
const refreshCookieOptions = Object.freeze({
  httpOnly: true,
  secure: cookieSecure,
  sameSite: cookieSameSite,
  path: '/',
  maxAge: DEFAULT_REFRESH_COOKIE_MAX_AGE_MS,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
});

export const securityConfig = Object.freeze({
  isProduction,
  isDevelopment: !isProduction,
  environmentName: isProduction ? 'production' : 'development',
  allowedOrigins,
  frontendUrl,
  trustProxy: resolveTrustProxy(process.env.TRUST_PROXY, isProduction),
  jsonBodyLimit: process.env.JSON_BODY_LIMIT?.trim() || '32kb',
  urlencodedBodyLimit: process.env.URLENCODED_BODY_LIMIT?.trim() || '16kb',
  socketMaxHttpBufferSize: parseInteger(
    process.env.SOCKET_MAX_HTTP_BUFFER_SIZE,
    DEFAULT_SOCKET_BUFFER_SIZE
  ),
  serverRequestTimeoutMs: parseInteger(process.env.SERVER_REQUEST_TIMEOUT_MS, 60_000),
  serverHeadersTimeoutMs: parseInteger(process.env.SERVER_HEADERS_TIMEOUT_MS, 65_000),
  serverKeepAliveTimeoutMs: parseInteger(
    process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS,
    5_000
  ),
  hstsMaxAge: parseInteger(process.env.HSTS_MAX_AGE, DEFAULT_HSTS_MAX_AGE),
  tokenIssuer: process.env.JWT_ISSUER?.trim() || 'escape-room-backend',
  tokenAudience: process.env.JWT_AUDIENCE?.trim() || 'escape-room-clients',
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL?.trim() || '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL?.trim() || '7d',
  refreshTokenReuseGraceMs: parseInteger(
    process.env.REFRESH_TOKEN_REUSE_GRACE_MS,
    5_000
  ),
  refreshCookieName,
  refreshCookieNames,
  refreshCookieOptions,
  cookieDomain,
  cookieSecure,
  cookieSameSite,
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

  if (!securityConfig.frontendUrl) {
    const message = 'FRONTEND_URL could not be derived from config';
    if (securityConfig.isProduction) {
      throw new Error(message);
    }
    console.warn(message);
  } else if (!process.env.FRONTEND_URL && securityConfig.isProduction) {
    console.warn(
      `FRONTEND_URL is not set; using ${securityConfig.frontendUrl} for generated links`
    );
  }

  if (refreshCookieName.startsWith('__Host-') && cookieDomain) {
    throw new Error('__Host- cookies cannot be used together with COOKIE_DOMAIN');
  }

  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
  }

  if (!process.env.COOKIE_SAME_SITE && !cookieSecure) {
    console.warn(
      'COOKIE_SAME_SITE is not set; defaulting the refresh cookie to SameSite=lax because COOKIE_SECURE=false.'
    );
  }

  if (hasLoopbackHostMix(securityConfig.allowedOrigins)) {
    console.warn(
      'ORIGIN includes both localhost and 127.0.0.1. Refresh cookies are host-specific; prefer one canonical local host to avoid inconsistent sessions after reload.'
    );
  }
}

export function describeSecurityConfiguration() {
  return {
    environment: securityConfig.environmentName,
    allowedOrigins: [...securityConfig.allowedOrigins],
    trustProxy: securityConfig.trustProxy,
    frontendUrl: securityConfig.frontendUrl,
    cookie: {
      name: securityConfig.refreshCookieName,
      secure: securityConfig.cookieSecure,
      sameSite: securityConfig.cookieSameSite,
      domain: securityConfig.cookieDomain,
    },
    httpServer: {
      requestTimeoutMs: securityConfig.serverRequestTimeoutMs,
      headersTimeoutMs: securityConfig.serverHeadersTimeoutMs,
      keepAliveTimeoutMs: securityConfig.serverKeepAliveTimeoutMs,
    },
  };
}

export function isOriginAllowed(origin) {
  const normalizedOrigin = typeof origin === 'string'
    ? normalizeUrl(origin)
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
  const exp = Number(decodeJwtPayload(token)?.exp);
  const maxAge = Number.isFinite(exp) && exp > 0
    ? Math.max(0, exp * 1000 - Date.now())
    : securityConfig.refreshCookieOptions.maxAge;

  res.cookie(
    securityConfig.refreshCookieName,
    token,
    {
      ...securityConfig.refreshCookieOptions,
      maxAge,
    }
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
