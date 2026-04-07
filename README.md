# Multiplayer Escape Room - Backend

Node.js + Express + Socket.IO backend for the multiplayer escape room game.
Handles:
- Game room management
- Puzzle synchronization
- Player communication

## Setup
```bash
npm install
npm run dev
```

## Security Notes
- Set `JWT_SECRET` and `REFRESH_SECRET` to long random values with at least 32 characters.
- Keep `ORIGIN` to an explicit allowlist of frontend origins. Do not use `*` in production.
- If the backend runs behind Caddy or another reverse proxy, set `TRUST_PROXY=1`.
- Cookies are configured as `HttpOnly`; in production they become secure automatically.
- Remote databases can now use verified TLS via `DATABASE_SSL_ENABLED=true`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, and optionally `DATABASE_CA_CERT_PATH`.
- Redis and Postgres are only bound to `127.0.0.1` in `docker-compose.yaml`, so they are not exposed publicly by default.
