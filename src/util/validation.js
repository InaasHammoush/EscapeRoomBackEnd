// src/util/validation.js
import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Passwort muss mindestens 8 Zeichen lang sein')
  .max(100, 'Passwort darf maximal 100 Zeichen lang sein')
  .regex(/[A-Z]/, 'Passwort muss mindestens einen Großbuchstaben enthalten')
  .regex(/[a-z]/, 'Passwort muss mindestens einen Kleinbuchstaben enthalten')
  .regex(/[0-9]/, 'Passwort muss mindestens eine Ziffer enthalten')
  .regex(
    /[^A-Za-z0-9]/,
    'Passwort muss mindestens ein Sonderzeichen enthalten'
  );

export const schemas = {
  CreateRoom: z.object({
    roomName: z.string().min(1).max(32)
  }),
  JoinRoom: z.object({
    roomId: z.uuid(),
    name: z.string().min(1).max(32)
  }),
  Ready: z.object({
    roomId: z.uuid(),
  }),
  Chat: z.object({
    roomId: z.uuid(),
    text: z.string().min(1).max(500)
  }),
  Interact: z.object({
    roomId: z.uuid(),
    actionId: z.uuid(),
    objectId: z.string().min(1), // z. B. "switch:A"
    verb: z.string().min(1),     // z. B. "toggle"
    data: z.any().optional()
  }).loose(),
  Turn: z.object({
    roomId: z.uuid(),
    direction: z.enum(['LEFT','RIGHT'])
  })
};

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Benutzername muss mindestens 3 Zeichen lang sein')
    .max(50, 'Benutzername darf maximal 50 Zeichen lang sein'),
  email: z
    .string()
    .email('Bitte eine gültige E-Mail-Adresse angeben'),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z
    .string()
    .email('Bitte eine gültige E-Mail-Adresse angeben'),
  password: z
    .string()
    .min(1, 'Passwort darf nicht leer sein'),
});

export const changeEmailSchema = z.object({
  newEmail: z.email(),
});

export const emailSchema = z.object({
  email: z.email(),
});

/**
 * Wrappt socket.on(...) mit Payload-Validierung & Fehlerbehandlung
 */
export function onSafe(socket, event, schema, handler) {
  socket.on(event, async (payload, cb) => {
    try {
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
