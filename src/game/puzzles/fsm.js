// Ein kleines, gemeinsames Interface/Dokumentation
// Jedes Puzzle-Modul exportiert: init(), apply(state, action, now), exportPublic(state), isSolved(state)

export function makeResult({ state, diff = {}, ok = true, error = null }) {
  return { nextState: state, diff, ok, error };
}
