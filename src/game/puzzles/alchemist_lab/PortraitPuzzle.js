// src/game/puzzles/alch/PortraitPuzzle.js
import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'alchPortrait';
const OBJECT_ID = 'alch:portrait';

export function init() {
  return {
    portraitOpened: false,
    featherTaken: false,
    goldTaken: false,
    solved: false, // Solved when everything is taken
  };
}

export function apply(state, action) {
  if (!action || action.objectId !== OBJECT_ID) {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = String(action.verb || '').trim().toLowerCase();
  const next = clone(state);

  switch (verb) {
    case 'interact':
      // Open the widget popup
      return makeResult({
        state: next,
        diff: {
          activeWidget: OBJECT_ID,
          [OBJECT_ID]: exportPublic(next),
        },
        ok: true,
        error: null,
      });

    case 'open':
      // Clicked the closed portrait to reveal shelves
      if (next.portraitOpened) return fail(state, 'ALREADY_OPEN');
      next.portraitOpened = true;
      return ok(next);

    case 'take': {
      const itemKey = action?.data?.item;
      if (!next.portraitOpened) return fail(state, 'PORTRAIT_CLOSED');

      if (itemKey === 'FEATHER') {
        if (next.featherTaken) return fail(state, 'ALREADY_TAKEN');
        next.featherTaken = true;
      } else if (itemKey === 'GOLD_NUGGET') {
        if (next.goldTaken) return fail(state, 'ALREADY_TAKEN');
        next.goldTaken = true;
      } else {
        return fail(state, 'INVALID_ITEM');
      }

      // Check if both items are taken to set solved state
      if (next.featherTaken && next.goldTaken) {
        next.solved = true;
      }
      
      return ok(next);
    }

    case 'reset':
      return ok(init());

    default:
      return fail(state, 'INVALID_VERB');
  }
}

export function exportPublic(state) {
  return {
    opened: !!state.portraitOpened,
    featherTaken: !!state.featherTaken,
    goldTaken: !!state.goldTaken,
    solved: !!state.solved,
  };
}

// Helpers
function clone(s) { return { ...s }; }

function ok(nextState) {
  return makeResult({
    state: nextState,
    diff: { [PUZZLE_KEY]: exportPublic(nextState) },
    ok: true,
    error: null,
  });
}

function fail(state, errorCode) {
  return makeResult({ state, diff: {}, ok: false, error: errorCode });
}
