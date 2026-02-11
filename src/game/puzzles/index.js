// src/game/puzzles/index.js
// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter
import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';
import * as AlchLightBeamGrid from './alchLightBeamGrid.js';
import * as AlchMortarEssence from './alchMortarEssence.js';
import * as TicTacToe from './wizard_library/TicTacToe.js';
import * as Bookshelf from './wizard_library/Bookshelf.js';
import * as CandlePuzzle from './wizard_library/CandlePuzzle.js';
import * as WizardTransformationTable from './wizard_library/WizTransformationPuzzle.js';
import * as DoorSeal from './DoorSeal.js';
import { makeResult } from './fsm.js';

export function initAll() {
  const coop = Coop.init();
  const lights = Lights.init();
  const grid = AlchLightBeamGrid.init();
  const mortar = AlchMortarEssence.init();
  const tictactoe = TicTacToe.init();
  const bookshelf = Bookshelf.init();
  const candle = CandlePuzzle.init();
  const wizTable = WizardTransformationTable.init();
  const doorSeal = DoorSeal.init();

  return {
    public: {
      coopSwitches: Coop.exportPublic(coop),
      lightsOut: Lights.exportPublic(lights),
      alchLightBeamGrid: AlchLightBeamGrid.exportPublic(grid),
      alchMortarEssence: AlchMortarEssence.exportPublic(mortar),
      scroll_grid: TicTacToe.exportPublic(tictactoe),
      bookshelf_puzzle: Bookshelf.exportPublic(bookshelf),
      candle_puzzle: CandlePuzzle.exportPublic(candle),
      wizard_transformation_table: WizardTransformationTable.exportPublic(wizTable),
      door_seal: DoorSeal.exportPublic(doorSeal),
    },
    internal: {
      coopSwitches: coop,
      lightsOut: lights,
      alchLightBeamGrid: grid,
      alchMortarEssence: mortar,
      scroll_grid: tictactoe,
      bookshelf_puzzle: bookshelf,
      candle_puzzle: candle,
      wizard_transformation_table: wizTable,
      door_seal: doorSeal,

      processedActions: new Set(), 
    }
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
// server/src/puzzles/index.js

export function apply(state, action) {
  const now = Date.now();

  // EMERGENCY GUARD: If state or public is missing, use defaults
  if (!state || !state.public) {
    state = initAll();
  }

  // WIDGET VISIBILITY HANDLERS (Simple UI toggles can stay here or move to a separate UI manager)
  if (action.objectId === 'test_box_01') {
    return { ok: true, nextState: state, diff: { test_box_01: { showWidget: "scroll_grid" } } };
  }
  if (action.objectId === 'bookshelf_01') {
    return { ok: true, nextState: state, diff: { bookshelf_01: { showWidget: "bookshelf_puzzle" } } };
  }
  if (action.objectId === 'candle_puzzle_trigger') { 
    return { ok: true, nextState: state, diff: { candle_puzzle_trigger: { showWidget: "candle_puzzle" } } };
  }

  /// 3. PUZZLE LOGIC ROUTING
  
  // Wizard Puzzles
  if (action.objectId === 'scroll_grid') {
    return runPuzzle(state, 'scroll_grid', TicTacToe, action, now);
  }
  if (action.objectId === 'bookshelf_puzzle') {
    return runPuzzle(state, 'bookshelf_puzzle', Bookshelf, action, now);
  }
  if (action.objectId === 'candle_puzzle') {
    return runPuzzle(state, 'candle_puzzle', CandlePuzzle, action, now);
  }
  if (action.objectId === 'wizard_transformation_table') {
    return runPuzzle(state, 'wizard_transformation_table', WizardTransformationTable, action, now);
  }

  // temp
  if (action.objectId?.startsWith('switch:')) {
    return runPuzzle(state, 'coopSwitches', Coop, action, now);
  }

  if (action.objectId?.startsWith('light:')) {
    return runPuzzle(state, 'lightsOut', Lights, action, now);
  }

  // Alchemist Puzzles
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
