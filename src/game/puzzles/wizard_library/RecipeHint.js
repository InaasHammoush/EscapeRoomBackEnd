// src/game/puzzles/wizard_library/RecipeHint.js
import { makeResult } from "../fsm.js";

const PUZZLE_KEY = "recipe_hint";

export function init() {
  return {
    unlocked: false,
    recipeTaken: false,
  };
}

export function exportPublic(state) {
  return { ...state };
}

export function apply(state, action) {
  const verb = String(action?.verb || "").toUpperCase();
  const item = String(action?.data?.item || "").trim().toUpperCase().replace(/\s+/g, "_");

  switch (verb) {
    case "PLACE": {
      if (state.unlocked) return fail(state, "ALREADY_UNLOCKED");
      if (item !== "CHEST_KEY") return fail(state, "INVALID_ITEM");
      return ok({ ...state, unlocked: true });
    }
    case "TAKE": {
      if (!state.unlocked) return fail(state, "CHEST_LOCKED");
      if (state.recipeTaken) return fail(state, "ALREADY_TAKEN");
      return ok({ ...state, recipeTaken: true });
    }
    default:
      return fail(state, "INVALID_VERB");
  }
}

function ok(state) {
  return makeResult({
    ok: true,
    state,
    diff: { [PUZZLE_KEY]: exportPublic(state) },
  });
}

function fail(state, error) {
  return makeResult({ ok: false, state, error });
}
