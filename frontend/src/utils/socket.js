import { io } from "socket.io-client";
import { fetchAuthSession } from "aws-amplify/auth";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL;

let socket = null;

export async function getSocket() {
  if (socket) {
    // Reuse the existing socket instance even if temporarily disconnected;
    // creating a new one would orphan any listeners registered on the old one.
    if (!socket.connected) socket.connect();
    return socket;
  }
  
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  
  socket = io(SOCKET_URL, {
    transports: ["websocket"],
    autoConnect: false,
    auth: { token }
  });
  
  return socket;
}

export { socket };
