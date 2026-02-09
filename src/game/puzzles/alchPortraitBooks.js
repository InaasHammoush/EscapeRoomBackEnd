// src/game/puzzles/alchemist/alchPortraitBooks.js
import { makeResult } from '../fsm.js';

/**
 * B-S0/B-Side-Prep:
 * Portrait mit hervorgehobenen Büchern.
 * Korrekte Reihenfolge: SALZ -> SCHWEFEL -> QUECKSILBER -> VERFALL
 * Reward (einmalig): FEATHER + GOLD_NUGGET
 */

const REQUIRED = ['SALZ', 'SCHWEFEL', 'QUECKSILBER', 'VERFALL'];

const BOOK_ALIASES = {
  SALZ: 'SALZ',
  SALT: 'SALZ',

  SCHWEFEL: 'SCHWEFEL',
  SULFUR: 'SCHWEFEL',
  SULPHUR: 'SCHWEFEL',

  QUECKSILBER: 'QUECKSILBER',
  MERCURY: 'QUECKSILBER',
  MERKUR: 'QUECKSILBER',

  VERFALL: 'VERFALL',
  DECAY: 'VERFALL',
};

function normalizeBook(input) {
  if (!input) return null;
  const k = String(input).trim().toUpperCase();
  return BOOK_ALIASES[k] || null;
}

function cloneState(s) {
  return {
    requiredOrder: [...s.requiredOrder],
    entered: [...s.entered],
    solved: !!s.solved,
    mistakes: Number(s.mistakes || 0),
    output: {
      featherReady: !!s.output?.featherReady,
      goldNuggetReady: !!s.output?.goldNuggetReady,
    },
  };
}

export function init() {
  return {
    requiredOrder: [...REQUIRED],
    entered: [],
    solved: false,
    mistakes: 0,
    output: {
      featherReady: false,
      goldNuggetReady: false,
    },
  };
}

export function apply(state, action, now = Date.now()) {
  const verb = action?.verb;
  const next = cloneState(state);

  if (verb === 'reset') {
    next.entered = [];
    return makeResult({
      state: next,
      diff: {
        puzzle: 'alchPortraitBooks',
        action: 'reset',
        progress: 0,
      },
    });
  }

  if (verb !== 'press_book') {
    return makeResult({
      state,
      ok: false,
      error: 'UNSUPPORTED_VERB',
    });
  }

  if (next.solved) {
    return makeResult({
      state: next,
      diff: {
        puzzle: 'alchPortraitBooks',
        alreadySolved: true,
      },
    });
  }

  // Input kann in data.book oder im objectId-Suffix liegen (z. B. alch:portrait_books:salz)
  const fromData = action?.data?.book;
  const fromObjectId = action?.objectId?.split(':')[2];
  const book = normalizeBook(fromData ?? fromObjectId);

  if (!book) {
    return makeResult({
      state,
      ok: false,
      error: 'INVALID_BOOK',
    });
  }

  const expected = next.requiredOrder[next.entered.length];

  if (book !== expected) {
    next.entered = [];
    next.mistakes += 1;

    return makeResult({
      state: next,
      diff: {
        puzzle: 'alchPortraitBooks',
        wrong: true,
        progress: 0,
        mistakes: next.mistakes,
        ts: now,
      },
    });
  }

  next.entered.push(book);

  if (next.entered.length === next.requiredOrder.length) {
    next.solved = true;
    next.output.featherReady = true;
    next.output.goldNuggetReady = true;

    return makeResult({
      state: next,
      diff: {
        puzzle: 'alchPortraitBooks',
        solved: true,
        progress: next.entered.length,
        output: { ...next.output },
      },
    });
  }

  return makeResult({
    state: next,
    diff: {
      puzzle: 'alchPortraitBooks',
      progress: next.entered.length,
      solved: false,
    },
  });
}

export function exportPublic(state) {
  return {
    solved: !!state.solved,
    progress: state.entered?.length || 0,
    length: state.requiredOrder?.length || 0,
    mistakes: Number(state.mistakes || 0),
    // requiredOrder bewusst NICHT exportieren (sonst spoilert der Server)
    output: {
      featherReady: !!state.output?.featherReady,
      goldNuggetReady: !!state.output?.goldNuggetReady,
    },
  };
}

export function isSolved(state) {
  return !!state?.solved;
}
