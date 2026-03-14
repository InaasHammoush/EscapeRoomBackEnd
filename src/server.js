// src/server.js
// ------------------------------------------------------------
// Escape-Room Backend – Express + Socket.IO + Redis Adapter
// ------------------------------------------------------------

import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

import { JsonStore } from './store/jsonStore.js';
import authRoutes from './routes/auth.routes.js';
import tokenRoutes from './routes/token.routes.js';

// Eigene Hilfen/Domain-Module
import { onSafe, schemas } from './util/validation.js';
import { RoomManager } from './game/rooms.js';
import { authenticateToken } from './middleware/auth.middleware.js';
import leaderboardRoutes from './routes/leaderboard.routes.js';

dotenv.config(); // .env einlesen (PORT, ORIGIN, REDIS_URL, ...)

const JWT_SECRET = process.env.JWT_SECRET;

// ------------------------------------------------------------
// 1) Basis-HTTP-Server (Express) + Standard-Middleware
// ------------------------------------------------------------
const ORIGINS = (process.env.ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map(s => s.trim());

const app = express();

// CORS: erlaubt Aufrufe vom Frontend (idealerweise gleicher Origin)
app.use(cors({ origin: ORIGINS, credentials: true }));
app.use(express.json());   // JSON-Body-Parsing für REST-Hilfsrouten
app.use(cookieParser());   // Cookies z. B. für Refresh-Token

// Wenn später ein Proxy (z. B. Caddy) davor steht, richtige IP/Proto erkennen
app.set('trust proxy', 1);

// Health-/Info-Endpunkte (Monitoring/Debug)
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/version', (_req, res) =>
  res.json({ version: process.env.npm_package_version ?? 'dev' })
);

// Auth routes (Registration and Login)
app.use('/api/auth', authRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

// Kleine Test-Route für Access-Token: gibt den im JWT kodierten User zurück
app.get('/api/me', authenticateToken, (req, res) => {
  // req.user wird in middleware/auth.js aus dem Access-Token befüllt
  res.json({ user: req.user });
});

// HTTP-Serverhülle für Socket.IO
const httpServer = http.createServer(app);

// ------------------------------------------------------------
// 2) Socket.IO – Realtime-Kanal (Events, Rooms)
// ------------------------------------------------------------
const io = new Server(httpServer, {
  // CORS-Spiegelung wie oben – wichtig für lokale Entwicklung
  cors: { origin: ORIGINS, credentials: true },
  path: '/socket.io',                 // explizit, Standard ist ebenfalls /socket.io
  transports: ['websocket', 'polling'] // robust: bevorzugt WS, Fallback auf Polling
});

// ------------------------------------------------------------
// 2.1) Lobby-State (Coop Rollen A/B)
// ------------------------------------------------------------
const lobbies = new Map(); // sessionId -> { players: Map<socketId,{role:string|null}>, roomId?:string }

function normalizeRole(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'A' || raw === 'B') return raw;
  if (raw === 'WIZARD' || raw === 'WIZARD_LIBRARY') return 'A';
  if (raw === 'ALCHEMIST' || raw === 'ALCHEMIST_LAB') return 'B';
  return null;
}

function getLobby(sessionId) {
  if (!sessionId) return null;
  if (!lobbies.has(sessionId)) {
    lobbies.set(sessionId, { players: new Map() });
  }
  return lobbies.get(sessionId);
}

function lobbySnapshot(sessionId, socketId = null) {
  const lobby = lobbies.get(sessionId);
  if (!lobby) return { players: [], ready: false, roomId: null };
  const players = [...lobby.players.entries()].map(([id, p]) => ({
    id,
    role: p.role || null,
  }));
  const roles = players.map((p) => p.role).filter(Boolean);
  const ready = roles.includes('A') && roles.includes('B');
  const myRole = socketId ? (lobby.players.get(socketId)?.role || null) : null;
  return { players, ready, ...(socketId ? { myRole } : {}), roomId: lobby.roomId || null };
}

function lobbyRoom(sessionId) {
  return `lobby:${sessionId}`;
}

function ensureLobbyRoom(sessionId) {
  const lobby = getLobby(sessionId);
  if (!lobby) return null;
  const snap = lobbySnapshot(sessionId);
  if (snap.ready && !lobby.roomId) {
    const room = rooms.createRoom('wizard_library', { mode: 'coop' });
    lobby.roomId = room.id;
  }
  return lobby.roomId || null;
}

