import assert from 'node:assert/strict';

import {
  formatValidationErrorMessage,
  getValidationErrorDetails,
  isValidationError,
  registerSchema,
} from '../util/validation.js';

function run() {
  const result = registerSchema.safeParse({
    username: 'tester',
    email: 'test',
    password: 'test',
  });

  assert.equal(result.success, false, 'invalid registration payload should fail validation');

  const err = result.error;
  assert.equal(isValidationError(err), true);

  const details = getValidationErrorDetails(err);
  assert.equal(details.length, 5);

  assert.equal(
    formatValidationErrorMessage(err),
    [
      'Bitte eine gueltige E-Mail-Adresse angeben',
      'Passwort muss mindestens 8 Zeichen lang sein',
      'Passwort muss mindestens einen Grossbuchstaben enthalten',
      'Passwort muss mindestens eine Ziffer enthalten',
      'Passwort muss mindestens ein Sonderzeichen enthalten',
    ].join('\n')
  );

  console.log('testValidationMessages passed');
}

try {
  run();
} catch (err) {
  console.error('testValidationMessages failed');
  console.error(err);
  process.exit(1);
}
