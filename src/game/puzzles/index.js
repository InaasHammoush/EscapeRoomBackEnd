// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter
import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';
import { makeResult } from './fsm.js';

export function initAll() {
  return {
    public: {
      coopSwitches: Coop.exportPublic(Coop.init()),  // placeholder; wir speichern parallel
      lightsOut:    Lights.exportPublic(Lights.init())
    },
    internal: {
      coopSwitches: Coop.init(),
      lightsOut:    Lights.init()
    }
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
export function apply(state, action) {
  const now = Date.now();

  // Dispatch über objectId-Präfix
  if (action.objectId?.startsWith('switch:')) {
    const res = Coop.apply(state.internal.coopSwitches, action, now);
    if (!res.ok) return res;
    const next = cloneState(state);
    next.internal.coopSwitches = res.nextState;
    next.public.coopSwitches = Coop.exportPublic(res.nextState);
    return makeResult({ state: next, diff: res.diff });
  }

  if (action.objectId?.startsWith('light:')) {
    const res = Lights.apply(state.internal.lightsOut, action, now);
    if (!res.ok) return res;
    const next = cloneState(state);
    next.internal.lightsOut = res.nextState;
    next.public.lightsOut = Lights.exportPublic(res.nextState);
    return makeResult({ state: next, diff: res.diff });
  }

  return makeResult({ state, ok: false, error: 'UNKNOWN_OBJECT' });
}

function cloneState(s) {
  // flach genug für Prototyp
  return {
    public: { ...s.public },
    internal: {
      coopSwitches: { ...s.internal.coopSwitches },
      lightsOut: {
        grid: s.internal.lightsOut.grid.map(r => r.slice()),
        solved: s.internal.lightsOut.solved
      }
    }
  };
}
