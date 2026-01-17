// src/routes/leaderboard.routes.js
import express from 'express';
import db from '../config/db.js';

const router = express.Router();

/**
 * Zeitbasiertes Leaderboard.
 *
 * Beispiel-Aggregation:
 *  - user_id, username
 *  - completed_runs: Anzahl abgeschlossener Runs
 *  - best_time: beste (min) Escape-Zeit in Sekunden
 *  - avg_time: durchschnittliche Escape-Zeit in Sekunden
 *
 * Optional könnt ihr später per Query-Param Zeitraum filtern (since=...).
 */
router.get('/time', async (req, res) => {
  try {
    const { rows } = await db.query(
      `
      SELECT
        u.id          AS user_id,
        u.username    AS username,
        COUNT(rp.id)  AS completed_runs,
        MIN(rp.escape_time_seconds) AS best_time,
        AVG(rp.escape_time_seconds)::float AS avg_time
      FROM room_participants rp
      JOIN users u
        ON u.id = rp.user_id
      WHERE rp.escape_time_seconds IS NOT NULL
      GROUP BY u.id, u.username
      ORDER BY best_time ASC
      LIMIT 10
      `
    );

    res.json({ leaderboard: rows });
  } catch (e) {
    console.error('GET /api/leaderboard/time failed:', e);
    res.status(500).json({ error: 'LEADERBOARD_QUERY_FAILED' });
  }
});

export default router;
