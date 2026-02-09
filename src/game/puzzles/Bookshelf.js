// server/src/puzzles/Bookshelf.js

export function apply(state, action) {
  let { currentOrder, solved, message } = state.public.bookshelf;
  const { bookshelfSolution } = state.internal;

  if (solved) return { ok: false, error: "ALREADY_SOLVED" };

  if (action.verb === "REORDER") {
    const { fromIndex, toIndex } = action.data;

    // 1. Validation
    if (fromIndex === toIndex) return { ok: true, nextState: state };

    // 2. Perform the Move (Drag and Drop Logic)
    const nextOrder = [...currentOrder];
    const [movedItem] = nextOrder.splice(fromIndex, 1); // Remove from old spot
    nextOrder.splice(toIndex, 0, movedItem);           // Insert at new spot

    currentOrder = nextOrder;

    // 3. Check Win Condition
    const isWinner = currentOrder.every((val, index) => val === bookshelfSolution[index]);

    if (isWinner) {
      solved = true;
    }
  }

  const nextBookshelfState = { currentOrder, solved };

  return {
    ok: true,
    nextState: {
      ...state,
      public: { ...state.public, bookshelf: nextBookshelfState }
    },
    diff: { bookshelf: nextBookshelfState }
  };
}