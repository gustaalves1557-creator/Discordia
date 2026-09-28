import { io } from 'socket.io-client';
import { getToken, getApiUrl } from './api';

let socket = null;
let socketUrl = null;
export function getSocket() {
  const url = getApiUrl();
  if (socket && socketUrl === url && socket.connected) return socket;
  if (socket) socket.disconnect();
  socketUrl = url;
  socket = io(url, { auth: { token: getToken() } });
  return socket;
}
export function closeSocket() {
  socket?.disconnect(); socket = null; socketUrl = null;
}
