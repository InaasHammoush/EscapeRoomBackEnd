// src/middleware/rateLimit.js
// Redis-backed Rate-Limiter mit In-Memory-Fallback fuer lokale Entwicklung
// oder kurzzeitige Redis-Ausfaelle.

import { consumeRateLimit } from '../services/rateLimit.service.js';

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

  return async (req, res, next) => {
    const rawKey = keyGenerator ? keyGenerator(req) : req.ip;
    const key = String(rawKey || req.ip || 'global');

    const result = await consumeRateLimit({
      namespace: name,
      key,
      windowMs,
      max,
    });

    res.set('X-RateLimit-Limit', String(result.limit));
    res.set('X-RateLimit-Remaining', String(result.remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(result.resetTime / 1000)));
    res.set('X-RateLimit-Store', result.store);

    if (result.exceeded) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: 'Zu viele Anfragen. Bitte versuche es spaeter erneut.'
      });
    }

    return next();
  };
}
