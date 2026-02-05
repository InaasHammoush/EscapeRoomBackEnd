// src/game/puzzles/alchMortarEssence.js
// B-S2 Reagenz-Mörser:
// 1) Mondraute einlegen
// 2) zermahlen
// 3) grüne Flüssigkeit einlegen
// 4) kombinieren -> BlueLiquid

import { makeResult } from './fsm.js';
import { ALCHEMY_ITEMS, normalizeAlchemyItem } from './helpers/alchemyItems.js';

const PUZZLE_KEY = 'alchMortarEssence';

export function init() {
  return {
    phase: 'WAIT_MOONWORT',
    inserted: {
      moonwort: false,
      greenLiquid: false,
    },
    processed: {
      essenceReady: false,
    },
    output: {
      blueLiquidReady: false,
      blueLiquidTaken: false, // optionaler UX-Status fürs Frontend
    },
    solved: false,
  };
}

export function apply(state, action) {
  if (!action || action.objectId !== 'alch:mortar') {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = action.verb;
  const next = clone(state);

  // Optional: hartes Stoppen nach Solve (außer reset/take)
  if (next.solved && verb !== 'reset' && verb !== 'take') {
    return fail(state, 'PUZZLE_ALREADY_SOLVED');
  }

  switch (verb) {
    case 'insert': {
      const item = normalizeAlchemyItem(action?.data?.item);
      if (!item) return fail(state, 'INVALID_ITEM');

      if (item === ALCHEMY_ITEMS.MOONWORT) {
        if (next.inserted.moonwort) return fail(state, 'MOONWORT_ALREADY_INSERTED');
        if (next.processed.essenceReady) return fail(state, 'TOO_LATE_FOR_MOONWORT');

        next.inserted.moonwort = true;
        next.phase = 'MOONWORT_INSERTED';
        return ok(next);
      }

      if (item === ALCHEMY_ITEMS.GREEN_LIQUID) {
        if (!next.processed.essenceReady) return fail(state, 'ESSENCE_NOT_READY');
        if (next.inserted.greenLiquid) return fail(state, 'GREEN_LIQUID_ALREADY_INSERTED');

        next.inserted.greenLiquid = true;
        next.phase = 'READY_TO_COMBINE';
        return ok(next);
      }

      return fail(state, 'ITEM_NOT_SUPPORTED');
    }

    case 'grind': {
      if (!next.inserted.moonwort) return fail(state, 'MISSING_MOONWORT');
      if (next.processed.essenceReady) return fail(state, 'ESSENCE_ALREADY_READY');

      next.processed.essenceReady = true;
      next.phase = 'ESSENCE_READY';
      return ok(next);
    }

    case 'combine': {
      if (!next.processed.essenceReady) return fail(state, 'MISSING_ESSENCE');
      if (!next.inserted.greenLiquid) return fail(state, 'MISSING_GREEN_LIQUID');
      if (next.output.blueLiquidReady) return fail(state, 'BLUE_LIQUID_ALREADY_CREATED');

      next.output.blueLiquidReady = true;
      next.solved = true;
      next.phase = 'BLUE_LIQUID_READY';
      return ok(next);
    }

    case 'take': {
      const item = normalizeAlchemyItem(action?.data?.item);
      if (item !== ALCHEMY_ITEMS.BLUE_LIQUID) return fail(state, 'ONLY_BLUE_LIQUID_CAN_BE_TAKEN');
      if (!next.output.blueLiquidReady) return fail(state, 'BLUE_LIQUID_NOT_READY');

      next.output.blueLiquidTaken = true;
      next.phase = 'COMPLETED';
      // solved bleibt true
      return ok(next);
    }

    case 'reset': {
      const fresh = init();
      return ok(fresh);
    }

    default:
      return fail(state, 'INVALID_VERB');
  }
}

export function exportPublic(state) {
  return {
    phase: state.phase,
    inserted: {
      moonwort: !!state.inserted.moonwort,
      greenLiquid: !!state.inserted.greenLiquid,
    },
    processed: {
      essenceReady: !!state.processed.essenceReady,
    },
    output: {
      blueLiquidReady: !!state.output.blueLiquidReady,
      blueLiquidTaken: !!state.output.blueLiquidTaken,
    },
    solved: !!state.solved,
    nextActions: deriveNextActions(state),
  };
}

export function isSolved(state) {
  return !!state.solved;
}

// -------------------- internals --------------------

function deriveNextActions(state) {
  if (state.solved && !state.output.blueLiquidTaken) {
    return ['take(BLUE_LIQUID)'];
  }
  if (state.solved) return [];

  if (!state.inserted.moonwort) return ['insert(MOONWORT)'];
  if (!state.processed.essenceReady) return ['grind'];
  if (!state.inserted.greenLiquid) return ['insert(GREEN_LIQUID)'];
  if (!state.output.blueLiquidReady) return ['combine'];

  return [];
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
    processed: { ...s.processed },
    output: { ...s.output },
    solved: !!s.solved,
  };
}
