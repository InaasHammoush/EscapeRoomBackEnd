// src/tests/testSouthWallFlow.js
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { RoomManager } from '../../rooms.js';

function clone(obj) {
  if (globalThis.structuredClone) return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function getRoom(rm, roomId) {
  // je nach Implementierung:
  if (rm.rooms?.get) return rm.rooms.get(roomId);
  if (typeof rm.getRoom === 'function') return rm.getRoom(roomId);
  return null;
}

async function startRoom(rm, roomId) {
  // kompatibel für unterschiedliche Methodennamen
  if (typeof rm.start === 'function') return rm.start(roomId);
  if (typeof rm.startRoom === 'function') return rm.startRoom(roomId);
  throw new Error('RoomManager has neither start() nor startRoom()');
}

function invCount(room, item) {
  const inv = room?.state?.public?.inventory;
  if (!inv) return 0;

  // Fall A: Array direkt (legacy)
  if (Array.isArray(inv)) {
    const hit = inv.find(
      (e) => e?.item === item || e?.name === item || e?.id === item
    );
    return Number(hit?.count ?? hit?.amount ?? 0);
  }

  // Fall B: Neues Format { items: [...] }
  if (Array.isArray(inv.items)) {
    const hit = inv.items.find(
      (e) => e?.item === item || e?.name === item || e?.id === item
    );
    return Number(hit?.count ?? hit?.amount ?? 0);
  }

  // Fall C: Map-ähnliches Objekt { ITEM: count }
  if (typeof inv === 'object') {
    return Number(inv[item] ?? 0);
  }

  return 0;
}

function mkAction(objectId, verb = 'interact', data = {}) {
  return {
    actionId: crypto.randomUUID(),
    playerId: 'sockA',
    objectId,
    verb,
    data,
  };
}

async function makeStartedAlchemistRoom() {
  const rm = new RoomManager();
  const room = rm.createRoom('alchemist');
  const roomId = room.id;

  // join ist bei dir async
  await rm.joinRoom(roomId, 'sockA', 'Tester A');
  await startRoom(rm, roomId);

  const liveRoom = getRoom(rm, roomId);
  if (!liveRoom) throw new Error('Could not fetch room from RoomManager');
  return { rm, roomId, room: liveRoom };
}

test('South: Portrait gibt FEATHER + GOLD_NUGGET genau einmal', async () => {
  const { rm, roomId, room } = await makeStartedAlchemistRoom();

  const beforeFeather = invCount(room, 'FEATHER');
  const beforeGold = invCount(room, 'GOLD_NUGGET');

  const r1 = rm.applyAction(roomId, mkAction('alch:portrait-books', 'click'));
  assert.equal(r1.ok, true, r1.error ?? 'portrait click failed');

  assert.equal(invCount(room, 'FEATHER'), beforeFeather + 1, 'FEATHER should +1 on first click');
  assert.equal(invCount(room, 'GOLD_NUGGET'), beforeGold + 1, 'GOLD_NUGGET should +1 on first click');

  // Zweiter Klick darf nicht nochmal looten
  const r2 = rm.applyAction(roomId, mkAction('alch:portrait-books', 'click'));
  assert.equal(r2.ok, true, r2.error ?? 'second portrait click failed');

  assert.equal(invCount(room, 'FEATHER'), beforeFeather + 1, 'FEATHER should not duplicate');
  assert.equal(invCount(room, 'GOLD_NUGGET'), beforeGold + 1, 'GOLD_NUGGET should not duplicate');
});

test('South: Flask-Output-Flags geben 4 Rewards einmalig', async () => {
  const { rm, room } = await makeStartedAlchemistRoom();

  assert.equal(typeof rm._applyInventoryBridge, 'function', '_applyInventoryBridge missing');

  const baseCoal = invCount(room, 'COAL_BLOCK');
  const baseMoon = invCount(room, 'MOONWORT');
  const baseMatch = invCount(room, 'MATCHES');
  const baseGreen = invCount(room, 'GREEN_LIQUID');

  const prevPublic = clone(room.state.public);

  room.state.public.alchFlaskTransfer ??= {};
  room.state.public.alchFlaskTransfer.output ??= {};

  Object.assign(room.state.public.alchFlaskTransfer.output, {
    coalReady: true,
    moonwortReady: true,
    matchesReady: true,
    greenLiquidReady: true,
  });

  const changed = rm._applyInventoryBridge(
    room,
    prevPublic,
    mkAction('alch:flask-transfer', 'debug')
  );
  assert.equal(changed, true, 'Bridge should detect rising-edge rewards');

  assert.equal(invCount(room, 'COAL_BLOCK'), baseCoal + 1);
  assert.equal(invCount(room, 'MOONWORT'), baseMoon + 1);
  assert.equal(invCount(room, 'MATCHES'), baseMatch + 1);
  assert.equal(invCount(room, 'GREEN_LIQUID'), baseGreen + 1);

  // Kein erneutes Add ohne neue Rising-Edge
  const prev2 = clone(room.state.public);
  const changed2 = rm._applyInventoryBridge(
    room,
    prev2,
    mkAction('alch:flask-transfer', 'debug')
  );
  assert.equal(changed2, false, 'No duplicate rewards without new edge');
});

test('South: Flask solved-Fallback gibt Rewards auch ohne Einzel-Flags', async () => {
  const { rm, room } = await makeStartedAlchemistRoom();

  const baseCoal = invCount(room, 'COAL_BLOCK');
  const baseMoon = invCount(room, 'MOONWORT');
  const baseMatch = invCount(room, 'MATCHES');
  const baseGreen = invCount(room, 'GREEN_LIQUID');

  const prevPublic = clone(room.state.public);

  room.state.public.alchFlaskTransfer = {
    ...(room.state.public.alchFlaskTransfer || {}),
    solved: true,
    output: {}, // absichtlich ohne *_Ready Flags
  };

  const changed = rm._applyInventoryBridge(
    room,
    prevPublic,
    mkAction('alch:flask-transfer', 'debug')
  );
  assert.equal(changed, true, 'Fallback solved=true should reward once');

  assert.equal(invCount(room, 'COAL_BLOCK'), baseCoal + 1);
  assert.equal(invCount(room, 'MOONWORT'), baseMoon + 1);
  assert.equal(invCount(room, 'MATCHES'), baseMatch + 1);
  assert.equal(invCount(room, 'GREEN_LIQUID'), baseGreen + 1);
});

test('Regression: LightBeam Reward (LIGHT_SIGIL) nur auf solved-Rising-Edge', async () => {
  const { rm, room } = await makeStartedAlchemistRoom();

  const baseSigil = invCount(room, 'LIGHT_SIGIL');
  const prevPublic = clone(room.state.public);

  room.state.public.alchLightBeamGrid ??= {};
  room.state.public.alchLightBeamGrid.solved = true;

  const changed = rm._applyInventoryBridge(
    room,
    prevPublic,
    mkAction('alch:light-beam-grid', 'debug')
  );
  assert.equal(changed, true);
  assert.equal(invCount(room, 'LIGHT_SIGIL'), baseSigil + 1);

  // Kein doppeltes Rewarding
  const prev2 = clone(room.state.public);
  const changed2 = rm._applyInventoryBridge(
    room,
    prev2,
    mkAction('alch:light-beam-grid', 'debug')
  );
  assert.equal(changed2, false);
  assert.equal(invCount(room, 'LIGHT_SIGIL'), baseSigil + 1);
});
