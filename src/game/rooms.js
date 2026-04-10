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
import { roomImagesMapper } from '../data/roomImagesMapper.js';
import * as Inventory from './inventory.js';

const { STARTER_INVENTORY, toPublicInventory, fromPublicInventory, cloneBag, normalizeActionItems,
  ensureInventory, precheckInventoryForAction, applyInventoryBridge, getInventoryForPlayer } = Inventory;

const SOLO_CHAMBERS = Object.freeze(['wizard_library', 'alchemist_lab', 'corridor']);
const DOOR_SYNC_WINDOW_MS = 1000;
const COOP_ROLE_TO_CHAMBER = Object.freeze({
  A: 'wizard_library',
  B: 'alchemist_lab',
});

const SHARED_PUBLIC_KEYS = new Set([
  'game',
  'corridorUnlocked',
  'corridorUnlockedAt',
  'finalCorridor',
]);

const WIZARD_PUBLIC_KEYS = new Set([
  'tictactoe_scroll',
  'bookshelf_puzzle',
  'candle_puzzle',
  'transformation_table_puzzle',
  'merlin_scale',
  'vase_puzzle',
  'recipe_hint',
  'door_seal',
]);

const ALCHEMIST_PUBLIC_KEYS = new Set([
  'alchPortraitBooks',
  'alchFlaskTransfer',
  'alchPortrait',
  'alchMortarEssence',
  'alch:mortar',
  'alchKeyTransmutation',
  'alchWestCodeboxJigsaw',
  'alchNorthHierarchyNote',
  'alchStatuePose',
  'alch_drawer_puzzle',
  'alchEastSlidingLock',
  'alchEastDoorSync',
  'alchLightBeamGrid',
  'alchDoorState',
  'doorState',
]);
const ROOM_TYPE_ALIASES = Object.freeze({
  default: 'default',
  wizard: 'wizard_library',
  wizard_library: 'wizard_library',
  alchemist: 'alchemist_lab',
  alchemist_lab: 'alchemist_lab',
  corridor: 'corridor',
});
const SOLO_CHAMBER_ALIASES = Object.freeze({
  ...ROOM_TYPE_ALIASES,
  default: 'wizard_library',
});

let roomStatsModulePromise = null;
let roomStatsUnavailableGlobally = false;
async function getRoomStatsModule() {
  if (roomStatsUnavailableGlobally) {
    return Promise.reject(Object.assign(new Error('ROOM_STATS_UNAVAILABLE'), { code: 'ERR_MODULE_NOT_FOUND' }));
  }
  if (!roomStatsModulePromise) {
    roomStatsModulePromise = import('../models/roomStats.model.js');
  }
  return roomStatsModulePromise;
}

function getRoomViews(roomName) {
  const resolvedRoomName = normalizeDisplayRoomType(roomName, 'default');
  const viewsMap = roomImagesMapper[resolvedRoomName] || roomImagesMapper.default || {};
  return Object.values(viewsMap);
}

function normalizeGameMode(value) {
  return String(value ?? '').trim().toLowerCase() === 'solo' ? 'solo' : 'coop';
}

function normalizeDisplayRoomType(value, fallback = 'default') {
  const raw = String(value ?? '').trim().toLowerCase();
  const resolved = ROOM_TYPE_ALIASES[raw] || raw;
  return roomImagesMapper[resolved] ? resolved : fallback;
}

function normalizeSoloChamber(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  const resolved = SOLO_CHAMBER_ALIASES[raw] || raw;
  return SOLO_CHAMBERS.includes(resolved) ? resolved : SOLO_CHAMBERS[0];
}

function chamberForRole(role, fallback = 'wizard_library') {
  if (!role) return fallback;
  const key = String(role).trim().toUpperCase();
  return COOP_ROLE_TO_CHAMBER[key] || fallback;
}

function filterPublicStateForChamber(pub, chamber) {
  const filtered = {};
  for (const [key, value] of Object.entries(pub || {})) {
    if (SHARED_PUBLIC_KEYS.has(key)) {
      filtered[key] = value;
      continue;
    }
    if (chamber === 'wizard_library' && WIZARD_PUBLIC_KEYS.has(key)) {
      filtered[key] = value;
      continue;
    }
    if (chamber === 'alchemist_lab' && ALCHEMIST_PUBLIC_KEYS.has(key)) {
      filtered[key] = value;
      continue;
    }
    if (chamber === 'corridor' && key === 'finalCorridor') {
      filtered[key] = value;
      continue;
    }
  }
  return filtered;
}

