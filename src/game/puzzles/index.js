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
import * as MerlinScale from './wizard_library/MerlinScale.js';
import * as DoorSeal from './wizard_library/DoorSeal.js';
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
  const merlinScale = MerlinScale.init();
  const doorSeal = DoorSeal.init();

  return {
    public: {
      coopSwitches: Coop.exportPublic(coop),
      lightsOut: Lights.exportPublic(lights),
      alchLightBeamGrid: AlchLightBeamGrid.exportPublic(grid),
      alchMortarEssence: AlchMortarEssence.exportPublic(mortar),
      tictactoe_scroll: TicTacToe.exportPublic(tictactoe),
      bookshelf_puzzle: Bookshelf.exportPublic(bookshelf),
      candle_puzzle: CandlePuzzle.exportPublic(candle),
      wizard_transformation_table: WizardTransformationTable.exportPublic(wizTable),
      merlin_scale: MerlinScale.exportPublic(merlinScale),
      door_seal: DoorSeal.exportPublic(doorSeal),
    },
    internal: {
      coopSwitches: coop,
      lightsOut: lights,
      alchLightBeamGrid: grid,
      alchMortarEssence: mortar,
      tictactoe_scroll: tictactoe,
      bookshelf_puzzle: bookshelf,
      candle_puzzle: candle,
      wizard_transformation_table: wizTable,
      merlin_scale: merlinScale,
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

  // EMERGENCY GUARD
  if (!state || !state.public) {
    state = initAll();
  }

  // handle objectId routing: trigger_ = UI-Element, puzzle_ = Logik
  if (action.objectId.startsWith('trigger_')) {
    const widgetResult = routeWidgetTriggers(state, action);
    if (widgetResult) return widgetResult;

  } else if (action.objectId.startsWith('puzzle_')) {
    const puzzleResult = routePuzzleLogic(state, action, now);
    if (puzzleResult) return puzzleResult;

  } else {
    return makeResult({ state, ok: false, error: 'UNKNOWN_OBJECT' });
  }

}

function routeWidgetTriggers(state, action) {
  const widgetMap = {
    trigger_tictactoe_scroll: "tictactoe_scroll",
    trigger_bookshelf: "bookshelf_puzzle",
    trigger_candle_puzzle: "candle_puzzle",
    trigger_wiz_hint_candles: "candle_hint",
    trigger_wiz_hint_recipe: "recipe_hint",
    trigger_wiz_hint_frame: "frame_hint",
    trigger_merlin_scale: "merlin_scale"
  };

  const widget = widgetMap[action.objectId];

  if (!widget) return null;

  return {
    ok: true,
    nextState: state,
    diff: {
      activeWidget: widget
    }
  };
}

function routePuzzleLogic(state, action, now) {
  const puzzleMap = {
    puzzle_tictactoe_scroll: ['tictactoe_scroll', TicTacToe],
    puzzle_bookshelf: ['bookshelf_puzzle', Bookshelf],
    puzzle_candle: ['candle_puzzle', CandlePuzzle],
    puzzle_wizard_transformation_table: ['wizard_transformation_table', WizardTransformationTable],
    puzzle_merlin_scale: ['merlin_scale', MerlinScale],
    puzzle_door_seal: ['door_seal', DoorSeal],
    // TODO: change the format of the objectID for alchemist puzzles
    'alch:mirror-grid': ['alchLightBeamGrid', AlchLightBeamGrid],
    'alch:mortar': ['alchMortarEssence', AlchMortarEssence]
  };

  if (puzzleMap[action.objectId]) {
    const [key, PuzzleClass] = puzzleMap[action.objectId];
    return runPuzzle(state, key, PuzzleClass, action, now);
  }

  return null;
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
