// src/game/puzzles/alchLightBeamGrid.js
// V2: echtes NxM-Grid-Lichtstrahlrätsel mit Spiegeln
//
// objectId: "alch:mirror-grid"
//
// Verbs:
// - place_mirror   data: { x, y, type: "/" | "\\" }
// - rotate_mirror  data: { x, y }
// - remove_mirror  data: { x, y }
// - set_source_dir data: { dir: "N"|"E"|"S"|"W" }   // optional
// - simulate
// - reset
//
// Solve-Bedingung:
// 1) alle Runen wurden vom Strahl getroffen
// 2) Strahl erreicht goal
//
// Notes:
// - Blocker-/Wall-Kacheln optional
// - Loop-Schutz über maxSteps + visited(state)

import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'alchLightBeamGrid';
const VALID_OBJECT_IDS = new Set(['alch:mirror-grid', 'puzzle_light_beam_grid']);

// ---------- 7x7 Preset (lösbar) ----------
export const GRID_7X7_PRESET = Object.freeze({
  width: 7,
  height: 7,

  source: { x: 0, y: 3, dir: 'E' },
  goal: { x: 6, y: 3 },

  // WICHTIG: Keine Rune auf Referenz-Spiegelzellen
  runes: [
    { id: 'R1', x: 2, y: 1 },
    { id: 'R2', x: 4, y: 0 },
    { id: 'R3', x: 5, y: 2 },
  ],

  blockers: [],
  mirrors: [],
  maxMirrors: 10,
  maxStepsFactor: 8,
});

// Referenz-Lösung fürs QA/Testen
export const GRID_7X7_REFERENCE_MIRRORS = Object.freeze([
  { x: 2, y: 3, type: '/' },
  { x: 2, y: 0, type: '/' },
  { x: 5, y: 0, type: '\\' },
  { x: 5, y: 3, type: '\\' },
]);

const DEFAULT_CONFIG = GRID_7X7_PRESET;

// ---------- Direction helpers ----------
const DIRS = ['N', 'E', 'S', 'W'];
const DX = { N: 0, E: 1, S: 0, W: -1 };
const DY = { N: -1, E: 0, S: 1, W: 0 };

function turnOnMirror(dir, mirrorType) {
  // "/" mapping: N->E, E->N, S->W, W->S
  // "\" mapping: N->W, W->N, S->E, E->S
  if (mirrorType === '/') {
    if (dir === 'N') return 'E';
    if (dir === 'E') return 'N';
    if (dir === 'S') return 'W';
    if (dir === 'W') return 'S';
  } else if (mirrorType === '\\') {
    if (dir === 'N') return 'W';
    if (dir === 'W') return 'N';
    if (dir === 'S') return 'E';
    if (dir === 'E') return 'S';
  }
  return dir;
}

// ---------- Init ----------
export function init(config = {}) {
  const cfg = normalizeConfig({ ...DEFAULT_CONFIG, ...config });

  const mirrors = {};
  for (const m of cfg.mirrors) {
    mirrors[key(m.x, m.y)] = m.type;
  }

  const st = {
    config: cfg,
    mirrors, // map "x,y" -> "/" | "\"
    runesActive: {}, // id -> bool
    beam: {
      segments: [],
      exited: false,
      hitGoal: false,
      steps: 0,
      stoppedReason: 'NOT_SIMULATED',
    },
    solved: false,
    phase: 'SETUP',
    attempts: 0,
  };

  // Initialsimulation (praktisch fürs Frontend)
  recompute(st);
  return st;
}

