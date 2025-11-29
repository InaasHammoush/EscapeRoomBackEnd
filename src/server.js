// src/server.js
// ------------------------------------------------------------
// Escape-Room Backend – Express + Socket.IO + Redis Adapter
// Präzise kommentierte Basis, lauffähig mit den Modulen
//   - ./util/validation.js   (onSafe + zod-Schemas)
//   - ./game/rooms.js        (RoomManager + Puzzle-Dispatch)
// Node.js: ESM aktiv (package.json -> { "type": "module" })
// ------------------------------------------------------------

import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { JsonStore } from './store/jsonStore.js';
import { ensureDb } from './infra/db.js';
import authRoutes from './routes/auth.routes.js';
import cookieParser from 'cookie-parser';
import tokenRoutes from './routes/token.routes.js';

// Eigene Hilfen/Domain-Module
import { onSafe, schemas } from './util/validation.js';
import { RoomManager } from './game/rooms.js';

dotenv.config(); // .env einlesen (PORT, ORIGIN, REDIS_URL, ...)

// ------------------------------------------------------------
// 1) Basis-HTTP-Server (Express) + Standard-Middleware
// ------------------------------------------------------------
const ORIGINS = (process.env.ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

const app = express();

// CORS: erlaubt Aufrufe vom Frontend (idealerweise gleicher Origin)
app.use(cors({ origin: ORIGINS, credentials: true }));
app.use(express.json()); // JSON-Body-Parsing für evtl. REST-Hilfsrouten

// Wenn später ein Proxy (z. B. Caddy) davor steht, richtige IP/Proto erkennen
app.set('trust proxy', 1);

// Health-/Info-Endpunkte (Monitoring/Debug)
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/version', (_req, res) => res.json({ version: process.env.npm_package_version ?? 'dev' }));

// Auth routes (Registration and Login)
app.use('/api/auth', authRoutes);
app.use(cookieParser());
app.use('/api/token', tokenRoutes);


// HTTP-Serverhülle für Socket.IO
const httpServer = http.createServer(app);

// ------------------------------------------------------------
// 2) Socket.IO – Realtime-Kanal (Events, Rooms)
// ------------------------------------------------------------
const io = new Server(httpServer, {
  // CORS-Spiegelung wie oben – wichtig für lokale Entwicklung
  cors: { origin: ORIGINS, credentials: true },
  path: '/socket.io',                // explizit, Standard ist ebenfalls /socket.io
  transports: ['websocket', 'polling'] // robust: bevorzugt WS, Fallback auf Polling
});

// ------------------------------------------------------------
// 3) Redis-Anbindung – Socket.IO-Adapter + Runtime-Hilfen
//    (Pub/Sub für Broadcasts zwischen Instanzen, Snapshots, Locks…)
// ------------------------------------------------------------
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisPub = createClient({ url: redisUrl });
const redisSub = redisPub.duplicate();

await redisPub.connect();
await redisSub.connect();

// Socket.IO über Redis skalierbar machen (instanzübergreifende Rooms/Broadcasts)
io.adapter(createAdapter(redisPub, redisSub));

// DB-Schema sicherstellen
try {
  await ensureDb();
  console.log('PostgreSQL ready (schema ensured)');
} catch (e) {
  console.warn('ensureDb() failed:', e?.message || e);
  // Optional: process.exit(1) wenn DB zwingend sein soll
}

// ------------------------------------------------------------
// 4) Room-Manager initialisieren (autoritativer In-Memory-State)
//    - hält Rooms & Spieler
//    - kapselt Snapshot/Apply-Logik (Puzzle-FSM via ./game/puzzles)
// ------------------------------------------------------------

const jsonStore = new JsonStore({ file: './data/runtime.json' });
await jsonStore.load();
const rooms = new RoomManager({ redis: redisPub, snapshotTTL: 3600, store: jsonStore });
rooms.startAutosave(30000); // alle 30s speichern
rooms.setCleanupInterval(600000, 600000); // each 10 minutes, clean rooms older that 10 minutes

// ------------------------------------------------------------
// 5) Socket-Event-Handler – alle via onSafe() (Schema-Validierung + Fehlerantworten)
// ------------------------------------------------------------
io.on('connection', (socket) => {
  console.log('⚡ Socket.IO: connection attempt detected');
  console.log('socket connected', socket.id);

  // Raum anlegen
  onSafe(socket, 'create_room', schemas.CreateRoom, async ({ roomName }, cb) => {
    const room = rooms.createRoom(roomName);
    cb?.({ ok: true, roomId: room.id });
  });

  // Raum beitreten
  onSafe(socket, 'join_room', schemas.JoinRoom, async ({ roomId, name }, cb) => {
    try {
      await rooms.joinRoom(roomId, socket.id, name);
      socket.join(roomId);
      // Lobby-Status an alle im Raum
      io.to(roomId).emit('lobby_update', rooms.publicRoom(roomId));
      const snapshot = rooms.snapshot(roomId);
      console.log("✅ SNAPSHOT DATA SENT:", snapshot.state.views);
      // eigenen Snapshot an den neuen Client
      cb?.({ ok: true, snapshot });
    } catch (e) {
      cb?.({ ok: false, error: e.message || 'ROOM_JOIN_FAILED' });
    }
  });

  // „Bereit“-Signal – Startet das Spiel, wenn alle bereit sind
  onSafe(socket, 'ready', schemas.Ready, async ({ roomId }, cb) => {
    try {
      rooms.setReady(roomId, socket.id, true);
      io.to(roomId).emit('lobby_update', rooms.publicRoom(roomId));
      if (rooms.allReady(roomId) && !rooms.get(roomId).started) {
        rooms.start(roomId);
        io.to(roomId).emit('room_state', rooms.snapshot(roomId)); // Initialer Spielzustand
      }
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: e.message || 'READY_FAILED' });
    }
  });

  onSafe(socket, 'intent:turn', schemas.Turn, async ( payload, cb) => {
    const { roomId, direction } = payload; // Destructure the full validated payload
    const result = rooms.applyViewRotation(roomId, { direction }); // Pass direction inside an object
    if (!result.ok) return cb?.(result);
    // Broadcast delta to everyone in the room
    io.to(roomId).emit('state:viewChanged', {
      seq: result.seq,
      viewIndex: result.diff.viewIndex
    });

    cb?.({ ok: true, seq: result.seq });
  });

  // Chat-Nachricht (einfaches Beispiel)
  onSafe(socket, 'chat', schemas.Chat, async ({ roomId, text }) => {
    const from = rooms.displayName(roomId, socket.id) ?? 'Anon';
    io.to(roomId).emit('chat_msg', { from, text });
  });

  // Interaktion mit einem Objekt/Hotspot (Puzzle-Engine)
  onSafe(socket, 'interact', schemas.Interact, async (payload, cb) => {
    const { roomId, actionId, objectId, verb, data } = payload;
    const result = rooms.applyAction(roomId, {
      actionId, playerId: socket.id, objectId, verb, data
    });
    if (!result.ok) return cb?.(result);
    // Delta an alle Clients im Raum senden
    io.to(roomId).emit('puzzle_update', { seq: result.seq, diff: result.diff });
    cb?.({ ok: true, seq: result.seq });
  });

  // Aufräumen bei Verbindungsende
  socket.on('disconnect', () => {
    const affectedRoomIds = rooms.leaveBySocket(socket.id);
    affectedRoomIds.forEach(roomId => {
      io.to(roomId).emit('lobby_update', rooms.publicRoom(roomId));
    });
    console.log('socket disconnected', socket.id);
  });
});

// ------------------------------------------------------------
// 6) Serverstart + (optional) Graceful Shutdown
// ------------------------------------------------------------
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Auf SIGTERM/SIGINT sauber schließen (nützlich in Containern)
async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down…`);
  try {
    await io.close();          // schließt alle Sockets
    await redisPub.quit();     // Redis-Verbindungen schließen
    await redisSub.quit();
    httpServer.close(() => {   // HTTP-Server beenden
      process.exit(0);
    });
    // Falls Close hängt, nach Timeout hart beenden
    setTimeout(() => process.exit(0), 2000).unref();
  } catch (e) {
    console.error('Shutdown error:', e);
    process.exit(1);
  }
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ------------------------------------------------------------
// Ende server.js
// ------------------------------------------------------------
