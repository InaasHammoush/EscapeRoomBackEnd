// src/services/auth.service.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createUser, findUserByEmail } from '../models/user.model.js';

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;

if (!JWT_SECRET || !REFRESH_SECRET) {
  console.warn('⚠️ JWT_SECRET or REFRESH_SECRET is not set – auth will not work correctly.');
}

export async function registerUser({ username, email, password }) {
  const existing = await findUserByEmail(email);
  if (existing) throw new Error('Email already registered');

  const hash = await bcrypt.hash(password, 10);
  return await createUser(username, email, hash);
}

export async function loginUser({ email, password }) {
  const user = await findUserByEmail(email);
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Invalid credentials');

  // Short-lived access token
  const accessToken = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' }
  );

  // Long-lived refresh token (enthält jetzt auch username)
  const refreshToken = jwt.sign(
    { id: user.id, username: user.username },
    REFRESH_SECRET,
    { algorithm: 'HS256', expiresIn: '7d' }
  );

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, username: user.username },
  };
}
