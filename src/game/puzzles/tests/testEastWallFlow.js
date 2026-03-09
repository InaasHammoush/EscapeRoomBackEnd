import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { RoomManager } from '../../rooms.js';

function mkAction(playerId, objectId, verb, data = {}) {
  return {
    actionId: crypto.randomUUID(),
    playerId,
    objectId,
    verb,
    data
  };
}

async function startRoom(rm, roomId) {
  if (typeof rm.start === 'function') return rm.start(roomId);
  if (typeof rm.startRoom === 'function') return rm.startRoom(roomId);
  throw new Error('RoomManager has neither start() nor startRoom()');
}

const SLIDING_LOCK_SOLUTION = [1, 2, 3, 5, 6, 8, 5, 6];

function getRoom(rm, roomId) {
  if (rm.rooms?.get) return rm.rooms.get(roomId);
  if (typeof rm.getRoom === 'function') return rm.getRoom(roomId);
  return null;
}

test('East wall: sliding lock + key insert + sync press opens door', async () => {
  const rm = new RoomManager();
  const room = rm.createRoom('alchemist');
  const roomId = room.id;

  await rm.joinRoom(roomId, 'sockA', 'A');
  await rm.joinRoom(roomId, 'sockB', 'B');
  await startRoom(rm, roomId);

  const live = getRoom(rm, roomId);
  assert.ok(live);

  // ensure key exists for insert test
  live.state.internal.inventory.GOLDEN_KEY = 1;

  // 1) solve 3x3 slider from the harder default board
  let r;
  for (const tile of SLIDING_LOCK_SOLUTION) {
    r = rm.applyAction(roomId, mkAction('sockA', 'alch:east-sliding-lock', 'move', { tile }));
    assert.equal(r.ok, true, r?.error);
  }
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.alchEastSlidingLock?.solved, true);
  assert.equal(Number(live.state.public?.alchEastSlidingLock?.moves || 0), 8);

  // 2) simulate runes activated (light-beam solved)
  live.state.public.alchLightBeamGrid ??= {};
  live.state.public.alchLightBeamGrid.solved = true;

  // 3) insert golden key
  r = rm.applyAction(roomId, mkAction('sockA', 'alch:east-door-lock', 'insert', { item: 'GOLDEN_KEY' }));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.alchEastDoorSync?.keyInserted, true);

  // key consumed once
  assert.equal(Number(live.state.internal.inventory.GOLDEN_KEY ?? 0), 0);

  // 4) sync press by two distinct players within time window
  r = rm.applyAction(roomId, mkAction('sockA', 'alch:east-door-switch', 'press', {}));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public?.alchEastDoorSync?.opened, false);

  r = rm.applyAction(roomId, mkAction('sockB', 'alch:east-door-switch', 'press', {}));
  assert.equal(r.ok, true, r.error);

  assert.equal(!!live.state.public?.alchEastDoorSync?.opened, true);
  assert.equal(!!live.state.public?.doorState?.opened, true);
});
