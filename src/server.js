// src/server.js
import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import cookieParser from 'cookie-parser';

import {
  buildCorsOptions,
  describeSecurityConfiguration,
  isOriginAllowed,
  readRefreshTokenCookie,
  securityConfig,
  validateSecurityConfiguration
} from './config/security.js';
import { describeDatabaseConfiguration } from './config/db.js';
import {
  createRedisConnection,
  describeRedisConfiguration,
  getRedisClient
} from './config/redis.js';
import { JsonStore } from './store/jsonStore.js';
import authRoutes from './routes/auth.routes.js';
import tokenRoutes from './routes/token.routes.js';
import { onSafe, schemas } from './util/validation.js';
import { RoomManager } from './game/rooms.js';
import { authenticateToken } from './middleware/auth.middleware.js';
import { applyHttpSecurity } from './middleware/httpSecurity.js';
import leaderboardRoutes from './routes/leaderboard.routes.js';
import {
  extractBearerToken,
  resolveAuthorizedUserFromAccessToken
} from './services/accessTokenAuth.service.js';
import { assertActiveRefreshToken, assertTokenNotRevoked } from './services/tokenSession.service.js';
import { verifyRefreshToken } from './util/token.js';
import * as userModel from './models/user.model.js';

validateSecurityConfiguration();

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function formatDiagnosticValue(value) {
  if (typeof value === 'boolean') return yesNo(value);
  if (value == null || value === '') return '(none)';
  return String(value);
}

function logStartupDiagnostics() {
  const securityDiagnostics = describeSecurityConfiguration();
  const dbDiagnostics = describeDatabaseConfiguration();
  const redisDiagnostics = describeRedisConfiguration();

  console.info(`[startup] Environment: ${securityDiagnostics.environment}`);
  console.info(
    `[startup] Allowed origins: ${securityDiagnostics.allowedOrigins.join(', ')}`
  );
  console.info(
    `[startup] Frontend URL: ${formatDiagnosticValue(securityDiagnostics.frontendUrl)}`
  );
  console.info(
    `[startup] Trust proxy: ${formatDiagnosticValue(securityDiagnostics.trustProxy)}`
  );
  console.info(
    `[startup] Refresh cookie: name=${securityDiagnostics.cookie.name}, secure=${yesNo(securityDiagnostics.cookie.secure)}, sameSite=${securityDiagnostics.cookie.sameSite}, domain=${formatDiagnosticValue(securityDiagnostics.cookie.domain)}`
  );
  console.info(
    `[startup] HTTP timeouts: request=${securityDiagnostics.httpServer.requestTimeoutMs}ms, headers=${securityDiagnostics.httpServer.headersTimeoutMs}ms, keepAlive=${securityDiagnostics.httpServer.keepAliveTimeoutMs}ms`
  );
  console.info(
    `[startup] DB TLS: enabled=${yesNo(dbDiagnostics.sslEnabled)}, rejectUnauthorized=${yesNo(dbDiagnostics.sslRejectUnauthorized)}, caConfigured=${yesNo(dbDiagnostics.sslCaConfigured)}`
  );
  console.info(
    `[startup] Redis: url=${redisDiagnostics.url}, tls=${yesNo(redisDiagnostics.tlsEnabled)}, rejectUnauthorized=${yesNo(redisDiagnostics.tlsRejectUnauthorized)}, caConfigured=${yesNo(redisDiagnostics.tlsCaConfigured)}, keyPrefix=${redisDiagnostics.keyPrefix}`
  );
}

function parseCookieHeader(headerValue) {
  const cookies = {};
  if (typeof headerValue !== 'string' || headerValue.trim() === '') {
    return cookies;
  }

  for (const entry of headerValue.split(';')) {
    const [rawName, ...rawValueParts] = entry.split('=');
    const name = rawName?.trim();
    if (!name) continue;
    const value = rawValueParts.join('=').trim();
    cookies[name] = decodeURIComponent(value || '');
  }

  return cookies;
}

async function resolveAuthorizedUserFromRefreshCookie(socket) {
  const cookieHeader = socket.handshake?.headers?.cookie;
  const refreshToken = readRefreshTokenCookie({
    cookies: parseCookieHeader(cookieHeader),
  });

  if (!refreshToken) {
    return null;
  }

  const payload = verifyRefreshToken(refreshToken);
  await assertTokenNotRevoked(payload);
  await assertActiveRefreshToken(payload);

  const user = await userModel.findActiveUserById(payload.id);
  if (!user || !user.email_verified) {
    throw new Error('ACCOUNT_NOT_AUTHORIZED');
  }

  const boundUser = { id: user.id, username: user.username };
  socket.data.user = boundUser;
  return boundUser;
}

async function bindSocketUser(socket, token) {
  const user = await resolveAuthorizedUserFromAccessToken(token);
  const boundUser = { id: user.id, username: user.username };
  socket.data.user = boundUser;
  return boundUser;
}

