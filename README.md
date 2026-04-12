# Arcane Descent - Backend

This repository contains the backend for Arcane Descent, a browser-based escape room developed as part of a university project. The backend is split between HTTP endpoints and real-time game communication: Express handles authentication and supporting routes, while Socket.IO manages the authoritative room state during play.

The overall goal of this service is not only to make the game run, but to keep it predictable. Puzzle progression, room state, session handling, validation, and persistence all live on the server so the frontend can stay focused on presentation and interaction.

## What This Backend Is Responsible For

- user registration, login, logout, and token refresh
- email verification, password reset, password change, email change, account recovery, and account deletion
- authoritative room creation and join flow for solo and co-op sessions
- role-based lobby handling for co-op play
- puzzle validation and room progression through Socket.IO events
- persistence for completed runs and the time-based leaderboard
- Redis-backed refresh-token tracking, rate limiting, and Socket.IO scaling support
- background score processing through a Redis stream worker
- baseline security headers, validation, and operational diagnostics

## Architecture At a Glance

- `Express` serves REST endpoints for auth, session refresh, leaderboard queries, and health checks.
- `Socket.IO` manages room creation, room joins, puzzle actions, room switching, chat, and lobby coordination.
- `RoomManager` in `src/game/rooms.js` acts as the authoritative in-memory game state.
- `PostgreSQL` stores users and room statistics used for leaderboard data.
- `Redis` is used for refresh-token state, rate limiting, pub/sub, snapshots, and the score outbox worker.
- `Nodemailer` sends verification and password-related emails.
- `Zod` validates HTTP and socket payloads.

## Tech Stack

- Node.js 20
- Express 5
- Socket.IO
- PostgreSQL
- Redis
- Nodemailer
- Zod
- JSON Web Tokens
- Docker Compose for the integrated stack

## Quick Start

### Requirements

- Node.js 20 or newer
- npm
- PostgreSQL
- Redis
- a `.env` file with the required secrets and service URLs

### Minimal Local Setup

Create a local `.env` file in the backend root. A minimal development setup usually looks like this:

```env
PORT=3000
NODE_ENV=development
ORIGIN=http://127.0.0.1:5173
FRONTEND_URL=http://127.0.0.1:5173
DATABASE_URL=postgres://app:app@127.0.0.1:5432/escape
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=replace_with_a_long_random_value
REFRESH_SECRET=replace_with_a_second_long_random_value
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
GMAIL_USER=your_mail_account@example.com
GMAIL_PASSWORD=your_mail_password_or_app_password
```

Important notes:

- `JWT_SECRET` and `REFRESH_SECRET` should be long random values with at least 32 characters.
- `GMAIL_USER` and `GMAIL_PASSWORD` are needed if you want registration, verification, and password reset mails to work end to end.
- During local HTTP development, `COOKIE_SECURE=false` and `COOKIE_SAME_SITE=lax` are the intended defaults.

### Install and Run

```bash
npm install
npm run dev
```

The app starts on port `3000` unless `PORT` is overridden.

## Docker Compose

For the integrated stack, you can start the backend together with Redis, PostgreSQL, the frontend container, Caddy, and the score worker:

```bash
docker compose up -d --build
```

The compose setup includes these services:

- `app` - main Express and Socket.IO server
- `scoreworker` - consumes Redis score events and writes them to Postgres
- `postgres` - relational data store
- `redis` - token state, rate limits, pub/sub, and outbox transport
- `frontend` - static frontend container
- `caddy` - reverse proxy for API, sockets, and frontend delivery

## Key Environment Variables

