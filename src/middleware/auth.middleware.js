import {
  extractBearerToken,
  resolveAuthorizedUserFromAccessToken
} from '../services/accessTokenAuth.service.js';

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

    const user = await resolveAuthorizedUserFromAccessToken(token);

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
    await resolveAuthorizedUserFromAccessToken(token);

    return res.status(403).json({
      message: 'Already authenticated.'
    });
  } catch {
    return next();
  }
}
