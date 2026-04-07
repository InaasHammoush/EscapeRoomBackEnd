// src/game/puzzles/doorSeal.js
import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'door_seal';

export function init() {
  return {
    hasKey: false,
    openable: false, // This becomes true only when Key + TicTacToe are done
    opened: false
  };
}

export function exportPublic(state) {
  return { ...state };
}

export function apply(state, action) {
  if (action.verb === "INSERT") {
    if (state.opened) return fail(state, "ALREADY_OPEN");

    // We rely on the RoomManager to normalize 'ASH_KEY' before it gets here
    // or we check raw data. Assuming normalized:
    if (action.data.item !== "ASH_KEY") return fail(state, "WRONG_ITEM");

    const next = { ...state, hasKey: true };
  
    // Note: We do NOT set openable=true here yet. 
    // The RoomManager will check the Scroll Grid status and update this.
  
    return ok(next);
  }

  if (action.verb === "OPEN") {
    if (state.opened) return fail(state, "ALREADY_OPEN");
    if (!state.hasKey) return fail(state, "MISSING_KEY");
    if (!state.openable) return fail(state, "NOT_OPENABLE_YET");
    const next = { ...state, opened: true };
    return ok(next);
  }

  return fail(state, "INVALID_VERB");
}

// --- Helpers ---
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
