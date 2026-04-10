import express from 'express';

import * as AuthService from '../services/auth.service.js';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie
} from '../config/security.js';
import { rateLimit } from '../middleware/rateLimit.js';

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
    const { accessToken, refreshToken, user } =
      await AuthService.refreshUserSession(token);
    console.info('[auth:refresh] refresh succeeded', {
      userId: user?.id ?? null,
      username: user?.username ?? null,
      issuedAccessToken: Boolean(accessToken),
      rotatedRefreshToken: Boolean(refreshToken),
    });
    if (refreshToken) {
      setRefreshTokenCookie(res, refreshToken);
    }

    return res.json({
      accessToken,
      user,
    });
  } catch (err) {
    console.warn('[auth:refresh] refresh failed', {
      error: err?.message ?? 'unknown',
    });
    clearRefreshTokenCookie(res);
    return res.status(403).json({ error: 'Invalid refresh token' });
  }
});

export default router;