// ---------- Apply ----------
export function apply(state, action) {
  if (!action || !VALID_OBJECT_IDS.has(String(action.objectId || '').trim())) {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = String(action.verb || '').toLowerCase().trim();
  const next = clone(state);

  if (verb === 'interact' || verb === 'inspect' || verb === 'open') {
    return makeResult({
      state: next,
      diff: {
        activeWidget: PUZZLE_KEY,
        [PUZZLE_KEY]: exportPublic(next),
      },
      ok: true,
      error: null,
    });
  }

  switch (verb) {
    case 'place_mirror': {
      const x = asInt(action?.data?.x);
      const y = asInt(action?.data?.y);
      const type = action?.data?.type;

      if (!isInBounds(next, x, y)) return fail(state, 'OUT_OF_BOUNDS');
      if (!isMirrorType(type)) return fail(state, 'INVALID_MIRROR_TYPE');
      if (isReservedCell(next, x, y)) return fail(state, 'CELL_RESERVED');
      if (isBlocked(next, x, y)) return fail(state, 'CELL_BLOCKED');

      const k = key(x, y);
      if (!next.mirrors[k] && mirrorCount(next) >= next.config.maxMirrors) {
        return fail(state, 'MAX_MIRRORS_REACHED');
      }

      next.mirrors[k] = type;
      next.phase = 'ADJUSTING';
      recompute(next);
      return ok(next);
    }

    case 'rotate_mirror': {
      const x = asInt(action?.data?.x);
      const y = asInt(action?.data?.y);
      if (!isInBounds(next, x, y)) return fail(state, 'OUT_OF_BOUNDS');

      const k = key(x, y);
      if (!next.mirrors[k]) return fail(state, 'NO_MIRROR_AT_CELL');

      next.mirrors[k] = next.mirrors[k] === '/' ? '\\' : '/';
      next.phase = 'ADJUSTING';
      recompute(next);
      return ok(next);
    }

    case 'remove_mirror': {
      const x = asInt(action?.data?.x);
      const y = asInt(action?.data?.y);
      if (!isInBounds(next, x, y)) return fail(state, 'OUT_OF_BOUNDS');

      const k = key(x, y);
      if (!next.mirrors[k]) return fail(state, 'NO_MIRROR_AT_CELL');

      delete next.mirrors[k];
      next.phase = 'ADJUSTING';
      recompute(next);
      return ok(next);
    }

    case 'set_source_dir': {
      const dir = String(action?.data?.dir || '').toUpperCase();
      if (!DIRS.includes(dir)) return fail(state, 'INVALID_DIR');

      next.config.source.dir = dir;
      next.phase = 'ADJUSTING';
      recompute(next);
      return ok(next);
    }

    case 'simulate': {
      next.attempts += 1;
      recompute(next);
      next.phase = next.solved ? 'SOLVED' : 'SIMULATED';
      return ok(next);
    }

    case 'reset': {
      const cfg = next.config;
      return ok(init(cfg));
    }

    default:
      return fail(state, 'INVALID_VERB');
  }
}

// ---------- Public export ----------
export function exportPublic(state) {
  const { width, height, source, goal, runes, blockers, maxMirrors } = state.config;

  return {
    phase: state.phase,
    solved: !!state.solved,
    attempts: Number(state.attempts || 0),

    grid: { width, height, maxMirrors },

    source: { ...source },
    goal: { ...goal },

    runes: runes.map(r => ({
      id: r.id,
      x: r.x,
      y: r.y,
      active: !!state.runesActive[r.id],
    })),

    blockers: blockers.map(b => ({ x: b.x, y: b.y })),

    mirrors: Object.entries(state.mirrors).map(([k, type]) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y, type };
    }),

    beam: {
      segments: state.beam.segments, // [{x1,y1,x2,y2}]
      exited: !!state.beam.exited,
      hitGoal: !!state.beam.hitGoal,
      steps: state.beam.steps,
      stoppedReason: state.beam.stoppedReason,
    },

    progress: {
      activeRunes: Object.values(state.runesActive).filter(Boolean).length,
      totalRunes: state.config.runes.length,
      runesComplete:
        Object.values(state.runesActive).filter(Boolean).length === state.config.runes.length,
      goalReached: !!state.beam.hitGoal,
    },

    nextActions: deriveNextActions(state),
  };
}

export function isSolved(state) {
  return !!state.solved;
}

// ---------- Core simulation ----------
function recompute(st) {
  const sim = simulateBeam(st);

  st.beam = {
    segments: sim.segments,
    exited: sim.exited,
    hitGoal: sim.hitGoal,
    steps: sim.steps,
    stoppedReason: sim.stoppedReason,
  };

  st.runesActive = {};
  for (const r of st.config.runes) {
    st.runesActive[r.id] = sim.hitCells.has(key(r.x, r.y));
  }

  const allRunes = st.config.runes.every(r => st.runesActive[r.id]);
  st.solved = allRunes && sim.hitGoal;
  if (st.solved) st.phase = 'SOLVED';
}

function simulateBeam(st) {
  const cfg = st.config;
  const maxSteps = cfg.width * cfg.height * cfg.maxStepsFactor;

  let x = cfg.source.x;
  let y = cfg.source.y;
  let dir = cfg.source.dir;

  const hitCells = new Set([key(x, y)]);
  const segments = [];
  const visited = new Set(); // state loops: x,y,dir
  let steps = 0;

  while (steps < maxSteps) {
    const vKey = `${x},${y},${dir}`;
    if (visited.has(vKey)) {
      return {
        segments,
        hitCells,
        hitGoal: hitCells.has(key(cfg.goal.x, cfg.goal.y)),
        exited: false,
        steps,
        stoppedReason: 'LOOP_DETECTED',
      };
    }
    visited.add(vKey);

    // move one tile
    const nx = x + DX[dir];
    const ny = y + DY[dir];

    // draw segment from center(x,y) to center(nx,ny)
    segments.push({
      x1: x, y1: y,
      x2: nx, y2: ny,
    });

    steps += 1;

    // out of bounds -> exit
    if (!inBounds(cfg.width, cfg.height, nx, ny)) {
      return {
        segments,
        hitCells,
        hitGoal: hitCells.has(key(cfg.goal.x, cfg.goal.y)),
        exited: true,
        steps,
        stoppedReason: 'OUT_OF_BOUNDS',
      };
    }

    x = nx;
    y = ny;
    hitCells.add(key(x, y));

    // blocker absorbs beam
    if (cfg.blockers.some(b => b.x === x && b.y === y)) {
      return {
        segments,
        hitCells,
        hitGoal: hitCells.has(key(cfg.goal.x, cfg.goal.y)),
        exited: false,
        steps,
        stoppedReason: 'BLOCKER_HIT',
      };
    }

    // mirror reflection
    const m = st.mirrors[key(x, y)];
    if (m) {
      dir = turnOnMirror(dir, m);
    }
  }

  return {
    segments,
    hitCells,
    hitGoal: hitCells.has(key(cfg.goal.x, cfg.goal.y)),
    exited: false,
    steps,
    stoppedReason: 'MAX_STEPS_REACHED',
  };
}

