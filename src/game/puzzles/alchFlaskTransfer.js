// src/game/puzzles/alchemist/alchFlaskTransfer.js
import { makeResult } from '../fsm.js';

/**
 * B-S1:
 * Flaschen in korrekter Reihenfolge "umfüllen":
 * RUBIN -> CITRIN -> SMARAGD -> AMETHYST
 *
 * Bei Fehler: Sequence reset + 3s Cooldown
 * Reward (einmalig): COAL_BLOCK, MOONWORT, MATCHES, GREEN_LIQUID
 */

const REQUIRED = ['RUBIN', 'CITRIN', 'SMARAGD', 'AMETHYST'];

const FLASK_ALIASES = {
  RUBIN: 'RUBIN',
  RUBY: 'RUBIN',

  CITRIN: 'CITRIN',
  CITRINE: 'CITRIN',

  SMARAGD: 'SMARAGD',
  EMERALD: 'SMARAGD',

  AMETHYST: 'AMETHYST',
};

function normalizeFlask(input) {
  if (!input) return null;
  const k = String(input).trim().toUpperCase();
  return FLASK_ALIASES[k] || null;
}

function cloneState(s) {
  return {
    expectedOrder: [...s.expectedOrder],
    sequence: [...s.sequence],
    solved: !!s.solved,
    failures: Number(s.failures || 0),
    cooldownUntil: Number(s.cooldownUntil || 0),
    output: {
      coalBlockReady: !!s.output?.coalBlockReady,
      moonwortReady: !!s.output?.moonwortReady,
      matchesReady: !!s.output?.matchesReady,
      greenLiquidReady: !!s.output?.greenLiquidReady,
    },
  };
}

export function init() {
  return {
    expectedOrder: [...REQUIRED],
    sequence: [],
    solved: false,
    failures: 0,
    cooldownUntil: 0,
    output: {
      coalBlockReady: false,
      moonwortReady: false,
      matchesReady: false,
      greenLiquidReady: false,
    },
  };
}

export function apply(state, action, now = Date.now()) {
  const verb = action?.verb;
  const next = cloneState(state);

  if (verb === 'reset') {
    next.sequence = [];
    next.cooldownUntil = 0;
    return makeResult({
      state: next,
      diff: {
        puzzle: 'alchFlaskTransfer',
        action: 'reset',
        progress: 0,
      },
    });
  }

  if (verb !== 'pour') {
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
        puzzle: 'alchFlaskTransfer',
        alreadySolved: true,
      },
    });
  }

  if (now < next.cooldownUntil) {
    return makeResult({
      state,
      ok: false,
      error: 'COOLDOWN_ACTIVE',
      diff: { retryAfterMs: next.cooldownUntil - now },
    });
  }

  // input: data.flask | data.color | objectId-Suffix
  const fromData = action?.data?.flask ?? action?.data?.color;
  const fromObjectId = action?.objectId?.split(':')[2]; // alch:flasks:rubin
  const flask = normalizeFlask(fromData ?? fromObjectId);

  if (!flask) {
    return makeResult({
      state,
      ok: false,
      error: 'INVALID_FLASK',
    });
  }

  const expected = next.expectedOrder[next.sequence.length];

  if (flask !== expected) {
    next.sequence = [];
    next.failures += 1;
    next.cooldownUntil = now + 3000;

    return makeResult({
      state: next,
      diff: {
        puzzle: 'alchFlaskTransfer',
        wrong: true,
        progress: 0,
        failures: next.failures,
        cooldownUntil: next.cooldownUntil,
      },
    });
  }

  next.sequence.push(flask);

  if (next.sequence.length === next.expectedOrder.length) {
    next.solved = true;
    next.sequence = [];
    next.output.coalBlockReady = true;
    next.output.moonwortReady = true;
    next.output.matchesReady = true;
    next.output.greenLiquidReady = true;

    return makeResult({
      state: next,
      diff: {
        puzzle: 'alchFlaskTransfer',
        solved: true,
        output: { ...next.output },
      },
    });
  }

  return makeResult({
    state: next,
    diff: {
      puzzle: 'alchFlaskTransfer',
      progress: next.sequence.length,
      solved: false,
    },
  });
}

export function exportPublic(state) {
  return {
    solved: !!state.solved,
    progress: state.sequence?.length || 0,
    length: state.expectedOrder?.length || 0,
    failures: Number(state.failures || 0),
    cooldownUntil: Number(state.cooldownUntil || 0),
    output: {
      coalBlockReady: !!state.output?.coalBlockReady,
      moonwortReady: !!state.output?.moonwortReady,
      matchesReady: !!state.output?.matchesReady,
      greenLiquidReady: !!state.output?.greenLiquidReady,
    },
  };
}

export function isSolved(state) {
  return !!state?.solved;
}
