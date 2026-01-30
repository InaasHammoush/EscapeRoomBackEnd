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

  // Safe destructuring with a fallback to avoid the TypeError
  const grid = state.public.scroll_grid || {
    board: Array(9).fill(null),
    score: { player: 0, ghost: 0 },
    round: 1,
    completed: false,
    message: "Care for a game, mortal?"
  };

  let { board, score, round, completed, message } = grid;
  
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

  function checkWinner(b) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let [a, c, d] of lines) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
    }
    return null;
  }

  function calculateSmartMove(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    const findTrigger = (m) => {
      for (let l of lines) {
        const v = l.map(i => board[i]);
        if (v.filter(x => x === m).length === 2 && v.filter(x => x === null).length === 1) {
          return l[v.indexOf(null)];
        }
      }
      return null;
    };
    const win = findTrigger("O"); if (win !== null) return win;
    const block = findTrigger("X"); if (block !== null) return block;
    if (board[4] === null) return 4;
    return board.indexOf(null);
  }

  const nextGridState = { 
    board, 
    score, 
    round, 
    completed, 
    message,
    solved: completed // This tells RoomManager: "Only finish if the match is done"
  };

  return {
    ok: true,
    nextState: {
      ...state,
      public: { 
        ...state.public, 
        scroll_grid: nextGridState 
      }
    },
    diff: { scroll_grid: nextGridState }
  };
}