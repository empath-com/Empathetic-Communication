import { io } from "socket.io-client";
import { fetchAuthSession } from "aws-amplify/auth";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

// Create the socket ONCE synchronously at module load — this eliminates the
// race condition where two concurrent getSocket() callers both see socket===null,
// both await fetchAuthSession(), and both create separate socket instances
// (orphaning whichever one registered audio-chunk listeners first).
const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: false,
  auth: {},
});

// Refresh the auth token and connect (or reconnect) the socket.
// Safe to call concurrently — socket.connect() is a no-op when already connecting.
export async function getSocket() {
  if (!socket.connected) {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    socket.auth = { token };
    socket.connect();
  }
  return socket;
}

export { socket };
