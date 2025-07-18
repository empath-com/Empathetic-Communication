import socketio
import asyncio
import base64
import time
import logging
import os

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def main():
    # Connect to local socket server
    sio = socketio.AsyncClient()
    
    @sio.event
    async def connect():
        logger.info("Connected to socket server")
    
    @sio.event
    async def disconnect():
        logger.info("Disconnected from socket server")
    
    @sio.on("audio-chunk")
    async def on_audio_chunk(data):
        audio_data = data.get("data", "")
        audio_length = len(audio_data) if audio_data else 0
        logger.info(f"Received audio chunk, size: {audio_length}")
        
        # Save audio to file
        if audio_data:
            try:
                audio_bytes = base64.b64decode(audio_data)
                with open(f"received_audio_{int(time.time())}.raw", "wb") as f:
                    f.write(audio_bytes)
                logger.info(f"Saved audio to file")
            except Exception as e:
                logger.error(f"Error saving audio: {e}")
    
    @sio.on("text-message")
    async def on_text_message(data):
        text = data.get("text", "")
        logger.info(f"Received text: {text[:50]}...")
    
    @sio.on("nova-started")
    async def on_nova_started(data):
        logger.info(f"Nova started: {data}")
    
    try:
        # Connect to socket server
        await sio.connect("http://localhost:3000")
        logger.info("Connected to socket server")
        
        # Start Nova Sonic
        logger.info("Starting Nova Sonic")
        await sio.emit("start-nova-sonic")
        
        # Wait for Nova to initialize
        logger.info("Waiting for Nova to initialize...")
        await asyncio.sleep(5)
        
        # Send test audio (1 second of 440Hz tone)
        logger.info("Sending test audio")
        
        # Generate sine wave
        import math
        import struct
        
        sample_rate = 16000
        duration = 1.0
        frequency = 440
        
        samples = []
        for i in range(int(sample_rate * duration)):
            sample = int(32767 * math.sin(2 * math.pi * frequency * i / sample_rate))
            samples.append(struct.pack('<h', sample))
        
        audio_bytes = b''.join(samples)
        audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        await sio.emit("audio-input", {"data": audio_b64})
        logger.info(f"Sent audio, size: {len(audio_bytes)} bytes")
        
        # Wait for response
        logger.info("Waiting for response...")
        await asyncio.sleep(5)
        
        # End audio input
        logger.info("Ending audio input")
        await sio.emit("end-audio")
        
        # Wait for final response
        logger.info("Waiting for final response...")
        await asyncio.sleep(20)
        
        # Disconnect
        await sio.disconnect()
        
    except Exception as e:
        logger.error(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())