function normalizeViewIndex(value, roomType) {
  const views = getRoomViews(roomType);
  const modulo = Math.max(1, views.length);
  const parsed = Number.parseInt(String(value ?? 0), 10);
  if (!Number.isFinite(parsed)) return 0;
  return ((Math.floor(parsed) % modulo) + modulo) % modulo;
}

function buildChamberState(roomType, viewIndex = 0) {
  const resolvedRoomType = normalizeDisplayRoomType(roomType, roomType);
  const views = getRoomViews(resolvedRoomType);
  let normalizedIndex = normalizeViewIndex(viewIndex, resolvedRoomType);
  if (resolvedRoomType === 'corridor') {
    normalizedIndex = 1;
  }
  return {
    roomType: resolvedRoomType,
    viewIndex: normalizedIndex,
    views,
  };
}

function buildPresentationState(publicState, fallbackRoomName = 'default') {
  const pub = publicState && typeof publicState === 'object' ? publicState : {};
  const mode = normalizeGameMode(pub.mode);

  if (mode === 'solo') {
    const activeChamber = normalizeSoloChamber(pub.activeChamber || pub.roomType || fallbackRoomName);
    const wizardViewIndex =
      activeChamber === 'wizard_library'
        ? pub.viewIndex
        : pub?.chambers?.wizard_library?.viewIndex;
    const alchemistViewIndex =
      activeChamber === 'alchemist_lab'
        ? pub.viewIndex
        : pub?.chambers?.alchemist_lab?.viewIndex;
    const chambers = {
      wizard_library: buildChamberState('wizard_library', wizardViewIndex),
      alchemist_lab: buildChamberState('alchemist_lab', alchemistViewIndex),
    };
    const activeState = chambers[activeChamber];
    return {
      ...pub,
      mode,
      activeChamber,
      availableChambers: corridorUnlocked(pub)
        ? [...SOLO_CHAMBERS]
        : ['wizard_library', 'alchemist_lab'],
      chambers,
      roomType: activeState.roomType,
      views: [...activeState.views],
      viewIndex: activeState.viewIndex,
    };
  }

  const roomType = normalizeDisplayRoomType(pub.roomType || fallbackRoomName, 'default');
  const currentState = buildChamberState(
    roomType,
    pub?.chambers?.[roomType]?.viewIndex ?? pub.viewIndex
  );
  return {
    ...pub,
    mode,
    activeChamber: roomType,
    availableChambers: [roomType],
    chambers: { [roomType]: currentState },
    roomType,
    views: [...currentState.views],
    viewIndex: currentState.viewIndex,
  };
}

