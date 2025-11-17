import db from '../config/db.js';

export async function createUser(username, email, passwordHash, emailVerificationToken, tokenExpiresAt) {
  const result = await db.query(
    `INSERT INTO users (username, email, password_hash, email_verification_token, email_verification_expires)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, created_at`,
    [username, email, passwordHash, emailVerificationToken, tokenExpiresAt]
  );
  return result.rows[0];
}

export async function findUserByEmail(email) {
  const result = await db.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return result.rows[0];
}

// for email verification
export async function findUserByToken(hashedToken) {
  const result = await db.query(
    `SELECT * FROM users WHERE email_verification_token = $1 AND email_verification_expires > NOW() AND email_verified = FALSE`,
    [hashedToken]
  );
  return result.rows[0];
}

export async function verifyUserEmail(userId) {
  await db.query(
    `UPDATE users SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL WHERE id = $1`,
    [userId]
  );
}

