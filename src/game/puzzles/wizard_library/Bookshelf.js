// src/game/puzzles/wizard_library/bookshelf.js
import { makeResult } from './fsm.js';

const PUZZLE_KEY = 'bookshelf_puzzle';
const SOLUTION = ["BOOK_YELLOW", "BOOK_RED", "BOOK_BLUE", "BOOK_GREEN"];

export function init() {
  return {
    currentOrder: ["BOOK_RED", "BOOK_GREEN", "BOOK_BLUE", "BOOK_YELLOW"],
    solved: false,
  };
}

export function exportPublic(state) {
  return {
    currentOrder: [...state.currentOrder],
    solved: state.solved,
  };
}

export function apply(state, action) {
  if (state.solved) return fail(state, "ALREADY_SOLVED");
  if (action.verb !== "REORDER") return fail(state, "INVALID_VERB");

  const { fromIndex, toIndex } = action.data;
  if (fromIndex === undefined || toIndex === undefined) return fail(state, "MISSING_DATA");

  const next = clone(state);

  // Perform Move
  const [movedItem] = next.currentOrder.splice(fromIndex, 1);
  next.currentOrder.splice(toIndex, 0, movedItem);

  // Check Win
  const isWinner = next.currentOrder.every((val, index) => val === SOLUTION[index]);
  if (isWinner) {
    next.solved = true;
  }

  return ok(next);
}

// --- Helpers ---
function clone(s) {
  return { ...s, currentOrder: [...s.currentOrder] };
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