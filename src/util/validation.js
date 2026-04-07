// src/util/validation.js
import { z } from 'zod';

const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

function nonControlText({ min, max, label }) {
  return z
    .string()
    .trim()
    .min(min, `${label} muss mindestens ${min} Zeichen lang sein`)
    .max(max, `${label} darf maximal ${max} Zeichen lang sein`)
    .refine(
      value => !CONTROL_CHAR_REGEX.test(value),
      `${label} darf keine Steuerzeichen enthalten`
    );
}

const emailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Bitte eine gueltige E-Mail-Adresse angeben')
  .max(254, 'E-Mail-Adresse darf maximal 254 Zeichen lang sein');

const passwordSchema = z
  .string()
  .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
  .max(100, 'Passwort darf maximal 100 Zeichen lang sein')
  .regex(/[A-Z]/, 'Passwort muss mindestens einen Grossbuchstaben enthalten')
  .regex(/[a-z]/, 'Passwort muss mindestens einen Kleinbuchstaben enthalten')
  .regex(/[0-9]/, 'Passwort muss mindestens eine Ziffer enthalten')
  .regex(
    /[^A-Za-z0-9]/,
    'Passwort muss mindestens ein Sonderzeichen enthalten'
  );

export const schemas = {
  CreateRoom: z.object({
    roomName: nonControlText({ min: 1, max: 32, label: 'Raumname' }),
    mode: z.enum(['coop', 'solo']).optional(),
    startingChamber: nonControlText({ min: 1, max: 32, label: 'Kammer' }).optional(),
  }),
  JoinRoom: z.object({
    roomId: z.uuid(),
    name: nonControlText({ min: 1, max: 32, label: 'Name' }),
  }),
  Ready: z.object({
    roomId: z.uuid(),
  }),
  Chat: z.object({
    roomId: z.uuid(),
    text: nonControlText({ min: 1, max: 500, label: 'Nachricht' }),
  }),
  Interact: z.object({
    roomId: z.uuid(),
    actionId: z.uuid(),
    objectId: nonControlText({ min: 1, max: 128, label: 'Objekt-ID' }),
    canonicalObjectId: nonControlText({ min: 1, max: 128, label: 'Objekt-ID' }).optional(),
    verb: nonControlText({ min: 1, max: 64, label: 'Verb' }),
    data: z.any().optional(),
  }).loose(),
  Turn: z.object({
    roomId: z.uuid(),
    direction: z.enum(['LEFT', 'RIGHT']),
  }),
  SwitchRoom: z.object({
    roomId: z.uuid(),
    chamber: nonControlText({ min: 1, max: 32, label: 'Kammer' }),
  }),
};

export const registerSchema = z.object({
  username: nonControlText({ min: 3, max: 50, label: 'Benutzername' }),
  email: emailAddressSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailAddressSchema,
  password: z
    .string()
    .min(1, 'Passwort darf nicht leer sein'),
});

export const changeEmailSchema = z.object({
  newEmail: emailAddressSchema,
});

export const emailSchema = z.object({
  email: emailAddressSchema,
});

export const changePasswordSchema = z
  .object({
    oldPassword: z
      .string()
      .min(1, 'Aktuelles Passwort darf nicht leer sein')
      .max(100, 'Aktuelles Passwort darf maximal 100 Zeichen lang sein'),
    newPassword: passwordSchema,
  })
  .refine(
    ({ oldPassword, newPassword }) => oldPassword !== newPassword,
    {
      message: 'Das neue Passwort muss sich vom alten unterscheiden',
      path: ['newPassword'],
    }
  );

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

const socketBuckets = new Map();
let socketCleanupCounter = 0;

function cleanupSocketBuckets(now) {
  socketCleanupCounter += 1;
  if (socketCleanupCounter % 250 !== 0) return;

  for (const [key, bucket] of socketBuckets.entries()) {
    if (bucket.resetTime <= now) {
      socketBuckets.delete(key);
    }
  }
}

function checkSocketRateLimit(socket, event, { windowMs, max }) {
  const now = Date.now();
  cleanupSocketBuckets(now);

  const key = `${socket.id}:${event}`;
  let bucket = socketBuckets.get(key);

  if (!bucket || bucket.resetTime <= now) {
    bucket = { count: 0, resetTime: now + windowMs };
  }

  bucket.count += 1;
  socketBuckets.set(key, bucket);

  if (bucket.count > max) {
    return Math.max(0, bucket.resetTime - now);
  }

  return null;
}

/**
 * Wrappt socket.on(...) mit Payload-Validierung & Fehlerbehandlung
 */
export function onSafe(socket, event, schema, handler, options = {}) {
  socket.on(event, async (payload, cb) => {
    try {
      if (options.rateLimit) {
        const retryAfterMs = checkSocketRateLimit(
          socket,
          options.rateLimit.key ?? event,
          options.rateLimit
        );

        if (retryAfterMs != null) {
          cb?.({ ok: false, error: 'TOO_MANY_REQUESTS', retryAfterMs });
          return;
        }
      }

      const parsed = schema ? schema.parse(payload) : payload;
      await handler(parsed, cb);
    } catch (err) {
      if (err?.name === 'ZodError') {
        cb?.({ ok: false, error: 'INVALID_PAYLOAD', details: err.issues });
      } else {
        console.error(`[${event}]`, err);
        cb?.({ ok: false, error: 'SERVER_ERROR' });
      }
    }
  });
}
