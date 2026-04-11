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

## Local Dev
- `npm run dev` in the frontend expects the backend app to be reachable on `http://127.0.0.1:3000` by default.
- Override the frontend proxy target with `VITE_PROXY_TARGET` if you explicitly want to proxy through Caddy instead.
- In Docker Compose, the shared defaults publish to loopback only. If a machine or Compose implementation needs plain mappings instead, override `APP_PORT_MAPPING`, `REDIS_PORT_MAPPING`, or `POSTGRES_PORT_MAPPING` locally, for example `APP_PORT_MAPPING=3000:3000`.
- If `ORIGIN` is unset, the backend now defaults to `http://localhost:5173` and `http://127.0.0.1:5173` in development.
- Prefer one canonical local host (`localhost` or `127.0.0.1`) per machine/session. Refresh cookies are host-specific, so mixing both can look like a random logout after reload.
- If `FRONTEND_URL` is unset, development email links fall back to `http://localhost:5173`.
- For plain local HTTP development, `COOKIE_SECURE` now defaults to `false` and `COOKIE_SAME_SITE` falls back to `lax`.
- If your managed Postgres connection fails with `self-signed certificate in certificate chain`, keep `DATABASE_SSL_ENABLED=true` and set `DATABASE_SSL_REJECT_UNAUTHORIZED=false` locally unless you have mounted the provider CA via `DATABASE_CA_CERT_PATH` or `DATABASE_CA_CERT`.
- If you roll out the new refresh-token state store to an existing environment, already issued refresh cookies become invalid and users need to log in once again.

## Production Config
- Set `ORIGIN` explicitly to the real frontend origin.
- Set `FRONTEND_URL` explicitly so verification and reset links use the public URL.
- Keep `COOKIE_SECURE=true` in production.
- If the backend runs behind Caddy or another reverse proxy, set `TRUST_PROXY=1`.
- For managed Postgres in production, keep `DATABASE_SSL_ENABLED=true` and `DATABASE_SSL_REJECT_UNAUTHORIZED=true`.
- For managed Redis, prefer `rediss://...` or set `REDIS_TLS_ENABLED=true` explicitly. Keep `REDIS_TLS_REJECT_UNAUTHORIZED=true` in production and provide `REDIS_CA_CERT_PATH` / `REDIS_CA_CERT` if your provider requires a custom CA.
- Tune `SERVER_REQUEST_TIMEOUT_MS`, `SERVER_HEADERS_TIMEOUT_MS`, and `SERVER_KEEP_ALIVE_TIMEOUT_MS` only deliberately. The defaults are meant to reduce resource pinning from slow or hanging clients.
- Only disable DB certificate verification in production if you have a deliberate, temporary reason and know the network boundary.

## Startup Diagnostics
- On startup the backend now logs the allowed origins, derived frontend URL, trust-proxy setting, refresh-cookie flags, HTTP timeout values, DB TLS mode, and Redis/TLS mode.
- DB/TLS failures now include a short hint when the problem looks like CA / certificate-chain / TLS verification misconfiguration.

## Security Notes
- Set `JWT_SECRET` and `REFRESH_SECRET` to long random values with at least 32 characters.
- Keep `ORIGIN` to an explicit allowlist of frontend origins. Do not use `*` in production.
- If the backend runs behind Caddy or another reverse proxy, set `TRUST_PROXY=1`.
- Cookies are configured as `HttpOnly`; in production they become secure automatically.
- Remote databases can now use verified TLS via `DATABASE_SSL_ENABLED=true`, `DATABASE_SSL_REJECT_UNAUTHORIZED=true`, and optionally `DATABASE_CA_CERT_PATH`.
- Refresh tokens are now server-tracked in Redis, rotated on `/api/token/refresh`, revoked on logout, and invalidated globally after password/email/account state changes.
- Access tokens are also rejected after global account-security events because the backend now checks a per-user revocation timestamp.
- HTTP and Socket.IO rate limits now use Redis with an in-memory fallback, so the limits remain effective across restarts or multiple app instances.
- Redis and Postgres are only bound to `127.0.0.1` in `docker-compose.yaml`, so they are not exposed publicly by default.
