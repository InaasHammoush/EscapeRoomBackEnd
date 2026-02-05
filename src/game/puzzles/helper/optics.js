// src/game/puzzles/helpers/optics.js

export const DEFAULT_LETTER_TO_ANGLE = Object.freeze({
  R: 18,
  J: 10,
  W: 23,
});

export const RUNE_TO_LETTER = Object.freeze({
  'ᚱ': 'R',
  'ᛃ': 'J',
  'ᚹ': 'W',
});

export function normalizeAngle(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return ((n % 360) + 360) % 360;
}

export function angularDistance(a, b) {
  const aa = normalizeAngle(a);
  const bb = normalizeAngle(b);
  const d = Math.abs(aa - bb);
  return Math.min(d, 360 - d);
}

export function withinTolerance(value, target, tol = 2) {
  return angularDistance(value, target) <= Math.max(0, Number(tol) || 0);
}

export function toLetter(token) {
  const raw = String(token ?? '').trim().toUpperCase();
  if (!raw) return null;
  if (RUNE_TO_LETTER[raw]) return RUNE_TO_LETTER[raw];
  if (raw.length === 1 && /^[A-Z]$/.test(raw)) return raw;
  return null;
}

export function deriveTargetsFromTokens(tokens, letterToAngle = DEFAULT_LETTER_TO_ANGLE) {
  if (!Array.isArray(tokens) || tokens.length !== 3) {
    return { ok: false, error: 'TOKENS_MUST_BE_LENGTH_3' };
  }

  const letters = [];
  const targets = [];

  for (const token of tokens) {
    const letter = toLetter(token);
    if (!letter) return { ok: false, error: 'INVALID_RUNE_TOKEN' };

    const angle = letterToAngle[letter];
    if (!Number.isFinite(angle)) {
      return { ok: false, error: `NO_ANGLE_FOR_LETTER_${letter}` };
    }

    letters.push(letter);
    targets.push(normalizeAngle(angle));
  }

  return { ok: true, letters, targets };
}

export function alignmentSummary(levers) {
  const aligned = levers.map((l) => withinTolerance(l.value, l.target, l.tol));

  // Progress als "Nähe" (0..100)
  const score = levers.reduce((sum, l) => {
    const dist = angularDistance(l.value, l.target);
    const maxDist = 90; // ab 90° zählt es als "sehr weit weg"
    const closeness = 1 - Math.min(dist, maxDist) / maxDist;
    return sum + closeness;
  }, 0);

  const progressPct = Math.round((score / levers.length) * 100);
  const allAligned = aligned.every(Boolean);

  return { aligned, progressPct, allAligned };
}
