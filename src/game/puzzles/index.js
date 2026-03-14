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
import * as FinalDoorWordSync from './final_corridor/finalDoorWordSync.js';
import * as PortraitPuzzle from './alchemist_lab/PortraitPuzzle.js';
import * as DrawerPuzzle from './alchemist_lab/DrawerPuzzle.js';

// --- Wizard Modules ---
import * as TicTacToe from './wizard_library/TicTacToe.js';
import * as Bookshelf from './wizard_library/Bookshelf.js';
import * as CandlePuzzle from './wizard_library/CandlePuzzle.js';
import * as transformationTable from './wizard_library/TransformationTable.js';
import * as MerlinScale from './wizard_library/MerlinScale.js';
import * as DoorSeal from './wizard_library/DoorSeal.js';
import * as VasePuzzle from './wizard_library/VasePuzzle.js';
import * as RecipeHint from './wizard_library/RecipeHint.js';

import { makeResult } from './fsm.js';

export function initAll() {
  const internal = {
    // Demo/Legacy
    coopSwitches: Coop.init(),
    lightsOut: Lights.init(),

    // Alchemy South
    alchPortraitBooks: AlchPortraitBooks.init(),
    alchFlaskTransfer: AlchFlaskTransfer.init(),
    alchPortrait: PortraitPuzzle.init(),
    
    // Alchemy West
    alchMortarEssence: AlchMortarEssence.init(),
    alchKeyTransmutation: AlchKeyTransmutation.init(),
    alchWestCodeboxJigsaw: AlchWestCodeboxJigsaw.init(),
    // Alchemy North
    alchNorthHierarchyNote: AlchNorthHierarchyNote.init(),
    alchStatuePose: AlchStatuePose.init(),
    alch_drawer_puzzle: DrawerPuzzle.init(),
    // Alchemy East
    alchEastSlidingLock: AlchEastSlidingLock.init(),
    alchEastDoorSync: AlchEastDoorSync.init(),
    alchLightBeamGrid: AlchLightBeamGrid.init(),

    // --- Wizard ---
    tictactoe_scroll: TicTacToe.init(),
    bookshelf_puzzle: Bookshelf.init(),
    candle_puzzle: CandlePuzzle.init(),
    transformation_table_puzzle: transformationTable.init(),
    merlin_scale: MerlinScale.init(),
    vase_puzzle: VasePuzzle.init(),
    recipe_hint: RecipeHint.init(),
    door_seal: DoorSeal.init(),
    finalCorridor: FinalDoorWordSync.init(),

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
      alchPortrait: PortraitPuzzle.exportPublic(internal.alchPortrait),
      // Alchemy West
      alchMortarEssence: AlchMortarEssence.exportPublic(internal.alchMortarEssence),
      'alch:mortar': AlchMortarEssence.exportPublic(internal.alchMortarEssence),
      alchKeyTransmutation: AlchKeyTransmutation.exportPublic(internal.alchKeyTransmutation),
      alchWestCodeboxJigsaw: AlchWestCodeboxJigsaw.exportPublic(internal.alchWestCodeboxJigsaw),
      // Alchemy North
      alchNorthHierarchyNote: AlchNorthHierarchyNote.exportPublic(internal.alchNorthHierarchyNote),
      alchStatuePose: AlchStatuePose.exportPublic(internal.alchStatuePose),
      alch_drawer_puzzle: DrawerPuzzle.exportPublic(internal.alch_drawer_puzzle),
      // Alchemy East
      alchEastSlidingLock: AlchEastSlidingLock.exportPublic(internal.alchEastSlidingLock),
      alchEastDoorSync: AlchEastDoorSync.exportPublic(internal.alchEastDoorSync),
      alchLightBeamGrid: AlchLightBeamGrid.exportPublic(internal.alchLightBeamGrid),
      
      // Wizard
      tictactoe_scroll: TicTacToe.exportPublic(internal.tictactoe_scroll),
      bookshelf_puzzle: Bookshelf.exportPublic(internal.bookshelf_puzzle),
      candle_puzzle: CandlePuzzle.exportPublic(internal.candle_puzzle),
      transformation_table_puzzle: transformationTable.exportPublic(internal.transformation_table_puzzle),
      merlin_scale: MerlinScale.exportPublic(internal.merlin_scale),
      vase_puzzle: VasePuzzle.exportPublic(internal.vase_puzzle),
      recipe_hint: RecipeHint.exportPublic(internal.recipe_hint),
      door_seal: DoorSeal.exportPublic(internal.door_seal),
      finalCorridor: FinalDoorWordSync.exportPublic(internal.finalCorridor),
    },
    internal,
  };
}

