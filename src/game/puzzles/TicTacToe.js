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
    } else {
        message = "A stalemate... for now.";
    }

    // ✅ CRITICAL: Check if the match is decided (First to 3)
    if (score.player >= 3) {
        completed = true;
        message = "The scroll shrivels... the path is open.";
    } else if (score.ghost >= 3) {
        // Ghost wins match: Reset the nightmare
        message = getRandom(TAUNTS.MATCH_LOSS);
        score = { player: 0, ghost: 0 }; 
        round = 1;
        board = Array(9).fill(null);
        completed = false; // Player must start over
    } else {
        // Match continues to next round
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

    // 1. Priority: Can Ghost win? (Pick a random winning move if multiple exist)
    const winMoves = findTrigger("O");
    if (winMoves) return winMoves[Math.floor(Math.random() * winMoves.length)];

    // 2. Priority: Must Ghost block Player?
    const blockMoves = findTrigger("X");
    if (blockMoves) return blockMoves[Math.floor(Math.random() * blockMoves.length)];

    // 3. Strategic: Weighted Randomness
    // High weight for Center (4), Medium for Corners (0,2,6,8), Low for Edges
    const center = [4];
    const corners = [0, 2, 6, 8];
    const edges = [1, 3, 5, 7];

    const available = (list) => list.filter(i => board[i] === null);

    // 70% chance to pick Center/Corners if available, 30% to be "absent-minded"
    if (Math.random() > 0.3) {
      const bestChoices = [...available(center), ...available(corners)];
      if (bestChoices.length > 0) return bestChoices[Math.floor(Math.random() * bestChoices.length)];
    }

    // Fallback: Pick any remaining empty spot randomly
    const allAvailable = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
    return allAvailable[Math.floor(Math.random() * allAvailable.length)];
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