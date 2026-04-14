import { io } from 'socket.io-client';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const socket = io(BACKEND, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

export default socket;
