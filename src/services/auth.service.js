import bcrypt from 'bcryptjs';
import crypto from "crypto";
import jwt from 'jsonwebtoken';
import * as userModel from '../models/user.model.js';
import emailService from '../util/nodemailer.js';
import * as passwordResetModel from '../models/passwordReset.model.js';

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

export async function registerUser({ username, email, password }) {
  const existing = await userModel.findUserByEmail(email);
  if (existing) throw new Error('Email already registered');

  const hashedPassword = await bcrypt.hash(password, 10);
  const {token, hashedToken} = generateVerificationToken();


  const user = await userModel.createUser(
    username, 
    email, 
    hashedPassword, 
    hashedToken, 
    new Date(Date.now() + 3600000 * 24) // 24 hours expiry for token
  );

  await emailService.sendVerificationEmail(email, token);

  return user;
}

export async function loginUser({ email, password }) {
  const user = await userModel.findUserByEmail(email);
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Invalid credentials');
  ensureEmailVerified(user);

  // Short-lived access token
  const accessToken = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );

  // Long-lived refresh token
  const refreshToken = jwt.sign(
    { id: user.id },
    REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: '7d' }
  );

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username },
  };
}

export async function verifyEmailToken(token) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const user = await userModel.findUserByToken(tokenHash);
  if (!user) {
    throw new Error("invalid or expired token");
  }

  await userModel.completeEmailVerification(user.id);
  await emailService.sendWelcomeEmail(user.email);
}

export async function changeUserPassword(userID, oldPassword, newPassword) {
  const user = await userModel.findUserById(userID);
  if (!user) {
    throw new Error("User not found");
  }
  const valid = await bcrypt.compare(oldPassword, user.password_hash);
  if (!valid) {
    throw new Error("Password incorrect");
  }
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await userModel.updateUserPassword(userID, hashedPassword);
  await emailService.sendPasswordChangedEmail(user.email);
}

export async function requestPasswordReset(email) {
  const user = await userModel.findUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 3600000); // 1 hour expiry

  await passwordResetModel.createPasswordResetToken(user.id, hashedToken, expiresAt);
  await emailService.sendResetPasswordEmail(user.email, token);

} 

export async function resetUserPasswordWithToken(token, newPassword) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const result = await passwordResetModel.findTokenHash(tokenHash);
  const resetRecord = result.rows[0];

  if (!resetRecord) {
    throw new Error("invalid or expired token");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await userModel.updateUserPassword(resetRecord.user_id, hashedPassword);
  await passwordResetModel.deleteTokenByHash(tokenHash);

  const user = await userModel.findUserById(resetRecord.user_id);

  await emailService.sendPasswordChangedEmail(user.email);
}

export async function changeUserEmailAddress(userID, newEmail) {
  const existing = await userModel.findUserById(userID);
  if (!existing) {
    throw new Error("user not found")
  }

  const emailExists = await userModel.findUserByEmail(newEmail);
  if (emailExists) {
    throw new Error("email already exists");
  }

  const {token, hashedToken} = generateVerificationToken();

  await userModel.updateUserEmail(
    userID,
    newEmail,
    hashedToken,
    new Date(Date.now() + 3600000 * 24) // 24 hours expiry for token
  )
  await emailService.sendVerificationEmail(newEmail, token);
  
}

export async function softDeleteUserAccount(userID) {
  const user = await userModel.findUserById(userID);
  if (!user) {
    throw new Error("User not found");
  }
  await userModel.softDeleteUserById(userID);
  await emailService.sendAccountDeletionEmail(user.email);
} 

export async function recoverDeletedUserAccount(email) {
  const user = await userModel.findDeletedUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }
  if (new Date() - new Date(user.deleted_at) > 30 * 24 * 3600000) {
    throw new Error("Account recovery period exceeded");
  }

  await userModel.recoverDeletedUserByEmail(email);
  await emailService.sendAccountRecoveryEmail(email);
}

function generateVerificationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  return {token, hashedToken};
}

function ensureEmailVerified(user) {
  if (!user.email_verified) {
    throw new Error("Email not verified");
  }
}