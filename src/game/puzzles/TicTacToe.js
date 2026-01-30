// server/src/puzzles/TicTacToe.js

const TAUNTS = {
  PLAYER_MOVE: ["A bold choice...", "I've seen that before.", "Tick, tock...", "Still trying?"],
  GHOST_WIN_ROUND: ["Point for the departed.", "You're slow, mortal.", "The cold grows deeper."],
  PLAYER_WIN_ROUND: ["Lucky guess.", "Enjoy your fleeting victory.", "A temporary setback."],
  MATCH_LOSS: ["Time is a circle. Let's begin again.", "You'll never leave this room.", "I have eternity. You don't."]
};

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function apply(state, action) {
  const { index, mark } = action.data;
  let { board, score, round, completed, message } = state.public.scroll_grid;
  
  if (completed) return { ok: false, error: "GAME_ALREADY_FINISHED" };
  board = [...board];
  board[index] = mark;
  message = getRandom(TAUNTS.PLAYER_MOVE);

  let winner = checkWinner(board);
  
  if (!winner && board.includes(null)) {
    const ghostIndex = calculateSmartMove(board);
    board[ghostIndex] = "O";
    winner = checkWinner(board);
  }

  // End of Round Logic
  if (winner || !board.includes(null)) {
    if (winner === "X") {
        score.player++;
        message = getRandom(TAUNTS.PLAYER_WIN_ROUND);
    } else if (winner === "O") {
        score.ghost++;
        message = getRandom(TAUNTS.GHOST_WIN_ROUND);
    }

    if (score.player >= 3) {
      completed = true;
      message = "The scroll shrivels... the path is open.";
    } else if (score.ghost >= 3) {
      // THE GHOSTLY RESET: Match lost
      message = getRandom(TAUNTS.MATCH_LOSS);
      score = { player: 0, ghost: 0 }; // Reset the score
      round = 1;                      // Reset rounds
      board = Array(9).fill(null);    // Clear board
      // Note: completed remains false so they can try again immediately
    } else {
      board = Array(9).fill(null);
      round++;
    }
  }

  const nextGridState = { board, score, round, completed, message };
  return {
    ok: true,
    nextState: {
      ...state,
      public: { ...state.public, scroll_grid: nextGridState }
    },
    diff: { scroll_grid: nextGridState }
  };
}