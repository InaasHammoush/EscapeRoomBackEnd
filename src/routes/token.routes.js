import express from 'express';
import jwt from 'jsonwebtoken';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

// z.B. 20 Refreshes pro 5 Minuten/IP
const refreshLimiter = rateLimit({
  windowMs: 5 * 60_000,
  max: 20,
  keyGenerator: (req) => req.ip
});

router.post('/refresh', refreshLimiter, (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  if (!REFRESH_SECRET || !JWT_SECRET) {
    return res.status(500).json({ error: 'JWT configuration missing' });
  }

  jwt.verify(token, REFRESH_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid refresh token' });

    const accessToken = jwt.sign(
      { id: decoded.id, username: decoded.username },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '15m' }
    );

    res.json({ accessToken });
  });
});

export default router;
