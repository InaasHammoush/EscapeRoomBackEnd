import express from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { authenticateToken, isAuthenticated } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', isAuthenticated, AuthController.register);
router.post('/login', isAuthenticated, AuthController.login);
router.post('/logout', authenticateToken, AuthController.logout);

// Email verification
router.get('/verify-email/:token', AuthController.verifyEmail);

router.patch('/change-password', authenticateToken, AuthController.changePassword);

router.post('/request-password-reset', isAuthenticated, AuthController.resetPasswordRequest);
router.post('/reset-password/:token', isAuthenticated, AuthController.resetPassword);

export default router;