import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'finalCorridor';
const DEFAULT_KEYWORD = 'winner';
const DEFAULT_SYNC_WINDOW_MS = 1800;

const WIZARD_RUNES = Object.freeze(['ANSUZ', 'ISA', 'NAUTHIZ']);
const ALCHEMIST_RUNES = Object.freeze(['NAUTHIZ_ALT', 'EHWAZ', 'RAIDO']);

const RUNE_TRANSLATION = Object.freeze({
  ANSUZ: 'W',
  ISA: 'I',
  NAUTHIZ: 'N',
  NAUTHIZ_ALT: 'N',
  EHWAZ: 'E',
  RAIDO: 'R',
});

const HINT_OBJECTS = new Set([
  'final:hint-note',
  'final:rune-note',
  'final:note',
  'final:translation-note',
]);

const KEYPAD_OBJECTS = new Set([
  'final:keypad',
  'final:door-keypad',
  'final:word-input',
  'final:door-input',
]);

const LEFT_PLATE_OBJECTS = new Set([
  'final:plate-left',
  'final:pressure-plate-left',
]);

const RIGHT_PLATE_OBJECTS = new Set([
  'final:plate-right',
  'final:pressure-plate-right',
]);

const GENERIC_PLATE_OBJECTS = new Set([
  'final:plate',
  'final:pressure-plate',
  'final:plates',
]);

const VALID_OBJECTS = new Set([
  ...HINT_OBJECTS,
  ...KEYPAD_OBJECTS,
  ...LEFT_PLATE_OBJECTS,
  ...RIGHT_PLATE_OBJECTS,
  ...GENERIC_PLATE_OBJECTS,
]);

export function init() {
  return {
    wizardRunes: [...WIZARD_RUNES],
    alchemistRunes: [...ALCHEMIST_RUNES],
    wizardRunesLit: false,
    alchemistRunesLit: false,
    wizardRunesLitAt: null,
    alchemistRunesLitAt: null,
    hintRevealed: false,
    keywordSolved: false,
    keywordAttempts: 0,
    lastError: null,
    syncWindowMs: configuredSyncWindow(),
    plates: {
      left: { playerId: null, pressedAt: null },
      right: { playerId: null, pressedAt: null },
    },
    finalDoorOpen: false,
    solved: false,
    wonAt: null,
    expectedKeyword: configuredKeyword(),
  };
}

export function exportPublic(state) {
  const runesLitTotal =
    (state.wizardRunesLit ? state.wizardRunes.length : 0) +
    (state.alchemistRunesLit ? state.alchemistRunes.length : 0);

  return {
    wizardRunesLit: !!state.wizardRunesLit,
    alchemistRunesLit: !!state.alchemistRunesLit,
    wizardRunes: state.wizardRunesLit ? [...state.wizardRunes] : [],
    alchemistRunes: state.alchemistRunesLit ? [...state.alchemistRunes] : [],
    runesLitTotal,
    hintRevealed: !!state.hintRevealed,
    runeHint: state.hintRevealed ? { ...RUNE_TRANSLATION } : null,
    keywordSolved: !!state.keywordSolved,
    keywordAttempts: Number(state.keywordAttempts || 0),
    lastError: state.lastError ?? null,
    syncWindowMs: Number(state.syncWindowMs || DEFAULT_SYNC_WINDOW_MS),
    plates: {
      left: {
        pressed: !!state.plates?.left?.pressedAt,
        playerId: state.plates?.left?.playerId ?? null,
        pressedAt: state.plates?.left?.pressedAt ?? null,
      },
      right: {
        pressed: !!state.plates?.right?.pressedAt,
        playerId: state.plates?.right?.playerId ?? null,
        pressedAt: state.plates?.right?.pressedAt ?? null,
      },
    },
    finalDoorOpen: !!state.finalDoorOpen,
    solved: !!state.solved,
    wonAt: state.wonAt ?? null,
  };
}

