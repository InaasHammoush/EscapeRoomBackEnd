// src/game/puzzles/index.js
// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter
import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';
import * as AlchLightBeamGrid from './alchLightBeamGrid.js';
import * as AlchMortarEssence from './alchMortarEssence.js';
import * as TicTacToe from './TicTacToe.js';
import { makeResult } from './fsm.js';

export function initAll() {
  const coop = Coop.init();
  const lights = Lights.init();
  const grid = AlchLightBeamGrid.init();
  const mortar = AlchMortarEssence.init();

  return {
    public: {
      coopSwitches: Coop.exportPublic(coop),
      lightsOut: Lights.exportPublic(lights),
      alchLightBeamGrid: AlchLightBeamGrid.exportPublic(grid),
      alchMortarEssence: AlchMortarEssence.exportPublic(mortar),
      scroll_grid: {
        board: Array(9).fill(null),
        score: { player: 0, ghost: 0, draws: 0 },
        round: 1,
        message: "Care for a game, mortal?",
        solved: false,
        completed: false 
      }
    },
    internal: {
      coopSwitches: coop,
      lightsOut: lights,
      alchLightBeamGrid: grid,
      alchMortarEssence: mortar,
      processedActions: new Set(), 
    },
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
// server/src/puzzles/index.js

export function apply(state, action) {
  const now = Date.now();

  // 1. EMERGENCY GUARD: If state or public is missing, use defaults
  if (!state || !state.public) {
    state = initAll();
  }

  // 2. FILL MISSING KEYS: Ensure scroll_grid exists before passing it to the sub-module
  if (!state.public.scroll_grid) {
    state.public.scroll_grid = initAll().public.scroll_grid;
  }
  // 3. Logic for opening the widget
  if (action.objectId === 'test_box_01') {
    return {
      ok: true,
      nextState: state, // Since we just trigger a UI change, state remains same
      diff: {
        test_box_01: { showWidget: "scroll_grid" }
      }
    };
  }

  // 4. TicTacToe logic
  if (action.objectId === 'scroll_grid') {
    if (action.verb === 'PLACE_MARK') {
      const res = TicTacToe.apply(state, action);
      if (!res) return { ok: false, error: 'TIC_TAC_TOE_ERROR' };
      return res;
    }
  }

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

  if (action.objectId === 'alch:mortar') {
    return runPuzzle(state, 'alchMortarEssence', AlchMortarEssence, action, now);
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
  
  // 5. Fallback
  return { ok: false, error: 'UNKNOWN_OBJECT', nextState: state };
}

function cloneState(s) {
  return {
    // Deep clone the nested public objects
    public: JSON.parse(JSON.stringify(s.public)), 
    
    // Internal usually contains Sets or Maps which JSON.stringify breaks,
    // so we handle them specifically:
    internal: {
      ...s.internal,
      processedActions: new Set(s.internal.processedActions || [])
    }
  };
}
