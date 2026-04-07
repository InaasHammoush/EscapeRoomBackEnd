import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { securityConfig } from '../config/security.js';

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_TYPE = 'refresh';

function requireSecret(secret, envName) {
  if (!secret) {
    throw new Error(`${envName} is not configured`);
  }

  return secret;
}

function buildTokenPayload(user, tokenType) {
  return {
    id: user.id,
    username: user.username,
    tokenType,
  };
}

function buildTokenOptions(userId, expiresIn) {
  return {
    algorithm: 'HS256',
    audience: securityConfig.tokenAudience,
    expiresIn,
    issuer: securityConfig.tokenIssuer,
    jwtid: crypto.randomUUID(),
    subject: String(userId),
  };
}

function verifyToken(token, secret, expectedType) {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    audience: securityConfig.tokenAudience,
    issuer: securityConfig.tokenIssuer,
  });

  if (!decoded || typeof decoded !== 'object') {
    throw new jwt.JsonWebTokenError('Invalid token payload');
  }

  if (decoded.tokenType !== expectedType) {
    throw new jwt.JsonWebTokenError('Unexpected token type');
  }

  if (String(decoded.sub ?? '') !== String(decoded.id ?? '')) {
    throw new jwt.JsonWebTokenError('Invalid token subject');
  }

  return decoded;
}

export function signAccessToken(user) {
  return jwt.sign(
    buildTokenPayload(user, ACCESS_TOKEN_TYPE),
    requireSecret(process.env.JWT_SECRET, 'JWT_SECRET'),
    buildTokenOptions(user.id, securityConfig.accessTokenTtl)
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    buildTokenPayload(user, REFRESH_TOKEN_TYPE),
    requireSecret(process.env.REFRESH_SECRET, 'REFRESH_SECRET'),
    buildTokenOptions(user.id, securityConfig.refreshTokenTtl)
  );
}

export function verifyAccessToken(token) {
  return verifyToken(
    token,
    requireSecret(process.env.JWT_SECRET, 'JWT_SECRET'),
    ACCESS_TOKEN_TYPE
  );
}

export function verifyRefreshToken(token) {
  return verifyToken(
    token,
    requireSecret(process.env.REFRESH_SECRET, 'REFRESH_SECRET'),
    REFRESH_TOKEN_TYPE
  );
}
