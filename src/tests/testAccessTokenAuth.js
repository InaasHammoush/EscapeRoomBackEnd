import assert from 'node:assert/strict';

import {
  extractBearerToken,
  resolveAuthorizedUserFromAccessToken
} from '../services/accessTokenAuth.service.js';

async function run() {
  assert.equal(extractBearerToken(null), null);
  assert.equal(extractBearerToken('Basic abc'), null);
  assert.equal(extractBearerToken('Bearer test-token'), 'test-token');

  const resolvedUser = await resolveAuthorizedUserFromAccessToken('valid-token', {
    verifyToken: token => {
      assert.equal(token, 'valid-token');
      return { id: 7 };
    },
    assertNotRevoked: async payload => {
      assert.equal(payload.id, 7);
    },
    findUserById: async userId => ({
      id: userId,
      username: 'player7',
      email: 'player7@example.invalid',
      email_verified: true,
    }),
  });

  assert.deepEqual(resolvedUser, {
    id: 7,
    username: 'player7',
    email: 'player7@example.invalid',
  });

  await assert.rejects(
    () =>
      resolveAuthorizedUserFromAccessToken('valid-token', {
        verifyToken: () => ({ id: 8 }),
        assertNotRevoked: async () => {},
        findUserById: async () => ({
          id: 8,
          username: 'guestlike',
          email: 'guestlike@example.invalid',
          email_verified: false,
        }),
      }),
    /ACCOUNT_NOT_AUTHORIZED/
  );

  console.log('testAccessTokenAuth passed');
}

run().catch(err => {
  console.error('testAccessTokenAuth failed');
  console.error(err);
  process.exit(1);
});
