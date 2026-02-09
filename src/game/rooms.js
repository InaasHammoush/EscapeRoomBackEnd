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

const STARTER_INVENTORY = Object.freeze({
  // MOONWORT: 1,
  // GREEN_LIQUID: 1,
  // GOLD_NUGGET: 1,
});

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
          inventory: toPublicInventory(starterBag),
        },
        internal: {
          ...puzzleInit.internal,
          inventory: starterBag,
        },
      },
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

    this._ensureInventory(room);

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
      this._ensureInventory(room);

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

    this._ensureInventory(room);

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

    this._ensureInventory(room);

    console.log("Applying action in room", id, action);

    // 1) Normalize + Inventory-Precheck (ohne zu konsumieren)
    const normalizedAction = this._normalizeActionItems(action);
    const pre = this._precheckInventoryForAction(room, normalizedAction);
    if (!pre.ok) return { ok: false, error: pre.error };

    // 2) Delegation an Puzzle-Engine (deterministisch)
    const prevPublic = typeof structuredClone === 'function'
      ? structuredClone(room.state.public)
      : JSON.parse(JSON.stringify(room.state.public));
    const res = Puzzles.apply(room.state, normalizedAction);
    if (!res.ok) return { ok: false, error: res.error || 'INVALID_ACTION' };

    // 3) Autoritativen Zustand übernehmen
    room.state = res.nextState;
    this._ensureInventory(room);

    // 4) Inventory-Bridge (consume + rewards)
    const invChanged = this._applyInventoryBridge(room, prevPublic, normalizedAction);

    this._touchSeq(room);
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);

    // Prüfen, ob der Raum nun als "gelöst" gilt
    this._maybeMarkCompleted(room).catch(() => {});

    const diff = { ...(res.diff ?? {}) };
    if (invChanged) diff.inventory = room.state.public.inventory;

    return { ok: true, seq: room.seq, diff };
  }

  /** Öffentlichen Anzeigenamen eines Spielers */
  displayName(id, socketId) {
    return this.get(id)?.players.get(socketId)?.name ?? null;
  }

  // ----------------------------------------------------------
  // Inventory-Bridge Helpers
  // ----------------------------------------------------------

  _ensureInventory(room) {
    if (!room.state.public) room.state.public = {};
    if (!room.state.internal) room.state.internal = {};

    if (!room.state.internal.inventory) {
      const fromPub = fromPublicInventory(room.state.public.inventory);
      room.state.internal.inventory =
        Object.keys(fromPub).length > 0 ? fromPub : cloneBag(STARTER_INVENTORY);
    }

    room.state.public.inventory = toPublicInventory(room.state.internal.inventory);
  }

  _normalizeActionItems(action) {
    if (!action?.data?.item) return action;
    const normalized = normalizeItem(action.data.item);
    if (!normalized) return action; // Puzzle-Validation kann INVALID_ITEM liefern
    return {
      ...action,
      data: { ...action.data, item: normalized },
    };
  }

_precheckInventoryForAction(room, action) {
  // Alchemie-Insert-Checks
  if (action?.verb === 'insert') {
    const isAlchemyInsert =
      action.objectId === 'alch:mortar' || action.objectId === 'alch:transmuter';

    if (isAlchemyInsert) {
      const item = normalizeItem(action?.data?.item);
      if (!item) return { ok: true }; // Puzzle-Validation übernimmt

      if (!bagHas(room.state.internal.inventory, item, 1)) {
        return { ok: false, error: 'INVENTORY_ITEM_MISSING' };
      }
    }
  }
  return { ok: true };
}

