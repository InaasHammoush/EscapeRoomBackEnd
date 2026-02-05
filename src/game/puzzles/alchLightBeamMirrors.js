// src/game/puzzles/alchLightBeamMirrors.js
// Großes Puzzle (B-East): Spiegel/Lichtstrahl-Kalibrierung
//
// Objekt-ID: alch:mirror-array
//
// Aktionen:
// - mount_crystal
// - unmount_crystal
// - apply_runes   data: { tokens: ['ᚱ','ᛃ','ᚹ'] } oder ['R','J','W']
// - set_lever     data: { index: 0..2, value: 0..359 }
// - nudge_lever   data: { index: 0..2, delta: number }
// - calibrate
// - reset
//
// Ziel:
// 1) Kristall einsetzen
// 2) 3 Zielwinkel (aus Rune-Map) anwenden
// 3) Levers korrekt ausrichten
// 4) calibrate => solved / beam lit

import { makeResult } from './fsm.js';
import {
  normalizeAngle,
  deriveTargetsFromTokens,
  alignmentSummary,
} from './helpers/optics.js';

const PUZZLE_KEY = 'alchLightBeamMirrors';

export function init() {
  return {
    phase: 'IDLE',
    mountedCrystal: false,
    solved: false,

    // Zuletzt übernommene Rune-Infos (optional fürs Debug/Story)
    runeInput: {
      letters: [],
      hasExternalTargets: false,
    },

    // 3 Hebel/Fassetten
    levers: [
      { value: 0, target: 18, tol: 2 },
      { value: 0, target: 10, tol: 2 },
      { value: 0, target: 23, tol: 2 },
    ],

    beam: {
      lit: false,
      progressPct: 0,
      alignedSlots: [false, false, false],
    },

    attempts: 0,
    cooldownUntil: 0, // timestamp ms
    cooldownMsOnFail: 1500,
  };
}

