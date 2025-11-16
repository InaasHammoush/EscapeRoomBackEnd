// src/tests/testRoomManager.js
import assert from 'node:assert/strict';
import { RoomManager } from '../game/rooms.js';

async function main() {
  const rooms = new RoomManager({ redis: null, store: null });

  const room = rooms.createRoom();
  console.log('Created room', room.id);

  await rooms.joinRoom(room.id, 'socket1', 'Alice');
  await rooms.joinRoom(room.id, 'socket2', 'Bob');

  rooms.setReady(room.id, 'socket1', true);
  rooms.setReady(room.id, 'socket2', true);

  assert.equal(rooms.allReady(room.id), true, 'Alle Spieler sollten ready sein');

  rooms.start(room.id);

  const result = rooms.applyAction(room.id, {
    actionId: '1',
    playerId: 'socket1',
    objectId: 'switch:A',
    verb: 'toggle'
  });

  console.log('Action result:', result);
  console.log('Snapshot:', rooms.snapshot(room.id));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
