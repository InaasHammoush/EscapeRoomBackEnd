// src/game/puzzles/index.js
// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter

import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';
import * as AlchLightBeamGrid from './alchLightBeamGrid.js';
import * as AlchMortarEssence from './alchMortarEssence.js';
import * as AlchKeyTransmutation from './alchKeyTransmutation.js';
import * as TicTacToe from './TicTacToe.js';
import * as AlchHintB1 from './hints/alchHintB1.js';
import * as AlchHintB2 from './hints/alchHintB2.js';
import * as AlchPortraitBooks from './alchemist/alchPortraitBooks.js';
import * as AlchFlaskTransfer from './alchemist/alchFlaskTransfer.js';
import { makeResult } from './fsm.js';

export function initAll() {
  const coop = Coop.init();
  const lights = Lights.init();
  const grid = AlchLightBeamGrid.init();
  const mortar = AlchMortarEssence.init();
  const transmuter = AlchKeyTransmutation.init();

  const hintB1 = AlchHintB1.init();
  const hintB2 = AlchHintB2.init();
  const portrait = AlchPortraitBooks.init();
  const flasks = AlchFlaskTransfer.init();

  return {
    public: {
      coopSwitches: Coop.exportPublic(coop),
      lightsOut: Lights.exportPublic(lights),
      alchLightBeamGrid: AlchLightBeamGrid.exportPublic(grid),
      alchMortarEssence: AlchMortarEssence.exportPublic(mortar),
      alchKeyTransmutation: AlchKeyTransmutation.exportPublic(transmuter),

      alchHintB1: AlchHintB1.exportPublic(hintB1),
      alchHintB2: AlchHintB2.exportPublic(hintB2),
      alchPortraitBooks: AlchPortraitBooks.exportPublic(portrait),
      alchFlaskTransfer: AlchFlaskTransfer.exportPublic(flasks),

      scroll_grid: {
        board: Array(9).fill(null),
        score: { player: 0, ghost: 0, draws: 0 },
        round: 1,
        message: 'Care for a game, mortal?',
        solved: false,
        completed: false,
      },
    },

    internal: {
      coopSwitches: coop,
      lightsOut: lights,
      alchLightBeamGrid: grid,
      alchMortarEssence: mortar,
      alchKeyTransmutation: transmuter,

      alchHintB1: hintB1,
      alchHintB2: hintB2,
      alchPortraitBooks: portrait,
      alchFlaskTransfer: flasks,

      processedActions: new Set(),
    },
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
export function apply(state, action) {
  const now = Date.now();
  const defaults = initAll();

  // Hardening: vollständige Guard-Logik statt nur public-Check
  if (!state || typeof state !== 'object' || !state.public || !state.internal) {
    state = defaults;
  } else {
    state.public ??= {};
    state.internal ??= {};

    // fehlende public keys nachziehen
    for (const [k, v] of Object.entries(defaults.public)) {
      if (state.public[k] === undefined) {
        state.public[k] = deepCloneState(v);
      }
    }

    // fehlende internal keys nachziehen
    for (const [k, v] of Object.entries(defaults.internal)) {
      if (state.internal[k] === undefined) {
        if (k === 'processedActions') {
          state.internal[k] = new Set(v instanceof Set ? [...v] : []);
        } else {
          state.internal[k] = deepCloneState(v);
        }
      }
    }

    // processedActions hart absichern
    if (!(state.internal.processedActions instanceof Set)) {
      state.internal.processedActions = new Set(state.internal.processedActions || []);
    }
  }

  // Widget öffnen (Frontend-Hook)
  if (action.objectId === 'test_box_01') {
    return {
      ok: true,
      nextState: state,
      diff: {
        test_box_01: { showWidget: 'scroll_grid' },
      },
    };
  }

  // TicTacToe
  if (action.objectId === 'scroll_grid' && action.verb === 'PLACE_MARK') {
    const res = TicTacToe.apply(state, action);
    if (!res) return { ok: false, error: 'TIC_TAC_TOE_ERROR' };
    return res;
  }

  // Basis-Puzzle
  if (action.objectId?.startsWith('switch:')) {
    return runPuzzle(state, 'coopSwitches', Coop, action, now);
  }

  if (action.objectId?.startsWith('light:')) {
    return runPuzzle(state, 'lightsOut', Lights, action, now);
  }

  // Alchemie
  if (action.objectId === 'alch:mirror-grid') {
    return runPuzzle(state, 'alchLightBeamGrid', AlchLightBeamGrid, action, now);
  }

  if (action.objectId === 'alch:mortar') {
    return runPuzzle(state, 'alchMortarEssence', AlchMortarEssence, action, now);
  }

  // ✅ Transmuter reaktiviert
  if (action.objectId === 'alch:transmuter') {
    return runPuzzle(state, 'alchKeyTransmutation', AlchKeyTransmutation, action, now);
  }

  if (action.objectId === 'alch:hint:b1') {
    return runPuzzle(state, 'alchHintB1', AlchHintB1, action, now);
  }

  if (action.objectId === 'alch:hint:b2') {
    return runPuzzle(state, 'alchHintB2', AlchHintB2, action, now);
  }

  // Vereinheitlicht über runPuzzle
  if (action.objectId === 'alch:portrait_books' || action.objectId?.startsWith('alch:portrait_books:')) {
    return runPuzzle(state, 'alchPortraitBooks', AlchPortraitBooks, action, now);
  }

  if (action.objectId === 'alch:flasks' || action.objectId?.startsWith('alch:flasks:')) {
    return runPuzzle(state, 'alchFlaskTransfer', AlchFlaskTransfer, action, now);
  }

  return { ok: false, error: 'UNKNOWN_OBJECT', nextState: state };
}

function runPuzzle(state, key, moduleRef, action, now) {
  const localState = state.internal?.[key];
  if (!localState) {
    return makeResult({ state, ok: false, error: `MISSING_PUZZLE_STATE:${key}` });
  }

  const res = moduleRef.apply(localState, action, now);
  if (!res.ok) return res;

  const next = cloneState(state);
  next.internal[key] = res.nextState;
  next.public[key] = moduleRef.exportPublic(res.nextState);

  const diff =
    res.diff && Object.keys(res.diff).length > 0
      ? res.diff
      : { [key]: next.public[key] };

  return makeResult({ state: next, diff });
}

function cloneState(s) {
  return {
    public: deepCloneState(s.public),
    internal: {
      ...s.internal,
      processedActions: new Set(s.internal?.processedActions || []),
    },
  };
}

function deepCloneState(s) {
  if (typeof structuredClone === 'function') return structuredClone(s);
  return JSON.parse(JSON.stringify(s));
}
