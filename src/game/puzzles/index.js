// src/game/puzzles/index.js
// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter

import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';

import * as AlchPortraitBooks from './alchPortraitBooks.js';
import * as AlchFlaskTransfer from './alchFlaskTransfer.js';

import * as AlchMortarEssence from './alchMortarEssence.js';
import * as AlchKeyTransmutation from './alchKeyTransmutation.js';

import * as AlchWestCodeboxJigsaw from './alchWestCodeboxJigsaw.js';

import * as AlchNorthHierarchyNote from './alchNorthHierarchyNote.js';
import * as AlchStatuePose from './alchStatuePose.js';

import * as AlchEastSlidingLock from './alchEastSlidingLock.js';
import * as AlchEastDoorSync from './alchEastDoorSync.js';
import * as AlchLightBeamGrid from './alchLightBeamGrid.js';

import { makeResult } from './fsm.js';

export function initAll() {
  const internal = {
    // Demo/Legacy
    coopSwitches: Coop.init(),
    lightsOut: Lights.init(),

    // South
    alchPortraitBooks: AlchPortraitBooks.init(),
    alchFlaskTransfer: AlchFlaskTransfer.init(),

    // West
    alchMortarEssence: AlchMortarEssence.init(),
    alchKeyTransmutation: AlchKeyTransmutation.init(),
    alchWestCodeboxJigsaw: AlchWestCodeboxJigsaw.init(),

    // North
    alchNorthHierarchyNote: AlchNorthHierarchyNote.init(),
    alchStatuePose: AlchStatuePose.init(),

    // East
    alchEastSlidingLock: AlchEastSlidingLock.init(),
    alchEastDoorSync: AlchEastDoorSync.init(),
    alchLightBeamGrid: AlchLightBeamGrid.init(),
  };

  return {
    public: {
      coopSwitches: Coop.exportPublic(internal.coopSwitches),
      lightsOut: Lights.exportPublic(internal.lightsOut),

      alchPortraitBooks: AlchPortraitBooks.exportPublic(internal.alchPortraitBooks),
      alchFlaskTransfer: AlchFlaskTransfer.exportPublic(internal.alchFlaskTransfer),

      alchMortarEssence: AlchMortarEssence.exportPublic(internal.alchMortarEssence),
      alchKeyTransmutation: AlchKeyTransmutation.exportPublic(internal.alchKeyTransmutation),
      alchWestCodeboxJigsaw: AlchWestCodeboxJigsaw.exportPublic(internal.alchWestCodeboxJigsaw),

      alchNorthHierarchyNote: AlchNorthHierarchyNote.exportPublic(internal.alchNorthHierarchyNote),
      alchStatuePose: AlchStatuePose.exportPublic(internal.alchStatuePose),

      alchEastSlidingLock: AlchEastSlidingLock.exportPublic(internal.alchEastSlidingLock),
      alchEastDoorSync: AlchEastDoorSync.exportPublic(internal.alchEastDoorSync),
      alchLightBeamGrid: AlchLightBeamGrid.exportPublic(internal.alchLightBeamGrid),
    },
    internal,
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
export function apply(state, action) {
  const now = Date.now();
  const objectId = String(action?.objectId || '');
  const verb = String(action?.verb || '').trim().toLowerCase();

  if (!objectId) {
    return makeResult({ state, ok: false, error: 'MISSING_OBJECT_ID' });
  }

  // Demo/Legacy
  if (objectId.startsWith('switch:')) return runPuzzle(state, 'coopSwitches', Coop, action, now);
  if (objectId.startsWith('light:')) return runPuzzle(state, 'lightsOut', Lights, action, now);

  // South
  if (
    objectId === 'alch:portrait-books' ||
    objectId === 'alch:portrait' ||
    objectId === 'alch:portrait-lady'
  ) {
    return runPuzzle(
      state,
      'alchPortraitBooks',
      AlchPortraitBooks,
      withObjectId(action, 'alch:portrait-books'),
      now
    );
  }
  if (
    objectId === 'alch:flask-transfer' ||
    objectId === 'alch:flasks' ||
    objectId === 'alch:flask-shelf'
  ) {
    return runPuzzle(
      state,
      'alchFlaskTransfer',
      AlchFlaskTransfer,
      withObjectId(action, 'alch:flask-transfer'),
      now
    );
  }

  // West
  if (objectId === 'alch:mortar') {
    return runPuzzle(state, 'alchMortarEssence', AlchMortarEssence, action, now);
  }
  if (objectId === 'alch:transmuter' || objectId === 'alch:ritual-paper') {
    return runPuzzle(
      state,
      'alchKeyTransmutation',
      AlchKeyTransmutation,
      withObjectId(action, 'alch:transmuter'),
      now
    );
  }
  if (objectId === 'alch:west-codebox' || objectId === 'alch:west-jigsaw') {
    return runPuzzle(state, 'alchWestCodeboxJigsaw', AlchWestCodeboxJigsaw, action, now);
  }

  // North
  if (
    objectId === 'alch:north-hierarchy-note' ||
    objectId === 'alch:hierarchy-note' ||
    objectId === 'alch:note-drawer'
  ) {
    return runPuzzle(
      state,
      'alchNorthHierarchyNote',
      AlchNorthHierarchyNote,
      withObjectId(action, 'alch:north-hierarchy-note'),
      now
    );
  }
  if (objectId === 'alch:statue' || objectId === 'alch:statue-pose') {
    return runPuzzle(
      state,
      'alchStatuePose',
      AlchStatuePose,
      withObjectId(action, 'alch:statue'),
      now
    );
  }

// East
if (objectId === 'alch:east-sliding-lock') {
  return runPuzzle(state, 'alchEastSlidingLock', AlchEastSlidingLock, action, now);
}

// akzeptiere alte + neue Objekt-IDs
if (
  objectId === 'alch:east-door-sync' ||
  objectId === 'alch:east-door' ||
  objectId === 'alch:east-door-lock' ||
  objectId === 'alch:east-door-switch' ||
  objectId === 'alch:east-door-mechanism' ||
  objectId === 'alch:east:door' ||
  objectId === 'alch:east:sync-switch'
) {
  return runPuzzle(
    state,
    'alchEastDoorSync',
    AlchEastDoorSync,
    withObjectId(action, canonicalEastDoorObjectId(objectId, verb)),
    now
  );
}

// mirror/lightbeam Aliase
if (
  objectId === 'alch:mirror-grid' ||
  objectId === 'alch:lightbeam-grid' ||
  objectId === 'alch:east-lightbeam'
) {
  return runPuzzle(
    state,
    'alchLightBeamGrid',
    AlchLightBeamGrid,
    withObjectId(action, 'alch:mirror-grid'),
    now
  );
}

  return makeResult({ state, ok: false, error: 'UNKNOWN_OBJECT' });
}

function runPuzzle(state, key, moduleRef, action, now) {
  const localState = state?.internal?.[key];
  if (!localState) {
    return makeResult({ state, ok: false, error: `MISSING_PUZZLE_STATE:${key}` });
  }

  const res = moduleRef.apply(localState, action, now, state);

  if (!res?.ok) {
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

function cloneState(s) {
  if (typeof structuredClone === 'function') return structuredClone(s);
  return JSON.parse(JSON.stringify(s));
}

function withObjectId(action, objectId) {
  if (!action || action.objectId === objectId) return action;
  return { ...action, objectId };
}

function canonicalEastDoorObjectId(objectId, verb) {
  if (objectId === 'alch:east-door-sync' || objectId === 'alch:east:sync-switch') {
    return verb === 'insert' ? 'alch:east-door-lock' : 'alch:east-door-switch';
  }

  if (objectId === 'alch:east-door' || objectId === 'alch:east:door') {
    return verb === 'insert' ? 'alch:east-door-lock' : 'alch:east-door-mechanism';
  }

  return objectId;
}
