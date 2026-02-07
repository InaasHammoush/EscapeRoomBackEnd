// src/game/puzzles/index.js
import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';
import * as AlchLightBeamGrid from './alchLightBeamGrid.js';
import { makeResult } from './fsm.js';

export function initAll() {
  const coop = Coop.init();
  const lights = Lights.init();
  const grid = AlchLightBeamGrid.init();

  return {
    public: {
      coopSwitches: Coop.exportPublic(coop),
      lightsOut: Lights.exportPublic(lights),
      alchLightBeamGrid: AlchLightBeamGrid.exportPublic(grid),
    },
    internal: {
      coopSwitches: coop,
      lightsOut: lights,
      alchLightBeamGrid: grid,
    },
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
export function apply(state, action) {
  const now = Date.now();

  if (action.objectId?.startsWith('switch:')) {
    return runPuzzle(state, 'coopSwitches', Coop, action, now);
  }

  if (action.objectId?.startsWith('light:')) {
    return runPuzzle(state, 'lightsOut', Lights, action, now);
  }

  // V2 only
  if (action.objectId === 'alch:mirror-grid') {
    return runPuzzle(state, 'alchLightBeamGrid', AlchLightBeamGrid, action, now);
  }

  return makeResult({ state, ok: false, error: 'UNKNOWN_OBJECT' });
}

function runPuzzle(state, key, module, action, now) {
  const localState = state.internal[key];
  if (!localState) {
    return makeResult({ state, ok: false, error: `MISSING_PUZZLE_STATE:${key}` });
  }

  const res = module.apply(localState, action, now);
  if (!res.ok) return res;

  const next = cloneState(state);
  next.internal[key] = res.nextState;
  next.public[key] = module.exportPublic(res.nextState);

  const diff =
    res.diff && Object.keys(res.diff).length > 0
      ? res.diff
      : { [key]: next.public[key] };

  return makeResult({ state: next, diff });
}

function cloneState(s) {
  if (typeof structuredClone === 'function') return structuredClone(s);
  return JSON.parse(JSON.stringify(s));
}
