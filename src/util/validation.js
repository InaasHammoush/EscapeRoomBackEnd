// src/util/validation.js
import { z } from 'zod';

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
  username: z.string().min(3),
  email: z.email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
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
