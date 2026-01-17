// src/middleware/rateLimit.js
// Einfacher In-Memory-Rate-Limiter (per IP oder benutzerdefiniertem Key).

const buckets = new Map();

/**
 * @param {Object} opts
 * @param {number} opts.windowMs - Zeitfenster in Millisekunden (z.B. 60_000)
 * @param {number} opts.max - maximale Anzahl Requests pro Fenster
 * @param {(req: import('express').Request) => string} [opts.keyGenerator] - wie der Schlüssel gebildet wird (Standard: IP)
 */
export function rateLimit({ windowMs, max, keyGenerator }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator ? keyGenerator(req) : req.ip;

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetTime < now) {
      bucket = { count: 0, resetTime: now + windowMs };
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Zu viele Anfragen. Bitte versuche es später erneut.'
      });
    }

    return next();
  };
}
