import crypto from 'node:crypto';

import { getRedisClient, redisConfig } from '../config/redis.js';
import { securityConfig } from '../config/security.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from '../util/token.js';

function hashTokenIdentifier(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function refreshTokenKey(jti) {
  return `${redisConfig.keyPrefix}:auth:refresh:${hashTokenIdentifier(jti)}`;
}

function revokedAfterKey(userId) {
  return `${redisConfig.keyPrefix}:auth:revoked-after:${userId}`;
}

function getTokenIssuedAtMs(tokenPayload) {
  const authTimeMs = Number(tokenPayload?.authTimeMs);
  if (Number.isFinite(authTimeMs) && authTimeMs > 0) {
    return authTimeMs;
  }

  const iat = Number(tokenPayload?.iat);
  if (Number.isFinite(iat) && iat > 0) {
    return iat * 1000;
  }

  return 0;
}

function getRefreshTokenTtlMs(tokenPayload) {
  const exp = Number(tokenPayload?.exp);
  if (!Number.isFinite(exp) || exp <= 0) {
    throw new Error('Refresh token is missing exp');
  }

  return Math.max(1, exp * 1000 - Date.now());
}

async function writeRefreshTokenState(tokenPayload, status) {
  if (!tokenPayload?.jti) {
    throw new Error('Refresh token is missing jti');
  }

  const redis = await getRedisClient();
  await redis.set(
    refreshTokenKey(tokenPayload.jti),
    JSON.stringify({
      userId: String(tokenPayload.id),
      issuedAtMs: getTokenIssuedAtMs(tokenPayload),
      changedAtMs: Date.now(),
      status,
    }),
    { PX: getRefreshTokenTtlMs(tokenPayload) }
  );
}

async function readRefreshTokenState(tokenPayload) {
  if (!tokenPayload?.jti) {
    throw new AuthTokenError('INVALID_REFRESH_TOKEN');
  }

  const redis = await getRedisClient();
  const raw = await redis.get(refreshTokenKey(tokenPayload.jti));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (String(parsed?.userId) !== String(tokenPayload.id)) {
      await revokeAllUserTokens(tokenPayload.id, 'refresh_token_user_mismatch');
      throw new AuthTokenError('REFRESH_TOKEN_REUSED');
    }

    return parsed;
  } catch (err) {
    if (err instanceof AuthTokenError) {
      throw err;
    }

    await revokeAllUserTokens(tokenPayload.id, 'refresh_token_state_corrupt');
    throw new AuthTokenError('REFRESH_TOKEN_REUSED');
  }
}

async function readUserRevocation(userId) {
  const redis = await getRedisClient();
  const raw = await redis.get(revokedAfterKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const revokedAfterMs = Number(parsed?.revokedAfterMs);
    if (Number.isFinite(revokedAfterMs) && revokedAfterMs > 0) {
      return {
        revokedAfterMs,
        reason: parsed?.reason || null,
      };
    }
  } catch {
    const revokedAfterMs = Number(raw);
    if (Number.isFinite(revokedAfterMs) && revokedAfterMs > 0) {
      return {
        revokedAfterMs,
        reason: null,
      };
    }
  }

  return null;
}

export class AuthTokenError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'AuthTokenError';
    this.code = code;
  }
}

export function isAuthTokenError(err, code) {
  return err instanceof AuthTokenError && (!code || err.code === code);
}

export async function registerRefreshToken(tokenPayload) {
  await writeRefreshTokenState(tokenPayload, 'active');
}

export async function revokeRefreshToken(tokenPayload) {
  if (!tokenPayload?.jti) {
    return false;
  }

  await writeRefreshTokenState(tokenPayload, 'revoked');
  return true;
}

export async function revokeRefreshTokenString(rawToken, expectedUserId = null) {
  if (!rawToken) return false;

  try {
    const decoded = verifyRefreshToken(rawToken);
    if (
      expectedUserId != null &&
      String(decoded.id) !== String(expectedUserId)
    ) {
      return false;
    }

    return await revokeRefreshToken(decoded);
  } catch {
    return false;
  }
}

export async function revokeAllUserTokens(userId, reason = 'manual_revocation') {
  const redis = await getRedisClient();
  const revokedAfterMs = Date.now();

  await redis.set(
    revokedAfterKey(userId),
    JSON.stringify({ revokedAfterMs, reason })
  );

  return revokedAfterMs;
}

export async function assertTokenNotRevoked(tokenPayload) {
  const revocation = await readUserRevocation(tokenPayload.id);
  if (!revocation) {
    return;
  }

  if (getTokenIssuedAtMs(tokenPayload) <= revocation.revokedAfterMs) {
    throw new AuthTokenError('TOKEN_REVOKED');
  }
}

export async function assertActiveRefreshToken(tokenPayload) {
  const state = await readRefreshTokenState(tokenPayload);
  if (!state) {
    throw new AuthTokenError('INVALID_REFRESH_TOKEN');
  }

  if (state.status === 'active') {
    return 'active';
  }

  if (state.status === 'rotated') {
    const changedAtMs = Number(state.changedAtMs);
    const ageMs = Number.isFinite(changedAtMs)
      ? Math.max(0, Date.now() - changedAtMs)
      : Number.POSITIVE_INFINITY;

    if (ageMs <= securityConfig.refreshTokenReuseGraceMs) {
      return 'stale';
    }

    await revokeAllUserTokens(tokenPayload.id, 'refresh_token_reuse_detected');
    throw new AuthTokenError('REFRESH_TOKEN_REUSED');
  }

  if (state.status === 'revoked') {
    throw new AuthTokenError('INVALID_REFRESH_TOKEN');
  }
}

export async function issueTokensForUser(user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const decodedRefreshToken = verifyRefreshToken(refreshToken);

  await registerRefreshToken(decodedRefreshToken);

  return {
    accessToken,
    refreshToken,
  };
}

export async function rotateRefreshToken(rawToken, user) {
  const decoded = verifyRefreshToken(rawToken);

  await assertTokenNotRevoked(decoded);
  const status = await assertActiveRefreshToken(decoded);

  if (status === 'stale') {
    return {
      accessToken: signAccessToken(user),
      refreshToken: null,
      decoded,
    };
  }

  await writeRefreshTokenState(decoded, 'rotated');

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  const nextDecodedRefreshToken = verifyRefreshToken(refreshToken);

  await registerRefreshToken(nextDecodedRefreshToken);

  return {
    accessToken,
    refreshToken,
    decoded,
  };
}
