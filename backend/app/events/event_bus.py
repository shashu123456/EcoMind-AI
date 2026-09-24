"""In-process event bus for SSE streaming.

No Redis/RabbitMQ — pure asyncio.Queue per subscriber.
"""
import asyncio
import json
import threading
from typing import AsyncGenerator
from collections import defaultdict


class EventBus:
    def __init__(self):
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop):
        """Bind the main event loop so cross-thread publishes are safe."""
        self._loop = loop

    def _put_nowait(self, channel: str, event: dict):
        for q in self._subscribers.get(channel, []):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass  # drop if subscriber is too slow

    def publish(self, channel: str, event: dict):
        """Publish to all subscribers of a channel (thread-safe)."""
        with self._lock:
            on_main_loop = False
            if self._loop is not None and self._loop.is_running():
                try:
                    on_main_loop = asyncio.get_event_loop() is self._loop
                except RuntimeError:
                    on_main_loop = False
            if self._loop is None or on_main_loop:
                self._put_nowait(channel, event)
            else:
                self._loop.call_soon_threadsafe(self._put_nowait, channel, event)

    def subscribe(self, channel: str) -> asyncio.Queue:
        with self._lock:
            q: asyncio.Queue = asyncio.Queue(maxsize=100)
            self._subscribers[channel].append(q)
            return q

    def unsubscribe(self, channel: str, q: asyncio.Queue):
        with self._lock:
            if q in self._subscribers.get(channel, []):
                self._subscribers[channel].remove(q)

    async def stream(self, channel: str) -> AsyncGenerator[dict, None]:
        """SSE generator for a channel."""
        q = self.subscribe(channel)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(q.get(), timeout=30)
                    yield event
                except asyncio.TimeoutError:
                    yield {"type": "heartbeat"}
        except asyncio.CancelledError:
            pass
        finally:
            self.unsubscribe(channel, q)


# Global singleton
event_bus = EventBus()
