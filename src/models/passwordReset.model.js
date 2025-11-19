import db from '../config/db.js';

export async function createPasswordResetToken(userId, hashedToken, expiresAt) {
  const result = await db.query(
    `INSERT INTO password_resets (user_id, reset_token, expires_at)
     VALUES ($1, $2, $3) RETURNING id, user_id, reset_token, expires_at`,
    [userId, hashedToken, expiresAt]
  );
  return result.rows[0];
}

export async function findTokenHash(hashedToken) {
    const result = await db.query(
    `SELECT * FROM password_resets WHERE reset_token = $1 AND expires_at > NOW()`,
    [hashedToken]
    );
    return result;
}

export async function deleteTokenByHash(hashedToken) {
  await db.query(
    `DELETE FROM password_resets WHERE reset_token = $1`,
    [hashedToken]   
  )
}