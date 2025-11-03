//Platzhalter-Spiel für Testing

import { makeResult } from './fsm.js';

export function init() {
  // 3x3 Grid als Beispiel
  return {
    grid: [
      [1,0,1],
      [0,1,0],
      [1,0,1]
    ],
    solved: false
  };
}

export function apply(state, action) {
  if (state.solved) return makeResult({ state });

  if (action.objectId?.startsWith('light:') && action.verb === 'press') {
    const [_, r, c] = action.objectId.split(':'); // z. B. light:1:2
    const row = Number(r), col = Number(c);
    const next = toggle(state, row, col);
    next.solved = isZero(next.grid);
    return makeResult({ state: next, diff: { lightsOut: exportPublic(next) } });
  }

  return makeResult({ state, ok: false, error: 'INVALID_ACTION' });
}

function toggle(state, r, c) {
  const next = { grid: state.grid.map(row => row.slice()), solved: false };
  const dirs = [[0,0],[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dr,dc] of dirs) {
    const rr = r + dr, cc = c + dc;
    if (rr>=0 && rr<3 && cc>=0 && cc<3) next.grid[rr][cc] = next.grid[rr][cc] ? 0 : 1;
  }
  return next;
}

function isZero(grid) { return grid.every(row => row.every(v => v === 0)); }

export function exportPublic(state) {
  return { grid: state.grid, solved: state.solved };
}

export function isSolved(state) { return !!state.solved; }