async function resolveSocketUser(socket, accessToken) {
  if (socket.data.user?.id && socket.data.user?.username) {
    return socket.data.user;
  }

  // Allows an already connected anonymous socket to bind a freshly obtained
  // access token right before joining a room, without forcing a reconnect.
  const token =
    typeof accessToken === 'string' && accessToken.trim()
      ? accessToken.trim()
      : null;

  if (token) {
    try {
      return await bindSocketUser(socket, token);
    } catch (err) {
      if (securityConfig.socketDebugLogsEnabled) {
        console.warn('Socket access-token auth rejected:', err.message);
      }
    }
  }

  try {
    return await resolveAuthorizedUserFromRefreshCookie(socket);
  } catch (err) {
    if (securityConfig.socketDebugLogsEnabled) {
      console.warn('Socket refresh-cookie auth rejected:', err.message);
    }
    return null;
  }
}

const app = express();
const corsOptions = buildCorsOptions();

app.disable('x-powered-by');
app.set('trust proxy', securityConfig.trustProxy);
app.use(applyHttpSecurity);
app.use(cors(corsOptions));
app.use(express.json({ limit: securityConfig.jsonBodyLimit }));
app.use(express.urlencoded({ extended: false, limit: securityConfig.urlencodedBodyLimit }));
app.use(cookieParser());

app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/version', (_req, res) =>
  res.json({ version: process.env.npm_package_version ?? 'dev' })
);

