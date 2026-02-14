// src/game/puzzles/wizard_library/WizTransformationPuzzle.js
import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'wizard_transformation_table';
const REQUIRED_SCRAPS = ["Flamma", "Purificat"];

export function init() {
  return {
    itemOnPlate: null, 
    powderApplied: false,
    hasKey: false,
    keyTaken: false,
    solved: false
  };
}

export function exportPublic(state) {
  return { ...state }; // All state here is public safe
}

export function apply(state, action) {
  if (state.keyTaken) return fail(state, "ALREADY_TAKEN");

  const next = clone(state);

  switch (action.verb) {
    case 'PLACE': {
      if (action.data.item === "WHITE_ROSE" && !next.itemOnPlate) {
        next.itemOnPlate = "WHITE_ROSE";
        return ok(next);
      }
      return fail(state, "INVALID_PLACEMENT");
    }

    case 'SPRINKLE': {
      if (action.data.item === "BLUE_POWDER" && next.itemOnPlate === "WHITE_ROSE") {
        next.itemOnPlate = "BLUE_ROSE";
        next.powderApplied = true;
        return ok(next);
      }
      return fail(state, "INVALID_POWDER_USE");
    }

    case 'COMBINE': {
      const { scrapA, scrapB } = action.data;
      const valid = (scrapA === REQUIRED_SCRAPS[0] && scrapB === REQUIRED_SCRAPS[1]) ||
                    (scrapA === REQUIRED_SCRAPS[1] && scrapB === REQUIRED_SCRAPS[0]);

      if (next.itemOnPlate === "BLUE_ROSE" && valid) {
        next.itemOnPlate = "ASHES";
        next.hasKey = true;
        next.solved = true;
        return ok(next);
      }
      return fail(state, "COMBINATION_FAILED");
    }

    case 'TAKE': {
      if (next.hasKey && !next.keyTaken) {
        next.keyTaken = true;
        return ok(next);
      }
      return fail(state, "NOTHING_TO_TAKE");
    }

    default:
      return fail(state, "INVALID_VERB");
  }
}

// --- Helpers ---
function clone(s) { return { ...s }; }

function ok(state) {
  return makeResult({
    ok: true,
    state: state, 
    diff: { [PUZZLE_KEY]: exportPublic(state) }
  });
}

function fail(state, error) {
  return makeResult({ 
    ok: false, 
    state: state, 
    error 
  });
}