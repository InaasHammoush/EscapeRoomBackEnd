// src/game/puzzles/merlinScale.js

import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'merlin_scale';

// Define the 4 interactable items
const ITEMS = ['WAND', 'STONE', 'HORN', 'DRAGON_SCALE'];

export function init() {
  return {
    floating: [...ITEMS], // All items start floating
    left: [],             // Left scale tray
    right: [],            // Right scale tray
    solved: false
  };
}

export function exportPublic(state) {
  return {
    floating: [...state.floating],
    left: [...state.left],
    right: [...state.right],
    solved: state.solved
  };
}

export function apply(state, action) {
  if (state.solved) return fail(state, "ALREADY_SOLVED");
  if (action.verb !== "MOVE") return fail(state, "INVALID_VERB");

  const { item, to } = action.data; // Expected 'to': 'LEFT', 'RIGHT', or 'FLOATING'
  
  if (!item || !to) return fail(state, "MISSING_DATA");
  if (!ITEMS.includes(item)) return fail(state, "INVALID_ITEM");
  if (!['LEFT', 'RIGHT', 'FLOATING'].includes(to)) return fail(state, "INVALID_DESTINATION");

  const next = clone(state);

  // 1. Remove item from its current location
  if (next.floating.includes(item)) next.floating = next.floating.filter(i => i !== item);
  if (next.left.includes(item)) next.left = next.left.filter(i => i !== item);
  if (next.right.includes(item)) next.right = next.right.filter(i => i !== item);

  // 2. Add item to the new destination
  if (to === 'LEFT') next.left.push(item);
  if (to === 'RIGHT') next.right.push(item);
  if (to === 'FLOATING') next.floating.push(item);

  // 3. Check Win Condition
  // Group A: Wand & Dragon Scale | Group B: Horn & Stone
  const hasGroupA = (arr) => arr.includes('WAND') && arr.includes('DRAGON_SCALE') && arr.length === 2;
  const hasGroupB = (arr) => arr.includes('HORN') && arr.includes('STONE') && arr.length === 2;

  // It doesn't matter which side Group A or B is on, as long as they balance each other out
  const isBalanced = (hasGroupA(next.left) && hasGroupB(next.right)) || 
                     (hasGroupB(next.left) && hasGroupA(next.right));

  if (isBalanced) {
    next.solved = true;
  }

  return ok(next);
}

// --- Helpers ---
function clone(s) {
  return {
    floating: [...s.floating],
    left: [...s.left],
    right: [...s.right],
    solved: s.solved
  };
}

function ok(state) {
  return makeResult({
    ok: true,
    state: state, 
    diff: { [PUZZLE_KEY]: exportPublic(state) }
  });
}

function fail(state, error) {
  return makeResult({ 
    ok: false, 
    state: state, 
    error 
  });
}