app.use('/api/auth', authRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

app.get('/api/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

app.use((err, _req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.message === 'CORS_ORIGIN_FORBIDDEN') {
    return res.status(403).json({ error: 'CORS_ORIGIN_FORBIDDEN' });
  }

  console.error('Unhandled request error:', err);
  return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
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


const httpServer = http.createServer(app);
httpServer.requestTimeout = securityConfig.serverRequestTimeoutMs;
httpServer.headersTimeout = securityConfig.serverHeadersTimeoutMs;
httpServer.keepAliveTimeout = securityConfig.serverKeepAliveTimeoutMs;

const io = new Server(httpServer, {
  cors: {
    origin: securityConfig.allowedOrigins,
    credentials: true,
  },
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }

    return callback('CORS_ORIGIN_FORBIDDEN', false);
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: securityConfig.socketMaxHttpBufferSize,
});

io.use(async (socket, next) => {
  const auth = socket.handshake.auth || {};
  const headers = socket.handshake.headers || {};

  const token = auth.token || extractBearerToken(headers.authorization);

  if (!token) {
    return next();
  }

  try {
    await bindSocketUser(socket, token);
  } catch (err) {
    if (securityConfig.socketDebugLogsEnabled) {
      console.warn('Socket JWT rejected:', err.message);
    }
  }

  return next();
});

const redisPub = await getRedisClient();
const redisSub = createRedisConnection('socket-sub');

await redisSub.connect();

io.adapter(createAdapter(redisPub, redisSub));

const jsonStore = new JsonStore({ file: './data/runtime.json' });
await jsonStore.load();

const rooms = new RoomManager({
  redis: redisPub,
  snapshotTTL: 3600,
  store: jsonStore,
  resolvePlayerProfile: async (socketId) => {
    const liveSocket = io.sockets.sockets.get(socketId);
    if (liveSocket?.data?.user?.id && liveSocket?.data?.user?.username) {
      return liveSocket.data.user;
    }

    return null;
  },
});

rooms.startAutosave(30000);
rooms.setCleanupInterval(600000, 600000);
logStartupDiagnostics();

io.on('connection', (socket) => {
  if (securityConfig.socketDebugLogsEnabled) {
    console.log('Socket.IO connection accepted', socket.id);
  }

  socket.data.lobbies = new Set();

  // Raum anlegen
  onSafe(socket, 'create_room', schemas.CreateRoom, async ({ roomName, mode, startingChamber }, cb) => {
    const room = rooms.createRoom(roomName, { mode, startingChamber });
    cb?.({ ok: true, roomId: room.id });
    },
    { rateLimit: { windowMs: 60_000, max: 6 } }
  );

  // Raum beitreten
  onSafe(socket, 
    'join_room', 
    schemas.JoinRoom, 
    async ({ roomId, name, role, accessToken }, cb) => {
    try {
      const user = await resolveSocketUser(socket, accessToken);
      const displayName = user?.username || name;   // JWT-Name schlägt manuelles Feld
      const profileId = user?.id || null;           // Für Stats/room_participants
      const normalizedRole = normalizeRole(role) || socket.data?.coopRole || null;

      console.info('[socket:join_room] resolved player', {
        socketId: socket.id,
        roomId,
        hadInlineAccessToken: Boolean(typeof accessToken === 'string' && accessToken.trim()),
        boundSocketUserId: socket.data?.user?.id ?? null,
        resolvedUserId: user?.id ?? null,
        resolvedUsername: user?.username ?? null,
        profileId,
        role: normalizedRole,
      });

      // joinRoom ist async, weil es ggf. einen Snapshot aus Redis lädt
      const room = await rooms.joinRoom(roomId, socket.id, displayName, profileId, normalizedRole);

        socket.join(room.id);

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
      if (securityConfig.socketDebugLogsEnabled) {
        console.log('Snapshot data sent:', snapshot.state.views);
      }
      io.to(socket.id).emit('state:snapshot', { snapshot });
      cb?.({ ok: true, snapshot });
    } catch (e) {
      console.error('join_room failed:', e);
      cb?.({ ok: false, error: e.message || 'ROOM_JOIN_FAILED' });
    }
  },
    { rateLimit: { windowMs: 60_000, max: 20 } }
  );

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
  onSafe(
    socket, 
    'ready', 
    schemas.Ready, 
    async ({ roomId }, cb) => {
      try {
        rooms.setReady(roomId, socket.id, true);
        io.to(roomId).emit('lobby_update', rooms.publicRoom(roomId));
        cb?.({ ok: true });
      } catch (e) {
        cb?.({ ok: false, error: e.message || 'READY_FAILED' });
      }
    },
    { rateLimit: { windowMs: 30_000, max: 10 } }
  );

  // Intro dismissed – Timer tatsächlich starten
  socket.on('intro:dismissed', ({ roomId }) => {
    if (!roomId) return;
    try {
      const room = rooms.get(roomId);
      if (room && room.started && !room.timerStarted) {
        rooms.startTimer(roomId);
        // Broadcast updated snapshots to all players in the room
        const mode = room?.state?.public?.mode || 'coop';
        if (mode === 'coop') {
          for (const [sid] of room.players) {
            const snap = rooms.snapshotFor(roomId, sid);
            if (!snap) continue;
            io.to(sid).emit('state:snapshot', { snapshot: snap });
          }
        } else {
          // Solo mode: broadcast full snapshot to the room
          const snap = rooms.snapshotFor(roomId, socket.id);
          if (snap) {
            io.to(roomId).emit('state:snapshot', { snapshot: snap });
          }
        }
      }
    } catch (e) {
      if (securityConfig.socketDebugLogsEnabled) {
        console.error('intro:dismissed failed:', e);
      }
    }
  });

  onSafe(
    socket, 
    'intent:turn', 
    schemas.Turn, 
    async ( payload, cb) => {
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
    },
    { rateLimit: { windowMs: 10_000, max: 40 } }
  );


  // Interaktion mit einem Objekt/Hotspot (Puzzle-Engine)
  onSafe(
    socket, 
    'interact', 
    schemas.Interact, 
    async (payload, cb) => {
      if (securityConfig.socketDebugLogsEnabled) {
        console.log('INTERACT payload received:', payload);
      }
      const { roomId, actionId, objectId, canonicalObjectId, verb, data } = payload;
      const roomBefore = rooms.get(roomId);
      const wasCompleted = !!roomBefore?.completed;
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

      if (room?.completed && !wasCompleted) {
        const startedAt = room.startedAt ?? room.state?.public?.game?.startedAt ?? null;
        const completedAt = room.completedAt ?? room.state?.public?.game?.endedAt ?? null;
        const durationSeconds =
          startedAt && completedAt
            ? Math.max(0, Math.round((completedAt - startedAt) / 1000))
            : null;
        io.to(roomId).emit('room_completed', {
          roomId: room.id,
          mode: room.state?.public?.mode || 'coop',
          startedAt,
          completedAt,
          durationSeconds,
        });
      }
      cb?.({ ok: true, seq: result.seq });
    },
    { rateLimit: { windowMs: 10_000, max: 80 } }
  );
  onSafe(
    socket,
    'intent:switch_room',
    schemas.SwitchRoom,
    async ({ roomId, chamber }, cb) => {
      const result = rooms.switchChamber(roomId, chamber);
      if (!result.ok) return cb?.(result);

      io.to(roomId).emit('state:roomChanged', {
        seq: result.seq,
        diff: result.diff,
      });
      cb?.({ ok: true, seq: result.seq, diff: result.diff });
    },
    { rateLimit: { windowMs: 10_000, max: 20 } }
  );

  onSafe(
    socket,
    'chat',
    schemas.Chat,
    async ({ roomId, text }) => {
      const from = rooms.displayName(roomId, socket.id) ?? 'Anon';
      io.to(roomId).emit('chat_msg', { from, text });
    },
    { rateLimit: { windowMs: 60_000, max: 20 } }
  );

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

    if (securityConfig.socketDebugLogsEnabled) {
      console.log('socket disconnected', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  try {
    await io.close();
    await redisPub.quit();
    await redisSub.quit();
    httpServer.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  } catch (e) {
    console.error('Shutdown error:', e);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
