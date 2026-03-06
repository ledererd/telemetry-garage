"""
WiFi connectivity monitor for telemetry upload.
"""

import logging
import socket
import subprocess
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)


class WiFiMonitor:
    """Monitors WiFi connectivity and stability."""

    def __init__(
        self,
        stability_time: int = 10,
        api_url: Optional[str] = None,
        internet_check_host: str = "8.8.8.8",
        internet_check_port: int = 53,
    ):
        self.stability_time = stability_time
        self.api_url = api_url
        self.internet_check_host = internet_check_host
        self.internet_check_port = internet_check_port
        self.connected = False
        self.connection_start = None
        self.stable = False

    def check_connectivity(self) -> bool:
        """Check if WiFi is connected and internet is accessible."""
        try:
            result = subprocess.run(
                ["iwconfig"],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if "ESSID:" in result.stdout or "Access Point:" in result.stdout:
                try:
                    socket.create_connection(
                        (self.internet_check_host, self.internet_check_port),
                        timeout=3,
                    )
                    return True
                except OSError:
                    return False
        except Exception:
            pass

        if self.api_url:
            try:
                health_url = self.api_url.replace("/upload/batch", "/health")
                response = requests.get(health_url, timeout=2)
                return response.status_code == 200
            except Exception:
                pass
        return False

    def update(self) -> None:
        """Update connection status."""
        was_connected = self.connected
        self.connected = self.check_connectivity()

        if self.connected and not was_connected:
            self.connection_start = time.time()
            self.stable = False
            logger.info("WiFi connected")
        elif not self.connected:
            self.connection_start = None
            self.stable = False
        elif self.connected and self.connection_start:
            elapsed = time.time() - self.connection_start
            if elapsed >= self.stability_time and not self.stable:
                self.stable = True
                logger.info(f"WiFi stable for {elapsed:.1f} seconds")

    def is_stable(self) -> bool:
        """Check if WiFi is stable."""
        return self.stable and self.connected
