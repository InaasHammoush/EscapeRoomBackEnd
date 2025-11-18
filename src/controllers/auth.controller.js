import * as AuthService from '../services/auth.service.js';
import { registerSchema, loginSchema } from '../util/validation.js';

export async function register(req, res) {
  try {
    //input validation
    registerSchema.parse(req.body);

    const user = await AuthService.registerUser(req.body);
    res.status(201).json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function login(req, res) {
  try {
    //input validation
    loginSchema.parse(req.body);

    const { accessToken, refreshToken, user } = await AuthService.loginUser(req.body);

    // Send refresh token as HTTP-only cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({ accessToken, user });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

export async function logout(req, res) {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
}

export async function verifyEmail(req, res) {
  try {
    const { token } = req.params;
    await AuthService.verifyEmailToken(token);
    res.json({ success: true, message: 'Email verified successfully' }); // temporary until the frontend page is ready
    // res.redirect(`${process.env.FRONTEND_URL}/email-verified`);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function changePassword(req, res) {
  try{
    const userID = req.user.id;
    const { oldPassword, newPassword } = req.body;

    await AuthService.changeUserPassword(userID, oldPassword, newPassword);

    res.json({ success: true, message: 'Password changed successfully'});
  } catch (err) {
    res.status(400).json({ success: false, message: err.message});
  }
}