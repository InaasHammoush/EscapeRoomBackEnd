// src/game/puzzles/alchKeyTransmutation.js
// Westwand Ritual (Papier):
// 1) COAL_BLOCK (Symbol zeichnen)
// 2) BLUE_LIQUID auf Papier
// 3) GOLD_NUGGET auf Papier
// 4) MATCHES anzünden -> GOLDEN_KEY ready

import { makeResult } from './fsm.js';

const PUZZLE_KEY = 'alchKeyTransmutation';
const VALID_OBJECTS = new Set(['alch:transmuter', 'alch:ritual-paper']);

export function init() {
  return {
    steps: {
      symbolDrawn: false,
      blueApplied: false,
      goldPlaced: false,
      ignited: false,
    },
    output: {
      goldenKeyReady: false,
    },
    solved: false,
    phase: 'WAIT_SYMBOL',
  };
}

export function apply(state, action) {
  if (!action || !VALID_OBJECTS.has(action.objectId)) {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = normalizeVerb(action.verb);
  const next = clone(state);

  if (verb === 'interact' || verb === 'inspect' || verb === 'open') {
    return ok(next);
  }

  if (verb === 'reset') {
    return ok(init());
  }

  if (verb !== 'insert' && verb !== 'use' && verb !== 'apply_item') {
    return fail(state, 'INVALID_VERB');
  }

  const item = normalizeItem(action?.data?.item);
  if (!item) return fail(state, 'INVALID_ITEM');

  // Bereits gelöst
  if (next.solved) {
    return fail(state, 'PUZZLE_ALREADY_SOLVED');
  }

  switch (item) {
    case 'COAL_BLOCK': {
      if (!next.steps.symbolDrawn) {
        next.steps.symbolDrawn = true;
        next.phase = 'SYMBOL_READY';
      }
      return ok(next);
    }

    case 'BLUE_LIQUID': {
      if (!next.steps.symbolDrawn) return fail(state, 'NEED_SYMBOL_FIRST');
      if (next.steps.blueApplied) return fail(state, 'BLUE_ALREADY_APPLIED');

      next.steps.blueApplied = true;
      next.phase = 'BLUE_APPLIED';
      return ok(next);
    }

    case 'GOLD_NUGGET': {
      if (!next.steps.blueApplied) return fail(state, 'NEED_BLUE_FIRST');
      if (next.steps.goldPlaced) return fail(state, 'GOLD_ALREADY_PLACED');

      next.steps.goldPlaced = true;
      next.phase = 'GOLD_PLACED';
      return ok(next);
    }

    case 'MATCHES': {
      if (!next.steps.goldPlaced) return fail(state, 'NEED_GOLD_FIRST');
      if (next.steps.ignited) return fail(state, 'ALREADY_IGNITED');

      next.steps.ignited = true;
      next.output.goldenKeyReady = true;
      next.solved = true;
      next.phase = 'COMPLETE';
      return ok(next);
    }

    default:
      return fail(state, 'ITEM_NOT_SUPPORTED');
  }
}

export function exportPublic(state) {
  return {
    steps: {
      symbolDrawn: !!state.steps.symbolDrawn,
      blueApplied: !!state.steps.blueApplied,
      goldPlaced: !!state.steps.goldPlaced,
      ignited: !!state.steps.ignited,
    },
    output: {
      goldenKeyReady: !!state.output.goldenKeyReady,
    },
    solved: !!state.solved,
    phase: state.phase,
    activeWidget: true,
    nextActions: deriveNextActions(state),
  };
}

export function isSolved(state) {
  return !!state.solved;
}

// ------------------------------------------------------------

function deriveNextActions(state) {
  if (!state.steps.symbolDrawn) return ['insert(COAL_BLOCK)'];
  if (!state.steps.blueApplied) return ['insert(BLUE_LIQUID)'];
  if (!state.steps.goldPlaced) return ['insert(GOLD_NUGGET)'];
  if (!state.steps.ignited) return ['insert(MATCHES)'];
  return [];
}

function normalizeVerb(v) {
  return String(v ?? '').trim().toLowerCase();
}

function normalizeItem(input) {
  const raw = String(input ?? '').trim().toUpperCase();

  if (['COAL_BLOCK', 'KOHLEBLOCK', 'BLOCK_KOHLE'].includes(raw)) return 'COAL_BLOCK';
  if (['BLUE_LIQUID', 'BLUELIQUID', 'BLAUE_FLÜSSIGKEIT', 'BLAUE_FLUESSIGKEIT'].includes(raw)) return 'BLUE_LIQUID';
  if (['GOLD_NUGGET', 'GOLDNUGGET', 'GOLDKLUMPEN', 'RAW_KEY_MATERIAL'].includes(raw)) return 'GOLD_NUGGET';
  if (['MATCHES', 'STREICHHÖLZER', 'STREICHHOELZER'].includes(raw)) return 'MATCHES';

  return null;
}

function ok(nextState) {
  return makeResult({
    state: nextState,
    diff: { [PUZZLE_KEY]: exportPublic(nextState) },
    ok: true,
    error: null,
  });
}

function fail(state, code) {
  return makeResult({
    state,
    diff: {},
    ok: false,
    error: code,
  });
}

function clone(s) {
  return {
    steps: { ...s.steps },
    output: { ...s.output },
    solved: !!s.solved,
    phase: s.phase,
  };
}