// Auth-Hook für Socket.IO (JWT optional auswerten)
io.use((socket, next) => {
  const auth = socket.handshake.auth || {};
  const headers = socket.handshake.headers || {};

  let token = null;

  // Bevorzugt: Client übergibt token im auth-Feld
  if (auth.token) {
    token = auth.token;
  } else if (typeof headers.authorization === 'string' &&
             headers.authorization.startsWith('Bearer ')) {
    token = headers.authorization.substring('Bearer '.length);
  }

  if (!token || !JWT_SECRET) {
    // Kein Token oder Secret → als Gast behandeln
    return next();
  }

  jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }, (err, decoded) => {
    if (err) {
      console.warn('Socket JWT invalid:', err.message);
      // Für jetzt: trotzdem verbinden, aber ohne user-Info
      return next();
      // Wenn ihr später nur authentifizierte Sockets wollt:
      // return next(new Error('UNAUTHORIZED'));
    }
    // decoded enthält z.B. { id, username, iat, exp }
    socket.data.user = decoded;
    return next();
  });
});

// ------------------------------------------------------------
// 3) Redis-Anbindung – Socket.IO-Adapter + Runtime-Hilfen
// ------------------------------------------------------------
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisPub = createClient({ url: redisUrl });
const redisSub = redisPub.duplicate();

await redisPub.connect();
await redisSub.connect();

// Socket.IO über Redis skalierbar machen (instanzübergreifende Rooms/Broadcasts)
io.adapter(createAdapter(redisPub, redisSub));

// ------------------------------------------------------------
// 4) Room-Manager initialisieren (autoritativer In-Memory-State)
// ------------------------------------------------------------
const jsonStore = new JsonStore({ file: './data/runtime.json' });
await jsonStore.load();

const rooms = new RoomManager({
  redis: redisPub,
  snapshotTTL: 3600,
  store: jsonStore
});

// periodische Snapshots & Aufräumen leerer Räume
rooms.startAutosave(30000);                // alle 30s speichern
rooms.setCleanupInterval(600000, 600000);  // alle 10min Räume bereinigen, die älter als 10min sind

