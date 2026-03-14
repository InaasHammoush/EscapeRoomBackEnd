// src/game/puzzles/alch/DrawerPuzzle.js
import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'alch_drawer_puzzle';
const OBJECT_ID = 'alch:drawer';

export function init() {
  return {
    drawerOpened: false,
    scrollTaken: false,
    solved: false, // Solved when item is taken
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
      // Open the widget popup window
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
      // Clicked the closed drawer handle
      if (next.drawerOpened) return fail(state, 'ALREADY_OPEN');
      next.drawerOpened = true;
      return ok(next);

    case 'take': {
      // Clicked the scroll inside the open drawer
      const itemKey = action?.data?.item;
      if (!next.drawerOpened) return fail(state, 'DRAWER_CLOSED');

      if (itemKey === 'SCROLL') {
        if (next.scrollTaken) return fail(state, 'ALREADY_TAKEN');
        next.scrollTaken = true;
        next.solved = true; // Puzzle complete
      } else {
        return fail(state, 'INVALID_ITEM');
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
    opened: !!state.drawerOpened,
    scrollTaken: !!state.scrollTaken,
    solved: !!state.solved,
  };
}

// --- Helpers ---
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