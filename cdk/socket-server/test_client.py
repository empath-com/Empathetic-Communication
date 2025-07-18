import asyncio
import socketio
import base64
import time
import os
import logging

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class TestClient:
    def __init__(self, socket_url="http://localhost:3000"):
        self.sio = socketio.AsyncClient()
        self.socket_url = socket_url
        self.connected = False
        self.received_audio = 0
        self.received_text = 0
        
        @self.sio.event
        async def connect():
            logger.info("✅ Connected to socket server")
            self.connected = True
            
        @self.sio.event
        async def disconnect():
            logger.info("❌ Disconnected from socket server")
            self.connected = False
            
        @self.sio.on("audio-chunk")
        async def on_audio_chunk(data):
            audio_data = data.get("data", "")
            audio_length = len(audio_data) if audio_data else 0
            self.received_audio += 1
            logger.info(f"🎵 Received audio chunk #{self.received_audio}, size: {audio_length}")
            
        @self.sio.on("text-message")
        async def on_text_message(data):
            text = data.get("text", "")
            self.received_text += 1
            logger.info(f"💬 Received text message #{self.received_text}: {text[:50]}...")
            
        @self.sio.on("nova-started")
        async def on_nova_started(data):
            logger.info(f"🚀 Nova started: {data}")
            
    async def connect(self):
        try:
            await self.sio.connect(self.socket_url)
            return True
        except Exception as e:
            logger.error(f"❌ Connection error: {e}")
            return False
            
    async def start_nova(self):
        logger.info("🚀 Starting Nova Sonic")
        await self.sio.emit("start-nova-sonic")
        
    async def send_audio(self, audio_bytes=None):
        if not audio_bytes:
            # Generate dummy audio (1 second of silence)
            audio_bytes = bytes([0] * 32000)  # 16000 Hz * 2 bytes * 1 second
            
        audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
        logger.info(f"🎤 Sending audio, size: {len(audio_bytes)} bytes")
        await self.sio.emit("audio-input", {"data": audio_b64})
        
    async def send_text(self, text):
        logger.info(f"📝 Sending text: {text}")
        await self.sio.emit("text-input", {"text": text})
        
    async def end_audio(self):
        logger.info("🛑 Ending audio input")
        await self.sio.emit("end-audio")
        
    async def disconnect(self):
        if self.connected:
            await self.sio.disconnect()

async def main():
    socket_url = os.getenv("SOCKET_URL", "http://localhost:3000")
    client = TestClient(socket_url)
    
    try:
        logger.info(f"Connecting to {socket_url}")
        if not await client.connect():
            logger.error("Failed to connect, exiting")
            return
            
        # Start Nova Sonic
        await client.start_nova()
        logger.info("Waiting for Nova to initialize...")
        await asyncio.sleep(5)
        
        # Send some test audio
        for i in range(3):
            await client.send_audio()
            logger.info(f"Sent test audio chunk {i+1}/3")
            await asyncio.sleep(2)
            
        # End audio and wait for response
        await client.end_audio()
        logger.info("Ended audio, waiting for response...")
        await asyncio.sleep(5)
        
        # Send a text message
        await client.send_text("Hello, can you hear me?")
        logger.info("Sent test text message")
        await asyncio.sleep(5)
        
        # Print summary
        logger.info(f"Test complete. Received {client.received_audio} audio chunks and {client.received_text} text messages.")
        
    except Exception as e:
        logger.error(f"Test error: {e}")
    finally:
        await client.disconnect()

if __name__ == "__main__":
    asyncio.run(main())