export function apply(state, action, now, ctx = {}) {
  if (!action || !VALID_OBJECTS.has(action.objectId)) {
    return fail(state, 'INVALID_OBJECT');
  }

  const next = clone(state);
  const nowMs = Number.isFinite(now) ? now : Date.now();
  const verb = String(action?.verb || '').trim().toLowerCase();

  syncRuneUnlockInPlace(next, ctx, nowMs);

  if (next.finalDoorOpen) {
    return ok(next);
  }

  if (isHintObject(action.objectId)) {
    if (!['interact', 'inspect', 'open', 'read', 'take'].includes(verb)) {
      return fail(state, 'INVALID_VERB');
    }
    next.hintRevealed = true;
    next.lastError = null;
    return ok(next);
  }

  if (isKeypadObject(action.objectId)) {
    if (!['submit', 'enter', 'unlock', 'solve'].includes(verb)) {
      return fail(state, 'INVALID_VERB');
    }
    if (!next.wizardRunesLit || !next.alchemistRunesLit) {
      return fail(state, 'RUNES_NOT_READY');
    }

    const guess = normalizeKeyword(
      action?.data?.word ??
        action?.data?.value ??
        action?.data?.text ??
        action?.data?.input ??
        action?.data?.guess
    );
    if (!guess) return fail(state, 'MISSING_KEYWORD');

    if (next.keywordSolved) {
      next.lastError = null;
      return ok(next);
    }

    next.keywordAttempts += 1;
    if (guess === next.expectedKeyword) {
      next.keywordSolved = true;
      next.lastError = null;
      return ok(next);
    }

    next.lastError = 'WRONG_KEYWORD';
    return ok(next);
  }

  const plateSide = resolvePlateSide(action.objectId, action?.data?.plate);
  if (!plateSide) {
    return fail(state, 'INVALID_OBJECT');
  }

  if (!['press', 'step', 'activate'].includes(verb)) {
    return fail(state, 'INVALID_VERB');
  }
  if (!next.keywordSolved) {
    return fail(state, 'KEYWORD_NOT_SOLVED');
  }

  const playerId = String(action?.playerId || '').trim();
  if (!playerId) return fail(state, 'MISSING_PLAYER_ID');

  purgeExpiredPlates(next, nowMs);

  next.plates[plateSide] = {
    playerId,
    pressedAt: nowMs,
  };

  if (bothPlatesArmed(next)) {
    const left = next.plates.left;
    const right = next.plates.right;
    const delta = Math.abs(Number(left.pressedAt || 0) - Number(right.pressedAt || 0));

    if (left.playerId === right.playerId) {
      next.lastError = 'PLATES_REQUIRE_DISTINCT_PLAYERS';
      return ok(next);
    }

    if (delta <= next.syncWindowMs) {
      next.finalDoorOpen = true;
      next.solved = true;
      next.wonAt = nowMs;
      next.lastError = null;
    } else {
      next.lastError = 'PLATES_NOT_SYNCED';
    }
  }

  return ok(next);
}

export function syncFromContext(localState, rootState, now = Date.now()) {
  const next = clone(localState);
  const changed = syncRuneUnlockInPlace(next, rootState, now);
  return { changed, nextState: next };
}

export function hydrateFromPublic(publicState, now = Date.now()) {
  const base = init();
  const src = publicState && typeof publicState === 'object' ? publicState : {};
  const nowMs = Number.isFinite(now) ? now : Date.now();

  base.wizardRunesLit = !!src.wizardRunesLit;
  base.alchemistRunesLit = !!src.alchemistRunesLit;
  base.wizardRunes = normalizeRuneList(src.wizardRunes, WIZARD_RUNES);
  base.alchemistRunes = normalizeRuneList(src.alchemistRunes, ALCHEMIST_RUNES);
  base.hintRevealed = !!src.hintRevealed;
  base.keywordSolved = !!src.keywordSolved;
  base.keywordAttempts = normalizeCounter(src.keywordAttempts);
  base.lastError = typeof src.lastError === 'string' ? src.lastError : null;
  base.syncWindowMs = normalizeSyncWindow(src.syncWindowMs, base.syncWindowMs);
  base.plates.left = normalizePlate(src?.plates?.left);
  base.plates.right = normalizePlate(src?.plates?.right);
  base.finalDoorOpen = !!src.finalDoorOpen;
  base.solved = !!src.solved || base.finalDoorOpen;
  base.wonAt = normalizeTimestamp(src.wonAt);

  if (base.wizardRunesLit && !base.wizardRunesLitAt) {
    base.wizardRunesLitAt = nowMs;
  }
  if (base.alchemistRunesLit && !base.alchemistRunesLitAt) {
    base.alchemistRunesLitAt = nowMs;
  }
  if (base.finalDoorOpen && !base.wonAt) {
    base.wonAt = nowMs;
  }

  return base;
}

function syncRuneUnlockInPlace(state, ctx, nowMs) {
  const pub = ctx?.public || {};
  let changed = false;

  if (deriveWizardReady(pub) && !state.wizardRunesLit) {
    state.wizardRunesLit = true;
    state.wizardRunesLitAt = nowMs;
    changed = true;
  }

  if (deriveAlchemistReady(pub) && !state.alchemistRunesLit) {
    state.alchemistRunesLit = true;
    state.alchemistRunesLitAt = nowMs;
    changed = true;
  }

  return changed;
}

