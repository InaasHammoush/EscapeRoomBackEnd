import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { RoomManager } from '../../rooms.js';

const SLIDING_LOCK_SOLUTION = [1, 2, 3, 5, 6, 8, 5, 6];

function mkAction(playerId, objectId, verb, data = {}) {
  return {
    actionId: crypto.randomUUID(),
    playerId,
    objectId,
    verb,
    data,
  };
}

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

async function makeStartedSoloRoom(roomName = 'default', startingChamber = null) {
  const rm = new RoomManager({ statsEnabled: false });
  const room = rm.createRoom(roomName, {
    mode: 'solo',
    ...(startingChamber ? { startingChamber } : {}),
  });
  const roomId = room.id;
  await rm.joinRoom(roomId, 'sockSolo', 'Solo');
  await startRoom(rm, roomId);
  return { rm, roomId, live: getRoom(rm, roomId) };
}

test('Solo mode: chamber switching preserves room-local view and puzzle progress', async () => {
  const { rm, roomId, live } = await makeStartedSoloRoom();
  assert.ok(live);

  assert.equal(live.state.public.mode, 'solo');
  assert.equal(live.state.public.activeChamber, 'wizard_library');
  assert.deepEqual(live.state.public.availableChambers, ['wizard_library', 'alchemist_lab']);
  assert.match(String(live.state.public.views?.[0] || ''), /wizard_library/);

  let r = rm.applyViewRotation(roomId, { direction: 'RIGHT' });
  assert.equal(r.ok, true, r.error);
  assert.equal(live.state.public.viewIndex, 1);

  r = rm.switchChamber(roomId, 'alchemist');
  assert.equal(r.ok, true, r.error);
  assert.equal(live.state.public.activeChamber, 'alchemist_lab');
  assert.equal(live.state.public.roomType, 'alchemist_lab');
  assert.equal(live.state.public.viewIndex, 0);
  assert.match(String(live.state.public.views?.[0] || ''), /alchemist_lab/);

  r = rm.applyAction(roomId, mkAction('sockSolo', 'alch:east-sliding-lock', 'move', { tile: 1 }));
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(live.state.public.alchEastSlidingLock.board, [1, 0, 2, 4, 8, 3, 7, 6, 5]);

  r = rm.applyViewRotation(roomId, { direction: 'RIGHT' });
  assert.equal(r.ok, true, r.error);
  assert.equal(live.state.public.viewIndex, 1);

  r = rm.switchChamber(roomId, 'wizard');
  assert.equal(r.ok, true, r.error);
  assert.equal(live.state.public.activeChamber, 'wizard_library');
  assert.equal(live.state.public.viewIndex, 1);

  r = rm.switchChamber(roomId, 'alchemist_lab');
  assert.equal(r.ok, true, r.error);
  assert.equal(live.state.public.viewIndex, 1);
  assert.deepEqual(live.state.public.alchEastSlidingLock.board, [1, 0, 2, 4, 8, 3, 7, 6, 5]);
});

test('Solo mode: corridor switch diff preserves running game timer', async () => {
  const { rm, roomId, live } = await makeStartedSoloRoom();
  assert.ok(live);

  const startedAt = live.state.public?.game?.startedAt;
  assert.equal(typeof startedAt, 'number');

  live.state.public.corridorUnlocked = true;

  const r = rm.switchChamber(roomId, 'corridor');
  assert.equal(r.ok, true, r.error);
  assert.equal(r.diff.activeChamber, 'corridor');
  assert.equal(r.diff.game?.status, 'running');
  assert.equal(r.diff.game?.startedAt, startedAt);
});

test('Solo mode: east door opens on first press after key insert', async () => {
  const { rm, roomId, live } = await makeStartedSoloRoom('alchemist', 'alchemist');
  assert.ok(live);

  live.state.internal.inventory.GOLDEN_KEY = 1;

  let r;
  for (const tile of SLIDING_LOCK_SOLUTION) {
    r = rm.applyAction(roomId, mkAction('sockSolo', 'alch:east-sliding-lock', 'move', { tile }));
    assert.equal(r.ok, true, r.error);
  }

  live.state.public.alchLightBeamGrid ??= {};
  live.state.public.alchLightBeamGrid.solved = true;

  r = rm.applyAction(roomId, mkAction('sockSolo', 'alch:east-door-lock', 'insert', { item: 'GOLDEN_KEY' }));
  assert.equal(r.ok, true, r.error);

  r = rm.applyAction(roomId, mkAction('sockSolo', 'alch:east-door-switch', 'press'));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public.alchEastDoorSync.opened, true);
  assert.equal(!!live.state.public.doorState?.opened, true);
});

test('Solo mode: final plates can be pressed sequentially by one player', async () => {
  const { rm, roomId, live } = await makeStartedSoloRoom();
  assert.ok(live);
  const startedAt = live.state.public?.game?.startedAt;

  live.state.public.door_seal = { openable: true };
  live.state.public.tictactoe_scroll = { solved: true };
  live.state.public.alchDoorState = { open: true };

  let r = rm.applyAction(roomId, mkAction('sockSolo', 'final:hint-note', 'read'));
  assert.equal(r.ok, true, r.error);
  assert.equal(Number(live.state.public.finalCorridor?.runesLitTotal || 0), 6);

  r = rm.applyAction(roomId, mkAction('sockSolo', 'final:door-keypad', 'submit', { word: 'enigma' }));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public.finalCorridor?.keywordSolved, true);

  r = rm.applyAction(roomId, mkAction('sockSolo', 'final:plate-left', 'press'));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public.finalCorridor?.finalDoorOpen, false);
  assert.equal(!!live.state.public.finalCorridor?.plates?.left?.pressed, true);

  r = rm.switchChamber(roomId, 'alchemist');
  assert.equal(r.ok, true, r.error);

  r = rm.applyAction(roomId, mkAction('sockSolo', 'final:plate-right', 'press'));
  assert.equal(r.ok, true, r.error);
  assert.equal(!!live.state.public.finalCorridor?.finalDoorOpen, true);
  assert.equal(!!live.state.public.finalCorridor?.solved, true);
  assert.equal(live.state.public?.game?.status, 'won');
  assert.equal(live.completed, true);
  assert.ok(live.completedAt, 'completedAt should be set');
  assert.equal(
    live.completedAt,
    live.state.public?.game?.endedAt,
    'completedAt should match game endedAt when the final door opens'
  );
});
