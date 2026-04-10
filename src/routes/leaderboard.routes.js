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
        rp.id         AS run_id,
        COALESCE(u.username, 'Guest') AS username,
        rp.escape_time_seconds AS escape_time_seconds,
        rp.completed_at AS completed_at
      FROM room_participants rp
      LEFT JOIN users u
        ON u.id = rp.user_id
      WHERE rp.escape_time_seconds IS NOT NULL
      ORDER BY rp.escape_time_seconds ASC
      LIMIT 50
      `
    );

    res.json({ leaderboard: rows });
  } catch (e) {
    console.error('GET /api/leaderboard/time failed:', e);
    res.status(500).json({ error: 'LEADERBOARD_QUERY_FAILED' });
  }
});

export default router;
