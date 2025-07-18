import asyncio
import json
import sys
import os
import socketio
sys.path.append('/app')
from nova_boto3 import NovaSonic


async def run_nova():
    # Create socket client if SOCKET_URL is set
    socket_url = os.getenv("SOCKET_URL")
    socket_client = None
    
    if socket_url:
        print(f"Using socket URL: {socket_url}")
        socket_client = socketio.AsyncClient()
        try:
            await socket_client.connect(socket_url)
            print("Socket connected successfully")
        except Exception as e:
            print(f"Socket connection failed: {e}")
            socket_client = None
    
    # Create Nova instance
    nova = NovaSonic(socket_client=socket_client)
    await nova.start_session()
    
    try:
        # Run for 5 minutes or until interrupted
        await asyncio.sleep(300)
    except asyncio.CancelledError:
        print("Task cancelled")
    finally:
        # Clean up
        nova.is_active = False
        if not stream_task.done():
            stream_task.cancel()
        await nova.end_session()
        print("Session ended")

if __name__ == "__main__":
    asyncio.run(run_nova())