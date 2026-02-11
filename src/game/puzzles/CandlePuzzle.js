// src/game/puzzles/CandlePuzzle.js
import { makeResult } from './fsm.js';

const PUZZLE_KEY = 'candle_puzzle';
const SOLUTION = [2, 0, 3, 1];

export function init() {
  return {
    states: [true, true, true, true],  // Visual state
    playerAttempt: [],                 // Internal progress
    solved: false
  };
}

export function exportPublic(state) {
  return {
    states: [...state.states],
    solved: state.solved
  };
}

export function apply(state, action) {
  if (state.solved) return fail(state, "ALREADY_SOLVED");
  if (action.verb !== "TOGGLE") return fail(state, "INVALID_VERB");

  const { candleId } = action.data;
  if (candleId === undefined || candleId < 0 || candleId > 3) return fail(state, "INVALID_CANDLE_ID");
  
  // If candle is already off, ignore
  if (!state.states[candleId]) return ok(state);

  const next = clone(state);

  // Extinguish
  next.states[candleId] = false;
  next.playerAttempt.push(candleId);

  // Check Sequence if 4 candles are pressed
  if (next.playerAttempt.length === 4) {
    const isCorrect = next.playerAttempt.every((val, index) => val === SOLUTION[index]);

    if (isCorrect) {
      next.solved = true;
    } else {
      // Wrong order: Reset after this move
      next.states = [true, true, true, true];
      next.playerAttempt = [];
    }
  }

  return ok(next);
}

// --- Helpers ---
function clone(s) {
  return { 
    ...s, 
    states: [...s.states], 
    playerAttempt: [...s.playerAttempt] 
  };
}

function ok(state) {
  return makeResult({
    ok: true,
    nextState: state,
    diff: { [PUZZLE_KEY]: exportPublic(state) }
  });
}

function fail(state, error) {
  return makeResult({ ok: false, state, error });
}