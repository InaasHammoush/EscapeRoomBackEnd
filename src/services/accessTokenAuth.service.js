import * as userModel from '../models/user.model.js';
import { verifyAccessToken } from '../util/token.js';
import { assertTokenNotRevoked } from './tokenSession.service.js';

export function extractBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return null;
  if (!authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

export async function resolveAuthorizedUserFromAccessToken(
  token,
  {
    verifyToken = verifyAccessToken,
    assertNotRevoked = assertTokenNotRevoked,
    findUserById = userModel.findActiveUserById,
  } = {}
) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new Error('ACCESS_TOKEN_MISSING');
  }

  const payload = verifyToken(token);
  await assertNotRevoked(payload);

  const user = await findUserById(payload.id);
  if (!user || !user.email_verified) {
    throw new Error('ACCOUNT_NOT_AUTHORIZED');
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}
