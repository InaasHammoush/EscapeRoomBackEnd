import express from 'express';
import * as AuthController from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);

// Email verification
router.get('/verify-email/:token', AuthController.verifyEmail);

export default router;