export function apply(state, action, now = Date.now()) {
  if (!action || action.objectId !== 'alch:mirror-array') {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = String(action.verb ?? '').trim().toLowerCase();
  const next = clone(state);

  if (isCooldownActive(next, now) && verb !== 'reset') {
    return fail(state, 'COOLDOWN_ACTIVE');
  }

  // Bereits gelöst: nur reset zulassen
  if (next.solved && verb !== 'reset') {
    return fail(state, 'PUZZLE_ALREADY_SOLVED');
  }

  switch (verb) {
    case 'mount_crystal': {
      next.mountedCrystal = true;
      if (next.phase === 'IDLE') next.phase = 'CRYSTAL_MOUNTED';
      recomputeBeam(next);
      return ok(next);
    }

    case 'unmount_crystal': {
      next.mountedCrystal = false;
      next.beam.lit = false;
      if (!next.solved) next.phase = 'IDLE';
      recomputeBeam(next);
      return ok(next);
    }

    case 'apply_runes': {
      const tokens = action?.data?.tokens;
      const derived = deriveTargetsFromTokens(tokens);
      if (!derived.ok) return fail(state, derived.error);

      next.runeInput = {
        letters: derived.letters,
        hasExternalTargets: true,
      };

      for (let i = 0; i < 3; i += 1) {
        next.levers[i].target = derived.targets[i];
      }

      if (next.phase === 'IDLE') next.phase = 'TARGETS_SET';
      recomputeBeam(next);
      return ok(next);
    }

    case 'set_lever': {
      const idx = asIndex(action?.data?.index);
      const value = action?.data?.value;
      if (idx === null) return fail(state, 'INVALID_LEVER_INDEX');
      if (!Number.isFinite(Number(value))) return fail(state, 'INVALID_LEVER_VALUE');

      next.levers[idx].value = normalizeAngle(value);
      next.phase = 'ADJUSTING';
      recomputeBeam(next);
      return ok(next);
    }

    case 'nudge_lever': {
      const idx = asIndex(action?.data?.index);
      const delta = Number(action?.data?.delta);
      if (idx === null) return fail(state, 'INVALID_LEVER_INDEX');
      if (!Number.isFinite(delta)) return fail(state, 'INVALID_DELTA');

      next.levers[idx].value = normalizeAngle(next.levers[idx].value + delta);
      next.phase = 'ADJUSTING';
      recomputeBeam(next);
      return ok(next);
    }

    case 'calibrate': {
      if (!next.mountedCrystal) return fail(state, 'CRYSTAL_NOT_MOUNTED');

      recomputeBeam(next);

      if (next.beam.alignedSlots.every(Boolean)) {
        next.beam.lit = true;
        next.solved = true;
        next.phase = 'SOLVED';
        return ok(next);
      }

      // Fehlversuch: kurzer Cooldown
      next.attempts += 1;
      next.cooldownUntil = now + next.cooldownMsOnFail;
      next.phase = 'MISALIGNED';
      next.beam.lit = false;
      return ok(next);
    }

    case 'reset': {
      return ok(init());
    }

    default:
      return fail(state, 'INVALID_VERB');
  }
}

export function exportPublic(state) {
  const now = Date.now();
  const cooldownRemainingMs = Math.max(0, (state.cooldownUntil || 0) - now);

  return {
    phase: state.phase,
    solved: !!state.solved,
    mountedCrystal: !!state.mountedCrystal,

    // Targets absichtlich NICHT öffentlich (Cheat-Vermeidung)
    levers: state.levers.map((l) => ({
      value: l.value,
      tol: l.tol,
    })),

    beam: {
      lit: !!state.beam.lit,
      progressPct: Number(state.beam.progressPct || 0),
      alignedSlots: [...(state.beam.alignedSlots || [false, false, false])],
    },

    runeInput: {
      hasExternalTargets: !!state.runeInput?.hasExternalTargets,
      lettersCount: Array.isArray(state.runeInput?.letters) ? state.runeInput.letters.length : 0,
    },

    attempts: Number(state.attempts || 0),
    cooldownRemainingMs,
    nextActions: deriveNextActions(state, cooldownRemainingMs),
  };
}

export function isSolved(state) {
  return !!state.solved;
}

/* ---------------- internals ---------------- */

function recomputeBeam(s) {
  const summary = alignmentSummary(s.levers);
  s.beam.progressPct = summary.progressPct;
  s.beam.alignedSlots = summary.aligned;
  if (!s.mountedCrystal) s.beam.lit = false;
}

function deriveNextActions(state, cooldownRemainingMs) {
  if (state.solved) return [];

  if (cooldownRemainingMs > 0) return [];

  const actions = [];

  if (!state.mountedCrystal) actions.push('mount_crystal');
  if (!state.runeInput?.hasExternalTargets) actions.push('apply_runes(tokens[3])');

  actions.push('set_lever(index,value)');
  actions.push('nudge_lever(index,delta)');

  if (state.mountedCrystal) actions.push('calibrate');
  return actions;
}

function isCooldownActive(state, now) {
  return Number(state.cooldownUntil || 0) > now;
}

function asIndex(v) {
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  if (n < 0 || n > 2) return null;
  return n;
}

function ok(nextState) {
  return makeResult({
    state: nextState,
    diff: { [PUZZLE_KEY]: exportPublic(nextState) },
    ok: true,
    error: null,
  });
}

function fail(state, code) {
  return makeResult({
    state,
    diff: {},
    ok: false,
    error: code,
  });
}

function clone(s) {
  return {
    phase: s.phase,
    mountedCrystal: !!s.mountedCrystal,
    solved: !!s.solved,
    runeInput: {
      letters: Array.isArray(s.runeInput?.letters) ? [...s.runeInput.letters] : [],
      hasExternalTargets: !!s.runeInput?.hasExternalTargets,
    },
    levers: s.levers.map((l) => ({
      value: Number(l.value || 0),
      target: Number(l.target || 0),
      tol: Number(l.tol || 2),
    })),
    beam: {
      lit: !!s.beam?.lit,
      progressPct: Number(s.beam?.progressPct || 0),
      alignedSlots: Array.isArray(s.beam?.alignedSlots)
        ? [...s.beam.alignedSlots]
        : [false, false, false],
    },
    attempts: Number(s.attempts || 0),
    cooldownUntil: Number(s.cooldownUntil || 0),
    cooldownMsOnFail: Number(s.cooldownMsOnFail || 1500),
  };
}
