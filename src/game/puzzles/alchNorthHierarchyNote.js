// src/game/puzzles/alchNorthHierarchyNote.js
import { makeResult } from './fsm.js';

const PUZZLE_KEY = 'alchNorthHierarchyNote';
const VALID_OBJECTS = new Set([
  'alch:north-hierarchy-note',
  'alch:hierarchy-note',
  'alch:note-drawer',
]);

const HIERARCHY = Object.freeze([
  { rank: 1, being: 'WIZARD', symbol: 'WAND' },
  { rank: 2, being: 'UNICORN', symbol: 'HORN' },
  { rank: 3, being: 'DRAGON', symbol: 'TOOTH' },
  { rank: 4, being: 'GOBLIN', symbol: 'STONE_SWORD' },
]);

export function init() {
  return {
    opened: false,
    reads: 0,
    solved: false,
    output: {
      noteRevealed: false,
      noteTitle: 'Regeln der Antike',
      rule: 'Verbinde das Mächtigste mit dem Schwächsten.',
    },
  };
}

export function exportPublic(state) {
  return {
    solved: !!state.solved,
    opened: !!state.opened,
    reads: Number(state.reads || 0),
    hierarchy: HIERARCHY,
    output: { ...state.output },
    nextActions: state.solved
      ? []
      : ['inspect/read/open'],
  };
}

export function apply(state, action) {
  if (!action || !VALID_OBJECTS.has(action.objectId)) {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = String(action.verb || '').trim().toLowerCase();
  const next = clone(state);

  switch (verb) {
    case 'interact':
    case 'inspect':
    case 'open':
    case 'read':
    case 'take_note': {
      next.opened = true;
      next.reads = Number(next.reads || 0) + 1;
      next.solved = true;
      next.output.noteRevealed = true;
      return ok(next);
    }

    case 'reset':
      return ok(init());

    default:
      return fail(state, 'INVALID_VERB');
  }
}

function ok(nextState) {
  return makeResult({
    state: nextState,
    diff: { [PUZZLE_KEY]: exportPublic(nextState) },
    ok: true,
    error: null,
  });
}

function fail(state, errorCode) {
  return makeResult({
    state,
    diff: {},
    ok: false,
    error: errorCode,
  });
}

function clone(s) {
  return {
    opened: !!s.opened,
    reads: Number(s.reads || 0),
    solved: !!s.solved,
    output: { ...(s.output || {}) },
  };
}
