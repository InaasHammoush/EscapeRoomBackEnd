import { getRedisClient, redisConfig } from '../config/redis.js';

const memoryBuckets = new Map();
let cleanupCounter = 0;
let redisFallbackWarned = false;

function cleanupExpiredBuckets(now) {
  cleanupCounter += 1;
  if (cleanupCounter % 200 !== 0) return;

  for (const [key, bucket] of memoryBuckets.entries()) {
    if (bucket.resetTime <= now) {
      memoryBuckets.delete(key);
    }
  }
}

function consumeMemoryRateLimit({ namespace, key, windowMs, max }) {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const bucketKey = `${namespace}:${key}`;
  let bucket = memoryBuckets.get(bucketKey);

  if (!bucket || bucket.resetTime <= now) {
    bucket = { count: 0, resetTime: now + windowMs };
  }

  bucket.count += 1;
  memoryBuckets.set(bucketKey, bucket);

  return {
    count: bucket.count,
    limit: max,
    remaining: Math.max(0, max - bucket.count),
    resetTime: bucket.resetTime,
    retryAfterMs: Math.max(0, bucket.resetTime - now),
    exceeded: bucket.count > max,
    store: 'memory',
  };
}

async function consumeRedisRateLimit({ namespace, key, windowMs, max }) {
  const redis = await getRedisClient();
  const redisKey = `${redisConfig.keyPrefix}:ratelimit:${namespace}:${key}`;
  const now = Date.now();

  const count = await redis.incr(redisKey);
  let ttlMs = 0;

  if (count === 1) {
    await redis.pExpire(redisKey, windowMs);
    ttlMs = windowMs;
  } else {
    ttlMs = await redis.pTTL(redisKey);
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      await redis.pExpire(redisKey, windowMs);
      ttlMs = windowMs;
    }
  }

  return {
    count,
    limit: max,
    remaining: Math.max(0, max - count),
    resetTime: now + ttlMs,
    retryAfterMs: ttlMs,
    exceeded: count > max,
    store: 'redis',
  };
}

export async function consumeRateLimit({ namespace, key, windowMs, max }) {
  try {
    return await consumeRedisRateLimit({ namespace, key, windowMs, max });
  } catch (err) {
    if (!redisFallbackWarned) {
      redisFallbackWarned = true;
      console.warn(
        `[rate-limit] Redis unavailable, falling back to in-memory buckets: ${err.message}`
      );
    }

    return consumeMemoryRateLimit({ namespace, key, windowMs, max });
  }
}
