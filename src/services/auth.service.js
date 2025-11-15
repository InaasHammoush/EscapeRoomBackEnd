import bcrypt from 'bcryptjs';
import crypto from "crypto";
import jwt from 'jsonwebtoken';
import * as userModel from '../models/user.model.js';
import emailService from '../util/nodemailer.js';

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

  await userModel.verifyUserEmail(user.id);
  await emailService.sendWelcomeEmail(user.email);
}

function generateVerificationToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
  return {token, hashedToken};
}
