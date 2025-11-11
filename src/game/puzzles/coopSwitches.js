// Ein simples Koop-Puzzle: Zwei Schalter (A,B) müssen nahezu gleichzeitig getoggelt werden - erstmal 
// nur als Beispiel für ein koop-rätsel

import { makeResult } from './fsm.js';

export function init() {
  return {
    a: false,
    b: false,
    lastA: 0,
    lastB: 0,
    windowMs: 300,   // Zeitfenster für "gleichzeitig"
    solved: false
  };
}

export function apply(state, action, now = Date.now()) {
  if (state.solved) return makeResult({ state, diff: {} });

  if (action.objectId === 'switch:A' && action.verb === 'toggle') {
    const next = { ...state, a: !state.a, lastA: now };
    const both = next.a && next.b && (Math.abs(next.lastA - next.lastB) <= next.windowMs);
    next.solved = next.solved || both;
    return makeResult({
      state: next,
      diff: { coopSwitches: exportPublic(next) }
    });
  }

  if (action.objectId === 'switch:B' && action.verb === 'toggle') {
    const next = { ...state, b: !state.b, lastB: now };
    const both = next.a && next.b && (Math.abs(next.lastA - next.lastB) <= next.windowMs);
    next.solved = next.solved || both;
    return makeResult({
      state: next,
      diff: { coopSwitches: exportPublic(next) }
    });
  }

  return makeResult({ state, ok: false, error: 'INVALID_ACTION' });
}

export function exportPublic(state) {
  // Timestamps ausblenden
  const { a, b, solved } = state;
  return { a, b, solved };
}

export function isSolved(state) {
  return !!state.solved;
}
