"""
GPS reader for NMEA devices.
"""

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Optional

try:
    import serial
    import pynmea2
except ImportError:
    serial = None
    pynmea2 = None

logger = logging.getLogger(__name__)


class GPSReader:
    """Reads GPS data from NMEA device."""

    def __init__(self, port: str, baudrate: int):
        self.port = port
        self.baudrate = baudrate
        self.serial = None
        self.running = False
        self.last_position = None
        self.read_thread = None
        self.lock = threading.Lock()
        self.last_read_time = None
        self.read_timeout = 2.0
        self.reconnect_delay = 0.5
        self.consecutive_errors = 0
        self.max_consecutive_errors = 10

    def start(self) -> bool:
        """Start GPS serial connection."""
        if serial is None or pynmea2 is None:
            logger.error("pynmea2 or pyserial not available")
            return False

        try:
            self.serial = serial.Serial(
                self.port,
                self.baudrate,
                timeout=0.1,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
            )
            self.serial.reset_input_buffer()
            self._configure_gps_10hz()

            self.running = True
            self.read_thread = threading.Thread(target=self._read_loop, daemon=True)
            self.read_thread.start()

            logger.info(f"GPS started on {self.port} at {self.baudrate} baud (10 Hz)")
            return True
        except Exception as e:
            logger.error(f"Failed to start GPS: {e}")
            return False

    def _configure_gps_10hz(self) -> None:
        """Configure NEO-M8M GPS module to output at 10 Hz using UBX protocol."""
        if self.serial is None or not self.serial.is_open:
            return

        try:
            meas_rate = 100  # 100ms = 10 Hz
            nav_rate = 1
            time_ref = 0

            payload = bytearray(6)
            payload[0:2] = meas_rate.to_bytes(2, "little")
            payload[2:4] = nav_rate.to_bytes(2, "little")
            payload[4:6] = time_ref.to_bytes(2, "little")

            msg = bytearray()
            msg.append(0xB5)
            msg.append(0x62)
            msg.append(0x06)
            msg.append(0x08)
            msg.append(len(payload) & 0xFF)
            msg.append((len(payload) >> 8) & 0xFF)
            msg.extend(payload)

            ck_a = 0
            ck_b = 0
            for byte in msg[2:]:
                ck_a = (ck_a + byte) & 0xFF
                ck_b = (ck_b + ck_a) & 0xFF
            msg.append(ck_a)
            msg.append(ck_b)

            self.serial.write(msg)
            self.serial.flush()
            time.sleep(0.1)
            logger.info("GPS configured for 10 Hz update rate")
        except Exception as e:
            logger.warning(f"Failed to configure GPS for 10 Hz: {e}")

    def _read_loop(self) -> None:
        """Background thread to continuously read GPS data."""
        buffer = b""

        while self.running:
            try:
                if self.serial is None or not self.serial.is_open:
                    if not self._reconnect():
                        time.sleep(self.reconnect_delay)
                    continue

                if self.last_read_time and (time.time() - self.last_read_time) > self.read_timeout:
                    if not self._reconnect():
                        time.sleep(self.reconnect_delay)
                    continue

                try:
                    if self.serial.in_waiting > 0:
                        data = self.serial.read(self.serial.in_waiting)
                        if data:
                            buffer += data
                            self.last_read_time = time.time()
                            self.consecutive_errors = 0
                    else:
                        time.sleep(0.05 if not buffer else 0.01)
                        continue

                    while b"\n" in buffer or b"\r" in buffer:
                        line_end = buffer.find(b"\n") if b"\n" in buffer else buffer.find(b"\r")
                        line_bytes = buffer[:line_end]
                        buffer = buffer[line_end + 1:]

                        if not line_bytes:
                            continue
                        try:
                            line = line_bytes.decode("ascii", errors="ignore").strip()
                            if line and line.startswith("$"):
                                self._process_nmea_line(line)
                        except UnicodeDecodeError:
                            continue

                except serial.SerialTimeoutException:
                    time.sleep(0.01 if buffer else 0.05)
                    continue
                except (serial.SerialException, OSError) as e:
                    logger.error(f"GPS serial error: {e}")
                    self.consecutive_errors += 1
                    if self.consecutive_errors >= self.max_consecutive_errors:
                        self._reconnect()
                        self.consecutive_errors = 0
                    time.sleep(0.1)
                    continue

            except Exception as e:
                logger.error(f"Unexpected error in GPS read loop: {e}", exc_info=True)
                self.consecutive_errors += 1
                if self.consecutive_errors >= self.max_consecutive_errors:
                    self._reconnect()
                    self.consecutive_errors = 0
                time.sleep(0.1)

    def _process_nmea_line(self, line: str) -> None:
        """Process a single NMEA sentence."""
        try:
            msg = pynmea2.parse(line)

            if isinstance(msg, pynmea2.types.talker.RMC):
                if hasattr(msg, "status") and msg.status != "A":
                    return
                if msg.latitude is not None and msg.longitude is not None:
                    with self.lock:
                        heading = None
                        if hasattr(msg, "track_made_good") and msg.track_made_good is not None:
                            try:
                                heading = float(msg.track_made_good)
                            except (ValueError, TypeError):
                                pass
                        speed_kmh = None
                        if hasattr(msg, "spd_over_grnd") and msg.spd_over_grnd is not None:
                            try:
                                speed_kmh = float(msg.spd_over_grnd) * 1.852
                            except (ValueError, TypeError):
                                pass
                        self.last_position = {
                            "latitude": float(msg.latitude),
                            "longitude": float(msg.longitude),
                            "altitude": None,
                            "heading": heading,
                            "speed_kmh": speed_kmh,
                            "satellites": None,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }

            elif isinstance(msg, pynmea2.types.talker.GGA):
                if hasattr(msg, "gps_qual") and msg.gps_qual == 0:
                    return
                if msg.latitude is not None and msg.longitude is not None:
                    with self.lock:
                        if self.last_position:
                            self.last_position.update({
                                "latitude": float(msg.latitude),
                                "longitude": float(msg.longitude),
                                "altitude": float(msg.altitude) if msg.altitude else None,
                                "satellites": int(msg.num_sats) if msg.num_sats else None,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            })
                        else:
                            self.last_position = {
                                "latitude": float(msg.latitude),
                                "longitude": float(msg.longitude),
                                "altitude": float(msg.altitude) if msg.altitude else None,
                                "heading": None,
                                "satellites": int(msg.num_sats) if msg.num_sats else None,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            }
        except pynmea2.ParseError:
            pass
        except Exception as e:
            logger.debug(f"Error parsing GPS line: {e}")

    def _reconnect(self) -> bool:
        """Reconnect to the GPS serial port."""
        try:
            if self.serial and self.serial.is_open:
                try:
                    self.serial.close()
                except Exception:
                    pass
            time.sleep(0.5)

            self.serial = serial.Serial(
                self.port,
                self.baudrate,
                timeout=0.1,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
            )
            self.serial.reset_input_buffer()
            self.serial.reset_output_buffer()
            self._configure_gps_10hz()
            self.last_read_time = time.time()
            self.consecutive_errors = 0
            logger.info(f"GPS reconnected on {self.port}")
            return True
        except Exception as e:
            logger.error(f"Failed to reconnect GPS: {e}")
            self.serial = None
            return False

    def read_position(self) -> Optional[Dict]:
        """Get the most recent GPS position."""
        with self.lock:
            return self.last_position.copy() if self.last_position else None

    def stop(self) -> None:
        """Stop GPS serial connection."""
        self.running = False
        if self.read_thread:
            self.read_thread.join(timeout=2)
        if self.serial:
            try:
                if self.serial.is_open:
                    self.serial.close()
            except Exception:
                pass
            self.serial = None
        logger.info("GPS stopped")