const DIRECT_OBJECT_ALIASES = Object.freeze({
  // Legacy demo
  'switch:A': ['puzzle_coop_switches', 'switch:A'],
  'switch:B': ['puzzle_coop_switches', 'switch:B'],

  // Wizard
  tictactoe_scroll: ['puzzle_tictactoe_scroll', 'tictactoe_scroll'],
  bookshelf_puzzle: ['puzzle_bookshelf', 'bookshelf_puzzle'],
  candle_puzzle: ['puzzle_candle', 'candle_puzzle'],
  wizard_transformation_table: ['puzzle_wizard_transformation_table', 'wizard_transformation_table'],
  merlin_scale: ['puzzle_merlin_scale', 'merlin_scale'],
  door_seal: ['puzzle_door_seal', 'door_seal'],

  // Alchemist
  alchPortrait: ['puzzle_portrait_books', 'alch:portrait'],
  'alch:mortar': ['puzzle_mortar', 'alch:mortar'],
  'alch:transmuter': ['puzzle_transmuter', 'alch:transmuter'],
  'alch:ritual-paper': ['puzzle_transmuter', 'alch:ritual-paper'],
  'alch:west-codebox': ['puzzle_west_codebox', 'alch:west-codebox'],
  'alch:west-jigsaw': ['puzzle_west_codebox', 'alch:west-jigsaw'],
  'alch:portrait-books': ['puzzle_portrait_books', 'alch:portrait-books'],
  'alch:portrait': ['puzzle_portrait_books', 'alch:portrait'],
  'alch:portrait-lady': ['puzzle_portrait_books', 'alch:portrait-lady'],
  'alch:drawer': ['puzzle_drawer', 'alch:drawer'],
  'alch:flask-transfer': ['puzzle_flask_transfer', 'alch:flask-transfer'],
  'alch:flasks': ['puzzle_flask_transfer', 'alch:flasks'],
  'alch:flask-shelf': ['puzzle_flask_transfer', 'alch:flask-shelf'],
  'alch:north-hierarchy-note': ['puzzle_north_hierarchy_note', 'alch:north-hierarchy-note'],
  'alch:hierarchy-note': ['puzzle_north_hierarchy_note', 'alch:hierarchy-note'],
  'alch:note-drawer': ['puzzle_north_hierarchy_note', 'alch:note-drawer'],
  'alch:statue': ['puzzle_statue_pose', 'alch:statue'],
  'alch:statue-pose': ['puzzle_statue_pose', 'alch:statue-pose'],
  'alch:east-sliding-lock': ['puzzle_east_sliding_lock', 'alch:east-sliding-lock'],
  'alch:east-door-lock': ['puzzle_east_door_sync', 'alch:east-door-lock'],
  'alch:east-door-switch': ['puzzle_east_door_sync', 'alch:east-door-switch'],
  'alch:east-door-mechanism': ['puzzle_east_door_sync', 'alch:east-door-mechanism'],
  'alch:mirror-grid': ['puzzle_light_beam_grid', 'alch:mirror-grid'],

  // Final corridor
  'final:keypad': ['puzzle_final_corridor', 'final:keypad'],
  'final:door-keypad': ['puzzle_final_corridor', 'final:door-keypad'],
  'final:word-input': ['puzzle_final_corridor', 'final:word-input'],
  'final:door-input': ['puzzle_final_corridor', 'final:door-input'],
  'final:hint-note': ['puzzle_final_corridor', 'final:hint-note'],
  'final:rune-note': ['puzzle_final_corridor', 'final:rune-note'],
  'final:note': ['puzzle_final_corridor', 'final:note'],
  'final:translation-note': ['puzzle_final_corridor', 'final:translation-note'],
  'final:plate-left': ['puzzle_final_corridor', 'final:plate-left'],
  'final:pressure-plate-left': ['puzzle_final_corridor', 'final:pressure-plate-left'],
  'final:plate-right': ['puzzle_final_corridor', 'final:plate-right'],
  'final:pressure-plate-right': ['puzzle_final_corridor', 'final:pressure-plate-right'],
  'final:plate': ['puzzle_final_corridor', 'final:plate'],
  'final:pressure-plate': ['puzzle_final_corridor', 'final:pressure-plate'],
  'final:plates': ['puzzle_final_corridor', 'final:plates'],
});

