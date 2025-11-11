import crypto from 'node:crypto';

export async function enqueueScoreEvent(redis, evt) {
  // evt = { sessionId, profileId, points, reason, ts? }
  const full = {
    id: crypto.randomUUID(),
    sessionId: evt.sessionId,
    profileId: evt.profileId,
    points: String(evt.points ?? 0),
    reason: evt.reason ?? 'unspecified',
    ts: String(evt.ts ?? Date.now())
  };
  await redis.xAdd('events:scores', '*', { data: JSON.stringify(full) });
  return full.id;
}
