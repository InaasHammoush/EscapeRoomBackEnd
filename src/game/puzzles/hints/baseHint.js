// src/game/puzzles/hints/baseHint.js
import crypto from 'node:crypto';
import { makeResult } from '../fsm.js';

/**
 * Generic Hint Module Factory
 * - objectId-bound actions
 * - progressive hint levels
 * - optional share token (for cross-room communication)
 */
export function createHintModule({
  puzzleKey,
  objectId,
  title,
  levels = [],
  share = null, // { enabled, revealAtLevel, prefix, length }
}) {
  if (!puzzleKey) throw new Error('createHintModule: puzzleKey is required');
  if (!objectId) throw new Error('createHintModule: objectId is required');

  function init() {
    const shareEnabled = !!share?.enabled;
    const revealAtLevel = Number(share?.revealAtLevel ?? 2);
    const token = shareEnabled
      ? generateToken(share?.prefix ?? 'HINT', Number(share?.length ?? 4))
      : null;

    return {
      objectId,
      title: title || puzzleKey,
      discovered: false,
      hintLevel: 0,        // 0 = nichts sichtbar
      viewedCount: 0,
      discoveredAt: null,
      updatedAt: null,
      share: {
        enabled: shareEnabled,
        revealAtLevel,
        token,
        shared: false,
      },
    };
  }

  function apply(state, action, now = Date.now()) {
    if (!action || action.objectId !== objectId) {
      return fail(state, 'INVALID_OBJECT');
    }

    const verb = String(action.verb || '').toLowerCase().trim();
    const next = cloneState(state);

    switch (verb) {
      case 'inspect': {
        // Entdecken + ersten Hinweis anzeigen
        if (!next.discovered) {
          next.discovered = true;
          next.discoveredAt = now;
        }
        if (next.hintLevel === 0 && levels.length > 0) {
          next.hintLevel = 1;
        }
        next.viewedCount += 1;
        next.updatedAt = now;
        return ok(next);
      }

      case 'request_hint': {
        if (!next.discovered) return fail(state, 'HINT_NOT_DISCOVERED');
        if (next.hintLevel >= levels.length) return fail(state, 'NO_MORE_HINTS');

        next.hintLevel += 1;
        next.updatedAt = now;
        return ok(next);
      }

      case 'mark_shared': {
        if (!next.share.enabled) return fail(state, 'SHARE_NOT_SUPPORTED');
        if (next.hintLevel < next.share.revealAtLevel) {
          return fail(state, 'SHARE_TOKEN_NOT_REVEALED');
        }
        next.share.shared = true;
        next.updatedAt = now;
        return ok(next);
      }

      case 'reset': {
        return ok(init());
      }

      default:
        return fail(state, 'INVALID_VERB');
    }
  }

  function exportPublic(state) {
    const maxHintLevel = levels.length;
    const currentText = resolveLevelText(levels, state.hintLevel, state);
    const shareTokenVisible =
      state.share.enabled && state.hintLevel >= state.share.revealAtLevel;

    return {
      objectId: state.objectId,
      title: state.title,

      discovered: !!state.discovered,
      hintLevel: Number(state.hintLevel || 0),
      maxHintLevel,

      text: currentText,
      canRequestMore:
        !!state.discovered && Number(state.hintLevel || 0) < maxHintLevel,

      meta: {
        viewedCount: Number(state.viewedCount || 0),
        discoveredAt: state.discoveredAt,
        updatedAt: state.updatedAt,
      },

      share: {
        enabled: !!state.share.enabled,
        revealed: shareTokenVisible,
        token: shareTokenVisible ? state.share.token : null,
        shared: !!state.share.shared,
      },

      // Für Frontend-Hilfsbuttons
      nextActions: deriveNextActions(state, maxHintLevel),
    };
  }

  function isSolved() {
    // Hinweise sollen Completion nicht blockieren
    return false;
  }

  function ok(nextState) {
    return makeResult({
      state: nextState,
      diff: { [puzzleKey]: exportPublic(nextState) },
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

  return { init, apply, exportPublic, isSolved };
}

// ---------- Helpers ----------
function resolveLevelText(levels, hintLevel, state) {
  if (!hintLevel || hintLevel < 1) return null;
  const idx = Math.min(hintLevel, levels.length) - 1;
  const level = levels[idx];
  if (typeof level === 'function') return level(state);
  return String(level ?? '');
}

function deriveNextActions(state, maxHintLevel) {
  const actions = ['inspect'];
  if (state.discovered && state.hintLevel < maxHintLevel) actions.push('request_hint');
  if (state.share.enabled && state.hintLevel >= state.share.revealAtLevel) actions.push('mark_shared');
  return actions;
}

function generateToken(prefix = 'HINT', length = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < length; i++) {
    const n = crypto.randomInt(0, alphabet.length);
    tail += alphabet[n];
  }
  return `${prefix}-${tail}`;
}

function cloneState(s) {
  return {
    objectId: s.objectId,
    title: s.title,
    discovered: !!s.discovered,
    hintLevel: Number(s.hintLevel || 0),
    viewedCount: Number(s.viewedCount || 0),
    discoveredAt: s.discoveredAt ?? null,
    updatedAt: s.updatedAt ?? null,
    share: {
      enabled: !!s.share?.enabled,
      revealAtLevel: Number(s.share?.revealAtLevel ?? 2),
      token: s.share?.token ?? null,
      shared: !!s.share?.shared,
    },
  };
}
