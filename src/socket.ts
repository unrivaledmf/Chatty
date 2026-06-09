import { io } from 'socket.io-client';

// Determine socket URL based on environment. 
// In development, port 3000 is used on localhost or injected APP_URL.
export const socket = io(window.location.origin, {
  autoConnect: false,
});
