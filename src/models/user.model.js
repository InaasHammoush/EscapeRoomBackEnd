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
  const result = await db.query(`SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`, [email]);
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

export async function completeEmailVerification(userId) {
  await db.query(
    `UPDATE users SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL WHERE id = $1`,
    [userId]
  );
}

export async function findUserById(userID) {
  const user = await db.query(
    `SELECT * FROM users WHERE id = $1`,
    [userID]
  );
  return user.rows[0];
}

export async function updateUserPassword(userID, newPasswordHash) {
  await db.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2`,
    [newPasswordHash, userID]
  );
}

export async function updateUserEmail(userId, newEmail, emailVerificationToken, tokenExpiresAt) {
  await db.query(
    `UPDATE users SET email = $1, email_verified = FALSE, email_verification_token = $2, email_verification_expires = $3 WHERE id = $4`,
    [newEmail, emailVerificationToken, tokenExpiresAt, userId]
  );
}

export async function softDeleteUserById(userID) {
  await db.query(
    `UPDATE users SET deleted_at = NOW() WHERE id = $1`,
    [userID]
  );
}

export async function findDeletedUserByEmail(email) {
  const result = await db.query(
    `SELECT * FROM users WHERE email = $1 AND deleted_at IS NOT NULL`,
  [email]
  );
  return result.rows[0];
}

export async function recoverDeletedUserByEmail(email) {
  await db.query(
    `UPDATE users SET deleted_at = NULL WHERE email = $1`,
    [email]
  );
}
