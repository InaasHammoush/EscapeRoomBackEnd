// src/game/puzzles/index.js
// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter

import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';
import * as AlchMortarEssence from './alchMortarEssence.js';
import * as AlchKeyTransmutation from './alchKeyTransmutation.js';
import * as AlchLightBeamMirrors from './alchLightBeamMirrors.js';
import { makeResult } from './fsm.js';

export function initAll() {
  const coopInit = Coop.init();
  const lightsInit = Lights.init();
  const mortarInit = AlchMortarEssence.init();
  const transmuteInit = AlchKeyTransmutation.init();

  return {
    public: {
      coopSwitches: Coop.exportPublic(coopInit),
      lightsOut: Lights.exportPublic(lightsInit),
      alchMortarEssence: AlchMortarEssence.exportPublic(mortarInit),
      alchKeyTransmutation: AlchKeyTransmutation.exportPublic(transmuteInit),
      alchLightBeamMirrors: AlchLightBeamMirrors.exportPublic(AlchLightBeamMirrors.init()),
    },
    internal: {
      coopSwitches: coopInit,
      lightsOut: lightsInit,
      alchMortarEssence: mortarInit,
      alchKeyTransmutation: transmuteInit,
      alchLightBeamMirrors: AlchLightBeamMirrors.init(),
    },
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
export function apply(state, action) {
  const now = Date.now();

  if (!action || !action.objectId) {
    return makeResult({ state, ok: false, error: 'INVALID_ACTION' });
  }

  if (action.objectId.startsWith('switch:')) {
    return runPuzzle(state, 'coopSwitches', Coop, action, now);
  }

  if (action.objectId.startsWith('light:')) {
    return runPuzzle(state, 'lightsOut', Lights, action, now);
  }

  if (action.objectId === 'alch:mortar') {
    return runPuzzle(state, 'alchMortarEssence', AlchMortarEssence, action, now);
  }

  if (action.objectId === 'alch:transmuter') {
    return runPuzzle(state, 'alchKeyTransmutation', AlchKeyTransmutation, action, now);
  }

  if (action.objectId === 'alch:mirror-array') {
  return runPuzzle(state, 'alchLightBeamMirrors', AlchLightBeamMirrors, action, now);
}

  return makeResult({ state, ok: false, error: 'UNKNOWN_OBJECT' });
}

function runPuzzle(state, key, moduleRef, action, now) {
  const res = moduleRef.apply(state.internal[key], action, now);
  if (!res.ok) return res;

  const next = cloneState(state);
  next.internal[key] = res.nextState;
  next.public[key] = moduleRef.exportPublic(res.nextState);

  return makeResult({
    state: next,
    diff:
      res.diff && Object.keys(res.diff).length > 0
        ? res.diff
        : { [key]: next.public[key] },
    ok: true,
    error: null,
  });
}

function cloneState(s) {
  // Wichtig: erhält zusätzliche Felder wie inventory, views, etc.
  if (typeof structuredClone === 'function') {
    return structuredClone(s);
  }
  return JSON.parse(JSON.stringify(s));
}
