// src/game/puzzles/alchWestCodeboxJigsaw.js
// Westwand: Codebox + Jigsaw
// - Code 2848693 entsperrt die Box
// - Danach Jigsaw (3x3, 0 = Leerfeld)
// - Beim Lösen: output.blueRoseImageReady = true

import { makeResult } from './fsm.js';

const PUZZLE_KEY = 'alchWestCodeboxJigsaw';
const VALID_OBJECTS = new Set(['alch:west-codebox', 'alch:west-jigsaw']);

const EXPECTED_CODE = '2848693';
const SIZE = 3;
const SOLVED_LAYOUT = [1, 2, 3, 4, 5, 6, 7, 8, 0];
const START_LAYOUT = [2, 8, 3, 1, 6, 4, 7, 0, 5]; // bewusst unsortiert

export function init() {
  return {
    code: {
      unlocked: false,
      expected: EXPECTED_CODE,
      attempts: 0,
      lastCodeOk: null, // true/false/null
    },
    jigsaw: {
      size: SIZE,
      tiles: [...START_LAYOUT],
      solved: false,
    },
    output: {
      blueRoseImageReady: false,
    },
    solved: false,
  };
}

export function apply(state, action) {
  if (!action || !VALID_OBJECTS.has(action.objectId)) {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = normalizeVerb(action.verb);
  const next = clone(state);

  // Widget/UI öffnen
  if (verb === 'interact' || verb === 'inspect' || verb === 'open') {
    return ok(next);
  }

  switch (verb) {
    case 'enter_code': {
      const code = String(action?.data?.code ?? '').trim();
      next.code.attempts += 1;

      if (code === next.code.expected) {
        next.code.unlocked = true;
        next.code.lastCodeOk = true;
      } else {
        next.code.lastCodeOk = false;
      }
      return ok(next);
    }

    case 'set_layout': {
      if (!next.code.unlocked) return fail(state, 'BOX_LOCKED');

      const tiles = action?.data?.tiles;
      if (!isValidLayout(tiles, next.jigsaw.size)) {
        return fail(state, 'INVALID_LAYOUT');
      }

      next.jigsaw.tiles = [...tiles];
      if (isSolvedLayout(next.jigsaw.tiles)) {
        next.jigsaw.solved = true;
        next.output.blueRoseImageReady = true;
        next.solved = true;
      }
      return ok(next);
    }

    // Optional: falls FE lieber "swap" statt vollständiges Layout sendet
    case 'jigsaw_swap': {
      if (!next.code.unlocked) return fail(state, 'BOX_LOCKED');

      const a = Number(action?.data?.a);
      const b = Number(action?.data?.b);
      const max = next.jigsaw.tiles.length - 1;
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > max || b > max) {
        return fail(state, 'INVALID_SWAP_INDEX');
      }

      const arr = next.jigsaw.tiles;
      [arr[a], arr[b]] = [arr[b], arr[a]];

      if (isSolvedLayout(arr)) {
        next.jigsaw.solved = true;
        next.output.blueRoseImageReady = true;
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
    code: {
      unlocked: !!state.code.unlocked,
      attempts: Number(state.code.attempts || 0),
      lastCodeOk: state.code.lastCodeOk,
    },
    jigsaw: {
      size: state.jigsaw.size,
      tiles: [...state.jigsaw.tiles], // FE rendert damit
      solved: !!state.jigsaw.solved,
    },
    output: {
      blueRoseImageReady: !!state.output.blueRoseImageReady,
    },
    solved: !!state.solved,
    activeWidget: true,
    nextActions: deriveNextActions(state),
  };
}

export function isSolved(state) {
  return !!state.solved;
}

// ------------------------------------------------------------

function deriveNextActions(state) {
  if (!state.code.unlocked) return ['enter_code(2848693)'];
  if (!state.jigsaw.solved) return ['set_layout([...]) | jigsaw_swap(a,b)'];
  return [];
}

function isValidLayout(tiles, size) {
  if (!Array.isArray(tiles)) return false;
  if (tiles.length !== size * size) return false;

  const need = new Set([...Array(size * size).keys()]); // 0..8
  for (const x of tiles) {
    if (!Number.isInteger(x) || !need.has(x)) return false;
    need.delete(x);
  }
  return need.size === 0;
}

function isSolvedLayout(tiles) {
  if (!Array.isArray(tiles) || tiles.length !== SOLVED_LAYOUT.length) return false;
  for (let i = 0; i < SOLVED_LAYOUT.length; i++) {
    if (tiles[i] !== SOLVED_LAYOUT[i]) return false;
  }
  return true;
}

function normalizeVerb(v) {
  return String(v ?? '').trim().toLowerCase();
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
    code: { ...s.code },
    jigsaw: {
      size: s.jigsaw.size,
      tiles: [...s.jigsaw.tiles],
      solved: !!s.jigsaw.solved,
    },
    output: { ...s.output },
    solved: !!s.solved,
  };
}
