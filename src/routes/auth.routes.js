import express from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { authenticateToken, isAuthenticated } from '../middleware/auth.middleware.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = express.Router();

// z.B. max. 5 Login-Versuche pro Minute und IP
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => req.ip  // oder z.B. req.body.email, wenn du willst
});

// Registration limiter (z.B. 10 Registrierungen pro Stunde/IP)
const registerLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  keyGenerator: (req) => req.ip
});

router.post('/register', isAuthenticated, AuthController.register);
router.post('/login', isAuthenticated, AuthController.login);
router.post('/logout', authenticateToken, AuthController.logout);

// Email verification
router.get('/verify-email/:token', AuthController.verifyEmail);

router.patch('/change-password', authenticateToken, AuthController.changePassword);

router.post('/request-password-reset', isAuthenticated, AuthController.resetPasswordRequest);
router.post('/password/reset/:token', isAuthenticated, AuthController.resetPassword);

export default router;