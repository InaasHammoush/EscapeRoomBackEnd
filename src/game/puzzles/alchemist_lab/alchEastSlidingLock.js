// src/game/puzzles/alchEastSlidingLock.js
const PUZZLE_KEY = 'alchEastSlidingLock';
const WIDGET_ID = 'alch:east-sliding-lock';
const SIZE = 3;
const SOLVED_BOARD = [1, 2, 3, 4, 5, 6, 7, 8, 0];
const VALID_OBJECTS = new Set(['alch:east-codebox', 'alch:east-jigsaw', 'alch:east-sliding-lock']);

// Solvable start with shortest-path distance 8 to the solved board.
// One shortest solution is: 1 -> 2 -> 3 -> 5 -> 6 -> 8 -> 5 -> 6
const DEFAULT_BOARD = [0, 1, 2, 4, 8, 3, 7, 6, 5];

function clone(obj) {
  if (globalThis.structuredClone) return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function fail(state, error) {
  return { ok: false, error, nextState: state, diff: {} };
}

function ok(nextState, diff = {}) {
  return { ok: true, error: null, nextState, diff };
}

function isSolved(board) {
  if (!Array.isArray(board) || board.length !== SOLVED_BOARD.length) return false;
  for (let i = 0; i < SOLVED_BOARD.length; i += 1) {
    if (board[i] !== SOLVED_BOARD[i]) return false;
  }
  return true;
}

function idxOf(board, tile) {
  return board.indexOf(tile);
}

function areAdjacent(a, b, size = SIZE) {
  const ar = Math.floor(a / size);
  const ac = a % size;
  const br = Math.floor(b / size);
  const bc = b % size;
  return Math.abs(ar - br) + Math.abs(ac - bc) === 1;
}

export function init() {
  const solved = isSolved(DEFAULT_BOARD);
  return {
    size: SIZE,
    board: [...DEFAULT_BOARD],
    moves: 0,
    solved,
    keyImageRevealed: solved, // "strahlender Schlüssel sichtbar"
    lockVisible: solved
  };
}

export function exportPublic(state) {
  return {
    size: state.size,
    board: [...state.board],
    moves: state.moves,
    solved: !!state.solved,
    keyImageRevealed: !!state.keyImageRevealed,
    lockVisible: !!state.lockVisible
  };
}

export function apply(state, action) {
  if (!action || !VALID_OBJECTS.has(String(action.objectId || '').trim())) {
    return fail(state, 'INVALID_OBJECT');
  }

  const next = clone(state);
  const verb = String(action?.verb || '').toLowerCase().trim();

  if (verb === 'interact' || verb === 'inspect' || verb === 'open') {
    return ok(next, {
      activeWidget: WIDGET_ID,
      [WIDGET_ID]: exportPublic(next),
    });
  }

  if (verb === 'reset') {
    const reset = init();
    return ok(reset, { solved: reset.solved, board: reset.board, lockVisible: reset.lockVisible });
  }

  if (!['move', 'slide', 'click'].includes(verb)) {
    return fail(state, 'INVALID_VERB');
  }

  // already solved -> idempotent ok
  if (next.solved) {
    return ok(next, {});
  }

  // tile can be provided as number or inferred from clicked index
  let tile = Number(action?.data?.tile);
  if (!Number.isFinite(tile)) {
    const index = Number(action?.data?.index);
    if (Number.isFinite(index) && index >= 0 && index < next.board.length) {
      tile = next.board[index];
    }
  }

  if (!Number.isFinite(tile) || tile < 1 || tile > 8) {
    return fail(state, 'INVALID_TILE');
  }

  const tileIdx = idxOf(next.board, tile);
  const emptyIdx = idxOf(next.board, 0);

  if (tileIdx < 0 || emptyIdx < 0) {
    return fail(state, 'INVALID_BOARD');
  }

  if (!areAdjacent(tileIdx, emptyIdx, next.size)) {
    return fail(state, 'ILLEGAL_MOVE');
  }

  // swap tile <-> empty
  next.board[emptyIdx] = tile;
  next.board[tileIdx] = 0;
  next.moves += 1;

  if (isSolved(next.board)) {
    next.solved = true;
    next.keyImageRevealed = true;
    next.lockVisible = true;
  }

  return ok(next, {
    board: [...next.board],
    moves: next.moves,
    solved: next.solved,
    lockVisible: next.lockVisible
  });
}
