// src/game/puzzles/index.js
// Unified Dispatcher: Integrates Wizard + Alchemist 

import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';

// --- Alchemist Modules ---
import * as AlchPortraitBooks from './alchemist_lab/alchPortraitBooks.js';
import * as AlchFlaskTransfer from './alchemist_lab/alchFlaskTransfer.js';
import * as AlchMortarEssence from './alchemist_lab/alchMortarEssence.js';
import * as AlchKeyTransmutation from './alchemist_lab/alchKeyTransmutation.js';
import * as AlchWestCodeboxJigsaw from './alchemist_lab/alchWestCodeboxJigsaw.js';
import * as AlchNorthHierarchyNote from './alchemist_lab/alchNorthHierarchyNote.js';
import * as AlchStatuePose from './alchemist_lab/alchStatuePose.js';
import * as AlchEastSlidingLock from './alchemist_lab/alchEastSlidingLock.js';
import * as AlchEastDoorSync from './alchemist_lab/alchEastDoorSync.js';
import * as AlchLightBeamGrid from './alchemist_lab/alchLightBeamGrid.js';

// --- Wizard Modules ---
import * as TicTacToe from './wizard_library/TicTacToe.js';
import * as Bookshelf from './wizard_library/Bookshelf.js';
import * as CandlePuzzle from './wizard_library/CandlePuzzle.js';
import * as WizardTransformationTable from './wizard_library/WizTransformationPuzzle.js';
import * as MerlinScale from './wizard_library/MerlinScale.js';
import * as DoorSeal from './wizard_library/DoorSeal.js';

import { makeResult } from './fsm.js';

