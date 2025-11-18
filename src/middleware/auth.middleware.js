import jwt from 'jsonwebtoken';

/**
 * Middleware to verify JWT access tokens.
 * Expected header format: Authorization: Bearer <token>
 */
export function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Invalid Authorization header format' });
    }

    jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' });
      req.user = user; // attach decoded payload (id, username, etc.)
      next();
    });
  } catch (err) {
    console.error('JWT verification failed:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware to check if user is already authenticated
 * Used for routes that shouldn't be accessed when logged in (e.g., login page)
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next middleware function
 */
export function isAuthenticated(req, res, next) {
  const token = req.cookies?.access_token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return next();
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return res.status(403).json({
      message: "Already authenticated."
    });

  } catch (err) {
    // token exists but is expired or invalid → user is NOT authenticated
    return next();
  }
}
