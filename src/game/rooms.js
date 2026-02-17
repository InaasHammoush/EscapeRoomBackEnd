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
import * as RoomStats from '../models/roomStats.model.js';
import { roomImagesMapper } from '../data/roomImagesMapper.js';
import * as Inventory from './inventory.js';

const { STARTER_INVENTORY, toPublicInventory, fromPublicInventory, cloneBag, normalizeActionItems, 
  ensureInventory, precheckInventoryForAction, applyInventoryBridge } = Inventory;

function getRoomViews(roomName) {
  const viewsMap = roomImagesMapper[roomName] || roomImagesMapper.default || {};
  return Object.values(viewsMap);
}

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
    this.rooms = new Map(); // roomId -> Room
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
  createRoom(roomName = 'default') {
    const id = crypto.randomUUID();
    const puzzleInit = Puzzles.initAll();
    const starterBag = cloneBag(STARTER_INVENTORY);

    const room = {
      id,
      roomName,
      epoch: Date.now(),
      seq: 0,
      started: false,
      completed: false,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      players: new Map(), // socketId -> { name, ready, profileId? }
      state: {
        public: {
          ...puzzleInit.public,
          viewIndex: 0, // 0=N, 1=E, 2=S, 3=W
          roomType: roomName, // for client to pick images
          views: getRoomViews(roomName),
          alchDoorState: null,
          inventory: toPublicInventory(starterBag),
        },
        internal: {
          ...puzzleInit.internal,
          inventory: starterBag,
        },
      },
    };

    const initialDoorState = this._deriveAlchemistDoorStateFromPublic(room.state.public);
    room.state.public.alchDoorState = initialDoorState;
    room.state.public.doorState = {
      opened: !!initialDoorState.open,
      updatedAt: initialDoorState.updatedAt,
    };
    this.rooms.set(id, room);
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
      players: [...room.players.values()].map((p) => ({
        name: p.name,
        ready: !!p.ready,
      })),
      state: room.state.public, // nur öffentlicher Teil
    };
  }

  /** Alias: aktueller Snapshot (öffentlich) */
  snapshot(id) {
    return this.publicRoom(id);
  }

  /** Spieler beitreten lassen (mit optionaler Profil-ID) */
  async joinRoom(id, socketId, name = 'Player', profileId = null) {
    if (!this.rooms.has(id) && this.redis) {
      await this.loadSnapshot(id);
    }
    const room = this.get(id);
    if (!room) throw new Error('ROOM_NOT_FOUND');

    ensureInventory(room);

    const now = Date.now();
    room.players.set(socketId, {
      name: String(name),
      ready: false,
      profileId: profileId || null,
      joinedAt: now, // Join-Zeit für Stats
    });

    this._touchSeq(room);
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
    return [...room.players.values()].every((p) => p.ready);
  }

  /** Spiel starten (einmalig) */
  start(id) {
    const room = this.get(id);
    if (!room) throw new Error('ROOM_NOT_FOUND');

    if (!room.started) {
      ensureInventory(room);

      room.started = true;
      room.startedAt = Date.now();
      this._touchSeq(room);
      this._saveSnapshot(id).catch(() => {});
      this._persistLocal(id);

      // Nicht-blockierend in die DB schreiben
      RoomStats.recordRoomStarted(room).catch((err) => {
        console.error('recordRoomStarted failed:', err);
      });
    }
    return room;
  }

  applyViewRotation(id, { direction }) {
    const room = this.get(id);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (!room.started) return { ok: false, error: 'ROOM_NOT_RUNNING' };

    ensureInventory(room);

    const pub = room.state.public;
    if (direction === 'LEFT') {
      pub.viewIndex = (pub.viewIndex + 3) % 4;
    } else if (direction === 'RIGHT') {
      pub.viewIndex = (pub.viewIndex + 1) % 4;
    } else {
      return { ok: false, error: 'INVALID_DIRECTION' };
    }

    this._touchSeq(room);
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);

    return { ok: true, seq: room.seq, diff: { viewIndex: pub.viewIndex } };
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

    ensureInventory(room);

    // 1) Normalize (Inventory.js)
    const normalizedAction = normalizeActionItems(action);
    const pre = precheckInventoryForAction(room, normalizedAction);
    if (!pre.ok) return { ok: false, error: pre.error };

    // 2) Delegation an Puzzle-Engine (deterministisch)
    const prevPublic = room.state.public;
    const res = Puzzles.apply(room.state, normalizedAction);
    if (!res.ok) return { ok: false, error: res.error || 'INVALID_ACTION' };

    // 3) Autoritativen Zustand übernehmen
    room.state = res.nextState;
    ensureInventory(room);

    // 4) Inventory Bridge (Inventory.js)    
    const invChanged = applyInventoryBridge(room, prevPublic, normalizedAction);

    // 5) GLOBAL TRIGGERS (The logic for the door)

    // A. Wizard Door
    const wizDoorDiff = this._checkWizardDoorTriggers(room);
    // B. Alchemist Door
    const alchDoorChanged = this._updateAlchemistDoorState(room, normalizedAction);

    this._touchSeq(room);
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);

    // Prüfen, ob der Raum nun als "gelöst" gilt
    this._maybeMarkCompleted(room).catch(() => {});

    // Merge Diffs
    const diff = { ...(res.diff ?? {}), ...wizDoorDiff };
    if (invChanged) diff.inventory = room.state.public.inventory;
    if (alchDoorChanged) {
        diff.alchDoorState = room.state.public.alchDoorState;
        diff.doorState = room.state.public.doorState;
    }

    return { ok: true, seq: room.seq, diff };
  }

  /** Öffentlichen Anzeigenamen eines Spielers */
  displayName(id, socketId) {
    return this.get(id)?.players.get(socketId)?.name ?? null;
  }

  // ----------------------------------------------------------
  // Global Triggers Logic
  // ----------------------------------------------------------

  // --- WIZARD'S DOOR LOGIC  ---
  _checkWizardDoorTriggers(room) {
    const pub = room.state.public;
    const diff = {};
    if (pub.door_seal && pub.scroll_grid) {
      const keyInserted = pub.door_seal.hasKey;
      const gameSolved = pub.scroll_grid.solved;
      const alreadyOpen = pub.door_seal.openable;

      if (keyInserted && gameSolved && !alreadyOpen) {
        room.state.internal.door_seal.openable = true;
        room.state.public.door_seal.openable = true;
        diff.door_seal = { ...pub.door_seal, openable: true };
      }
    }
    return diff;
  }

  // --- ALCHEMIST'S DOOR LOGIC  ---
  _deriveAlchemistDoorStateFromPublic(pub) {
    const sliding = pub?.alchEastSlidingLock || {};
    const doorSync = pub?.alchEastDoorSync || {};
    const lightBeam = pub?.alchLightBeamGrid || {};

    const lockVisible = !!(sliding?.output?.lockVisible ?? sliding?.lockVisible ?? sliding?.solved);
    const keyInserted = !!(doorSync?.output?.keyInserted ?? doorSync?.keyInserted);
    const runesActivated = !!(doorSync?.output?.runesActivated ?? doorSync?.runesActivated ?? lightBeam?.solved);
    const mechanismTriggered = !!(doorSync?.output?.mechanismTriggered ?? doorSync?.mechanismTriggered ?? doorSync?.output?.opened);
    
    const open = (lockVisible && keyInserted && runesActivated && mechanismTriggered);

    return {
      lockVisible, keyInserted, runesActivated, mechanismTriggered, open,
      updatedAt: Date.now(),
    };
  }

  _deriveAlchemistDoorState(room) {
    const pub = room?.state?.public;
    if (!pub) return false;
    const prev = pub.alchDoorState || null;
    const next = this._deriveAlchemistDoorStateFromPublic(pub);
    pub.alchDoorState = next;
    pub.doorState = { opened: !!next.open, updatedAt: next.updatedAt };
    if (!prev) return true;
    return JSON.stringify(prev) !== JSON.stringify(next);
  }

  _updateAlchemistDoorState(room, action) {
    const objectId = action?.objectId;
    // Only recalc if a relevant puzzle was touched
    const watched = new Set([
    'alch:east-sliding-lock',
    'alch:east-door-lock',
    'alch:east-door-sync',
    'alch:east-door',
    'alch:east-door-switch',
    'alch:east-door-mechanism',
    'alch:east:door',
    'alch:east:sync-switch',
    'alch:mirror-grid',
    'alch:lightbeam-grid',
    'alch:east-lightbeam',
    'alch:door',
    'alch:final-door',
    ]);
    if (!watched.has(objectId)) return false;
    return this._deriveAlchemistDoorState(room);
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

  /** Periodisches Speichern aller Räume (z.B. alle 30s) */
  startAutosave(intervalMs = 30000) {
    setInterval(() => {
      for (const id of this.rooms.keys()) this._saveSnapshot(id).catch(() => {});
    }, intervalMs).unref();
  }

  /** Redis-Snapshot laden und Raum rehydrieren */
  async loadSnapshot(id) {
    if (!this.redis) return null;
    const key = `room:${id}:snapshot`;
    const snap = await this.redis.get(key);
    if (!snap) return null;

    const data = JSON.parse(snap);

    // Hinweis:
    // Snapshot ist "public only". Für interne Puzzle-States greifen wir auf initAll() zurück.
    // Das ist für Rejoin/Lobby robust; für exakte Fortsetzung nach Prozessneustart
    // sollte zukünftig ein full-state snapshot eingeführt werden.
    const puzzleInit = Puzzles.initAll();
    const inventoryBag =
      fromPublicInventory(data?.state?.inventory) || cloneBag(STARTER_INVENTORY);

    const room = {
      id,
      roomName: data?.state?.roomType || 'default',
      epoch: Date.now(),
      seq: data.seq ?? 0,
      started: data.started ?? false,
      completed: data.completed ?? false,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      players: new Map(), // wird bei Rejoin neu aufgebaut
      state: {
        public: data.state ?? puzzleInit.public,
        internal: {
          ...puzzleInit.internal,
          inventory: Object.keys(inventoryBag).length > 0 ? inventoryBag : cloneBag(STARTER_INVENTORY),
        },
      },
    };

    // inventory im public-state sichern
    room.state.public.inventory = toPublicInventory(room.state.internal.inventory);

    const restoredDoorState = this._deriveAlchemistDoorStateFromPublic(room.state.public);
    room.state.public.alchDoorState = restoredDoorState;
    room.state.public.doorState = {
      opened: !!restoredDoorState.open,
      updatedAt: restoredDoorState.updatedAt,
    };
    this.rooms.set(id, room);
    return room;
  }

  /** Leere Räume aufräumen (ohne Spieler, älter als ttlMs) */
  cleanupEmptyRooms(ttlMs = 600000) {
    // 10 minutes
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      const hasPlayers = room.players.size > 0;
      const age = now - (room.completedAt || room.startedAt || room.createdAt);
      if (!hasPlayers && age > ttlMs) {
        this.rooms.delete(id);
        if (this.store) this.store.delete(`room:${id}:snapshot`);
        console.log(`[cleanup] Removed empty room ${id}`);
      }
    }
  }

  /** set interval for automatic room cleanup */
  setCleanupInterval(intervalMs = 600000, ttlMs = 600000) {
    // every 10 minutes
    setInterval(() => {
      this.cleanupEmptyRooms(ttlMs);
    }, intervalMs).unref();
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

  async _maybeMarkCompleted(room) {
    if (room.completed) return;

    if (this.completionPredicate(room.state)) {
      room.completed = true;
      room.completedAt = Date.now();
      this._touchSeq(room);
      await this._saveSnapshot(room.id);
      this._persistLocal(room.id);

      // finishedAt pro Spieler setzen
      for (const player of room.players.values()) {
        if (!player.finishedAt) {
          player.finishedAt = room.completedAt;
        }
      }

      // Raum- und Teilnehmer-Stats in die DB schreiben (nicht-blockierend)
      RoomStats.recordRoomCompleted(room).catch((err) => {
        console.error('recordRoomCompleted failed:', err);
      });

      RoomStats.recordParticipantsOnComplete(room).catch((err) => {
        console.error('recordParticipantsOnComplete failed:', err);
      });

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
            reason,
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
    return values.every((v) =>
      typeof v === 'object' ? (v.solved === undefined ? true : !!v.solved) : true
    );
  } catch {
    return false;
  }
}