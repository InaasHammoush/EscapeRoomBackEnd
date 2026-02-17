import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'alchPortraitBooks';
const VALID_OBJECTS = new Set([
  'alch:portrait-books',
  'alch:portrait',
  'alch:portrait-lady',
]);

const HINT_WORDS = Object.freeze(['SALZ', 'SCHWEFEL', 'QUECKSILBER', 'VERFALL']);

export function init() {
  return {
    revealed: false,
    output: {
      featherReady: false,
      goldNuggetReady: false,
    },
    solved: false,
    revealedAt: null,
  };
}

export function apply(state, action) {
  if (!action || !VALID_OBJECTS.has(action.objectId)) {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = String(action.verb || '').toLowerCase().trim();
  const next = clone(state);

  switch (verb) {
    case 'interact':
    case 'inspect':
    case 'click':
    case 'reveal': {
      // einmaliges "Loot hinter Portrait"
      if (!next.revealed) {
        next.revealed = true;
        next.revealedAt = Date.now();
        next.output.featherReady = true;
        next.output.goldNuggetReady = true;
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
    solved: !!state.solved,
    revealed: !!state.revealed,
    hint: {
      type: 'BOOK_ORDER_HINT',
      words: [...HINT_WORDS],
      text: 'Die markierten Bücher zeigen die Reihenfolge: Salz – Schwefel – Quecksilber – Verfall.',
    },
    output: {
      featherReady: !!state.output.featherReady,
      goldNuggetReady: !!state.output.goldNuggetReady,
    },
    nextActions: state.revealed ? [] : ['interact'],
    message: state.revealed
      ? 'Hinter dem Portrait wurden Feder und Goldklumpen gefunden.'
      : 'Untersuche das Portrait der Dame.',
  };
}

export function isSolved(state) {
  return !!state.solved;
}

function ok(nextState) {
  return makeResult({
    state: nextState,
    diff: { [PUZZLE_KEY]: exportPublic(nextState) },
    ok: true,
    error: null,
  });
}

function fail(state, error) {
  return makeResult({
    state,
    diff: {},
    ok: false,
    error,
  });
}

function clone(s) {
  return {
    revealed: !!s.revealed,
    output: {
      featherReady: !!s.output?.featherReady,
      goldNuggetReady: !!s.output?.goldNuggetReady,
    },
    solved: !!s.solved,
    revealedAt: s.revealedAt ?? null,
  };
}
