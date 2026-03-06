"""
CAN bus reader for telemetry capture.
"""

import logging
from typing import Dict, Optional

try:
    import can
except ImportError:
    can = None

logger = logging.getLogger(__name__)


class CANBusReader:
    """Reads data from CAN bus."""

    def __init__(self, interface: str, bitrate: int):
        self.interface = interface
        self.bitrate = bitrate
        self.bus = None
        self.running = False

    def start(self) -> bool:
        """Start CAN bus interface."""
        if can is None:
            logger.error("python-can not available")
            return False

        try:
            try:
                self.bus = can.Bus(
                    interface="socketcan",
                    channel=self.interface,
                    bitrate=self.bitrate,
                    fd=True,
                )
            except Exception:
                self.bus = can.Bus(
                    interface="socketcan",
                    channel=self.interface,
                    bitrate=self.bitrate,
                )
            self.running = True
            logger.info(f"CAN bus started on {self.interface}")
            return True
        except Exception as e:
            logger.error(f"Failed to start CAN bus: {e}")
            return False

    def read_message(self, timeout: float = 0.1) -> Optional[Dict]:
        """Read a CAN message and parse it."""
        if not self.running or self.bus is None:
            return None

        try:
            msg = self.bus.recv(timeout=timeout)
            if msg is None:
                return None
            return {
                "arbitration_id": msg.arbitration_id,
                "data": msg.data.hex(),
                "timestamp": msg.timestamp,
                "dlc": msg.dlc,
            }
        except Exception as e:
            logger.error(f"Error reading CAN message: {e}")
            return None

    def stop(self) -> None:
        """Stop CAN bus interface."""
        self.running = False
        if self.bus:
            self.bus.shutdown()
        logger.info("CAN bus stopped")
