// src/models/roomStats.model.js
// ------------------------------------------------------------
// Hilfsfunktionen, um Raum- und Teilnehmerdaten in Postgres zu schreiben
// Nutzt die DB-Schicht aus src/config/db.js
// ------------------------------------------------------------

import db from '../config/db.js';

/**
 * Raumstart in der Tabelle "rooms" erfassen.
 *
 * Schema:
 *   rooms(
 *     id uuid primary key,
 *     room_name varchar(50),
 *     created_by integer,
 *     created_at timestamptz default now(),
 *     started_at timestamptz,
 *     ended_at timestamptz,
 *     duration_seconds integer,
 *     is_completed boolean default false
 *   )
 */
export async function recordRoomStarted(room) {
  const startedAt = room.startedAt ?? Date.now();
  const startedSec = startedAt / 1000;

  // created_at hat einen DEFAULT, kann also weggelassen werden
  await db.query(
    `
    INSERT INTO rooms (id, started_at, is_completed)
    VALUES ($1, to_timestamp($2), false)
    ON CONFLICT (id) DO UPDATE
      SET started_at = EXCLUDED.started_at
    `,
    [room.id, startedSec]
  );
}

/**
 * Raumabschluss in "rooms" aktualisieren (Endzeit + Dauer).
 */
export async function recordRoomCompleted(room) {
  const endedAt = room.completedAt ?? Date.now();
  const endedSec = endedAt / 1000;

  let durationSeconds = null;
  if (room.startedAt && room.completedAt) {
    durationSeconds = Math.max(
      0,
      Math.round((room.completedAt - room.startedAt) / 1000)
    );
  }

  await db.query(
    `
    UPDATE rooms
       SET ended_at = to_timestamp($2),
           duration_seconds = $3,
           is_completed = true
     WHERE id = $1
    `,
    [room.id, endedSec, durationSeconds]
  );
}

/**
 * Teilnehmer-Datensätze in "room_participants" anlegen.
 *
 * Schema:
 *   room_participants(
 *     id serial primary key,
 *     room_id uuid references rooms(id),
 *     user_id integer references users(id),
 *     joined_at timestamptz default now(),
 *     left_at timestamptz,
 *     completed_at timestamptz,
 *     escape_time_seconds integer
 *   )
 */
export async function recordParticipantsOnComplete(room) {
  if (!room.completedAt) return;

  const completedSec = room.completedAt / 1000;

  // Für jeden Spieler einen Datensatz schreiben
  for (const [, player] of room.players) {
    const joinedAt =
      player.joinedAt ?? room.startedAt ?? room.createdAt ?? Date.now();
    const joinedSec = joinedAt / 1000;

    const escapeSeconds = Math.max(
      0,
      Math.round((room.completedAt - joinedAt) / 1000)
    );

    await db.query(
      `
      INSERT INTO room_participants
        (room_id, user_id, joined_at, completed_at, escape_time_seconds)
      VALUES
        ($1, $2, to_timestamp($3), to_timestamp($4), $5)
      `,
      [
        room.id,                   // room_id
        player.profileId ?? null,  // user_id (int, FK zu users.id) oder null für Gäste
        joinedSec,                 // joined_at
        completedSec,              // completed_at
        escapeSeconds              // escape_time_seconds
      ]
    );
  }
}
