import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'alchFlaskTransfer';
const OBJECT_IDS = new Set([
  'alch:flask-transfer',
  'alch:flasks',
  'alch:flask-shelf',
]);

const BOTTLE_ORDER = Object.freeze(['RUBY', 'CITRINE', 'EMERALD', 'AMETHYST']);
const TARGETS = Object.freeze({
  RUBY: 'RED',
  CITRINE: 'YELLOW',
  EMERALD: 'GREEN',
  AMETHYST: 'PURPLE',
});

const CAPACITY = 5;
const BASE_LAYERS_PER_BOTTLE = 4;

const INITIAL_BOTTLES = Object.freeze({
  RUBY: ['GREEN', 'RED', 'PURPLE', 'YELLOW'],
  CITRINE: ['RED', 'YELLOW', 'GREEN', 'PURPLE'],
  EMERALD: ['PURPLE', 'GREEN', 'YELLOW', 'RED'],
  AMETHYST: ['YELLOW', 'PURPLE', 'RED', 'GREEN'],
});

export function init() {
  return {
    phase: 'MIXED',
    bottleOrder: [...BOTTLE_ORDER],
    capacity: CAPACITY,
    targets: { ...TARGETS },
    bottles: cloneBottles(INITIAL_BOTTLES),
    moves: 0,
    output: {
      coalBlockReady: false,
      moonwortReady: false,
      matchesReady: false,
      greenLiquidReady: false,
    },
    solved: false,
  };
}

export function apply(state, action) {
  if (!action || !OBJECT_IDS.has(action.objectId)) {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = String(action.verb || '').toLowerCase().trim();
  const next = clone(state);

  switch (verb) {
    case 'interact':
      return ok(next);

    case 'pour': {
      const from = normalizeBottle(action?.data?.from ?? action?.data?.source);
      const to = normalizeBottle(action?.data?.to ?? action?.data?.target);

      if (!from || !to) return fail(state, 'INVALID_BOTTLE');
      if (from === to) return fail(state, 'SAME_BOTTLE');
      if (next.solved) return fail(state, 'PUZZLE_ALREADY_SOLVED');

      const src = next.bottles[from];
      const dst = next.bottles[to];

      if (!src || !dst) return fail(state, 'INVALID_BOTTLE');
      if (src.length === 0) return fail(state, 'SOURCE_EMPTY');
      if (dst.length >= next.capacity) return fail(state, 'TARGET_FULL');

      const top = src[src.length - 1];
      src.pop();
      dst.push(top);
      next.moves += 1;

      evaluate(next);
      return ok(next);
    }

    case 'reset':
      return ok(init());

    default:
      return fail(state, 'INVALID_VERB');
  }
}

export function exportPublic(state) {
  const bottles = {};
  for (const id of state.bottleOrder) {
    const layers = state.bottles[id] || [];
    bottles[id] = {
      gem: id,
      targetColor: state.targets[id],
      capacity: state.capacity,
      fill: layers.length,
      layers: [...layers], // bottom -> top
      topColor: layers.length ? layers[layers.length - 1] : null,
    };
  }

  return {
    phase: state.phase,
    solved: !!state.solved,
    moves: Number(state.moves || 0),
    bottleOrder: [...state.bottleOrder],
    bottles,
    output: {
      coalBlockReady: !!state.output.coalBlockReady,
      moonwortReady: !!state.output.moonwortReady,
      matchesReady: !!state.output.matchesReady,
      greenLiquidReady: !!state.output.greenLiquidReady,
    },
    nextActions: state.solved ? [] : ['pour(from,to)'],
    message: state.solved
      ? 'Die Flüssigkeiten sind korrekt getrennt. Die Klappen öffnen sich.'
      : 'Trenne die gemischten Schichten, bis jede Flasche nur ihre Zielfarbe enthält.',
    rules: {
      pourUnit: 'single-layer',
      requireMatchingTopColor: false,
      objective: 'RUBY=RED, CITRINE=YELLOW, EMERALD=GREEN, AMETHYST=PURPLE (je 4 Schichten)',
    },
  };
}

export function isSolved(state) {
  return !!state.solved;
}

function evaluate(state) {
  const solved = state.bottleOrder.every((id) => {
    const layers = state.bottles[id] || [];
    if (layers.length !== BASE_LAYERS_PER_BOTTLE) return false;
    const target = state.targets[id];
    return layers.every((c) => c === target);
  });

  state.solved = solved;
  state.phase = solved ? 'SOLVED' : (state.moves > 0 ? 'IN_PROGRESS' : 'MIXED');

  if (solved) {
    state.output.coalBlockReady = true;
    state.output.moonwortReady = true;
    state.output.matchesReady = true;
    state.output.greenLiquidReady = true;
  }
}

function normalizeBottle(value) {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  if (BOTTLE_ORDER.includes(v)) return v;

  if (v === 'R' || v === '0') return 'RUBY';
  if (v === 'C' || v === '1') return 'CITRINE';
  if (v === 'E' || v === '2') return 'EMERALD';
  if (v === 'A' || v === '3') return 'AMETHYST';
  return null;
}

function cloneBottles(bottles) {
  const out = {};
  for (const k of Object.keys(bottles)) {
    out[k] = [...bottles[k]];
  }
  return out;
}

function clone(state) {
  return {
    phase: state.phase,
    bottleOrder: [...(state.bottleOrder || BOTTLE_ORDER)],
    capacity: Number(state.capacity || CAPACITY),
    targets: { ...(state.targets || TARGETS) },
    bottles: cloneBottles(state.bottles || INITIAL_BOTTLES),
    moves: Number(state.moves || 0),
    output: {
      coalBlockReady: !!state.output?.coalBlockReady,
      moonwortReady: !!state.output?.moonwortReady,
      matchesReady: !!state.output?.matchesReady,
      greenLiquidReady: !!state.output?.greenLiquidReady,
    },
    solved: !!state.solved,
  };
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
