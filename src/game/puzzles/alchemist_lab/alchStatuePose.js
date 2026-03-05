// src/game/puzzles/alchStatuePose.js
import { makeResult } from '../fsm.js';

const PUZZLE_KEY = 'alchStatuePose';
const VALID_OBJECTS = new Set([
  'alch:statue',
  'alch:statue-pose',
  'puzzle_statue_pose',
]);

const TARGET_POSE = Object.freeze({
  leftArm: 'HALF_UP',   // linker Arm halb oben
  rightArm: 'ON_CHEST', // rechte Hand auf Brust
  head: 'UP',           // Kopf nach oben
});

export function init() {
  return {
    featherInserted: false,
    featherPosition: null,
    pose: {
      leftArm: 'DOWN',
      rightArm: 'DOWN',
      head: 'FORWARD',
    },
    targetPose: { ...TARGET_POSE },
    mouthOpened: false,
    solved: false,
    output: {
      poseMatched: false,
      flammaReady: false, // triggert NOTE_FLAMMA über Inventory-Bridge
      noteTaken: false,
    },
  };
}

export function exportPublic(state) {
  return {
    solved: !!state.solved,
    featherInserted: !!state.featherInserted,
    featherPosition: state.featherPosition,
    mouthOpened: !!state.mouthOpened,
    pose: { ...state.pose },
    output: {
      poseMatched: !!state.output?.poseMatched,
      flammaReady: !!state.output?.flammaReady,
      noteTaken: !!state.output?.noteTaken,
      phrase: state.output?.flammaReady ? 'FLAMMA' : null,
    },
    nextActions: state.solved
      ? []
      : [
          'insert(item=FEATHER)',
          'set_pose(leftArm,rightArm,head)',
          'set_part(part,to)',
          'check_pose',
        ],
  };
}

export function apply(state, action) {
  if (!action || !VALID_OBJECTS.has(action.objectId)) {
    return fail(state, 'INVALID_OBJECT');
  }

  const verb = String(action.verb || '').trim().toLowerCase();
  const next = clone(state);

  switch (verb) {
    case 'interact':
    case 'inspect':
      return makeResult({
        state: next,
        diff: {
          activeWidget: 'alch:statue',
          'alch:statue': exportPublic(next),
        },
        ok: true,
        error: null,
      });

    case 'insert': {
      const item = normalizeItem(action?.data?.item);
      if (item !== 'FEATHER') return fail(state, 'INVALID_ITEM');
      next.featherInserted = true;
      next.featherPosition = action?.data?.ear || 'RIGHT';
      maybeUnlock(next);
      console.log("[STATUE] after insert", {
        item,
        pose: next.pose,
        featherInserted: next.featherInserted,
        poseMatched: next.output?.poseMatched,
        mouthOpened: next.mouthOpened,
        solved: next.solved,
      });
      return ok(next);
    }

    case 'toggle_feather': {
      if (!next.featherInserted) return fail(state, 'NO_FEATHER_TO_TOGGLE');
      next.featherPosition = next.featherPosition === 'RIGHT' ? 'LEFT' : 'RIGHT';
      maybeUnlock(next);
      return ok(next);
    }

    case 'set_pose': {
      const patch = action?.data || {};
      const patched = applyPosePatch(next.pose, patch);
      if (!patched.ok) return fail(state, patched.error);
      next.pose = patched.pose;
      maybeUnlock(next);
      console.log("[STATUE] after set_pose", {
        patch,
        pose: next.pose,
        featherInserted: next.featherInserted,
        poseMatched: next.output?.poseMatched,
        mouthOpened: next.mouthOpened,
        solved: next.solved,
      });
      return ok(next);
    }

    case 'set_part':
    case 'rotate': {
      const partRaw = String(action?.data?.part || '').toLowerCase();
      const value = action?.data?.to ?? action?.data?.value;
      const patch = {};

      if (['leftarm', 'left_arm', 'left'].includes(partRaw)) patch.leftArm = value;
      else if (['rightarm', 'right_arm', 'right'].includes(partRaw)) patch.rightArm = value;
      else if (['head', 'kopf'].includes(partRaw)) patch.head = value;
      else return fail(state, 'INVALID_PART');

      const patched = applyPosePatch(next.pose, patch);
      if (!patched.ok) return fail(state, patched.error);
      next.pose = patched.pose;
      maybeUnlock(next);
      console.log("[STATUE] after set_part/rotate", {
        partRaw,
        value,
        patch,
        pose: next.pose,
        featherInserted: next.featherInserted,
        poseMatched: next.output?.poseMatched,
        mouthOpened: next.mouthOpened,
        solved: next.solved,
      });
      return ok(next);
    }

    case 'check_pose':
    case 'check':
    case 'submit':
    case 'confirm':
      maybeUnlock(next);
      console.log("[STATUE] after check", {
        pose: next.pose,
        featherInserted: next.featherInserted,
        poseMatched: next.output?.poseMatched,
        mouthOpened: next.mouthOpened,
        solved: next.solved,
      });
      return ok(next);

    case 'take': {
      const item = normalizeItem(action?.data?.item);
      if (item !== 'NOTE_FLAMMA') return fail(state, 'INVALID_ITEM');
      if (!next.output.flammaReady) return fail(state, 'NOT_READY');
      next.output.noteTaken = true;
      return ok(next);
    }

    case 'reset':
      return ok(init());

    default:
      return fail(state, 'INVALID_VERB');
  }
}

