import crypto from 'node:crypto';
import { upsertProfile, insertScore } from '../infra/db.js';
import { getRedisClient } from '../config/redis.js';
import dotenv from 'dotenv';
dotenv.config();

const r = await getRedisClient();

let lastId = (await r.get('events:scores:lastId')) || '0-0';

async function loop() {
  while (true) {
    const streams = await r.xRead({ key: 'events:scores', id: lastId }, { BLOCK: 5000, COUNT: 100 });
    if (!streams) continue;

    for (const s of streams) {
      for (const [id, fields] of s.messages) {
        try {
          const evt = JSON.parse(fields.data);
          // Minimal: Profile „on the fly“ anlegen/aktualisieren (pseudonym)
          await upsertProfile({ profile_id: evt.profileId, display_name: evt.profileId.slice(0,8) });
          await insertScore({
            score_id: crypto.randomUUID(),
            profile_id: evt.profileId,
            session_id: evt.sessionId,
            points: Number(evt.points),
            reason: evt.reason,
            ts: new Date(Number(evt.ts))
          });
          lastId = id;
          await r.set('events:scores:lastId', lastId);
        } catch (e) {
          console.error('scoreWorker error:', e);
        }
      }
    }
  }
}
loop().catch(console.error);
