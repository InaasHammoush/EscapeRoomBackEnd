// src/services/auth.service.js
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

import * as userModel from '../models/user.model.js';
import * as passwordResetModel from '../models/passwordReset.model.js';
import emailService from '../util/nodemailer.js';
import { createPendingUserAndSendVerificationEmail } from './registrationFlow.service.js';
import { verifyRefreshToken } from '../util/token.js';
import {
  issueTokensForUser,
  revokeAllUserTokens,
  revokeRefreshTokenString,
  rotateRefreshToken
} from './tokenSession.service.js';

const parsedBcryptRounds = Number.parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10);
const BCRYPT_ROUNDS =
  Number.isFinite(parsedBcryptRounds) && parsedBcryptRounds >= 10 && parsedBcryptRounds <= 14
    ? parsedBcryptRounds
    : 12;

export async function registerUser({ username, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await userModel.findUserByEmail(normalizedEmail);
  if (existing) throw new Error('Email already registered');

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const { token, hashedToken } = generateVerificationToken();

  return createPendingUserAndSendVerificationEmail({
    createUser: () =>
      userModel.createUser(
        username,
        normalizedEmail,
        hashedPassword,
        hashedToken,
        new Date(Date.now() + 3600000 * 24)
      ),
    deletePendingUser: userId => userModel.deletePendingUserById(userId),
    sendVerificationEmail: (targetEmail, verificationToken) =>
      emailService.sendVerificationEmail(targetEmail, verificationToken),
    email: normalizedEmail,
    verificationToken: token,
  });
}

export async function loginUser({ email, password }) {
  const user = await userModel.findUserByEmail(normalizeEmail(email));
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Invalid credentials');

  ensureEmailVerified(user);

  const { accessToken, refreshToken } = await issueTokensForUser(user);

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username },
  };
}

export async function verifyEmailToken(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await userModel.findUserByToken(tokenHash);
  if (!user) {
    throw new Error('invalid or expired token');
  }

  await userModel.completeEmailVerification(user.id);
  await emailService.sendWelcomeEmail(user.email);
}

export async function changeUserPassword(userID, oldPassword, newPassword) {
  const user = await userModel.findUserById(userID);
  if (!user) {
    throw new Error('User not found');
  }

  const valid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!valid) {
    throw new Error('Password incorrect');
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userModel.updateUserPassword(userID, hashedPassword);
  await passwordResetModel.deleteTokensByUserId(userID);
  await revokeAllUserTokens(userID, 'password_changed');
  await emailService.sendPasswordChangedEmail(user.email);
}

export async function requestPasswordReset(email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await userModel.findUserByEmail(normalizedEmail);
  if (!user) {
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 3600000);

  await passwordResetModel.deleteTokensByUserId(user.id);
  await passwordResetModel.createPasswordResetToken(user.id, hashedToken, expiresAt);
  await emailService.sendResetPasswordEmail(user.email, token);
}

export async function resetUserPasswordWithToken(token, newPassword) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await passwordResetModel.findTokenHash(tokenHash);
  const resetRecord = result.rows[0];

  if (!resetRecord) {
    throw new Error('invalid or expired token');
  }

  const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userModel.updateUserPassword(resetRecord.user_id, hashedPassword);
  await passwordResetModel.deleteTokensByUserId(resetRecord.user_id);
  await revokeAllUserTokens(resetRecord.user_id, 'password_reset');

  const user = await userModel.findUserById(resetRecord.user_id);
  await emailService.sendPasswordChangedEmail(user.email);
}

export async function changeUserEmailAddress(userID, newEmail) {
  const normalizedEmail = normalizeEmail(newEmail);
  const existing = await userModel.findUserById(userID);
  if (!existing) {
    throw new Error('user not found');
  }

  if (existing.email?.toLowerCase() === normalizedEmail) {
    throw new Error('new email must differ from current email');
  }

  const emailExists = await userModel.findUserByEmail(normalizedEmail);
  if (emailExists) {
    throw new Error('email already exists');
  }

  const { token, hashedToken } = generateVerificationToken();

  await userModel.updateUserEmail(
    userID,
    normalizedEmail,
    hashedToken,
    new Date(Date.now() + 3600000 * 24)
  );
  await revokeAllUserTokens(userID, 'email_changed');
  await emailService.sendVerificationEmail(normalizedEmail, token);
}

export async function softDeleteUserAccount(userID) {
  const user = await userModel.findUserById(userID);
  if (!user) {
    throw new Error('User not found');
  }

  await userModel.softDeleteUserById(userID);
  await revokeAllUserTokens(userID, 'account_deleted');
  await emailService.sendAccountDeletionEmail(user.email);
}

export async function recoverDeletedUserAccount(email) {
  const normalizedEmail = normalizeEmail(email);
  const user = await userModel.findDeletedUserByEmail(normalizedEmail);
  if (!user) {
    return false;
  }

  if (new Date() - new Date(user.deleted_at) > 30 * 24 * 3600000) {
    return false;
  }

  await userModel.recoverDeletedUserByEmail(normalizedEmail);
  await revokeAllUserTokens(user.id, 'account_recovered');
  await emailService.sendAccountRecoveryEmail(normalizedEmail);
  return true;
}

export async function logoutUser(userId, refreshToken) {
  await revokeRefreshTokenString(refreshToken, userId);
}

export async function refreshUserSession(refreshToken) {
  const userId = normalizeTokenUserId(refreshToken);
  const user = await userModel.findActiveUserById(userId);

  if (!user || !user.email_verified) {
    await revokeAllUserTokens(userId, 'account_not_authorized');

    throw new Error('Invalid refresh token');
  }

  const tokens = await rotateRefreshToken(refreshToken, user);

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: { id: user.id, username: user.username },
  };
}

function generateVerificationToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hashedToken };
}

function ensureEmailVerified(user) {
  if (!user.email_verified) {
    throw new Error('Email not verified');
  }
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function normalizeTokenUserId(refreshToken) {
  const decoded = verifyRefreshToken(refreshToken);
  return decoded.id;
}
