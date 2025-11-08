import { RoomManager } from '../game/rooms.js';

const rooms = new RoomManager({ redis: null, store: null });
const r = rooms.createRoom();
console.log('Created room', r.id);

rooms.joinRoom(r.id, 'socket1', 'Alice');
rooms.joinRoom(r.id, 'socket2', 'Bob');

rooms.setReady(r.id, 'socket1', true);
rooms.setReady(r.id, 'socket2', true);

rooms.start(r.id);

const result = rooms.applyAction(r.id, {
  actionId: '1',
  playerId: 'socket1',
  objectId: 'switch:A',
  verb: 'toggle'
});
console.log('Action result:', result);
console.log('Snapshot:', rooms.snapshot(r.id));
