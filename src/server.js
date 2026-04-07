// src/server.js
import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import cookieParser from 'cookie-parser';

import {
  buildCorsOptions,
  isOriginAllowed,
  securityConfig,
  validateSecurityConfiguration
} from './config/security.js';
import { JsonStore } from './store/jsonStore.js';
import authRoutes from './routes/auth.routes.js';
import tokenRoutes from './routes/token.routes.js';
import { onSafe, schemas } from './util/validation.js';
import { verifyAccessToken } from './util/token.js';
import { RoomManager } from './game/rooms.js';
import { authenticateToken } from './middleware/auth.middleware.js';
import { applyHttpSecurity } from './middleware/httpSecurity.js';
import leaderboardRoutes from './routes/leaderboard.routes.js';
import * as userModel from './models/user.model.js';

validateSecurityConfiguration();

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

const httpServer = http.createServer(app);

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

  let token = null;

  if (auth.token) {
    token = auth.token;
  } else if (
    typeof headers.authorization === 'string' &&
    headers.authorization.startsWith('Bearer ')
  ) {
    token = headers.authorization.substring('Bearer '.length);
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);
    const user = await userModel.findActiveUserById(decoded.id);

    if (user && user.email_verified) {
      socket.data.user = { id: user.id, username: user.username };
    }
  } catch (err) {
    if (securityConfig.socketDebugLogsEnabled) {
      console.warn('Socket JWT rejected:', err.message);
    }
  }

  return next();
});

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const redisPub = createClient({ url: redisUrl });
const redisSub = redisPub.duplicate();

await redisPub.connect();
await redisSub.connect();

io.adapter(createAdapter(redisPub, redisSub));

const jsonStore = new JsonStore({ file: './data/runtime.json' });
await jsonStore.load();

const rooms = new RoomManager({
  redis: redisPub,
  snapshotTTL: 3600,
  store: jsonStore
});

rooms.startAutosave(30000);
rooms.setCleanupInterval(600000, 600000);

io.on('connection', (socket) => {
  if (securityConfig.socketDebugLogsEnabled) {
    console.log('Socket.IO connection accepted', socket.id);
  }

  onSafe(
    socket,
    'create_room',
    schemas.CreateRoom,
    async ({ roomName, mode, startingChamber }, cb) => {
      const room = rooms.createRoom(roomName, { mode, startingChamber });
      cb?.({ ok: true, roomId: room.id });
    },
    { rateLimit: { windowMs: 60_000, max: 6 } }
  );

  onSafe(
    socket,
    'join_room',
    schemas.JoinRoom,
    async ({ roomId, name }, cb) => {
      try {
        const user = socket.data.user;
        const displayName = user?.username || name;
        const profileId = user?.id || null;

        const room = await rooms.joinRoom(roomId, socket.id, displayName, profileId);

        socket.join(room.id);

        const publicRoom = rooms.publicRoom(room.id);
        io.to(room.id).emit('lobby_update', publicRoom);

        const snapshot = rooms.snapshot(room.id);
        cb?.({ ok: true, snapshot });
      } catch (e) {
        console.error('join_room failed:', e);
        cb?.({ ok: false, error: e.message || 'ROOM_JOIN_FAILED' });
      }
    },
    { rateLimit: { windowMs: 60_000, max: 20 } }
  );

  onSafe(
    socket,
    'ready',
    schemas.Ready,
    async ({ roomId }, cb) => {
      try {
        rooms.setReady(roomId, socket.id, true);
        io.to(roomId).emit('lobby_update', rooms.publicRoom(roomId));
        if (rooms.allReady(roomId) && !rooms.get(roomId).started) {
          rooms.start(roomId);
          io.to(roomId).emit('room_state', rooms.snapshot(roomId));
        }
        cb?.({ ok: true });
      } catch (e) {
        cb?.({ ok: false, error: e.message || 'READY_FAILED' });
      }
    },
    { rateLimit: { windowMs: 30_000, max: 10 } }
  );

  onSafe(
    socket,
    'intent:turn',
    schemas.Turn,
    async (payload, cb) => {
      const { roomId, direction } = payload;
      const result = rooms.applyViewRotation(roomId, { direction });
      if (!result.ok) return cb?.(result);

      io.to(roomId).emit('state:viewChanged', {
        seq: result.seq,
        viewIndex: result.diff.viewIndex
      });

      cb?.({ ok: true, seq: result.seq });
    },
    { rateLimit: { windowMs: 10_000, max: 40 } }
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

  onSafe(
    socket,
    'interact',
    schemas.Interact,
    async (payload, cb) => {
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

      io.to(roomId).emit('puzzle_update', { seq: result.seq, diff: result.diff });
      cb?.({ ok: true, seq: result.seq });
    },
    { rateLimit: { windowMs: 10_000, max: 80 } }
  );

  socket.on('disconnect', () => {
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