export function initAll() {
  const internal = {
    // Demo/Legacy
    coopSwitches: Coop.init(),
    lightsOut: Lights.init(),

    // Alchemy South
    alchPortraitBooks: AlchPortraitBooks.init(),
    alchFlaskTransfer: AlchFlaskTransfer.init(),
    // Alchemy West
    alchMortarEssence: AlchMortarEssence.init(),
    alchKeyTransmutation: AlchKeyTransmutation.init(),
    alchWestCodeboxJigsaw: AlchWestCodeboxJigsaw.init(),
    // Alchemy North
    alchNorthHierarchyNote: AlchNorthHierarchyNote.init(),
    alchStatuePose: AlchStatuePose.init(),
    // Alchemy East
    alchEastSlidingLock: AlchEastSlidingLock.init(),
    alchEastDoorSync: AlchEastDoorSync.init(),
    alchLightBeamGrid: AlchLightBeamGrid.init(),

    // --- Wizard ---
    tictactoe_scroll: TicTacToe.init(),
    bookshelf_puzzle: Bookshelf.init(),
    candle_puzzle: CandlePuzzle.init(),
    wizard_transformation_table: WizardTransformationTable.init(),
    merlin_scale: MerlinScale.init(),
    door_seal: DoorSeal.init(),

    // Infra
    processedActions: new Set(),
  };

  return {
    public: {
      // Demo
      coopSwitches: Coop.exportPublic(internal.coopSwitches),
      lightsOut: Lights.exportPublic(internal.lightsOut),
      // Alchemy
      alchPortraitBooks: AlchPortraitBooks.exportPublic(internal.alchPortraitBooks),
      alchFlaskTransfer: AlchFlaskTransfer.exportPublic(internal.alchFlaskTransfer),
      // Alchemy West
      alchMortarEssence: AlchMortarEssence.exportPublic(internal.alchMortarEssence),
      alchKeyTransmutation: AlchKeyTransmutation.exportPublic(internal.alchKeyTransmutation),
      alchWestCodeboxJigsaw: AlchWestCodeboxJigsaw.exportPublic(internal.alchWestCodeboxJigsaw),
      // Alchemy North
      alchNorthHierarchyNote: AlchNorthHierarchyNote.exportPublic(internal.alchNorthHierarchyNote),
      alchStatuePose: AlchStatuePose.exportPublic(internal.alchStatuePose),
      // Alchemy East
      alchEastSlidingLock: AlchEastSlidingLock.exportPublic(internal.alchEastSlidingLock),
      alchEastDoorSync: AlchEastDoorSync.exportPublic(internal.alchEastDoorSync),
      alchLightBeamGrid: AlchLightBeamGrid.exportPublic(internal.alchLightBeamGrid),
      
      // Wizard
      tictactoe_scroll: TicTacToe.exportPublic(internal.tictactoe_scroll),
      bookshelf_puzzle: Bookshelf.exportPublic(internal.bookshelf_puzzle),
      candle_puzzle: CandlePuzzle.exportPublic(internal.candle_puzzle),
      wizard_transformation_table: WizardTransformationTable.exportPublic(internal.wizard_transformation_table),
      merlin_scale: MerlinScale.exportPublic(internal.merlin_scale),
      door_seal: DoorSeal.exportPublic(internal.door_seal),
    },
    internal,
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
export function apply(state, action) {
  const now = Date.now();

  if (!state?.public || !state?.internal) {
    state = initAll();
  }

  const objectId = String(action?.objectId || '');

  if (!objectId) {
    return makeResult({ state, ok: false, error: 'MISSING_OBJECT_ID' });
  }

  // 1) Widget-Triggers
  if (objectId.startsWith('trigger_')) {
    const widgetResult = routeWidgetTriggers(state, action);
    if (widgetResult) return widgetResult;
    return makeResult({ state, ok: false, error: 'UNKNOWN_TRIGGER' });
  }

  // 2) Puzzle-Routing
  if (objectId.startsWith('puzzle_')) {
    const puzzleResult = routePuzzleLogic(state, action, now);
    if (puzzleResult) return puzzleResult;
    return makeResult({ state, ok: false, error: 'UNKNOWN_PUZZLE_OBJECT' });
  }

  return makeResult({ state, ok: false, error: 'UNKNOWN_OBJECT' });
}

function routeWidgetTriggers(state, action) {
  const widgetMap = {
    // --- WIZARD ---
    trigger_tictactoe_scroll: "tictactoe_scroll",
    trigger_bookshelf: "bookshelf_puzzle",
    trigger_candle_puzzle: "candle_puzzle",
    trigger_wiz_hint_candles: "candle_hint",
    trigger_wiz_hint_recipe: "recipe_hint",
    trigger_wiz_hint_frame: "frame_hint",
    trigger_merlin_scale: "merlin_scale",

    // --- ALCHEMIST ---
    trigger_mortar: 'mortar_puzzle',
    trigger_alch_mortar: 'mortar_puzzle',

    trigger_transmuter: 'transmuter_puzzle',
    trigger_alch_transmuter: 'transmuter_puzzle',

    trigger_portrait_books: 'portrait_books_puzzle',
    trigger_alch_portrait_books: 'portrait_books_puzzle',
    trigger_portrait: 'portrait_books_puzzle',

    trigger_flask_transfer: 'flask_transfer_puzzle',
    trigger_alch_flask_transfer: 'flask_transfer_puzzle',
    trigger_flasks: 'flask_transfer_puzzle',

    trigger_west_codebox: 'west_codebox_puzzle',
    trigger_alch_west_codebox: 'west_codebox_puzzle',
    trigger_west_jigsaw: 'west_codebox_puzzle',

    trigger_north_hierarchy_note: 'north_hierarchy_note_puzzle',
    trigger_alch_north_hierarchy_note: 'north_hierarchy_note_puzzle',
    trigger_hierarchy_note: 'north_hierarchy_note_puzzle',

    trigger_statue_pose: 'statue_pose_puzzle',
    trigger_alch_statue_pose: 'statue_pose_puzzle',
    trigger_statue: 'statue_pose_puzzle',

    trigger_east_sliding_lock: 'east_sliding_lock_puzzle',
    trigger_alch_east_sliding_lock: 'east_sliding_lock_puzzle',

    trigger_east_door_sync: 'east_door_sync_puzzle',
    trigger_alch_east_door_sync: 'east_door_sync_puzzle',
    trigger_east_door: 'east_door_sync_puzzle',

    trigger_light_beam_grid: 'light_beam_grid_puzzle',
    trigger_alch_light_beam_grid: 'light_beam_grid_puzzle',
    trigger_mirror_grid: 'light_beam_grid_puzzle',
  };

  const widget = widgetMap[String(action?.objectId || '')];
  if (!widget) return null;

  return makeResult({
    state,
    ok: true,
    error: null,
    diff: { activeWidget: widget },
  });
}

function routePuzzleLogic(state, action, now) {
  const oid = String(action?.objectId || '');

  const puzzleMap = {
    // Legacy
    puzzle_coop_switches: ['coopSwitches', Coop],
    puzzle_lights_out: ['lightsOut', Lights],

    // --- Wizard ---
    puzzle_tictactoe_scroll:            ['tictactoe_scroll', TicTacToe],
    puzzle_bookshelf:                   ['bookshelf_puzzle', Bookshelf],
    puzzle_candle:                      ['candle_puzzle', CandlePuzzle],
    puzzle_wizard_transformation_table: ['wizard_transformation_table', WizardTransformationTable],
    puzzle_merlin_scale:                ['merlin_scale', MerlinScale],
    puzzle_door_seal:                   ['door_seal', DoorSeal],

    // --- Alchemist ---
    puzzle_light_beam_grid:      ['alchLightBeamGrid', AlchLightBeamGrid],
    puzzle_mortar:               ['alchMortarEssence', AlchMortarEssence],
    puzzle_transmuter:           ['alchKeyTransmutation', AlchKeyTransmutation],
    puzzle_west_codebox:         ['alchWestCodeboxJigsaw', AlchWestCodeboxJigsaw],
    puzzle_portrait_books:       ['alchPortraitBooks', AlchPortraitBooks],
    puzzle_flask_transfer:       ['alchFlaskTransfer', AlchFlaskTransfer],
    puzzle_north_hierarchy_note: ['alchNorthHierarchyNote', AlchNorthHierarchyNote],
    puzzle_statue_pose:          ['alchStatuePose', AlchStatuePose],
    puzzle_east_sliding_lock:    ['alchEastSlidingLock', AlchEastSlidingLock],
    puzzle_east_door_sync:       ['alchEastDoorSync', AlchEastDoorSync],
  };

  const hit = puzzleMap[oid];
  if (!hit) return null;

  const [key, moduleRef] = hit;
  
  const canonicalObjectId = String(action?.canonicalObjectId || '').trim();
  let puzzleAction = canonicalObjectId
    ? { ...action, objectId: canonicalObjectId }
    : action;

  if (oid === 'puzzle_light_beam_grid') {
    puzzleAction = {
      ...action,
      objectId: canonicalObjectId || 'alch:mirror-grid',
    };
  }

  return runPuzzle(state, key, moduleRef, puzzleAction, now);
}

function runPuzzle(state, key, moduleRef, action, now) {
  const localState = state?.internal?.[key];
  if (!localState) {
    return makeResult({ state, ok: false, error: `MISSING_PUZZLE_STATE:${key}` });
  }

  const res = moduleRef.apply(localState, action, now, state);

  if (!res?.ok) {
    // Manche Module liefern bereits ein vollständiges makeResult-artiges Objekt
    if (res && (res.state || res.nextState)) return res;
    return makeResult({ state, ok: false, error: res?.error || 'PUZZLE_APPLY_FAILED' });
  }

  const nextLocalState = res.nextState ?? res.state;
  if (!nextLocalState) {
    return makeResult({ state, ok: false, error: `INVALID_PUZZLE_RESULT:${key}` });
  }

  const next = cloneState(state);
  next.internal[key] = nextLocalState;
  next.public[key] = moduleRef.exportPublic(nextLocalState);

  const diff =
    res.diff && Object.keys(res.diff).length > 0
      ? res.diff
      : { [key]: next.public[key] };

  return makeResult({ state: next, diff, ok: true, error: null });
}

function cloneState(state) {
  return {
    public: JSON.parse(JSON.stringify(state.public)),
    internal: {
      ...state.internal,
      processedActions: new Set(state.internal?.processedActions || []),
    },
  };
}
