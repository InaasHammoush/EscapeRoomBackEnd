// src/game/puzzles/wizard_library/VasePuzzle.js
import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'vase_puzzle';

export function init() {
  return {
    keyTaken: false
  };
}

export function exportPublic(state) {
  return { ...state };
}

export function apply(state, action) {
  if (action.verb === 'TAKE') {
    if (state.keyTaken) return fail(state, "ALREADY_TAKEN");
    
    const next = { ...state, keyTaken: true };
    return ok(next);
  }
  
  return fail(state, "INVALID_VERB");
}

function ok(state) {
  return makeResult({
    ok: true,
    state: state, 
    diff: { [PUZZLE_KEY]: exportPublic(state) }
  });
}

function fail(state, error) {
  return makeResult({ ok: false, state: state, error });
}