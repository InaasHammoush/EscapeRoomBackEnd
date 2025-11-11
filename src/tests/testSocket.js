import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', { transports: ['websocket'] });

socket.on('connect', () => {
  console.log('✅ Connected:', socket.id);

  socket.emit('create_room', {}, (res) => {
    console.log('Room created:', res);
    socket.disconnect();      // close after response
    process.exit(0);           // force exit cleanly
  });
});

socket.on('connect_error', (err) => {
  console.error('❌ Connection error:', err.message);
  process.exit(1);
});