// ---------- Utilities ----------
function deriveNextActions(state) {
  if (state.solved) return [];
  return [
    'place_mirror(x,y,type)',
    'rotate_mirror(x,y)',
    'remove_mirror(x,y)',
    'simulate',
  ];
}

function normalizeConfig(cfg) {
  const width = Math.max(5, asInt(cfg.width) ?? 7);
  const height = Math.max(5, asInt(cfg.height) ?? 7);

  const source = {
    x: clamp(asInt(cfg.source?.x) ?? 0, 0, width - 1),
    y: clamp(asInt(cfg.source?.y) ?? Math.floor(height / 2), 0, height - 1),
    dir: DIRS.includes(cfg.source?.dir) ? cfg.source.dir : 'E',
  };

  const goal = {
    x: clamp(asInt(cfg.goal?.x) ?? (width - 1), 0, width - 1),
    y: clamp(asInt(cfg.goal?.y) ?? Math.floor(height / 2), 0, height - 1),
  };

  const runes = Array.isArray(cfg.runes) ? cfg.runes.map((r, i) => ({
    id: String(r.id ?? `R${i + 1}`),
    x: clamp(asInt(r.x) ?? 0, 0, width - 1),
    y: clamp(asInt(r.y) ?? 0, 0, height - 1),
  })) : [];

  const blockers = Array.isArray(cfg.blockers) ? cfg.blockers.map((b) => ({
    x: clamp(asInt(b.x) ?? 0, 0, width - 1),
    y: clamp(asInt(b.y) ?? 0, 0, height - 1),
  })) : [];

  const mirrors = Array.isArray(cfg.mirrors)
    ? cfg.mirrors
      .filter(m => isMirrorType(m.type))
      .map(m => ({
        x: clamp(asInt(m.x) ?? 0, 0, width - 1),
        y: clamp(asInt(m.y) ?? 0, 0, height - 1),
        type: m.type,
      }))
    : [];

  const maxMirrors = Math.max(1, asInt(cfg.maxMirrors) ?? 10);
  const maxStepsFactor = Math.max(2, asInt(cfg.maxStepsFactor) ?? 8);

  return { width, height, source, goal, runes, blockers, mirrors, maxMirrors, maxStepsFactor };
}

function isReservedCell(st, x, y) {
  const { source, goal, runes } = st.config;
  if (x === source.x && y === source.y) return true;
  if (x === goal.x && y === goal.y) return true;
  if (runes.some(r => r.x === x && r.y === y)) return true;
  return false;
}

function isBlocked(st, x, y) {
  return st.config.blockers.some(b => b.x === x && b.y === y);
}

function mirrorCount(st) {
  return Object.keys(st.mirrors).length;
}

function asInt(v) {
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  return n;
}

function inBounds(w, h, x, y) {
  return x >= 0 && x < w && y >= 0 && y < h;
}

function isInBounds(st, x, y) {
  if (x == null || y == null) return false;
  return inBounds(st.config.width, st.config.height, x, y);
}

function isMirrorType(t) {
  return t === '/' || t === '\\';
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function key(x, y) {
  return `${x},${y}`;
}

function ok(nextState) {
  return makeResult({
    state: nextState,
    diff: { [PUZZLE_KEY]: exportPublic(nextState) },
    ok: true,
    error: null,
  });
}

function fail(state, errorCode) {
  return makeResult({
    state,
    diff: {},
    ok: false,
    error: errorCode,
  });
}

function clone(s) {
  return {
    config: {
      width: s.config.width,
      height: s.config.height,
      source: { ...s.config.source },
      goal: { ...s.config.goal },
      runes: s.config.runes.map(r => ({ ...r })),
      blockers: s.config.blockers.map(b => ({ ...b })),
      mirrors: s.config.mirrors.map(m => ({ ...m })),
      maxMirrors: s.config.maxMirrors,
      maxStepsFactor: s.config.maxStepsFactor,
    },
    mirrors: { ...s.mirrors },
    runesActive: { ...s.runesActive },
    beam: {
      segments: s.beam.segments.map(seg => ({ ...seg })),
      exited: !!s.beam.exited,
      hitGoal: !!s.beam.hitGoal,
      steps: Number(s.beam.steps || 0),
      stoppedReason: s.beam.stoppedReason,
    },
    solved: !!s.solved,
    phase: s.phase,
    attempts: Number(s.attempts || 0),
  };
}
