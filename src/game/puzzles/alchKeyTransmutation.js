// src/game/puzzles/alchKeyTransmutation.js
// Kleines Alchemisten-Puzzle (B-W2):
// - Zutaten einlegen (Goldklumpen + blaue Flüssigkeit)
// - Erhitzen
// - Transmutieren -> Golden Key

import { makeResult } from './fsm.js';

const PUZZLE_KEY = 'alchKeyTransmutation';

const ITEMS = Object.freeze({
  GOLD_NUGGET: 'GOLD_NUGGET',
  BLUE_LIQUID: 'BLUE_LIQUID',
  GOLDEN_KEY: 'GOLDEN_KEY',
});

export function init() {
  return {
    phase: 'WAIT_INGREDIENTS',
    inserted: {
      goldNugget: false,
      blueLiquid: false,
    },
    heated: false,
    output: {
      goldenKeyReady: false,
      goldenKeyTaken: false,
    },
    solved: false,
  };
}

export function apply(state, action) {
  if (!action || action.objectId !== 'alch:transmuter') {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = String(action.verb ?? '').trim().toLowerCase();
  const next = clone(state);

  if (next.solved && verb !== 'take' && verb !== 'reset') {
    return fail(state, 'PUZZLE_ALREADY_SOLVED');
  }

  switch (verb) {
    case 'insert': {
      const item = normalizeItem(action?.data?.item);
      if (!item) return fail(state, 'INVALID_ITEM');

      if (item === ITEMS.GOLD_NUGGET) {
        if (next.inserted.goldNugget) return fail(state, 'GOLD_ALREADY_INSERTED');
        next.inserted.goldNugget = true;
      } else if (item === ITEMS.BLUE_LIQUID) {
        if (next.inserted.blueLiquid) return fail(state, 'BLUE_LIQUID_ALREADY_INSERTED');
        next.inserted.blueLiquid = true;
      } else {
        return fail(state, 'ITEM_NOT_SUPPORTED');
      }

      next.phase = derivePhase(next);
      return ok(next);
    }

    case 'ignite': {
      if (!next.inserted.goldNugget || !next.inserted.blueLiquid) {
        return fail(state, 'MISSING_INGREDIENTS');
      }
      if (next.heated) return fail(state, 'ALREADY_HEATED');

      next.heated = true;
      next.phase = 'HEATED';
      return ok(next);
    }

    case 'transmute': {
      if (!next.inserted.goldNugget || !next.inserted.blueLiquid) {
        return fail(state, 'MISSING_INGREDIENTS');
      }
      if (!next.heated) return fail(state, 'NOT_HEATED');
      if (next.output.goldenKeyReady) return fail(state, 'GOLDEN_KEY_ALREADY_CREATED');

      next.output.goldenKeyReady = true;
      next.solved = true;
      next.phase = 'GOLDEN_KEY_READY';
      return ok(next);
    }

    case 'take': {
      const item = normalizeItem(action?.data?.item);
      if (item !== ITEMS.GOLDEN_KEY) return fail(state, 'ONLY_GOLDEN_KEY_CAN_BE_TAKEN');
      if (!next.output.goldenKeyReady) return fail(state, 'GOLDEN_KEY_NOT_READY');

      next.output.goldenKeyTaken = true;
      next.phase = 'COMPLETED';
      return ok(next);
    }

    case 'reset': {
      return ok(init());
    }

    default:
      return fail(state, 'INVALID_VERB');
  }
}

export function exportPublic(state) {
  return {
    phase: state.phase,
    inserted: {
      goldNugget: !!state.inserted.goldNugget,
      blueLiquid: !!state.inserted.blueLiquid,
    },
    heated: !!state.heated,
    output: {
      goldenKeyReady: !!state.output.goldenKeyReady,
      goldenKeyTaken: !!state.output.goldenKeyTaken,
    },
    solved: !!state.solved,
    nextActions: deriveNextActions(state),
  };
}

export function isSolved(state) {
  return !!state.solved;
}

/* ---------------- internals ---------------- */

function derivePhase(s) {
  if (!s.inserted.goldNugget && !s.inserted.blueLiquid) return 'WAIT_INGREDIENTS';
  if (s.inserted.goldNugget && s.inserted.blueLiquid) return s.heated ? 'HEATED' : 'INGREDIENTS_READY';
  if (s.inserted.goldNugget) return 'GOLD_INSERTED';
  if (s.inserted.blueLiquid) return 'BLUE_INSERTED';
  return 'WAIT_INGREDIENTS';
}

function deriveNextActions(s) {
  if (s.solved && !s.output.goldenKeyTaken) return ['take(GOLDEN_KEY)'];
  if (s.solved) return [];

  const actions = [];
  if (!s.inserted.goldNugget) actions.push('insert(GOLD_NUGGET)');
  if (!s.inserted.blueLiquid) actions.push('insert(BLUE_LIQUID)');
  if (s.inserted.goldNugget && s.inserted.blueLiquid && !s.heated) actions.push('ignite');
  if (s.heated && !s.output.goldenKeyReady) actions.push('transmute');
  return actions;
}

function normalizeItem(input) {
  const raw = String(input ?? '').trim().toUpperCase();

  if (['GOLD_NUGGET', 'GOLDNUGGET', 'GOLDKLUMPEN', 'RAW_KEY_MATERIAL'].includes(raw)) {
    return ITEMS.GOLD_NUGGET;
  }
  if (['BLUE_LIQUID', 'BLUELIQUID', 'BLAUE_FLUESSIGKEIT', 'BLAUE_FLÜSSIGKEIT'].includes(raw)) {
    return ITEMS.BLUE_LIQUID;
  }
  if (['GOLDEN_KEY', 'GOLDENKEY', 'GOLDENER_SCHLUESSEL', 'GOLDENER_SCHLÜSSEL'].includes(raw)) {
    return ITEMS.GOLDEN_KEY;
  }
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
    phase: s.phase,
    inserted: { ...s.inserted },
    heated: !!s.heated,
    output: { ...s.output },
    solved: !!s.solved,
  };
}