_applyInventoryBridge(room, prevPublic, action) {
  let changed = false;
  const bag = room.state.internal.inventory;

  // A) Verbrauch bei erfolgreichem insert in Alchemie-Puzzles
  if (
    action?.verb === 'insert' &&
    (action.objectId === 'alch:mortar' || action.objectId === 'alch:transmuter')
  ) {
    const item = normalizeItem(action?.data?.item);
    if (item && bagHas(bag, item, 1)) {
      bagRemove(bag, item, 1);
      changed = true;
    }
  }

  // B) Reward: BLUE_LIQUID wenn Mörser erstmals ready
  const prevBlue = !!prevPublic?.alchMortarEssence?.output?.blueLiquidReady;
  const nextBlue = !!room.state.public?.alchMortarEssence?.output?.blueLiquidReady;
  if (!prevBlue && nextBlue) {
    bagAdd(bag, 'BLUE_LIQUID', 1);
    changed = true;
  }

  // C) Reward: GOLDEN_KEY wenn Transmuter erstmals ready
  const prevKey = !!prevPublic?.alchKeyTransmutation?.output?.goldenKeyReady;
  const nextKey = !!room.state.public?.alchKeyTransmutation?.output?.goldenKeyReady;
  if (!prevKey && nextKey) {
    bagAdd(bag, 'GOLDEN_KEY', 1);
    changed = true;
  }

  // D) Spiegelpuzzle: Reward fürs lösen
  const prevGridSolved = !!prevPublic?.alchLightBeamGrid?.solved;
  const nextGridSolved = !!room.state.public?.alchLightBeamGrid?.solved;

  if (!prevGridSolved && nextGridSolved) {
    bagAdd(bag, 'LIGHT_SIGIL', 1);
    changed = true;
  }

    // E) Reward: Portrait/Bücher (FEATHER + GOLD_NUGGET)
  const prevFeather = !!prevPublic?.alchPortraitBooks?.output?.featherReady;
  const nextFeather = !!room.state.public?.alchPortraitBooks?.output?.featherReady;
  if (!prevFeather && nextFeather) {
    bagAdd(bag, 'FEATHER', 1);
    changed = true;
  }

  const prevGoldNugget = !!prevPublic?.alchPortraitBooks?.output?.goldNuggetReady;
  const nextGoldNugget = !!room.state.public?.alchPortraitBooks?.output?.goldNuggetReady;
  if (!prevGoldNugget && nextGoldNugget) {
    bagAdd(bag, 'GOLD_NUGGET', 1);
    changed = true;
  }

  // F) Reward: Flaschen-Umfüllung (4 Items)
  const prevCoal = !!prevPublic?.alchFlaskTransfer?.output?.coalBlockReady;
  const nextCoal = !!room.state.public?.alchFlaskTransfer?.output?.coalBlockReady;
  if (!prevCoal && nextCoal) {
    bagAdd(bag, 'COAL_BLOCK', 1);
    changed = true;
  }

  const prevMoonwort = !!prevPublic?.alchFlaskTransfer?.output?.moonwortReady;
  const nextMoonwort = !!room.state.public?.alchFlaskTransfer?.output?.moonwortReady;
  if (!prevMoonwort && nextMoonwort) {
    bagAdd(bag, 'MOONWORT', 1);
    changed = true;
  }

  const prevMatches = !!prevPublic?.alchFlaskTransfer?.output?.matchesReady;
  const nextMatches = !!room.state.public?.alchFlaskTransfer?.output?.matchesReady;
  if (!prevMatches && nextMatches) {
    bagAdd(bag, 'MATCHES', 1);
    changed = true;
  }

  const prevGreen = !!prevPublic?.alchFlaskTransfer?.output?.greenLiquidReady;
  const nextGreen = !!room.state.public?.alchFlaskTransfer?.output?.greenLiquidReady;
  if (!prevGreen && nextGreen) {
    bagAdd(bag, 'GREEN_LIQUID', 1);
    changed = true;
  }

  if (changed) {
    room.state.public.inventory = toPublicInventory(bag);
  }

  return changed;
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
  const pub = state?.public ?? {};
  const roomType = pub.roomType;

  const requiredByRoom = {
    alchemist: [
      'alchMortarEssence',
      'alchLightBeamGrid',
      'alchPortraitBooks',
      'alchFlaskTransfer',
      // optional: hints nur wenn als "Pflicht" gewollt
      // 'alchHintB1', 'alchHintB2',
    ],
    mage: [
      'coopSwitches',
      'lightsOut',
      'scroll_grid',
    ],
  };

  const required = requiredByRoom[roomType];
  if (!required) return false;

  return required.every((k) => !!pub?.[k]?.solved);
}

// ------------------------------------------------------------
// Inventory utilities
// ------------------------------------------------------------
function normalizeItem(input) {
  const raw = String(input ?? '').trim().toUpperCase();

  if (['MOONWORT', 'MONDRAUTE', 'BOTRYCHIUM_LUNARIA', 'BOTRYCHIUM LUNARIA'].includes(raw)) return 'MOONWORT';
  if (['GREEN_LIQUID', 'GREENLIQUID', 'GRÜNE_FLÜSSIGKEIT', 'GRUENE_FLUESSIGKEIT'].includes(raw)) return 'GREEN_LIQUID';
  if (['BLUE_LIQUID', 'BLUELIQUID', 'BLAUE_FLÜSSIGKEIT', 'BLAUE_FLUESSIGKEIT'].includes(raw)) return 'BLUE_LIQUID';
  if (['GOLD_NUGGET', 'GOLDNUGGET', 'GOLDKLUMPEN', 'RAW_KEY_MATERIAL'].includes(raw)) return 'GOLD_NUGGET';
  if (['GOLDEN_KEY', 'GOLDENKEY', 'GOLDENER_SCHLUESSEL', 'GOLDENER_SCHLÜSSEL'].includes(raw)) return 'GOLDEN_KEY';
  if (['PURIFIED_CRYSTAL', 'CRYSTAL', 'REINER_KRISTALL', 'GEREINIGTER_KRISTALL'].includes(raw)) return 'PURIFIED_CRYSTAL';
  if (['LIGHT_SIGIL', 'LIGHTSIGIL', 'LICHT_SIGIL', 'LICHTSIGIL'].includes(raw)) return 'LIGHT_SIGIL';

  return null;
}

function cloneBag(bag) {
  return { ...(bag || {}) };
}

function bagHas(bag, item, amount = 1) {
  return Number(bag?.[item] || 0) >= amount;
}

function bagAdd(bag, item, amount = 1) {
  bag[item] = Number(bag[item] || 0) + amount;
}

function bagRemove(bag, item, amount = 1) {
  const next = Number(bag[item] || 0) - amount;
  if (next > 0) bag[item] = next;
  else delete bag[item];
}

function toPublicInventory(bag) {
  const items = Object.entries(bag || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([item, count]) => ({ item, count: Number(count) }))
    .sort((a, b) => a.item.localeCompare(b.item));

  return { items };
}

function fromPublicInventory(publicInventory) {
  const bag = {};
  for (const entry of publicInventory?.items || []) {
    if (!entry?.item) continue;
    bag[String(entry.item)] = Number(entry.count || 0);
  }
  return bag;
}
