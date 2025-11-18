import express from 'express';
import * as AuthController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', authenticateToken, AuthController.logout);

// Email verification
router.get('/verify-email/:token', AuthController.verifyEmail);

router.patch('/change-password', authenticateToken, AuthController.changePassword);

export default router;