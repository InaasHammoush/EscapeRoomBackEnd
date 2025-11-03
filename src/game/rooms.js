// src/game/rooms.js
// ------------------------------------------------------------
// RoomManager: Autoritativer In-Memory-Serverzustand für Spielräume
// - Hält Rooms, Spieler, Sequenzen, Start/Ende
// - Delegiert Rätsel/Interaktionen an Puzzle-Engine (./puzzles/index.js)
// - Schreibt periodisch Snapshots nach Redis (TTL) -> Rehydrate/Rejoin
// - (Optional) Persistiert Snapshots zusätzlich in JsonStore (./store/jsonStore.js)
// - (Optional) Vergibt Punkte beim Raumabschluss via Outbox (Redis Stream -> Worker)
// ------------------------------------------------------------

import crypto from 'node:crypto';
import * as Puzzles from './puzzles/index.js';
import { enqueueScoreEvent } from '../infra/outbox.js'; // optional – nur genutzt, wenn Redis existiert

export class RoomManager {
  /**
   * @param {Object} opts
   * @param {import('redis').RedisClientType|null} opts.redis - Redis-Client (für Snapshots/Outbox)
   * @param {number} opts.snapshotTTL - TTL für Redis-Snapshots in Sekunden (Standard: 3600 = 1h)
   * @param {Object|null} opts.store - Optionaler JsonStore mit .set(key,val)
   * @param {(state:any)=>boolean} opts.completionPredicate - Prüft, ob der Raum als "gelöst" gilt
   * @param {boolean} opts.awardOnComplete - Punktevergabe bei Abschluss aktivieren?
   * @param {number} opts.pointsOnComplete - Punkte pro Spieler bei Abschluss
   * @param {string} opts.pointsReason - Reason-String für die Score-Events
   */
  constructor({
    redis = null,
    snapshotTTL = 3600,
    store = null,
    completionPredicate = defaultCompletionPredicate,
    awardOnComplete = true,
    pointsOnComplete = 100,
    pointsReason = 'room_completed',
  } = {}) {
    this.rooms = new Map();          // roomId -> Room
    this.redis = redis;
    this.snapshotTTL = snapshotTTL;
    this.store = store;

    this.completionPredicate = completionPredicate;
    this.awardOnComplete = awardOnComplete;
    this.pointsOnComplete = pointsOnComplete;
    this.pointsReason = pointsReason;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /** Neuen Raum erzeugen (unstarted, leere Spielerliste, initialer Puzzle-State) */
  createRoom() {
    const id = crypto.randomUUID();
    const room = {
      id,
      epoch: Date.now(),
      seq: 0,
      started: false,
      completed: false,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      players: new Map(), // socketId -> { name, ready, profileId? }
      state: Puzzles.initAll(), // { public, internal }
    };
    this.rooms.set(id, room);
    // Bei Anlage sofort einen Snapshot persistieren (nicht kritisch, aber praktisch)
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);
    return room;
  }

  /** Den Raum lesen (intern) */
  get(id) {
    return this.rooms.get(id);
  }

  /** Öffentlicher Status eines Raums (für Lobby / Clients) */
  publicRoom(id) {
    const room = this.get(id);
    if (!room) return null;
    return {
      id: room.id,
      epoch: room.epoch,
      seq: room.seq,
      started: room.started,
      completed: room.completed,
      players: [...room.players.values()].map(p => ({
        name: p.name, ready: !!p.ready
      })),
      state: room.state.public, // nur öffentlicher Teil
    };
  }

  /** Alias: aktueller Snapshot (öffentlich) */
  snapshot(id) {
    return this.publicRoom(id);
  }

