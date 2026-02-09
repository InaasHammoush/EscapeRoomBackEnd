// server/src/puzzles/CandlePuzzle.js

export function apply(state, action) {
  let { states, solved } = state.public.candle_puzzle;
  let { candleSolution, playerAttempt } = state.internal;

  if (solved) return { ok: false, error: "ALREADY_SOLVED" };

  if (action.verb === "TOGGLE") {
    const { candleId } = action.data;

    // Ignore if the candle is already off or invalid ID
    if (states[candleId] === false || candleId < 0 || candleId > 3) {
      return { ok: true, nextState: state };
    }

    // 1. Extinguish the candle visually and record the attempt
    states[candleId] = false;
    playerAttempt.push(candleId);

    // 2. Check if the player has finished the sequence
    if (playerAttempt.length === 4) {
      // Check if the attempt matches the solution exactly
      const isCorrect = playerAttempt.every((val, index) => val === candleSolution[index]);

      if (isCorrect) {
        solved = true;
      } else {
        // WRONG ORDER: Delay feedback until the end, then reset
        states = [true, true, true, true];
        playerAttempt = [];
      }
    }
  }

  const nextCandleState = { states, solved };

  return {
    ok: true,
    nextState: {
      ...state,
      public: { ...state.public, candle_puzzle: nextCandleState },
      internal: { ...state.internal, playerAttempt }
    },
    diff: { candle_puzzle: nextCandleState }
  };
}