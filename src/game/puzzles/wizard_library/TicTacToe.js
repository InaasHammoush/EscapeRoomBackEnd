// server/src/puzzles/TicTacToe.js

const TAUNTS = {
  PLAYER_MOVE: ["A bold choice...", "I've seen that before.", "Tick, tock...", "Still trying?"],
  GHOST_WIN_ROUND: ["Point for the departed.", "You're slow, mortal.", "The cold grows deeper.", "I have eternity. You don't.", "You'll never leave this room."],
  PLAYER_WIN_ROUND: ["Lucky guess.", "Enjoy your fleeting victory.", "A temporary setback."],
  MATCH_LOSS: ["Time is a circle. Let's begin again.", "You'll never leave this room.", "I have eternity. You don't."]
};

const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function init() {
  return {
    board: Array(9).fill(null),
    score: { player: 0, ghost: 0, draws: 0 },
    round: 1,
    message: "Care for a game, mortal?",
    solved: false,
    completed: false
  };
}

export function exportPublic(state) {
  return { ...state };
}

export function apply(state, action) {
  if (state.completed) return { ok: false, error: "GAME_ALREADY_FINISHED" };

  const nextState = {
    ...state,
    board: [...state.board],
    score: { ...state.score }
  };

  const { index, mark } = action.data;

  // Apply Player Move
  nextState.board[index] = mark;
  nextState.message = getRandom(TAUNTS.PLAYER_MOVE);

  // Game Logic
  let winner = checkWinner(nextState.board);
  
  // Ghost Turn (if no winner and board not full)
  if (!winner && nextState.board.includes(null)) {
    const ghostIndex = calculateSmartMove(nextState.board);
    nextState.board[ghostIndex] = "O";
    winner = checkWinner(nextState.board);
  }

  // End of Round/Match Logic
  if (winner || !nextState.board.includes(null)) {
    if (winner === "X") {
        nextState.score.player++;
        nextState.message = getRandom(TAUNTS.PLAYER_WIN_ROUND);
    } else if (winner === "O") {
        nextState.score.ghost++;
        nextState.message = getRandom(TAUNTS.GHOST_WIN_ROUND);
    } else {
        nextState.score.draws++;
        nextState.message = "A stalemate... for now.";
    }

    const totalRoundsPlayed = nextState.score.player + nextState.score.ghost + nextState.score.draws;

    // Victory
    if (nextState.score.player >= 3) {
      nextState.completed = true;
      nextState.solved = true; // Signals RoomManager completion
      nextState.message = "The scroll shrivels... the path is open.";
    } 
    // Defeat / Reset (Best of 5 limit)
    else if (nextState.score.ghost >= 3 || totalRoundsPlayed >= 5) {
      if (nextState.score.ghost >= 3) {
          nextState.message = getRandom(TAUNTS.MATCH_LOSS);
      } else {
          nextState.message = "Five rounds and no master? Time twists back upon itself...";
      }
      
      // Full Reset
      nextState.score = { player: 0, ghost: 0, draws: 0 }; 
      nextState.round = 1;
      nextState.board = Array(9).fill(null);
      nextState.completed = false; 
    } 
    // Next Round
    else {
      nextState.board = Array(9).fill(null);
      nextState.round++;
    }
  }

  // Return the result compatible with runPuzzle()
  return {
    ok: true,
    nextState: nextState, // Return only the local state
    diff: { tictactoe_scroll: nextState }
  };
}

// --- Helpers ---

function checkWinner(b) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (let [a, c, d] of lines) {
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  }
  return null;
}

function calculateSmartMove(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  
  const findTrigger = (mark) => {
      const potentialMoves = [];
      for (let l of lines) {
          const v = l.map(i => board[i]);
          if (v.filter(x => x === mark).length === 2 && v.filter(x => x === null).length === 1) {
              potentialMoves.push(l[v.indexOf(null)]);
          }
      }
      return potentialMoves.length > 0 ? potentialMoves : null;
  };

  const winMoves = findTrigger("O");
  if (winMoves) return winMoves[Math.floor(Math.random() * winMoves.length)];

  const blockMoves = findTrigger("X");
  if (blockMoves) return blockMoves[Math.floor(Math.random() * blockMoves.length)];

  const center = [4];
  const corners = [0, 2, 6, 8];
  
  const available = (list) => list.filter(i => board[i] === null);

  if (Math.random() > 0.3) {
    const bestChoices = [...available(center), ...available(corners)];
    if (bestChoices.length > 0) return bestChoices[Math.floor(Math.random() * bestChoices.length)];
  }

  const allAvailable = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
  return allAvailable[Math.floor(Math.random() * allAvailable.length)];
}