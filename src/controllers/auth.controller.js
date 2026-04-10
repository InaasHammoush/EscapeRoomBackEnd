import * as AuthService from '../services/auth.service.js';
import {
  registerSchema,
  loginSchema,
  changeEmailSchema,
  emailSchema,
  changePasswordSchema,
  resetPasswordSchema
} from '../util/validation.js';
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie
} from '../config/security.js';

export async function register(req, res) {
  try {
    const payload = registerSchema.parse(req.body);
    const user = await AuthService.registerUser(payload);
    res.status(201).json({ success: true, user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function login(req, res) {
  try {
    const payload = loginSchema.parse(req.body);
    const { accessToken, refreshToken, user } = await AuthService.loginUser(payload);

    console.info('[auth:login] login succeeded', {
      userId: user?.id ?? null,
      username: user?.username ?? null,
      issuedAccessToken: Boolean(accessToken),
      issuedRefreshToken: Boolean(refreshToken),
    });

    setRefreshTokenCookie(res, refreshToken);
    res.json({ accessToken, user });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}

export async function logout(req, res) {
  try {
    const refreshToken = readRefreshTokenCookie(req);
    await AuthService.logoutUser(req.user.id, refreshToken);
    clearRefreshTokenCookie(res);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function verifyEmail(req, res) {
  try {
    const { token } = req.params;
    await AuthService.verifyEmailToken(token);
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function changePassword(req, res) {
  try {
    const userID = req.user.id;
    const { oldPassword, newPassword } = changePasswordSchema.parse(req.body);

    await AuthService.changeUserPassword(userID, oldPassword, newPassword);
    clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function resetPasswordRequest(req, res) {
  try {
    const { email } = emailSchema.parse(req.body);
    await AuthService.requestPasswordReset(email);
    res.json({
      success: true,
      message: 'Password reset email sent if the email is registered'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function resetPassword(req, res) {
  try {
    const { token } = req.params;
    const { newPassword } = resetPasswordSchema.parse(req.body);

    await AuthService.resetUserPasswordWithToken(token, newPassword);
    clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function changeEmailAddress(req, res) {
  try {
    const payload = changeEmailSchema.parse(req.body);
    const userID = req.user.id;
    const { newEmail } = payload;

    await AuthService.changeUserEmailAddress(userID, newEmail);
    clearRefreshTokenCookie(res);
    res.json({
      success: true,
      message: 'Email change initiated. Please verify your new email address.'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function deleteAccount(req, res) {
  try {
    const userID = req.user.id;
    await AuthService.softDeleteUserAccount(userID);
    clearRefreshTokenCookie(res);
    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}

export async function recoverAccount(req, res) {
  try {
    const payload = emailSchema.parse(req.body);
    const { email } = payload;

    await AuthService.recoverDeletedUserAccount(email);
    res.json({
      success: true,
      message: 'If the account is eligible for recovery, it is now available again.'
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
}