function deriveWizardReady(pub) {
  const doorSeal = pub?.door_seal || {};
  const scrollSolved = !!(pub?.scroll_grid?.solved || pub?.tictactoe_scroll?.solved);
  return !!(
    doorSeal.openable ||
    doorSeal.opened ||
    doorSeal.solved ||
    (doorSeal.hasKey && scrollSolved)
  );
}

function deriveAlchemistReady(pub) {
  return !!(pub?.alchDoorState?.open || pub?.alchEastDoorSync?.opened);
}

function resolvePlateSide(objectId, plateFromData) {
  if (LEFT_PLATE_OBJECTS.has(objectId)) return 'left';
  if (RIGHT_PLATE_OBJECTS.has(objectId)) return 'right';
  if (!GENERIC_PLATE_OBJECTS.has(objectId)) return null;

  const side = String(plateFromData || '').trim().toLowerCase();
  if (side === 'left') return 'left';
  if (side === 'right') return 'right';
  return null;
}

function purgeExpiredPlates(state, nowMs) {
  const leftTs = Number(state.plates?.left?.pressedAt || 0);
  const rightTs = Number(state.plates?.right?.pressedAt || 0);
  const threshold = Number(state.syncWindowMs || DEFAULT_SYNC_WINDOW_MS);

  if (leftTs > 0 && nowMs - leftTs > threshold) {
    state.plates.left = { playerId: null, pressedAt: null };
  }
  if (rightTs > 0 && nowMs - rightTs > threshold) {
    state.plates.right = { playerId: null, pressedAt: null };
  }
}

function bothPlatesArmed(state) {
  return !!(state.plates?.left?.pressedAt && state.plates?.right?.pressedAt);
}

function isHintObject(objectId) {
  return HINT_OBJECTS.has(objectId);
}

function isKeypadObject(objectId) {
  return KEYPAD_OBJECTS.has(objectId);
}

function configuredKeyword() {
  const fromEnv = process.env.FINAL_KEYWORD || process.env.FINAL_CORRIDOR_KEYWORD || DEFAULT_KEYWORD;
  const normalized = normalizeKeyword(fromEnv);
  return normalized || DEFAULT_KEYWORD;
}

function configuredSyncWindow() {
  const n = Number.parseInt(process.env.FINAL_PLATE_SYNC_WINDOW_MS || '', 10);
  if (!Number.isFinite(n)) return DEFAULT_SYNC_WINDOW_MS;
  return Math.max(300, Math.min(10000, n));
}

function normalizeKeyword(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normalizeRuneList(value, fallback) {
  if (!Array.isArray(value) || value.length === 0) return [...fallback];
  const cleaned = value
    .map((v) => String(v || '').trim().toUpperCase())
    .filter((v) => v.length > 0);
  return cleaned.length > 0 ? cleaned : [...fallback];
}

function normalizeCounter(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function normalizeSyncWindow(value, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(300, Math.min(10000, n));
}

function normalizeTimestamp(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizePlate(raw) {
  const playerId = String(raw?.playerId || '').trim() || null;
  const pressedAt = normalizeTimestamp(raw?.pressedAt);
  return { playerId, pressedAt };
}

function clone(state) {
  return {
    wizardRunes: [...(state?.wizardRunes || WIZARD_RUNES)],
    alchemistRunes: [...(state?.alchemistRunes || ALCHEMIST_RUNES)],
    wizardRunesLit: !!state?.wizardRunesLit,
    alchemistRunesLit: !!state?.alchemistRunesLit,
    wizardRunesLitAt: state?.wizardRunesLitAt ?? null,
    alchemistRunesLitAt: state?.alchemistRunesLitAt ?? null,
    hintRevealed: !!state?.hintRevealed,
    keywordSolved: !!state?.keywordSolved,
    keywordAttempts: Number(state?.keywordAttempts || 0),
    lastError: state?.lastError ?? null,
    syncWindowMs: Number(state?.syncWindowMs || DEFAULT_SYNC_WINDOW_MS),
    plates: {
      left: {
        playerId: state?.plates?.left?.playerId ?? null,
        pressedAt: state?.plates?.left?.pressedAt ?? null,
      },
      right: {
        playerId: state?.plates?.right?.playerId ?? null,
        pressedAt: state?.plates?.right?.pressedAt ?? null,
      },
    },
    finalDoorOpen: !!state?.finalDoorOpen,
    solved: !!state?.solved,
    wonAt: state?.wonAt ?? null,
    expectedKeyword: normalizeKeyword(state?.expectedKeyword) || configuredKeyword(),
  };
}

function ok(nextState) {
  return makeResult({
    state: nextState,
    diff: { [PUZZLE_KEY]: exportPublic(nextState) },
    ok: true,
    error: null,
  });
}

function fail(state, error) {
  return makeResult({
    state,
    diff: {},
    ok: false,
    error,
  });
}
