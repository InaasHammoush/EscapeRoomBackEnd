import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { RoomManager } from '../../rooms.js';
import * as FinalCorridor from '../final_corridor/finalDoorWordSync.js';

function mkAction(playerId, objectId, verb, data = {}) {
  return {
    actionId: crypto.randomUUID(),
    playerId,
    objectId,
    verb,
    data,
  };
}

const SLIDING_LOCK_SOLUTION = [1, 2, 3, 5, 6, 8, 5, 6];

async function startRoom(rm, roomId) {
  if (typeof rm.start === 'function') return rm.start(roomId);
  if (typeof rm.startRoom === 'function') return rm.startRoom(roomId);
  throw new Error('RoomManager has neither start() nor startRoom()');
}

function getRoom(rm, roomId) {
  if (rm.rooms?.get) return rm.rooms.get(roomId);
  if (typeof rm.getRoom === 'function') return rm.getRoom(roomId);
  return null;
}

test('Final corridor flow: runes -> keyword -> sync plates -> win', async () => {
  const rm = new RoomManager();
  const room = rm.createRoom('default');
  const roomId = room.id;

  await rm.joinRoom(roomId, 'sockA', 'A');
  await rm.joinRoom(roomId, 'sockB', 'B');
  await startRoom(rm, roomId);

  const live = getRoom(rm, roomId);
  assert.ok(live);

  // Wizard final prerequisite: seal key + solved scroll
  live.state.public.tictactoe_scroll = {
    ...(live.state.public.tictactoe_scroll || {}),
    solved: true,
  };
  live.state.internal.inventory.ASH_KEY = 1;

  let r = rm.applyAction(roomId, mkAction('sockA', 'puzzle_door_seal', 'INSERT', { item: 'ASH_KEY' }));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.door_seal?.openable, true);

  // Alchemist final prerequisite: east door flow
  live.state.internal.inventory.GOLDEN_KEY = 1;

  for (const tile of SLIDING_LOCK_SOLUTION) {
    r = rm.applyAction(roomId, mkAction('sockA', 'alch:east-sliding-lock', 'move', { tile }));
    assert.equal(r.ok, true, r.error);
  }

  live.state.public.alchLightBeamGrid ??= {};
  live.state.public.alchLightBeamGrid.solved = true;

  r = rm.applyAction(roomId, mkAction('sockA', 'alch:east-door-lock', 'insert', { item: 'GOLDEN_KEY' }));
  assert.equal(r.ok, true, r.error);
  r = rm.applyAction(roomId, mkAction('sockA', 'alch:east-door-switch', 'press', {}));
  assert.equal(r.ok, true, r.error);
  r = rm.applyAction(roomId, mkAction('sockB', 'alch:east-door-switch', 'press', {}));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.alchDoorState?.open, true);

  // Both room finals solved => 3+3 runes lit around doors
  assert.equal(!!live.state.public?.finalCorridor?.wizardRunesLit, true);
  assert.equal(!!live.state.public?.finalCorridor?.alchemistRunesLit, true);
  assert.equal(Number(live.state.public?.finalCorridor?.runesLitTotal || 0), 6);

  // Wrong keyword
  r = rm.applyAction(roomId, mkAction('sockA', 'final:door-keypad', 'submit', { word: 'loser' }));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.finalCorridor?.keywordSolved, false);
  assert.equal(live.state.public?.finalCorridor?.lastError, 'WRONG_KEYWORD');

  // Reveal hint + submit correct keyword
  r = rm.applyAction(roomId, mkAction('sockA', 'final:hint-note', 'read'));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.finalCorridor?.hintRevealed, true);
  assert.equal(typeof live.state.public?.finalCorridor?.runeHint?.ANSUZ, 'string');

  r = rm.applyAction(roomId, mkAction('sockA', 'final:door-keypad', 'submit', { word: 'winner' }));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.finalCorridor?.keywordSolved, true);

  // Sync pressure plates unlocks final door
  r = rm.applyAction(roomId, mkAction('sockA', 'final:plate-left', 'press'));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.finalCorridor?.finalDoorOpen, false);

  r = rm.applyAction(roomId, mkAction('sockB', 'final:plate-right', 'press'));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.finalCorridor?.finalDoorOpen, true);
  assert.equal(!!live.state.public?.finalCorridor?.solved, true);
  assert.equal(live.state.public?.game?.status, 'won');
  assert.equal(!!getRoom(rm, roomId)?.completed, true);
});

test('Final keyword is configurable via FINAL_KEYWORD env var', async () => {
  const before = process.env.FINAL_KEYWORD;
  process.env.FINAL_KEYWORD = 'victory';
  try {
    const rm = new RoomManager();
    const room = rm.createRoom('default');
    const expected = room?.state?.internal?.finalCorridor?.expectedKeyword;
    assert.equal(expected, 'victory');
  } finally {
    if (before === undefined) delete process.env.FINAL_KEYWORD;
    else process.env.FINAL_KEYWORD = before;
  }
});

test('Final corridor can hydrate internal state from public snapshot', () => {
  const restored = FinalCorridor.hydrateFromPublic({
    wizardRunesLit: true,
    alchemistRunesLit: true,
    wizardRunes: ['A', 'B', 'C'],
    alchemistRunes: ['D', 'E', 'F'],
    hintRevealed: true,
    keywordSolved: true,
    keywordAttempts: 4,
    syncWindowMs: 2500,
    plates: {
      left: { playerId: 'sockA', pressedAt: 1000 },
      right: { playerId: 'sockB', pressedAt: 1200 },
    },
    finalDoorOpen: true,
    solved: true,
    wonAt: 1300,
  }, 1400);

  assert.equal(restored.wizardRunesLit, true);
  assert.equal(restored.alchemistRunesLit, true);
  assert.deepEqual(restored.wizardRunes, ['A', 'B', 'C']);
  assert.deepEqual(restored.alchemistRunes, ['D', 'E', 'F']);
  assert.equal(restored.keywordSolved, true);
  assert.equal(restored.keywordAttempts, 4);
  assert.equal(restored.syncWindowMs, 2500);
  assert.equal(restored.plates.left.playerId, 'sockA');
  assert.equal(restored.plates.right.playerId, 'sockB');
  assert.equal(restored.finalDoorOpen, true);
  assert.equal(restored.solved, true);
  assert.equal(restored.wonAt, 1300);
});