function presentationDiff(publicState) {
  const diff = {
    mode: publicState.mode,
    activeChamber: publicState.activeChamber,
    availableChambers: [...(publicState.availableChambers || [])],
    chambers: JSON.parse(JSON.stringify(publicState.chambers || {})),
    roomType: publicState.roomType,
    views: [...(publicState.views || [])],
    viewIndex: Number(publicState.viewIndex || 0),
  };

  if (Object.prototype.hasOwnProperty.call(publicState, 'corridorUnlocked')) {
    diff.corridorUnlocked = !!publicState.corridorUnlocked;
  }

  if (Object.prototype.hasOwnProperty.call(publicState, 'corridorUnlockedAt')) {
    diff.corridorUnlockedAt = publicState.corridorUnlockedAt ?? null;
  }

  if (publicState.game) {
    diff.game = JSON.parse(JSON.stringify(publicState.game));
  }

  if (publicState.finalCorridor) {
    diff.finalCorridor = JSON.parse(JSON.stringify(publicState.finalCorridor));
  }

  return diff;
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
   * @param {boolean} opts.statsEnabled - DB-Stats (RoomStats) aktivieren?
   */
  constructor({
    redis = null,
    snapshotTTL = 3600,
    store = null,
    completionPredicate = defaultCompletionPredicate,
    awardOnComplete = true,
    pointsOnComplete = 100,
    pointsReason = 'room_completed',
    statsEnabled = process.env.ROOM_STATS_ENABLED !== 'false',
  } = {}) {
    this.rooms = new Map(); // roomId -> Room
    this.redis = redis;
    this.snapshotTTL = snapshotTTL;
    this.store = store;

    this.completionPredicate = completionPredicate;
    this.awardOnComplete = awardOnComplete;
    this.pointsOnComplete = pointsOnComplete;
    this.pointsReason = pointsReason;
    this.statsEnabled = !!statsEnabled;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /** Neuen Raum erzeugen (unstarted, leere Spielerliste, initialer Puzzle-State) */
  createRoom(roomName = 'default', options = {}) {
    const id = crypto.randomUUID();
    const puzzleInit = Puzzles.initAll();
    const starterBag = cloneBag(STARTER_INVENTORY);
    const mode = normalizeGameMode(options?.mode);
    const initialRoomType = mode === 'solo'
      ? normalizeSoloChamber(options?.startingChamber || roomName)
      : normalizeDisplayRoomType(roomName, 'default');
    const publicState = buildPresentationState({
      ...puzzleInit.public,
      mode,
      roomType: initialRoomType,
      viewIndex: 0,
      alchDoorState: null,
      inventory: toPublicInventory(starterBag),
      corridorUnlocked: false,
      corridorUnlockedAt: null,
      game: {
        status: 'running',
        startedAt: null,
        endedAt: null,
      },
    }, initialRoomType);

    const room = {
      id,
      roomName,
      epoch: Date.now(),
      seq: 0,
      started: false,
      timerStarted: false,
      completed: false,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      players: new Map(), // socketId -> { name, ready, profileId? }
      state: {
        public: publicState,
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
    this._updateCorridorAccess(room);
    this._syncFinalCorridorState(room);
    this._updateGameStatus(room);
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
        role: p.role || null,
      })),
      state: room.state.public, // nur öffentlicher Teil
    };
  }

  /** Alias: aktueller Snapshot (öffentlich) */
  snapshot(id) {
    return this.publicRoom(id);
  }

  /** Snapshot für einen bestimmten Socket (role-/view-spezifisch in Coop) */
  snapshotFor(id, socketId) {
    const room = this.get(id);
    if (!room) return null;
    const base = this.publicRoom(id);
    if (!base) return null;
    const pub = { ...(room.state.public || {}) };
    const mode = normalizeGameMode(pub.mode);

    if (mode !== 'coop') {
      return {
        ...base,
        state: buildPresentationState(pub, room.roomName),
      };
    }

    const player = room.players.get(socketId);
    let chamber = chamberForRole(player?.role, room.roomName || 'wizard_library');
    if (pub.corridorUnlocked) {
      chamber = 'corridor';
    }
    if (player && player.chamber !== chamber) player.chamber = chamber;
    const chamberState = buildChamberState(chamber, player?.viewIndex ?? 0);
    const filtered = filterPublicStateForChamber(pub, chamber);
    filtered.inventory = toPublicInventory(getInventoryForPlayer(room, socketId));

    const activeWidgetByPlayer = room.state.internal?.activeWidgetByPlayer;
    if (activeWidgetByPlayer && activeWidgetByPlayer.has(socketId)) {
      filtered.activeWidget = activeWidgetByPlayer.get(socketId);
      activeWidgetByPlayer.delete(socketId);
    }

    const coopState = {
      ...filtered,
      mode: 'coop',
      activeChamber: chamber,
      availableChambers: [chamber],
      chambers: { [chamber]: chamberState },
      roomType: chamberState.roomType,
      views: [...chamberState.views],
      viewIndex: chamberState.viewIndex,
    };

    return {
      ...base,
      state: coopState,
    };
  }

  /** Spieler beitreten lassen (mit optionaler Profil-ID) */
  async joinRoom(id, socketId, name = 'Player', profileId = null, role = null) {
    if (!this.rooms.has(id) && this.redis) {
      await this.loadSnapshot(id);
    }
    const room = this.get(id);
    if (!room) throw new Error('ROOM_NOT_FOUND');

    ensureInventory(room, socketId);

    const now = Date.now();
    const mode = normalizeGameMode(room.state.public?.mode);
    let playerRole = role ? String(role).trim().toUpperCase() : null;
    if (mode === 'coop' && !playerRole) {
      const existingRoles = new Set([...room.players.values()].map((p) => p.role).filter(Boolean));
      if (!existingRoles.has('A')) playerRole = 'A';
      else if (!existingRoles.has('B')) playerRole = 'B';
    }
    const initialChamber = mode === 'coop'
      ? chamberForRole(playerRole, room.roomName || 'wizard_library')
      : room.roomName;

    room.players.set(socketId, {
      name: String(name),
      ready: false,
      profileId: profileId || null,
      role: playerRole || null,
      chamber: initialChamber,
      viewIndex: 0,
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

  /** Spiel starten (einmalig) – setzt noch NICHT den Timer */
  start(id) {
    const room = this.get(id);
    if (!room) throw new Error('ROOM_NOT_FOUND');

    if (!room.started) {
      ensureInventory(room);

      room.started = true;
      // NB: startedAt bleibt null bis intro:dismissed event kommt
      if (!room.state.public.game) {
        room.state.public.game = { status: 'running', startedAt: null, endedAt: null };
      }
      this._touchSeq(room);
      this._saveSnapshot(id).catch(() => {});
      this._persistLocal(id);
    }
    return room;
  }

  /** Timer tatsächlich starten (nach Intro) */
  startTimer(id) {
    const room = this.get(id);
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.timerStarted) return room; // Already started

    room.timerStarted = true;
    room.startedAt = Date.now();
    if (room.state.public.game) {
      room.state.public.game.startedAt = room.startedAt;
    }
    this._touchSeq(room);
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);

    // Nicht-blockierend in die DB schreiben
    if (this.statsEnabled) {
      this._recordRoomStarted(room);
    }
    return room;
  }

  applyViewRotation(id, { direction, socketId }) {
    const room = this.get(id);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };
    if (!room.started) return { ok: false, error: 'ROOM_NOT_RUNNING' };

    ensureInventory(room, socketId);

    const mode = normalizeGameMode(room.state.public?.mode);
    if (mode === 'coop') {
      const player = socketId ? room.players.get(socketId) : null;
      if (!player) return { ok: false, error: 'PLAYER_NOT_FOUND' };
      const chamber = player.chamber || chamberForRole(player.role, room.roomName || 'wizard_library');
      const delta = direction === 'LEFT' ? -1 : direction === 'RIGHT' ? 1 : null;
      if (delta === null) return { ok: false, error: 'INVALID_DIRECTION' };
      player.viewIndex = normalizeViewIndex((player.viewIndex ?? 0) + delta, chamber);
      this._touchSeq(room);
      this._saveSnapshot(id).catch(() => {});
      this._persistLocal(id);
      return { ok: true, seq: room.seq, diff: { viewIndex: player.viewIndex } };
    }

    room.state.public = buildPresentationState(room.state.public, room.roomName);
    const pub = room.state.public;
    if (direction === 'LEFT') {
      pub.viewIndex = normalizeViewIndex(pub.viewIndex - 1, pub.roomType);
    } else if (direction === 'RIGHT') {
      pub.viewIndex = normalizeViewIndex(pub.viewIndex + 1, pub.roomType);
    } else {
      return { ok: false, error: 'INVALID_DIRECTION' };
    }
    if (pub.activeChamber && pub.chambers?.[pub.activeChamber]) {
      pub.chambers[pub.activeChamber].viewIndex = pub.viewIndex;
    }

    this._touchSeq(room);
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);

    return { ok: true, seq: room.seq, diff: { viewIndex: pub.viewIndex } };
  }

  switchChamber(id, chamber) {
    const room = this.get(id);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };

    room.state.public = buildPresentationState(room.state.public, room.roomName);
    const pub = room.state.public;
    if (pub.mode !== 'solo') {
      return { ok: false, error: 'ROOM_SWITCH_NOT_AVAILABLE' };
    }

    const targetChamber = normalizeSoloChamber(chamber);
    if (targetChamber === 'corridor' && !corridorUnlocked(pub)) {
      return { ok: false, error: 'CORRIDOR_LOCKED' };
    }
    if (targetChamber === pub.activeChamber) {
      return { ok: true, seq: room.seq, diff: presentationDiff(pub) };
    }

    const chamberState = pub.chambers?.[targetChamber] || buildChamberState(targetChamber, 0);
    pub.activeChamber = targetChamber;
    pub.roomType = chamberState.roomType;
    pub.views = [...chamberState.views];
    pub.viewIndex = chamberState.viewIndex;

    this._touchSeq(room);
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);

    return { ok: true, seq: room.seq, diff: presentationDiff(pub) };
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

    ensureInventory(room, action?.playerId || null);
    const nowMs = Date.now();

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
    ensureInventory(room, action?.playerId || null);

    if (
      normalizeGameMode(room.state.public?.mode) === 'coop' &&
      res?.diff &&
      Object.prototype.hasOwnProperty.call(res.diff, 'activeWidget')
    ) {
      if (!room.state.internal.activeWidgetByPlayer) {
        room.state.internal.activeWidgetByPlayer = new Map();
      }
      room.state.internal.activeWidgetByPlayer.set(action.playerId, res.diff.activeWidget);
      delete res.diff.activeWidget;
    }

    // 4) Inventory Bridge (Inventory.js)    
    const invChanged = this._applyInventoryBridge(room, prevPublic, normalizedAction);

    // 5) GLOBAL TRIGGERS (The logic for the door)

    // A. Wizard Door
    const wizDoorDiff = this._checkWizardDoorTriggers(room);
    const coopDoorSync = this._applyCoopDoorSync(room, prevPublic, normalizedAction, nowMs);
    const wizDoorOpenedAtChanged = this._updateWizardDoorOpenedAt(room, prevPublic);
    // B. Alchemist Door
    const alchDoorChanged = this._updateAlchemistDoorState(room, normalizedAction);
    const corridorChanged = this._updateCorridorAccess(room);
    // C. Final corridor runes + win state
    const finalCorridorChanged = this._syncFinalCorridorState(room);
    const gameChanged = this._updateGameStatus(room);

    this._touchSeq(room);
    this._saveSnapshot(id).catch(() => {});
    this._persistLocal(id);

    // Prüfen, ob der Raum nun als "gelöst" gilt
    this._maybeMarkCompleted(room).catch(() => {});

    // Merge Diffs
    const diff = { ...(res.diff ?? {}), ...wizDoorDiff };
    if (coopDoorSync?.changed) {
      if (room.state.public?.door_seal) diff.door_seal = room.state.public.door_seal;
      if (room.state.public?.alchEastDoorSync) diff.alchEastDoorSync = room.state.public.alchEastDoorSync;
    }
    if (invChanged) diff.inventory = room.state.public.inventory;
    if (wizDoorOpenedAtChanged) {
        diff.door_seal = room.state.public.door_seal;
    }
    if (alchDoorChanged) {
        diff.alchDoorState = room.state.public.alchDoorState;
        diff.doorState = room.state.public.doorState;
    }
    if (corridorChanged) {
        diff.corridorUnlocked = room.state.public.corridorUnlocked;
        diff.corridorUnlockedAt = room.state.public.corridorUnlockedAt;
        diff.availableChambers = [...(room.state.public.availableChambers || [])];
    }
    if (finalCorridorChanged) diff.finalCorridor = room.state.public.finalCorridor;
    if (gameChanged) diff.game = room.state.public.game;

    return { ok: true, seq: room.seq, diff };
  }

  _applyInventoryBridge(room, prevPublic, action) {
    return applyInventoryBridge(room, prevPublic, action);
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
    if (pub.door_seal && pub.tictactoe_scroll) {
      const keyInserted = pub.door_seal.hasKey;
      const gameSolved = pub.tictactoe_scroll.solved;
      const alreadyOpen = pub.door_seal.openable;

      if (keyInserted && gameSolved && !alreadyOpen) {
        room.state.internal.door_seal.openable = true;
        room.state.public.door_seal.openable = true;
        room.state.public.door_seal.openableAt = Date.now();
        diff.door_seal = { ...pub.door_seal, openable: true, openableAt: room.state.public.door_seal.openableAt };
      }
    }
    return diff;
  }

  _updateWizardDoorOpenedAt(room, prevPublic) {
    const nextDoor = room?.state?.public?.door_seal;
    if (!nextDoor) return false;
    const prevOpened = !!prevPublic?.door_seal?.opened;
    const nextOpened = !!nextDoor.opened;
    if (!nextOpened) return false;
    if (!nextDoor.openedAt || !prevOpened) {
      nextDoor.openedAt = nextDoor.openedAt || Date.now();
      return true;
    }
    return false;
  }

  _applyCoopDoorSync(room, prevPublic, action, nowMs) {
    const pub = room?.state?.public;
    if (!pub) return { changed: false, diff: {} };

    if (normalizeGameMode(pub.mode) !== 'coop') {
      return { changed: false, diff: {} };
    }

    const prevWizardOpened = !!prevPublic?.door_seal?.opened;
    const prevAlchOpened = !!prevPublic?.alchEastDoorSync?.opened;
    if (prevWizardOpened || prevAlchOpened) {
      return { changed: false, diff: {} };
    }

    const syncState = room.state.internal.coopDoorSync || { wizardAt: null, alchAt: null };
    room.state.internal.coopDoorSync = syncState;

    const now = Number.isFinite(nowMs) ? nowMs : Date.now();
    const windowMs = DOOR_SYNC_WINDOW_MS;

    if (Number.isFinite(syncState.wizardAt) && now - syncState.wizardAt > windowMs) {
      syncState.wizardAt = null;
    }
    if (Number.isFinite(syncState.alchAt) && now - syncState.alchAt > windowMs) {
      syncState.alchAt = null;
    }

    const verb = String(action?.verb || '').trim().toUpperCase();
    const objectId = String(action?.objectId || '').trim();
    const canonicalObjectId = String(action?.canonicalObjectId || '').trim();

    const isWizardAttempt =
      verb === 'OPEN' &&
      (objectId === 'puzzle_door_seal' || canonicalObjectId === 'puzzle_door_seal');
    const isAlchAttempt =
      verb === 'PRESS' &&
      (objectId === 'alch:east-door-switch' ||
        objectId === 'alch:east-door-mechanism' ||
        objectId === 'puzzle_east_door_sync' ||
        canonicalObjectId === 'alch:east-door-switch' ||
        canonicalObjectId === 'alch:east-door-mechanism');

    if (isWizardAttempt) syncState.wizardAt = now;
    if (isAlchAttempt) syncState.alchAt = now;

    const synced =
      Number.isFinite(syncState.wizardAt) &&
      Number.isFinite(syncState.alchAt) &&
      Math.abs(syncState.wizardAt - syncState.alchAt) <= windowMs;

    let changed = false;
    if (synced) {
      if (room.state.internal?.door_seal && !room.state.internal.door_seal.opened) {
        room.state.internal.door_seal.opened = true;
        changed = true;
      }
      if (pub?.door_seal && !pub.door_seal.opened) {
        pub.door_seal.opened = true;
        pub.door_seal.openedAt = now;
        changed = true;
      }

      if (room.state.internal?.alchEastDoorSync && !room.state.internal.alchEastDoorSync.opened) {
        room.state.internal.alchEastDoorSync.opened = true;
        room.state.internal.alchEastDoorSync.lastOpenedAt = now;
        changed = true;
      }
      if (pub?.alchEastDoorSync && !pub.alchEastDoorSync.opened) {
        pub.alchEastDoorSync.opened = true;
        pub.alchEastDoorSync.lastOpenedAt = now;
        changed = true;
      }

      syncState.wizardAt = null;
      syncState.alchAt = null;
    } else {
      if (room.state.internal?.door_seal?.opened) {
        room.state.internal.door_seal.opened = false;
        changed = true;
      }
      if (pub?.door_seal?.opened) {
        pub.door_seal.opened = false;
        pub.door_seal.openedAt = null;
        changed = true;
      }

      if (room.state.internal?.alchEastDoorSync?.opened) {
        room.state.internal.alchEastDoorSync.opened = false;
        room.state.internal.alchEastDoorSync.lastOpenedAt = null;
        changed = true;
      }
      if (pub?.alchEastDoorSync?.opened) {
        pub.alchEastDoorSync.opened = false;
        pub.alchEastDoorSync.lastOpenedAt = null;
        changed = true;
      }
    }

    return { changed, diff: changed ? { door_seal: pub.door_seal, alchEastDoorSync: pub.alchEastDoorSync } : {} };
  }

  // --- ALCHEMIST'S DOOR LOGIC  ---
  _deriveAlchemistDoorStateFromPublic(pub) {
    const sliding = pub?.alchEastSlidingLock || {};
    const doorSync = pub?.alchEastDoorSync || {};
    const lightBeam = pub?.alchLightBeamGrid || {};

    const lockVisible = !!(sliding?.output?.lockVisible ?? sliding?.lockVisible ?? sliding?.solved);
    const keyInserted = !!(doorSync?.output?.keyInserted ?? doorSync?.keyInserted);
    const runesActivated = !!(doorSync?.output?.runesActivated ?? doorSync?.runesActivated ?? lightBeam?.solved);
    const mechanismTriggered = !!(
      doorSync?.output?.mechanismTriggered ??
      doorSync?.mechanismTriggered ??
      doorSync?.output?.opened ??
      doorSync?.opened
    );
    
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
    const canonicalObjectId = action?.canonicalObjectId;
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
    'puzzle_east_sliding_lock',
    'puzzle_east_door_sync',
    'puzzle_light_beam_grid',
    ]);
    if (!watched.has(objectId) && !watched.has(canonicalObjectId)) return false;
    return this._deriveAlchemistDoorState(room);
  }

  _syncFinalCorridorState(room) {
    const internalFinal = room?.state?.internal?.finalCorridor;
    if (!internalFinal) return false;
    if (typeof Puzzles.syncFinalCorridor !== 'function') return false;
    if (typeof Puzzles.exportFinalCorridor !== 'function') return false;

    const sync = Puzzles.syncFinalCorridor(internalFinal, room.state, Date.now());
    if (!sync?.nextState) return false;
    if (!sync.changed) return false;

    room.state.internal.finalCorridor = sync.nextState;
    room.state.public.finalCorridor = Puzzles.exportFinalCorridor(sync.nextState);
    return true;
  }

  _updateGameStatus(room) {
    const pub = room?.state?.public;
    if (!pub) return false;

    const finalDoorOpen = !!pub?.finalCorridor?.finalDoorOpen;
    const prevGame = pub.game || null;
    const startedAt = prevGame?.startedAt || room?.startedAt || null;

    if (finalDoorOpen) {
      pub.game = {
        status: 'won',
        startedAt,
        endedAt: prevGame?.endedAt || Date.now(),
      };
      return JSON.stringify(prevGame) !== JSON.stringify(pub.game);
    }

    if (!prevGame) {
      pub.game = { status: 'running', startedAt, endedAt: null };
      return true;
    }

    const nextGame = {
      status: 'running',
      startedAt,
      endedAt: null,
    };

    if (JSON.stringify(prevGame) !== JSON.stringify(nextGame)) {
      pub.game = nextGame;
      return true;
    }

    return false;
  }

  _updateCorridorAccess(room) {
    const pub = room?.state?.public;
    if (!pub) return false;

    const wizardReady = corridorWizardReady(pub);
    const alchReady = corridorAlchemistReady(pub);
    const bothReady = wizardReady && alchReady;

    let unlocked = false;
    if (pub.mode === 'solo') {
      unlocked = bothReady;
    } else {
      const wizardAt = Number(pub?.door_seal?.openedAt || 0);
      const alchAt = Number(pub?.alchEastDoorSync?.lastOpenedAt || 0);
      unlocked = bothReady && wizardAt > 0 && alchAt > 0 && Math.abs(wizardAt - alchAt) <= DOOR_SYNC_WINDOW_MS;
    }

    const prev = !!pub.corridorUnlocked;
    if (unlocked && !prev) {
      pub.corridorUnlocked = true;
      pub.corridorUnlockedAt = Date.now();
      if (pub.mode === 'coop') {
        for (const player of room.players.values()) {
          player.chamber = 'corridor';
          player.viewIndex = 0;
        }
      }
    } else if (!unlocked && !prev) {
      pub.corridorUnlocked = false;
    }

    if (pub.mode === 'solo') {
      pub.availableChambers = corridorUnlocked(pub)
        ? [...SOLO_CHAMBERS]
        : ['wizard_library', 'alchemist_lab'];
    }

    return !!pub.corridorUnlocked !== prev;
  }

  // ----------------------------------------------------------
  // Interne Helfer
  // ----------------------------------------------------------

  /** Seq erhöhen (deterministische Reihenfolge) */
  _recordRoomStarted(room) {
    this._runWithRoomStats('recordRoomStarted', (RoomStats) => RoomStats.recordRoomStarted(room));
  }

  _recordRoomCompleted(room) {
    this._runWithRoomStats('recordRoomCompleted', (RoomStats) => RoomStats.recordRoomCompleted(room));
  }

  _recordParticipantsOnComplete(room) {
    this._runWithRoomStats('recordParticipantsOnComplete', (RoomStats) =>
      RoomStats.recordParticipantsOnComplete(room)
    );
  }

  _runWithRoomStats(opName, run) {
    if (roomStatsUnavailableGlobally) return;
    getRoomStatsModule()
      .then((RoomStats) => run(RoomStats))
      .catch((err) => {
        if (err?.code === 'ERR_MODULE_NOT_FOUND') {
          if (!roomStatsUnavailableGlobally) {
            roomStatsUnavailableGlobally = true;
            console.warn('[RoomStats] disabled at runtime: database module is unavailable');
          }
          return;
        }
        console.error(`${opName} failed:`, err);
      });
  }

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
    const publicState = buildPresentationState(
      data?.state ?? puzzleInit.public,
      data?.state?.roomType || 'default'
    );

    const snapGame = data?.state?.game || {};
    const snapStartedAt = Number(snapGame?.startedAt || 0);
    const snapEndedAt = Number(snapGame?.endedAt || 0);

    const room = {
      id,
      roomName: data?.state?.roomType || 'default',
      epoch: Date.now(),
      seq: data.seq ?? 0,
      started:
        data.started ??
        Boolean(Number(data?.state?.game?.startedAt || 0) > 0),
      completed:
        data.completed ??
        String(data?.state?.game?.status || '').toLowerCase() === 'won',
      createdAt: Date.now(),
      startedAt: Number.isFinite(snapStartedAt) && snapStartedAt > 0 ? snapStartedAt : null,
      completedAt: Number.isFinite(snapEndedAt) && snapEndedAt > 0 ? snapEndedAt : null,
      players: new Map(), // wird bei Rejoin neu aufgebaut
      state: {
        public: publicState,
        internal: {
          ...puzzleInit.internal,
          inventory: Object.keys(inventoryBag).length > 0 ? inventoryBag : cloneBag(STARTER_INVENTORY),
        },
      },
    };

    if (typeof Puzzles.hydrateFinalCorridor === 'function') {
      room.state.internal.finalCorridor = Puzzles.hydrateFinalCorridor(
        room.state.public?.finalCorridor,
        Date.now()
      );
    }

    // inventory im public-state sichern
    room.state.public.inventory = toPublicInventory(room.state.internal.inventory);

    const restoredDoorState = this._deriveAlchemistDoorStateFromPublic(room.state.public);
    room.state.public.alchDoorState = restoredDoorState;
    room.state.public.doorState = {
      opened: !!restoredDoorState.open,
      updatedAt: restoredDoorState.updatedAt,
    };
    if (room.state.public.corridorUnlocked === undefined) {
      room.state.public.corridorUnlocked = false;
      room.state.public.corridorUnlockedAt = null;
    }
    this._updateCorridorAccess(room);
    this._syncFinalCorridorState(room);
    this._updateGameStatus(room);
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
      if (!room.startedAt) {
        const startedAtFromGame = Number(room.state?.public?.game?.startedAt || 0);
        if (Number.isFinite(startedAtFromGame) && startedAtFromGame > 0) {
          room.startedAt = startedAtFromGame;
        }
      }

      const endedAtFromGame = Number(room.state?.public?.game?.endedAt || 0);
      room.completedAt =
        Number.isFinite(endedAtFromGame) && endedAtFromGame > 0
          ? endedAtFromGame
          : Date.now();

      room.completed = true;
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
      if (this.statsEnabled) {
        this._recordRoomCompleted(room);
        this._recordParticipantsOnComplete(room);
      }

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
    if (pub?.game?.status === 'won') return true;

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

function corridorWizardReady(pub) {
  const doorSeal = pub?.door_seal || {};
  return !!(doorSeal.opened || doorSeal.solved);
}

function corridorAlchemistReady(pub) {
  return !!(pub?.alchDoorState?.open || pub?.alchEastDoorSync?.opened);
}

function corridorUnlocked(pub) {
  return !!pub?.corridorUnlocked;
}
