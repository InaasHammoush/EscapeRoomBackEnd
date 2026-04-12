import assert from 'node:assert/strict';

import { createPendingUserAndSendVerificationEmail } from '../services/registrationFlow.service.js';

async function run() {
  const operations = [];

  await assert.rejects(
    () =>
      createPendingUserAndSendVerificationEmail({
        createUser: async () => {
          operations.push('createUser');
          return { id: 17, email: 'temp@example.invalid' };
        },
        deletePendingUser: async userId => {
          operations.push(`deletePendingUser:${userId}`);
          return true;
        },
        sendVerificationEmail: async (email, verificationToken) => {
          operations.push(`sendVerificationEmail:${email}:${verificationToken.length}`);
          throw new Error('SMTP_BAD_CREDENTIALS');
        },
        email: 'temp@example.invalid',
        verificationToken: 'verification-token',
      }),
    /Verification email could not be sent/
  );

  assert.deepEqual(operations, [
    'createUser',
    'sendVerificationEmail:temp@example.invalid:18',
    'deletePendingUser:17',
  ]);

  const successOperations = [];
  const user = await createPendingUserAndSendVerificationEmail({
    createUser: async () => {
      successOperations.push('createUser');
      return { id: 42, email: 'ok@example.invalid' };
    },
    deletePendingUser: async userId => {
      successOperations.push(`deletePendingUser:${userId}`);
      return true;
    },
    sendVerificationEmail: async email => {
      successOperations.push(`sendVerificationEmail:${email}`);
    },
    email: 'ok@example.invalid',
    verificationToken: 'another-token',
  });

  assert.deepEqual(user, { id: 42, email: 'ok@example.invalid' });
  assert.deepEqual(successOperations, [
    'createUser',
    'sendVerificationEmail:ok@example.invalid',
  ]);

  console.log('testRegistrationFlow passed');
}

run().catch(err => {
  console.error('testRegistrationFlow failed');
  console.error(err);
  process.exit(1);
});
