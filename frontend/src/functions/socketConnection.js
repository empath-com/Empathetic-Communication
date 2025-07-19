// Get the WebSocket URL from environment variables
// For Vite, use import.meta.env instead of process.env
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 
                  window.SOCKET_URL || 
                  'http://localhost:3000';

// Create a proxy iframe for WebSocket communication
let proxyFrame;
let isProxyReady = false;
let pendingMessages = [];
let eventListeners = {};
let voiceIdToUse = 'lennart';

// Initialize the proxy iframe
function initializeProxy() {
  if (proxyFrame) return;
  
  // Create hidden iframe
  proxyFrame = document.createElement('iframe');
  proxyFrame.style.display = 'none';
  proxyFrame.src = '/proxy.html';
  document.body.appendChild(proxyFrame);
  
  // Listen for messages from the proxy
  window.addEventListener('message', handleProxyMessage);
}

// Handle messages from the proxy iframe
function handleProxyMessage(event) {
  // Only accept messages from our proxy
  if (event.source !== proxyFrame.contentWindow) return;
  
  const data = event.data;
  
  switch (data.type) {
    case 'PROXY_READY':
      console.log('WebSocket proxy ready');
      isProxyReady = true;
      // Initialize socket connection
      proxyFrame.contentWindow.postMessage({
        type: 'SOCKET_INIT',
        url: SOCKET_URL
      }, '*');
      break;
      
    case 'SOCKET_CONNECTED':
      console.log('Socket connected successfully');
      // Start Nova Sonic session
      proxyFrame.contentWindow.postMessage({
        type: 'SOCKET_EMIT',
        event: 'start-nova-sonic',
        payload: { voice_id: voiceIdToUse }
      }, '*');
      // Process any pending messages
      processPendingMessages();
      break;
      
    case 'SOCKET_DISCONNECTED':
      console.log('Socket disconnected');
      triggerEvent('disconnect');
      break;
      
    case 'SOCKET_ERROR':
      console.error('Socket error:', data.error);
      triggerEvent('error', data.error);
      break;
      
    case 'NOVA_STARTED':
      console.log('Nova session started:', data.data);
      triggerEvent('nova-started', data.data);
      break;
      
    case 'TEXT_MESSAGE':
      console.log('Received text message:', data.data);
      triggerEvent('text-message', data.data);
      break;
      
    case 'AUDIO_CHUNK':
      console.log('Received audio chunk, size:', data.data?.data ? data.data.data.length : 0);
      triggerEvent('audio-chunk', data.data);
      break;
  }
}

// Process any pending messages
function processPendingMessages() {
  while (pendingMessages.length > 0) {
    const msg = pendingMessages.shift();
    proxyFrame.contentWindow.postMessage(msg, '*');
  }
}

// Trigger event for listeners
function triggerEvent(event, data) {
  if (eventListeners[event]) {
    eventListeners[event].forEach(callback => callback(data));
  }
}

// Socket-like interface
const socket = {
  connected: false,
  on: (event, callback) => {
    if (!eventListeners[event]) {
      eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
  },
  off: (event) => {
    if (eventListeners[event]) {
      delete eventListeners[event];
    }
  },
  emit: (event, payload) => {
    const message = {
      type: 'SOCKET_EMIT',
      event,
      payload
    };
    
    if (isProxyReady) {
      proxyFrame.contentWindow.postMessage(message, '*');
    } else {
      pendingMessages.push(message);
    }
  },
  disconnect: () => {
    if (proxyFrame) {
      proxyFrame.contentWindow.postMessage({
        type: 'SOCKET_EMIT',
        event: 'disconnect'
      }, '*');
    }
  }
};

export const initializeSocket = (voiceId = 'lennart') => {
  voiceIdToUse = voiceId;
  
  // Initialize the proxy if not already done
  if (!proxyFrame) {
    initializeProxy();
  }
  
  return socket;
};

export const getSocket = () => {
  if (!proxyFrame) {
    return initializeSocket();
  }
  return socket;
};

export const closeSocket = () => {
  if (proxyFrame) {
    socket.disconnect();
    window.removeEventListener('message', handleProxyMessage);
    document.body.removeChild(proxyFrame);
    proxyFrame = null;
    isProxyReady = false;
    pendingMessages = [];
    eventListeners = {};
  }
};

export const sendAudioInput = (audioData) => {
  socket.emit('audio-input', { data: audioData });
};

export const endAudioInput = () => {
  socket.emit('end-audio');
};

export const startAudioInput = () => {
  socket.emit('start-audio');
};