import express from 'express';

import * as AuthController from '../controllers/auth.controller.js';
import { authenticateToken, isAuthenticated } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

function emailKey(req) {
  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : 'anonymous';

  return `${req.ip}:${email}`;
}

const loginLimiter = rateLimit({
  name: 'auth:login',
  windowMs: 10 * 60_000,
  max: 10,
  keyGenerator: emailKey
});

const registerLimiter = rateLimit({
  name: 'auth:register',
  windowMs: 60 * 60_000,
  max: 10,
  keyGenerator: emailKey
});

const verifyLimiter = rateLimit({
  name: 'auth:verify-email',
  windowMs: 15 * 60_000,
  max: 20,
  keyGenerator: req => `${req.ip}:${req.params.token ?? 'unknown'}`
});

const passwordResetRequestLimiter = rateLimit({
  name: 'auth:password-reset-request',
  windowMs: 15 * 60_000,
  max: 5,
  keyGenerator: emailKey
});

const passwordResetLimiter = rateLimit({
  name: 'auth:password-reset',
  windowMs: 15 * 60_000,
  max: 10,
  keyGenerator: req => `${req.ip}:${req.params.token ?? 'unknown'}`
});

const authenticatedActionLimiter = rateLimit({
  name: 'auth:sensitive-action',
  windowMs: 10 * 60_000,
  max: 20,
  keyGenerator: req => `${req.ip}:${req.user?.id ?? 'anonymous'}`
});

const accountRecoveryLimiter = rateLimit({
  name: 'auth:recover-account',
  windowMs: 60 * 60_000,
  max: 5,
  keyGenerator: emailKey
});

router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

router.post('/register', registerLimiter, isAuthenticated, AuthController.register);
router.post('/login', loginLimiter, isAuthenticated, AuthController.login);
router.post('/logout', authenticateToken, authenticatedActionLimiter, AuthController.logout);

router.get('/verify-email/:token', verifyLimiter, AuthController.verifyEmail);

router.patch('/change-password', authenticateToken, authenticatedActionLimiter, AuthController.changePassword);

router.post('/request-password-reset', passwordResetRequestLimiter, isAuthenticated, AuthController.resetPasswordRequest);
router.post('/password/reset/:token', passwordResetLimiter, isAuthenticated, AuthController.resetPassword);

router.patch('/change-email', authenticateToken, authenticatedActionLimiter, AuthController.changeEmailAddress);

router.delete('/delete-account', authenticateToken, authenticatedActionLimiter, AuthController.deleteAccount);

router.patch('/recover-account', accountRecoveryLimiter, isAuthenticated, AuthController.recoverAccount);

export default router;