  /** Spieler beitreten lassen (mit optionaler Profil-ID) */
  joinRoom(id, socketId, name = 'Player', profileId = null) {
    const room = this.get(id);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    room.players.set(socketId, { name: String(name), ready: false, profileId: profileId || null });
    this._touchSeq(room); // optionaler Seq-Inkrement bei Join (macht Deltas eindeutiger)
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);
    return room;
  }

  /** Spieler mit gegebener Socket-ID aus allen Räumen entfernen (Disconnect) */
  leaveBySocket(socketId) {
    const affected = [];
    for (const [rid, room] of this.rooms) {
      if (room.players.delete(socketId)) {
        affected.push(rid);
        this._touchSeq(room);
        this._saveSnapshot(rid).catch(() => {});
        this._persistLocal(rid);
      }
    }
    return affected;
  }

  /** Ready-Flag setzen (pro Spieler) */
  setReady(id, socketId, ready) {
    const room = this.get(id);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    const player = room.players.get(socketId);
    if (player) {
      player.ready = !!ready;
      this._touchSeq(room);
      this._persistLocal(id);
    }
  }

  /** Sind alle im Raum als "ready" markiert? */
  allReady(id) {
    const room = this.get(id);
    if (!room || room.players.size === 0) return false;
    return [...room.players.values()].every(p => p.ready);
  }

  /** Spiel starten (einmalig) */
  start(id) {
    const room = this.get(id);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (!room.started) {
      room.started = true;
      room.startedAt = Date.now();
      this._touchSeq(room);
      this._saveSnapshot(id).catch(() => {});
      this._persistLocal(id);
    }
    return room;
  }

  /**
   * Hauptmutation: Aktion anwenden (delegiert an Puzzle-Engine).
   * @param {string} id - roomId
   * @param {{actionId:string, playerId:string, objectId:string, verb:string, data?:any}} action
   * @returns {{ok:boolean, error?:string, seq?:number, diff?:any}}
   */
  applyAction(id, action) {
    const room = this.get(id);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (!room.started) return { ok: false, error: 'ROOM_NOT_RUNNING' };
    if (room.completed) return { ok: false, error: 'ROOM_ALREADY_COMPLETED' };

    // Delegation an Puzzle-Engine (deterministisch)
    const res = Puzzles.apply(room.state, action);
    if (!res.ok) return { ok: false, error: res.error || 'INVALID_ACTION' };

    // Autoritativen Zustand übernehmen
    room.state = res.nextState;
    this._touchSeq(room);

    // Snapshots / persistieren (leichtgewichtig, asynchron)
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);

    // Prüfen, ob der Raum nun als "gelöst" gilt
    this._maybeMarkCompleted(room).catch(() => {});

    return { ok: true, seq: room.seq, diff: res.diff ?? {} };
  }

  /** Öffentlichen Anzeigenamen eines Spielers */
  displayName(id, socketId) {
    return this.get(id)?.players.get(socketId)?.name ?? null;
  }

  // ----------------------------------------------------------
  // Interne Helfer
  // ----------------------------------------------------------

  /** Seq erhöhen (deterministische Reihenfolge) */
  _touchSeq(room) {
    room.seq += 1;
  }

  /** Redis-Snapshot mit TTL ablegen (für Rehydrate/Rejoin nach Neustart) */
  async _saveSnapshot(id) {
    if (!this.redis) return;
    const key = `room:${id}:snapshot`;
    const snap = JSON.stringify(this.snapshot(id));
    await this.redis.set(key, snap, { EX: this.snapshotTTL });
  }

  /** Optionaler JSON-Store (lokale Dev-Persistenz) */
  _persistLocal(id) {
    if (!this.store) return;
    try {
      this.store.set(`room:${id}:snapshot`, this.snapshot(id));
    } catch {
      // bewusst still: Dev-Komfort
    }
  }

  /** Prüft Abschlussbedingung und vergibt optional Punkte */
  async _maybeMarkCompleted(room) {
    if (room.completed) return;

    if (this.completionPredicate(room.state)) {
      room.completed = true;
      room.completedAt = Date.now();
      this._touchSeq(room);

      // Finaler Snapshot
      await this._saveSnapshot(room.id);
      this._persistLocal(room.id);

      // Optional: Punktevergabe via Outbox (Redis Stream) – asynchron
      if (this.awardOnComplete && this.redis) {
        const points = Number(this.pointsOnComplete) || 0;
        const reason = this.pointsReason || 'room_completed';

        for (const [socketId, player] of room.players) {
          const profileId = player.profileId || socketId; // Fallback: Socket als Pseudoprofil
          await enqueueScoreEvent(this.redis, {
            sessionId: room.id,
            profileId,
            points,
            reason
          });
        }
      }
    }
  }
}

// ------------------------------------------------------------
// Default-Completion-Check:
//   Gilt als gelöst, wenn ALLE Puzzle im public-State ein Feld "solved: true" besitzen.
//   (Das passt zu den Beispiel-Puzzles; du kannst im Konstruktor eine eigene Funktion injizieren.)
// ------------------------------------------------------------
function defaultCompletionPredicate(state) {
  try {
    const pub = state?.public ?? {};
    const values = Object.values(pub);
    if (values.length === 0) return false;
    // Einfache Heuristik: jedes Objekt mit "solved" muss true sein;
    // Objekte ohne "solved" zählen nicht negativ.
    return values.every(v =>
      typeof v === 'object' ? (v.solved === undefined ? true : !!v.solved) : true
    );
  } catch {
    return false;
  }
}
