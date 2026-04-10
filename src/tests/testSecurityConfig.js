import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import jwt from 'jsonwebtoken';

const securityModuleUrl = pathToFileURL(path.resolve('src/config/security.js')).href;
const TRACKED_ENV_KEYS = [
  'NODE_ENV',
  'ORIGIN',
  'FRONTEND_URL',
  'COOKIE_SECURE',
  'COOKIE_SAME_SITE',
  'COOKIE_DOMAIN',
  'JWT_SECRET',
  'REFRESH_SECRET',
  'ACCESS_TOKEN_TTL',
  'REFRESH_TOKEN_TTL',
];

async function loadSecurityModule(overrides = {}) {
  const previousEnv = new Map(TRACKED_ENV_KEYS.map(key => [key, process.env[key]]));
  const effectiveEnv = {
    NODE_ENV: 'production',
    ORIGIN: 'http://localhost:5173',
    FRONTEND_URL: 'http://localhost:5173',
    COOKIE_SECURE: 'false',
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
    ACCESS_TOKEN_TTL: '15m',
    REFRESH_TOKEN_TTL: '7d',
    ...overrides,
  };

  try {
    for (const key of TRACKED_ENV_KEYS) {
      const value = effectiveEnv[key];
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = String(value);
      }
    }

    const mod = await import(`${securityModuleUrl}?case=${Date.now()}-${Math.random()}`);
    return { mod, env: effectiveEnv };
  } finally {
    for (const [key, value] of previousEnv.entries()) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function signRefreshToken(secret, { issuer, audience }, expiresIn) {
  return jwt.sign(
    {
      id: 42,
      username: 'tester',
      tokenType: 'refresh',
      authTimeMs: Date.now(),
    },
    secret,
    {
      algorithm: 'HS256',
      audience,
      expiresIn,
      issuer,
      jwtid: crypto.randomUUID(),
      subject: '42',
    }
  );
}

async function run() {
  const { mod: insecureCookieModule } = await loadSecurityModule({
    COOKIE_SECURE: 'false',
    COOKIE_SAME_SITE: null,
  });
  assert.equal(
    insecureCookieModule.securityConfig.cookieSameSite,
    'lax',
    'insecure refresh cookies should default to SameSite=lax'
  );

  const { mod: secureCookieModule } = await loadSecurityModule({
    COOKIE_SECURE: 'true',
    COOKIE_SAME_SITE: null,
  });
  assert.equal(
    secureCookieModule.securityConfig.cookieSameSite,
    'strict',
    'secure refresh cookies should default to SameSite=strict'
  );

  const { mod: cookieLifetimeModule, env } = await loadSecurityModule({
    COOKIE_SECURE: 'false',
    COOKIE_SAME_SITE: 'lax',
    REFRESH_TOKEN_TTL: '2h',
  });

  const refreshToken = signRefreshToken(
    env.REFRESH_SECRET,
    {
      issuer: cookieLifetimeModule.securityConfig.tokenIssuer,
      audience: cookieLifetimeModule.securityConfig.tokenAudience,
    },
    '2h'
  );

  let capturedCookie = null;
  cookieLifetimeModule.setRefreshTokenCookie(
    {
      cookie(name, value, options) {
        capturedCookie = { name, value, options };
      },
    },
    refreshToken
  );

  assert.ok(capturedCookie, 'refresh cookie should be written');
  assert.equal(capturedCookie.name, cookieLifetimeModule.securityConfig.refreshCookieName);
  assert.equal(capturedCookie.value, refreshToken);
  const expectedLifetimeMs = 2 * 60 * 60 * 1000;
  assert.ok(
    Math.abs(capturedCookie.options.maxAge - expectedLifetimeMs) < 5_000,
    `refresh cookie maxAge should closely match token lifetime; got ${capturedCookie.options.maxAge}`
  );

  console.log('testSecurityConfig passed');
}

run().catch(err => {
  console.error('testSecurityConfig failed');
  console.error(err);
  process.exit(1);
});
