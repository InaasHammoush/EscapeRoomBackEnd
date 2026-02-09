// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter
import * as TicTacToe from './TicTacToe.js';
import * as Bookshelf from './bookshelf.js';
import { makeResult } from './fsm.js';

export function initAll() {
  return {
    public: {
      scroll_grid: {
        board: Array(9).fill(null),
        score: { player: 0, ghost: 0, draws: 0 },
        round: 1,
        message: "Care for a game, mortal?",
        solved: false,
        completed: false 
      },
      bookshelf_puzzle: {
        currentOrder: ["Red", "Green", "Blue", "Yellow"], 
        solved: false
      },
      candle_puzzle: {
        // true = lit, false = extinguished
        states: [true, true, true, true], 
        solved: false
      }
    },
    internal: {
      // Track processed actionIds to prevent double-spending/lag-cheating
      processedActions: new Set(), 
      bookshelfSolution: ["Yellow", "Red", "Blue", "Green"],
      // The specific order the candles must be put out
      candleSolution: [2, 0, 3, 1],
      // Tracks what candles the player has actually clicked
      playerAttempt: []
    }
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
// server/src/puzzles/index.js

export function apply(state, action) {
  // 1. EMERGENCY GUARD: If state or public is missing, use defaults
  // ----------------------------
  if (!state || !state.public) {
    state = initAll();
  }

  // 2. FILL MISSING KEYS: Ensure scroll_grid exists before passing it to the sub-module
  // ----------------------------
  // TODO: This is a band-aid for missing keys. A more robust solution would be to have a schema validation or a state management library that ensures all necessary keys are present.
  if (!state.public.scroll_grid) {
    state.public.scroll_grid = initAll().public.scroll_grid;
  }

  // 3. Logic for opening widgets
  // ---------------------------

  // TicTacToe scroll widget
  if (action.objectId === 'test_box_01') {
    return {
      ok: true,
      nextState: state, // Since we just trigger a UI change, state remains same
      diff: {
        test_box_01: { showWidget: "scroll_grid" }
      }
    };
  }

  // bookshelf puzzle widget
  if (action.objectId === 'bookshelf_01') {
    return {
      ok: true,
      nextState: state,
      diff: {
        bookshelf_01: { showWidget: "bookshelf_puzzle" }
      }
    };
  }

  // 4. puzzle logic handlers
  // ---------------------------

  // TicTacToe logic
  if (action.objectId === 'scroll_grid') {
    if (action.verb === 'PLACE_MARK') {
      const res = TicTacToe.apply(state, action);
      if (!res) return { ok: false, error: 'TIC_TAC_TOE_ERROR' };
      return res;
    }
  }

  // bookshelf puzzle logic
  if (action.objectId === 'bookshelf_puzzle') {
    return Bookshelf.apply(state, action);
  }

  // 5. Fallback
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
