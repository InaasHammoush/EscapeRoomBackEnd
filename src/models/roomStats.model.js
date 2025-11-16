// src/models/roomStats.model.js
// ------------------------------------------------------------
// Hilfsfunktionen, um Raum- und Teilnehmerdaten in Postgres zu schreiben
// Nutzt die neue DB-Schicht aus src/config/db.js
// ------------------------------------------------------------

import crypto from 'node:crypto';
import db from '../config/db.js';

/**
 * Raumstart in der Tabelle "rooms" erfassen.
 * Erwartetes Schema (anpassbar):
 *   rooms(id uuid primary key,
 *         created_at timestamptz,
 *         started_at timestamptz,
 *         completed_at timestamptz,
 *         escape_time_seconds integer)
 */
export async function recordRoomStarted(room) {
  const createdAt = room.createdAt ?? Date.now();
  const startedAt = room.startedAt ?? Date.now();

  // Zeit in Sekunden → timestamptz
  const createdSec = createdAt / 1000;
  const startedSec = startedAt / 1000;

  await db.query(
    `
    INSERT INTO rooms (id, created_at, started_at)
    VALUES ($1, to_timestamp($2), to_timestamp($3))
    ON CONFLICT (id) DO UPDATE
      SET started_at = EXCLUDED.started_at
    `,
    [room.id, createdSec, startedSec]
  );
}

/**
 * Raumabschluss in "rooms" aktualisieren (Endzeit + Dauer).
 */
export async function recordRoomCompleted(room) {
  if (!room.startedAt || !room.completedAt) {
    // ohne Start-/Endzeit keine Dauer – dann einfach nur Endzeit setzen
    const completedSec = (room.completedAt ?? Date.now()) / 1000;
    await db.query(
      `
      UPDATE rooms
         SET completed_at = to_timestamp($2)
       WHERE id = $1
      `,
      [room.id, completedSec]
    );
    return;
  }

  const startedSec = room.startedAt / 1000;
  const completedSec = room.completedAt / 1000;
  const escapeSeconds = Math.max(
    0,
    Math.round((room.completedAt - room.startedAt) / 1000)
  );

  await db.query(
    `
    UPDATE rooms
       SET completed_at = to_timestamp($2),
           escape_time_seconds = $3
     WHERE id = $1
    `,
    [room.id, completedSec, escapeSeconds]
  );
}

/**
 * Teilnehmer-Datensätze in "room_participants" anlegen.
 * Erwartetes Schema (anpassbar):
 *   room_participants(
 *     id uuid primary key,
 *     room_id uuid references rooms(id),
 *     user_id uuid null,
 *     joined_at timestamptz,
 *     finished_at timestamptz,
 *     escape_time_seconds integer
 *   )
 */
export async function recordParticipantsOnComplete(room) {
  if (!room.completedAt) return;

  const completedSec = room.completedAt / 1000;

  // Für jeden Spieler einen Datensatz schreiben
  for (const [socketId, player] of room.players) {
    const joinedAt = player.joinedAt ?? room.startedAt ?? room.createdAt ?? Date.now();
    const joinedSec = joinedAt / 1000;
    const escapeSeconds = Math.max(
      0,
      Math.round((room.completedAt - joinedAt) / 1000)
    );

    await db.query(
      `
      INSERT INTO room_participants
        (id, room_id, user_id, joined_at, finished_at, escape_time_seconds)
      VALUES
        ($1, $2, $3, to_timestamp($4), to_timestamp($5), $6)
      `,
      [
        crypto.randomUUID(),       // id
        room.id,                   // room_id
        player.profileId ?? null,  // user_id (kann null sein, falls noch kein Account)
        joinedSec,                 // joined_at
        completedSec,              // finished_at
        escapeSeconds              // escape_time_seconds
      ]
    );
  }
}