// ------------------------------------------------------------
// 5) Socket-Event-Handler – alle via onSafe() (Schema-Validierung + Fehlerantworten)
// ------------------------------------------------------------
io.on('connection', (socket) => {
  console.log('⚡ Socket.IO: connection attempt detected');
  console.log('socket connected', socket.id);

  socket.data.lobbies = new Set();

  // Raum anlegen
  onSafe(socket, 'create_room', schemas.CreateRoom, async ({ roomName, mode, startingChamber }, cb) => {
    const room = rooms.createRoom(roomName, { mode, startingChamber });
    cb?.({ ok: true, roomId: room.id });
  });

  // Raum beitreten
  onSafe(socket, 'join_room', schemas.JoinRoom, async ({ roomId, name, role }, cb) => {
    try {
      const user = socket.data.user;
      const displayName = user?.username || name;   // JWT-Name schlägt manuelles Feld
      const profileId = user?.id || null;           // Für Stats/room_participants
      const normalizedRole = normalizeRole(role) || socket.data?.coopRole || null;

      // joinRoom ist async, weil es ggf. einen Snapshot aus Redis lädt
      const room = await rooms.joinRoom(roomId, socket.id, displayName, profileId, normalizedRole);

      // Socket dem Socket.IO-Room zuordnen
      socket.join(room.id);

      // Lobby-Status an alle im Raum senden
      const publicRoom = rooms.publicRoom(room.id);
      io.to(room.id).emit('lobby_update', publicRoom);

      // Auto-start when expected players have joined
      const mode = publicRoom?.state?.mode || room?.state?.public?.mode || 'coop';
      const expectedPlayers = mode === 'solo' ? 1 : 2;
      if (!room.started && room.players.size >= expectedPlayers) {
        rooms.start(room.id);
        for (const [sid] of room.players) {
          const startedSnapshot = rooms.snapshotFor(room.id, sid);
          if (!startedSnapshot) continue;
          io.to(sid).emit('room_state', startedSnapshot);
          io.to(sid).emit('state:snapshot', { snapshot: startedSnapshot });
        }
      }

      // eigenen Snapshot an den neuen Client zurückgeben
      const snapshot = rooms.snapshotFor(room.id, socket.id);
      console.log("✅ SNAPSHOT DATA SENT:", snapshot.state.views);
      io.to(socket.id).emit('state:snapshot', { snapshot });
      cb?.({ ok: true, snapshot });
    } catch (e) {
      console.error('join_room failed:', e);
      cb?.({ ok: false, error: e.message || 'ROOM_JOIN_FAILED' });
    }
  });

  // ----------------------------------------------------------
  // Lobby (Coop Rollen A/B)
  // ----------------------------------------------------------
  socket.on('lobby:subscribe', ({ sessionId } = {}) => {
    if (!sessionId) return;
    const lobby = getLobby(sessionId);
    lobby.players.set(socket.id, lobby.players.get(socket.id) || { role: null });
    socket.join(lobbyRoom(sessionId));
    socket.data.lobbies.add(sessionId);
    ensureLobbyRoom(sessionId);
    socket.emit('lobby:status', lobbySnapshot(sessionId, socket.id));
    io.to(lobbyRoom(sessionId)).emit('lobby:status', lobbySnapshot(sessionId));
  });

  socket.on('lobby:status:get', ({ sessionId } = {}) => {
    if (!sessionId) return;
    ensureLobbyRoom(sessionId);
    socket.emit('lobby:status', lobbySnapshot(sessionId, socket.id));
  });

  socket.on('lobby:setRole', ({ sessionId, role } = {}) => {
    if (!sessionId) return;
    const nextRole = normalizeRole(role);
    if (!nextRole) return;
    const lobby = getLobby(sessionId);
    lobby.players.set(socket.id, { role: nextRole });
    socket.join(lobbyRoom(sessionId));
    socket.data.lobbies.add(sessionId);
    socket.data.coopRole = nextRole;
    ensureLobbyRoom(sessionId);
    io.to(lobbyRoom(sessionId)).emit('lobby:status', lobbySnapshot(sessionId));
    socket.emit('lobby:status', lobbySnapshot(sessionId, socket.id));
  });

  socket.on('lobby:unsubscribe', ({ sessionId } = {}) => {
    if (!sessionId) return;
    const lobby = lobbies.get(sessionId);
    if (!lobby) return;
    lobby.players.delete(socket.id);
    socket.leave(lobbyRoom(sessionId));
    socket.data.lobbies.delete(sessionId);
    io.to(lobbyRoom(sessionId)).emit('lobby:status', lobbySnapshot(sessionId));
    if (lobby.players.size === 0) lobbies.delete(sessionId);
  });

  // „Bereit“-Signal – Startet das Spiel, wenn alle bereit sind
  onSafe(socket, 'ready', schemas.Ready, async ({ roomId }, cb) => {
    try {
      rooms.setReady(roomId, socket.id, true);
      io.to(roomId).emit('lobby_update', rooms.publicRoom(roomId));
      cb?.({ ok: true });
    } catch (e) {
      cb?.({ ok: false, error: e.message || 'READY_FAILED' });
    }
  });

  onSafe(socket, 'intent:turn', schemas.Turn, async ( payload, cb) => {
    const { roomId, direction } = payload; // Destructure the full validated payload
    const result = rooms.applyViewRotation(roomId, { direction, socketId: socket.id }); // Pass direction inside an object
    if (!result.ok) return cb?.(result);
    const room = rooms.get(roomId);
    const mode = room?.state?.public?.mode || 'coop';
    const target = mode === 'coop' ? socket.id : roomId;
    // Broadcast delta (per-player in coop)
    io.to(target).emit('state:viewChanged', {
      seq: result.seq,
      viewIndex: result.diff.viewIndex
    });

    cb?.({ ok: true, seq: result.seq });
  });

  onSafe(socket, 'intent:switch_room', schemas.SwitchRoom, async ({ roomId, chamber }, cb) => {
    const result = rooms.switchChamber(roomId, chamber);
    if (!result.ok) return cb?.(result);
    io.to(roomId).emit('state:roomChanged', {
      seq: result.seq,
      diff: result.diff,
    });
    cb?.({ ok: true, seq: result.seq, diff: result.diff });
  });

  // Chat-Nachricht (einfaches Beispiel)
  onSafe(socket, 'chat', schemas.Chat, async ({ roomId, text }) => {
    const from = rooms.displayName(roomId, socket.id) ?? 'Anon';
    io.to(roomId).emit('chat_msg', { from, text });
  });

  // Interaktion mit einem Objekt/Hotspot (Puzzle-Engine)
  onSafe(socket, 'interact', schemas.Interact, async (payload, cb) => {
    console.log("INTERACT payload received:", payload);
    const { roomId, actionId, objectId, canonicalObjectId, verb, data } = payload;
    const result = rooms.applyAction(roomId, {
      actionId,
      playerId: socket.id,
      objectId,
      canonicalObjectId,
      verb,
      data
    });
    if (!result.ok) return cb?.(result);
    const room = rooms.get(roomId);
    if (room?.state?.public?.mode === 'coop') {
      for (const [sid] of room.players) {
        const snap = rooms.snapshotFor(roomId, sid);
        if (!snap) continue;
        io.to(sid).emit('state:snapshot', { snapshot: snap });
      }
    } else {
      // Delta an alle Clients im Raum senden
      io.to(roomId).emit('puzzle_update', { seq: result.seq, diff: result.diff });
    }
    cb?.({ ok: true, seq: result.seq });
  });

  // Aufräumen bei Verbindungsende
  socket.on('disconnect', () => {
    if (socket.data?.lobbies) {
      for (const sessionId of socket.data.lobbies) {
        const lobby = lobbies.get(sessionId);
        if (!lobby) continue;
        lobby.players.delete(socket.id);
        io.to(lobbyRoom(sessionId)).emit('lobby:status', lobbySnapshot(sessionId));
        if (lobby.players.size === 0) lobbies.delete(sessionId);
      }
      socket.data.lobbies.clear();
    }
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
