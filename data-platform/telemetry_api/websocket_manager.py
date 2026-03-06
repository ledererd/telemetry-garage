"""
WebSocket manager for broadcasting live telemetry data.
"""

from typing import Set
from fastapi import WebSocket
from datetime import datetime
import json
import asyncio


class WebSocketManager:
    """Manages WebSocket connections and broadcasts telemetry data."""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        print(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        async with self._lock:
            self.active_connections.discard(websocket)
        print(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast_telemetry(self, data: dict):
        """Broadcast telemetry data to all connected clients."""
        if not self.active_connections:
            return
        
        # Use custom JSON encoder to handle datetime objects
        try:
            message = json.dumps(data, default=self._json_serializer)
        except Exception as e:
            print(f"Error serializing telemetry data: {e}")
            return
        
        disconnected = set()
        
        async with self._lock:
            connections = list(self.active_connections)
        
        # Send to all connections concurrently to avoid blocking
        # Create tasks explicitly to avoid "coroutines forbidden" error
        tasks = [asyncio.create_task(self._send_to_connection(conn, message, disconnected)) 
                 for conn in connections]
        
        # Wait for all sends to complete (with timeout)
        if tasks:
            try:
                # Use gather with return_exceptions to handle individual failures gracefully
                await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True), 
                    timeout=1.0
                )
            except asyncio.TimeoutError:
                # Some sends timed out, but that's okay - they'll be marked as disconnected
                # Cancel any remaining tasks
                for task in tasks:
                    if not task.done():
                        task.cancel()
                pass
        
        # Remove disconnected connections
        if disconnected:
            async with self._lock:
                self.active_connections -= disconnected
    
    async def _send_to_connection(self, connection: WebSocket, message: str, disconnected: set):
        """Send a message to a single connection, handling errors."""
        try:
            await asyncio.wait_for(connection.send_text(message), timeout=0.5)
        except asyncio.TimeoutError:
            print(f"WebSocket send timeout, disconnecting")
            # Note: set.add() is thread-safe in Python, but we're in async context
            disconnected.add(connection)
        except Exception as e:
            print(f"Error sending to WebSocket: {e}")
            disconnected.add(connection)
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        """Send a message to a specific WebSocket connection."""
        try:
            await websocket.send_text(message)
        except Exception as e:
            print(f"Error sending personal message: {e}")
    
    @staticmethod
    def _json_serializer(obj):
        """Custom JSON serializer for datetime objects."""
        if isinstance(obj, datetime):
            return obj.isoformat()
        raise TypeError(f"Type {type(obj)} not serializable")


# Global WebSocket manager instance
websocket_manager = WebSocketManager()