function normalizeIncomingAction(action) {
  const objectId = String(action?.objectId || '').trim();
  if (!objectId) return action;
  if (objectId.startsWith('trigger_') || objectId.startsWith('puzzle_')) return action;

  if (/^light:\d+:\d+$/.test(objectId)) {
    return {
      ...action,
      objectId: 'puzzle_lights_out',
      canonicalObjectId: String(action?.canonicalObjectId || objectId),
    };
  }

  const mapped = DIRECT_OBJECT_ALIASES[objectId];
  if (!mapped) return action;

  return {
    ...action,
    objectId: mapped[0],
    canonicalObjectId: String(action?.canonicalObjectId || mapped[1]),
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

  const normalizedAction = normalizeIncomingAction(action);
  const objectId = String(normalizedAction?.objectId || '');

  if (!objectId) {
    return makeResult({ state, ok: false, error: 'MISSING_OBJECT_ID' });
  }

  // 1) Widget-Triggers
  if (objectId.startsWith('trigger_')) {
    const widgetResult = routeWidgetTriggers(state, normalizedAction);
    if (widgetResult) return widgetResult;
    return makeResult({ state, ok: false, error: 'UNKNOWN_TRIGGER' });
  }

  // 2) Puzzle-Routing
  if (objectId.startsWith('puzzle_')) {
    const puzzleResult = routePuzzleLogic(state, normalizedAction, now);
    if (puzzleResult) return puzzleResult;
    return makeResult({ state, ok: false, error: 'UNKNOWN_PUZZLE_OBJECT' });
  }

  return makeResult({ state, ok: false, error: 'UNKNOWN_OBJECT' });
}

function routeWidgetTriggers(state, action) {
  const triggerId = String(action?.objectId || '');
  const tictactoeSolved = !!state?.public?.tictactoe_scroll?.solved;

  if (triggerId === 'trigger_tictactoe_scroll' && tictactoeSolved) {
    return makeResult({ state, ok: false, error: 'SCROLL_ALREADY_SOLVED' });
  }

  if (triggerId === 'trigger_door_seal' && !tictactoeSolved) {
    return makeResult({ state, ok: false, error: 'DOOR_LOCKED_UNTIL_SCROLL_SOLVED' });
  }

  const widgetMap = {
    // --- WIZARD ---
    trigger_tictactoe_scroll: "tictactoe_scroll",
    trigger_door_seal: "door_seal",
    trigger_bookshelf: "bookshelf_puzzle",
    trigger_candle_puzzle: "candle_puzzle",
    trigger_wiz_hint_candles: "candle_hint",
    trigger_wiz_hint_recipe: "recipe_hint",
    trigger_wiz_hint_frame: "frame_hint",
    trigger_merlin_scale: "merlin_scale",
    trigger_transformation_table: "transformation_table_puzzle",
    trigger_key_vase: "vase_puzzle",

    // --- ALCHEMIST ---

    trigger_drawer: 'alch_drawer_puzzle',

    trigger_mortar: 'alch:mortar',
    trigger_alch_mortar: 'alch:mortar',

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

    // --- Final Corridor ---
    trigger_final_hint_note: 'final_rune_hint',
    trigger_final_keypad: 'final_word_input',
    trigger_final_plates: 'final_sync_plates',
    trigger_final_door: 'final_door_panel',
  };

  const widget = widgetMap[triggerId];
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
  const canonicalObjectId = String(action?.canonicalObjectId || '').trim();

  const puzzleMap = {
    // Legacy
    puzzle_coop_switches: ['coopSwitches', Coop],
    puzzle_lights_out: ['lightsOut', Lights],

    // --- Wizard ---
    puzzle_tictactoe_scroll:            ['tictactoe_scroll', TicTacToe],
    puzzle_bookshelf:                   ['bookshelf_puzzle', Bookshelf],
    puzzle_candle:                      ['candle_puzzle', CandlePuzzle],
    puzzle_transformation_table:        ['transformation_table_puzzle', transformationTable],
    puzzle_merlin_scale:                ['merlin_scale', MerlinScale],
    puzzle_door_seal:                   ['door_seal', DoorSeal],
    puzzle_vase:                        ['vase_puzzle', VasePuzzle],
    puzzle_recipe_hint:                 ['recipe_hint', RecipeHint],

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
    puzzle_final_corridor:       ['finalCorridor', FinalDoorWordSync],
    puzzle_drawer:               ['alch_drawer_puzzle', DrawerPuzzle],
  };

  const hit = puzzleMap[oid];
  if (!hit) return null;

  // Portrait widget actions (open/take) are handled by PortraitPuzzle.
  if (oid === 'puzzle_portrait_books' && canonicalObjectId === 'alch:portrait') {
    const portraitAction = { ...action, objectId: canonicalObjectId };
    return runPuzzle(state, 'alchPortrait', PortraitPuzzle, portraitAction, now);
  }

  const [key, moduleRef] = hit;

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

  // Defensive remap: some pipelines strip canonicalObjectId before puzzle apply.
  // Statue module expects alch:* object ids, not puzzle_* ids.
  const actionForModule =
    key === 'alchStatuePose' && String(action?.objectId || '') === 'puzzle_statue_pose'
      ? { ...action, objectId: 'alch:statue-pose' }
      : action;

  const res = moduleRef.apply(localState, actionForModule, now, state);
  if (key === 'alchStatuePose') {
    console.log("[DISPATCH:STATUE] apply result", {
      objectId: action?.objectId,
      forwardedObjectId: actionForModule?.objectId,
      verb: action?.verb,
      data: action?.data,
      ok: !!res?.ok,
      error: res?.error || null,
      diffKeys: Object.keys(res?.diff || {}),
    });
  }

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
  if (key === 'alchMortarEssence') {
    next.public['alch:mortar'] = next.public[key];
  }

  const diff =
    res.diff && Object.keys(res.diff).length > 0
      ? res.diff
      : { [key]: next.public[key] };

  if (key === 'alchStatuePose') {
    console.log("[DISPATCH:STATUE] exported", {
      pose: next.public[key]?.pose,
      featherInserted: next.public[key]?.featherInserted,
      mouthOpened: next.public[key]?.mouthOpened,
      solved: next.public[key]?.solved,
      poseMatched: next.public[key]?.output?.poseMatched,
      diffKeys: Object.keys(diff || {}),
    });
  }

  return makeResult({ state: next, diff, ok: true, error: null });
}

export function syncFinalCorridor(localState, rootState, now = Date.now()) {
  if (!localState) return { changed: false, nextState: localState };
  return FinalDoorWordSync.syncFromContext(localState, rootState, now);
}

export function exportFinalCorridor(localState) {
  return FinalDoorWordSync.exportPublic(localState);
}

export function hydrateFinalCorridor(publicState, now = Date.now()) {
  return FinalDoorWordSync.hydrateFromPublic(publicState, now);
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
