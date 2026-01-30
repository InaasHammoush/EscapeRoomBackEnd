// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter
import * as TicTacToe from './TicTacToe.js';
import { makeResult } from './fsm.js';

export function initAll() {
  return {
    public: {
      scroll_grid: {
        board: Array(9).fill(null),
        score: { player: 0, ghost: 0 },
        round: 1,
        completed: false,
        message: "Care for a game, mortal?"
      }
    },
    internal: {
      // Track processed actionIds to prevent double-spending/lag-cheating
      processedActions: new Set(), 
    }
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
// server/src/puzzles/index.js

export function apply(state, action) {
  // 1. Logic for opening the widget
  if (action.objectId === 'test_box_01') {
    return {
      ok: true,
      nextState: state, // Since we just trigger a UI change, state remains same
      diff: {
        test_box_01: { showWidget: "scroll_grid" }
      }
    };
  }

  // 2. TicTacToe logic
  if (action.objectId === 'scroll_grid') {
    if (action.verb === 'PLACE_MARK') {
      const res = TicTacToe.apply(state, action);
      if (!res) return { ok: false, error: 'TIC_TAC_TOE_ERROR' };
      return res;
    }
  }

  // 3. Fallback
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
