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
