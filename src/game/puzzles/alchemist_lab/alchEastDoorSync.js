// src/game/puzzles/alchEastDoorSync.js
const VALID_OBJECTS = new Set([
  'alch:east-door-lock',
  'alch:east-door-switch',
  'alch:east-door-mechanism'
]);

function clone(obj) {
  if (globalThis.structuredClone) return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function fail(state, error) {
  return { ok: false, error, nextState: state, diff: {} };
}

function ok(nextState, diff = {}) {
  return { ok: true, error: null, nextState, diff };
}

function normItem(x) {
  const raw = String(x ?? '').trim().toUpperCase();
  if (['GOLDEN_KEY', 'GOLDENKEY', 'GOLDENER_SCHLUESSEL', 'GOLDENER_SCHLÜSSEL'].includes(raw)) return 'GOLDEN_KEY';
  return raw || null;
}

function prerequisites(ctx, st) {
  const keyVisible = !!ctx?.public?.alchEastSlidingLock?.solved;
  const runesActivated = !!ctx?.public?.alchLightBeamGrid?.solved;
  const keyInserted = !!st?.keyInserted;
  return {
    keyVisible,
    runesActivated,
    openable: keyVisible && runesActivated && keyInserted
  };
}

function purgeOldPresses(presses, nowMs, windowMs) {
  const minTs = nowMs - windowMs;
  for (const [pid, ts] of Object.entries(presses)) {
    if (!Number.isFinite(ts) || ts < minTs) delete presses[pid];
  }
}

export function init() {
  return {
    keyInserted: false,
    opened: false,
    syncWindowMs: 1800,
    presses: {}, // { playerId: timestampMs }
    attempts: 0,
    lastOpenedAt: null
  };
}

export function exportPublic(state) {
  return {
    keyInserted: !!state.keyInserted,
    opened: !!state.opened,
    syncWindowMs: state.syncWindowMs,
    armedPlayers: Object.keys(state.presses || {}).length,
    attempts: state.attempts,
    lastOpenedAt: state.lastOpenedAt
  };
}

// ctx is optional but supported: runPuzzle passes root state as 4th arg
export function apply(state, action, now, ctx = {}) {
  if (!action || !VALID_OBJECTS.has(action.objectId)) {
    return fail(state, 'INVALID_OBJECT');
  }

  const next = clone(state);
  const verb = String(action?.verb || '').toLowerCase().trim();
  const nowMs = Number.isFinite(now) ? now : Date.now();

  switch (verb) {
    case 'insert': {
      if (action.objectId !== 'alch:east-door-lock') {
        return fail(state, 'INVALID_OBJECT_FOR_INSERT');
      }

      const req = prerequisites(ctx, next);
      if (!req.keyVisible) return fail(state, 'LOCK_NOT_VISIBLE');

      const item = normItem(action?.data?.item);
      if (item !== 'GOLDEN_KEY') return fail(state, 'INVALID_ITEM');

      if (!next.keyInserted) {
        next.keyInserted = true;
      }

      return ok(next, { keyInserted: next.keyInserted });
    }

    case 'press': {
      if (!['alch:east-door-switch', 'alch:east-door-mechanism'].includes(action.objectId)) {
        return fail(state, 'INVALID_OBJECT_FOR_PRESS');
      }

      const req = prerequisites(ctx, next);
      if (!req.openable) return fail(state, 'PREREQUISITES_NOT_MET');

      const playerId = String(action?.playerId || '').trim();
      if (!playerId) return fail(state, 'MISSING_PLAYER_ID');

      next.attempts += 1;
      next.presses[playerId] = nowMs;
      purgeOldPresses(next.presses, nowMs, next.syncWindowMs);

      const times = Object.values(next.presses);
      if (times.length >= 2) {
        const min = Math.min(...times);
        const max = Math.max(...times);

        if ((max - min) <= next.syncWindowMs) {
          next.opened = true;
          next.lastOpenedAt = nowMs;
          next.presses = {};
        }
      }

      return ok(next, {
        opened: next.opened,
        armedPlayers: Object.keys(next.presses).length,
        attempts: next.attempts
      });
    }

    case 'reset':
      return ok(init());

    default:
      return fail(state, 'INVALID_VERB');
  }
}
