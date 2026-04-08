import * as userModel from '../models/user.model.js';
import { verifyAccessToken } from '../util/token.js';
import { assertTokenNotRevoked } from '../services/tokenSession.service.js';

function extractBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Middleware to verify JWT access tokens.
 * Expected header format: Authorization: Bearer <token>
 */
export async function authenticateToken(req, res, next) {
  try {
    const token = extractBearerToken(req.headers['authorization']);
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const payload = verifyAccessToken(token);
    await assertTokenNotRevoked(payload);
    const user = await userModel.findActiveUserById(payload.id);

    if (!user || !user.email_verified) {
      return res.status(403).json({ error: 'Account is not authorized' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
    };

    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Middleware to check if user is already authenticated
 * Used for routes that should not be accessed when logged in
 */
export async function isAuthenticated(req, res, next) {
  const token =
    req.cookies?.access_token ||
    extractBearerToken(req.headers.authorization);

  if (!token) {
    return next();
  }

  try {
    const payload = verifyAccessToken(token);
    await assertTokenNotRevoked(payload);
    const user = await userModel.findActiveUserById(payload.id);

    if (!user || !user.email_verified) {
      return next();
    }

    return res.status(403).json({
      message: 'Already authenticated.'
    });
  } catch {
    return next();
  }
}