function maybeUnlock(s) {
  const poseMatched = posesEqual(s.pose, s.targetPose);
  s.output.poseMatched = poseMatched;

  if (s.featherInserted && s.featherPosition === 'LEFT' && poseMatched) {
    s.mouthOpened = true;
    s.solved = true;
    s.output.flammaReady = true;
  }
}

function applyPosePatch(current, patch) {
  const nextPose = { ...current };

  if (patch.leftArm !== undefined) {
    const v = normalizeLeftArm(patch.leftArm);
    if (!v) return { ok: false, error: 'INVALID_LEFT_ARM' };
    nextPose.leftArm = v;
  }

  if (patch.rightArm !== undefined) {
    const v = normalizeRightArm(patch.rightArm);
    if (!v) return { ok: false, error: 'INVALID_RIGHT_ARM' };
    nextPose.rightArm = v;
  }

  if (patch.head !== undefined) {
    const v = normalizeHead(patch.head);
    if (!v) return { ok: false, error: 'INVALID_HEAD' };
    nextPose.head = v;
  }

  return { ok: true, pose: nextPose };
}

function normalizeLeftArm(v) {
  const raw = String(v ?? '').trim().toUpperCase();
  if (['DOWN', 'UNTEN'].includes(raw)) return 'DOWN';
  if (['HALF_UP', 'HALFUP', 'HALB_OBEN', 'HALBOBEN'].includes(raw)) return 'HALF_UP';
  if (['UP', 'OBEN'].includes(raw)) return 'UP';
  return null;
}

function normalizeRightArm(v) {
  const raw = String(v ?? '').trim().toUpperCase();
  if (['DOWN', 'UNTEN'].includes(raw)) return 'DOWN';
  if (['ON_CHEST', 'CHEST', 'BRUST', 'AUF_BRUST'].includes(raw)) return 'ON_CHEST';
  if (['UP', 'OBEN'].includes(raw)) return 'UP';
  return null;
}

function normalizeHead(v) {
  const raw = String(v ?? '').trim().toUpperCase();
  if (['DOWN', 'UNTEN'].includes(raw)) return 'DOWN';
  if (['FORWARD', 'VORNE', 'GERADE'].includes(raw)) return 'FORWARD';
  if (['UP', 'OBEN'].includes(raw)) return 'UP';
  return null;
}

function posesEqual(a, b) {
  return (
    a?.leftArm === b?.leftArm &&
    a?.rightArm === b?.rightArm &&
    a?.head === b?.head
  );
}

function normalizeItem(input) {
  const raw = String(input ?? '').trim().toUpperCase();

  if (['FEATHER', 'FEDER'].includes(raw)) return 'FEATHER';
  if (['NOTE_FLAMMA', 'FLAMMA_NOTE', 'FLAMMA'].includes(raw)) return 'NOTE_FLAMMA';
  return raw || null;
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
    featherInserted: !!s.featherInserted,
    featherPosition: s.featherPosition,
    pose: { ...(s.pose || {}) },
    targetPose: { ...(s.targetPose || TARGET_POSE) },
    mouthOpened: !!s.mouthOpened,
    solved: !!s.solved,
    output: { ...(s.output || {}) },
  };
}
