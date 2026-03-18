// src/middleware/rateLimit.js
// Einfacher In-Memory-Rate-Limiter (per IP oder benutzerdefiniertem Key).

const buckets = new Map();
let cleanupCounter = 0;

function cleanupExpiredBuckets(now) {
  cleanupCounter += 1;
  if (cleanupCounter % 200 !== 0) return;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetTime <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * @param {Object} opts
 * @param {number} opts.windowMs - Zeitfenster in Millisekunden (z.B. 60_000)
 * @param {number} opts.max - maximale Anzahl Requests pro Fenster
 * @param {(req: import('express').Request) => string} [opts.keyGenerator] - wie der Schlussel gebildet wird (Standard: IP)
 * @param {string} [opts.name] - Namespace, damit sich unterschiedliche Limiter nicht gegenseitig beeinflussen
 */
export function rateLimit({ windowMs, max, keyGenerator, name = 'default' }) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('rateLimit windowMs must be a positive number');
  }

  if (!Number.isFinite(max) || max <= 0) {
    throw new Error('rateLimit max must be a positive number');
  }

  return (req, res, next) => {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const rawKey = keyGenerator ? keyGenerator(req) : req.ip;
    const key = `${name}:${rawKey || req.ip || 'global'}`;

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetTime <= now) {
      bucket = { count: 0, resetTime: now + windowMs };
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetTime / 1000)));

    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Zu viele Anfragen. Bitte versuche es spaeter erneut.'
      });
    }

    return next();
  };
}