This is not a full reference, but these are the most important settings when working on the backend.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP server port |
| `ORIGIN` | comma-separated list of allowed frontend origins |
| `FRONTEND_URL` | base URL used in verification and reset links |
| `JWT_SECRET` | signing secret for access tokens |
| `REFRESH_SECRET` | signing secret for refresh tokens |
| `ACCESS_TOKEN_TTL` | access-token lifetime, default `15m` |
| `REFRESH_TOKEN_TTL` | refresh-token lifetime, default `7d` |
| `COOKIE_SECURE` | enables secure cookies, should be `true` in production |
| `COOKIE_SAME_SITE` | refresh-cookie same-site policy |
| `TRUST_PROXY` | required when running behind Caddy or another reverse proxy |
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL_ENABLED` | enables DB TLS, especially relevant for managed Postgres |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | certificate verification behavior for Postgres |
| `REDIS_URL` | Redis connection string |
| `REDIS_TLS_ENABLED` | enables Redis TLS |
| `REDIS_TLS_REJECT_UNAUTHORIZED` | certificate verification behavior for Redis |
| `GMAIL_USER` / `GMAIL_PASSWORD` | SMTP credentials for verification and reset mail |
| `ROOM_STATS_ENABLED` | can be set to `false` when you want puzzle tests without DB stats |

## Local Development Notes

- The frontend Vite dev server expects the backend on `http://127.0.0.1:3000` by default.
- Prefer one canonical local host per setup. Mixing `localhost` and `127.0.0.1` can make refresh-cookie behavior look random after reloads because cookies are host-specific.
- If the backend sits behind Caddy or another reverse proxy, set `TRUST_PROXY=1`.
- For managed PostgreSQL, keep `DATABASE_SSL_ENABLED=true`. If your provider uses a custom CA chain, provide `DATABASE_CA_CERT_PATH` or `DATABASE_CA_CERT`.
- For managed Redis, prefer `rediss://...` or explicitly set `REDIS_TLS_ENABLED=true`.
- On startup, the backend prints diagnostics for allowed origins, cookie settings, HTTP timeouts, DB TLS, and Redis TLS. Those logs are worth checking first when something behaves unexpectedly.

## REST Endpoints

Important HTTP routes include:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/verify-email/:token`
- `POST /api/auth/request-password-reset`
- `POST /api/auth/password/reset/:token`
- `PATCH /api/auth/change-password`
- `PATCH /api/auth/change-email`
- `DELETE /api/auth/delete-account`
- `PATCH /api/auth/recover-account`
- `POST /api/token/refresh`
- `GET /api/leaderboard/time`
- `GET /api/me`
- `GET /healthz`

## Socket Events

The real-time game flow is built around a small set of socket events.

### Main gameplay events

- `create_room`
- `join_room`
- `ready`
- `intro:dismissed`
- `intent:turn`
- `interact`
- `intent:switch_room`
- `chat`

### Lobby events

- `lobby:subscribe`
- `lobby:status:get`
- `lobby:setRole`
- `lobby:unsubscribe`

### Common server emissions

- `state:snapshot`
- `state:viewChanged`
- `state:roomChanged`
- `puzzle_update`
- `lobby_update`
- `lobby:status`
- `chat_msg`
- `room_completed`

## Project Structure

```text
src/
  server.js                    # application entry point
  routes/                      # REST routes
  controllers/                 # auth controller logic
  services/                    # auth, access token, and token-session services
  middleware/                  # auth, rate limit, and HTTP security middleware
  config/                      # security, DB, Redis, and logger configuration
  models/                      # Postgres persistence for users and room stats
  game/
    rooms.js                   # authoritative room manager
    puzzles/                   # puzzle logic and puzzle tests
  worker/
    scoreWorker.js             # Redis stream consumer for score events
  infra/                       # outbox and score persistence helpers
  util/                        # validation, token helpers, email service
  tests/                       # focused Node-based validation and config tests
scripts/
  init-db.js                   # convenience DB initialization script
db/init/
  001_schema.sql               # schema for score-related tables
```

## Testing and Verification

There is currently no single unified `npm test` workflow. The backend uses small focused Node scripts instead. Useful checks include:

```bash
node src/tests/testAccessTokenAuth.js
node src/tests/testValidationMessages.js
node src/tests/testSecurityConfig.js
```

For puzzle-flow checks, a practical local command is:

```powershell
$env:ROOM_STATS_ENABLED='false'; node src/game/puzzles/tests/runAll.js
```

If you are using bash instead of PowerShell:

```bash
ROOM_STATS_ENABLED=false node src/game/puzzles/tests/runAll.js
```

## Security Notes

- Refresh tokens are tracked server-side and rotated on `/api/token/refresh`.
- Access tokens are checked against per-user revocation timestamps after account-security events.
- HTTP and Socket.IO rate limits use Redis with an in-memory fallback.
- Refresh cookies are `HttpOnly`, and production deployments should keep them secure.
- The backend sets a conservative baseline of HTTP security headers and only sends HSTS on secure requests.
- Validation errors are normalized so the frontend can show field-specific feedback instead of raw schema output.

## Database and Leaderboard Notes

This backend currently contains two persistence paths that are both relevant to scoring and completion data:

- room completion data in `rooms` and `room_participants`, used by the time-based leaderboard
- score events written through Redis and the score worker into `profiles` and `scores`

That split is intentional in the current project state, but it is good to keep in mind when working on leaderboard or post-game features.

## Related Repository

This backend is designed to run together with the frontend in `EscapeRoomFrontEnd`. The frontend README covers client-side architecture, routes, and development workflow from the browser side.
