import express from 'express';

import * as userModel from '../models/user.model.js';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie
} from '../config/security.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { signAccessToken, verifyRefreshToken } from '../util/token.js';

const router = express.Router();

const refreshLimiter = rateLimit({
  name: 'auth:refresh',
  windowMs: 5 * 60_000,
  max: 20,
  keyGenerator: req => req.ip
});

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  const token = readRefreshTokenCookie(req);
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  try {
    const decoded = verifyRefreshToken(token);
    const user = await userModel.findActiveUserById(decoded.id);

    if (!user || !user.email_verified) {
      clearRefreshTokenCookie(res);
      return res.status(403).json({ error: 'Invalid refresh token' });
    }

    const accessToken = signAccessToken(user);

    return res.json({
      accessToken,
      user: { id: user.id, username: user.username },
    });
  } catch {
    clearRefreshTokenCookie(res);
    return res.status(403).json({ error: 'Invalid refresh token' });
  }
});

export default router;
