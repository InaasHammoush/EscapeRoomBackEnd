// Zentraler Dispatcher: initAll() baut Gesamtzustand; apply() leitet an das richtige Puzzle weiter
import * as Coop from './coopSwitches.js';
import * as Lights from './lightsOut.js';
import { makeResult } from './fsm.js';

export function initAll() {
  return {
    public: {
      coopSwitches: Coop.exportPublic(Coop.init()),  // placeholder; wir speichern parallel
      lightsOut:    Lights.exportPublic(Lights.init())
    },
    internal: {
      coopSwitches: Coop.init(),
      lightsOut:    Lights.init()
    }
  };
}

/**
 * action = { actionId, playerId, objectId, verb, data }
 */
export function apply(state, action) {
  const now = Date.now();

  // Dispatch über objectId
  if (action.objectId === 'test_box_01'){
    console.log("Test Box 1 was interacted with!", action);
    return {
      ok: true,
      nextState: state, // No actual state change yet, just a UI trigger
      diff: {
        test_box_01: {
          showWidget: "keypad" // e.g., "keypad", "letter_safe", or null to close
        }
      }
    };
  }

  if (action.objectId === 'keypad' && action.verb === 'SUBMIT') {
    const submittedCode = action.data?.code;

    if (submittedCode === "1234") {
      console.log("🔓 Correct code entered!");
      
      // We clone the state to keep it immutable as per FSM principles 
      const nextState = JSON.parse(JSON.stringify(state)); 

      return {
        ok: true,
        nextState,
        diff: { 
          activeWidget: null, 
        }
      };
    }
}

  if (action.objectId?.startsWith('switch:')) {
    const res = Coop.apply(state.internal.coopSwitches, action, now);
    if (!res.ok) return res;
    const next = cloneState(state);
    next.internal.coopSwitches = res.nextState;
    next.public.coopSwitches = Coop.exportPublic(res.nextState);
    return makeResult({ state: next, diff: res.diff });
  }

  if (action.objectId?.startsWith('light:')) {
    const res = Lights.apply(state.internal.lightsOut, action, now);
    if (!res.ok) return res;
    const next = cloneState(state);
    next.internal.lightsOut = res.nextState;
    next.public.lightsOut = Lights.exportPublic(res.nextState);
    return makeResult({ state: next, diff: res.diff });
  }

  return makeResult({ state, ok: false, error: 'UNKNOWN_OBJECT' });
}

function cloneState(s) {
  // flach genug für Prototyp
  return {
    public: { ...s.public },
    internal: {
      coopSwitches: { ...s.internal.coopSwitches },
      lightsOut: {
        grid: s.internal.lightsOut.grid.map(r => r.slice()),
        solved: s.internal.lightsOut.solved
      }
    }
  };
}
