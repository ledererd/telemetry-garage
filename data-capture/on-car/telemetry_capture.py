#!/usr/bin/env python3
"""
Racing Car Telemetry Capture System
Captures data from CAN bus and GPS, buffers to local storage,
and uploads to API when WiFi is available and stable.
"""

import logging
import queue
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import requests

from config import load_config
from geometry import haversine_distance, point_to_line_distance, which_side_of_line
from readers import CANBusReader, GPSReader, MPU9250Reader
from telemetry_buffer import TelemetryBuffer
from wifi_monitor import WiFiMonitor

# Setup logging (will be updated after config is loaded)
Path.home().joinpath(".racing_telemetry").mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(Path.home() / ".racing_telemetry" / "capture.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)


class TelemetryCapture:
    """Main telemetry capture system."""

    def __init__(self, config: Dict):
        self.config = config
        self.running = False

        self.can_reader = CANBusReader(config["can_interface"], config["can_bitrate"])
        self.gps_reader = GPSReader(config["gps_port"], config["gps_baudrate"])
        self.mpu9250 = MPU9250Reader(config["mpu9250_i2c_bus"], config["mpu9250_address"])
        self.wifi_monitor = WiFiMonitor(
            config["wifi_stability_time"],
            config.get("api_url"),
            config.get("internet_check_host", "8.8.8.8"),
            config.get("internet_check_port", 53),
        )
        self.buffer = TelemetryBuffer(config["db_path"], config["buffer_dir"])

        self.data_queue = queue.Queue()
        self.capture_thread = None
        self.upload_thread = None
        self.wifi_thread = None

        self.session_id = None
        self.lap_number = 0
        self.lap_start_time = None
        self.last_lap_time = None

        self.auto_session_enabled = config.get("auto_session_management", False)
        self.session_active = False
        self.last_rpm = 0
        self.rpm_threshold = 0

        self.auto_lap_counting_enabled = config.get("auto_lap_counting", False)
        self.start_finish_line = config.get("start_finish_line", {})
        self.last_gps_position = None
        self.last_side_of_line = None
        self.last_crossing_time = 0
        self.crossing_threshold = self.start_finish_line.get("crossing_threshold_meters", 10.0)
        self.debounce_distance = self.start_finish_line.get("debounce_distance_meters", 50.0)

        self.can_parsers = {}

    def start(self) -> None:
        """Start the telemetry capture system."""
        logger.info("Starting telemetry capture system...")

        if self.auto_session_enabled:
            logger.info("Auto session management enabled - waiting for engine start (RPM > 0)")
            self.session_active = False
            self.session_id = None
        else:
            self.session_id = f"session_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
            self.config["session_id"] = self.session_id
            self.session_active = True
            self.lap_start_time = time.time()
            logger.info(f"Session ID: {self.session_id}")

        if not self.can_reader.start():
            logger.warning("CAN bus not available, continuing without CAN data")
        if not self.gps_reader.start():
            logger.warning("GPS not available, continuing without GPS data")
        if not self.mpu9250.start():
            logger.warning("MPU-9250 not available, continuing without IMU data")

        self.running = True
        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.upload_thread = threading.Thread(target=self._upload_loop, daemon=True)
        self.wifi_thread = threading.Thread(target=self._wifi_monitor_loop, daemon=True)

        self.capture_thread.start()
        self.upload_thread.start()
        self.wifi_thread.start()

        logger.info("Telemetry capture system started")

    def stop(self) -> None:
        """Stop the telemetry capture system."""
        logger.info("Stopping telemetry capture system...")
        self.running = False

        self.can_reader.stop()
        self.gps_reader.stop()
        self.mpu9250.stop()

        if self.capture_thread:
            self.capture_thread.join(timeout=5)
        if self.upload_thread:
            self.upload_thread.join(timeout=5)
        if self.wifi_thread:
            self.wifi_thread.join(timeout=5)

        logger.info("Telemetry capture system stopped")

    def _capture_loop(self) -> None:
        """Main capture loop."""
        sample_interval = 1.0 / self.config["sampling_rate"]
        last_sample = time.time()

        while self.running:
            try:
                current_time = time.time()

                if self.auto_session_enabled:
                    self._check_rpm_for_session_management()

                if self.session_active or not self.auto_session_enabled:
                    if current_time - last_sample >= sample_interval:
                        record = self._create_telemetry_record()
                        if record:
                            if self.auto_lap_counting_enabled:
                                self._check_lap_crossing(record)
                            self.buffer.add_record(record)
                            logger.debug(f"Captured record: {record['timestamp']}")
                        last_sample = current_time
                else:
                    time.sleep(0.1)
                    continue

                time.sleep(0.01)
            except Exception as e:
                logger.error(f"Error in capture loop: {e}")
                time.sleep(1)

    def _create_telemetry_record(self) -> Optional[Dict]:
        """Create a telemetry record from current sensor data."""
        try:
            gps_data = self.gps_reader.read_position()
            can_data = self._read_can_messages()

            record_timestamp = datetime.now(timezone.utc)
            if gps_data and gps_data.get("timestamp"):
                try:
                    gps_timestamp = datetime.fromisoformat(
                        gps_data["timestamp"].replace("Z", "+00:00")
                    )
                    time_diff = (
                        record_timestamp - gps_timestamp.replace(tzinfo=timezone.utc)
                    ).total_seconds()
                    if 0 <= time_diff <= 0.5:
                        record_timestamp = gps_timestamp.replace(tzinfo=timezone.utc)
                except (ValueError, TypeError):
                    pass

            record = {
                "timestamp": record_timestamp.isoformat(),
                "session_id": self.session_id,
                "lap_number": self.lap_number,
                "lap_time": self._calculate_lap_time(),
                "sector": None,
                "location": {
                    "latitude": gps_data.get("latitude", 0.0) if gps_data else 0.0,
                    "longitude": gps_data.get("longitude", 0.0) if gps_data else 0.0,
                    "altitude": gps_data.get("altitude") if gps_data else None,
                    "heading": gps_data.get("heading") if gps_data else None,
                    "satellites": gps_data.get("satellites") if gps_data else None,
                    "gps_timestamp": gps_data.get("timestamp") if gps_data else None,
                },
                "vehicle_dynamics": self._parse_vehicle_dynamics(can_data, gps_data),
                "powertrain": self._parse_powertrain(can_data),
                "suspension": self._parse_suspension(can_data),
                "wheels": self._parse_wheels(can_data),
                "environment": {
                    "ambient_temperature": 25.0,
                    "track_surface_temperature": 30.0,
                    "humidity": 60.0,
                },
                "metadata": {
                    "data_quality": {
                        "gps_quality": (
                            "excellent"
                            if (
                                gps_data
                                and gps_data.get("satellites") is not None
                                and gps_data.get("satellites") >= 4
                            )
                            else "poor"
                        ),
                    },
                    "sampling_rate": self.config["sampling_rate"],
                    "device_id": self.config["device_id"],
                },
            }
            return record
        except Exception as e:
            logger.error(f"Error creating telemetry record: {e}")
            return None

    def _read_can_messages(self) -> Dict:
        """Read and accumulate CAN messages."""
        messages = {}
        timeout = 0.05
        start_time = time.time()
        while time.time() - start_time < timeout:
            msg = self.can_reader.read_message(timeout=0.01)
            if msg:
                messages[msg["arbitration_id"]] = msg
        return messages

    def _parse_vehicle_dynamics(self, can_data: Dict, gps_data: Optional[Dict] = None) -> Dict:
        """Parse vehicle dynamics from MPU-9250 IMU sensor and optionally GPS speed."""
        imu_data = self.mpu9250.read_all()

        # Speed: from GPS when speed_from_gps is True, otherwise from CAN bus
        if self.config.get("speed_from_gps", False) and gps_data and gps_data.get("speed_kmh") is not None:
            speed = round(float(gps_data["speed_kmh"]), 2)
        else:
            # TODO: Parse speed from CAN when CAN protocol is implemented
            speed = 0.0

        return {
            "speed": speed,
            "yaw": round(imu_data["yaw"], 2),
            "roll": round(imu_data["roll"], 2),
            "pitch": round(imu_data["pitch"], 2),
            "lateral_g": round(imu_data["lateral_g"], 2),
            "longitudinal_g": round(imu_data["longitudinal_g"], 2),
            "vertical_g": round(imu_data["vertical_g"], 2),
            "steering_angle": 0.0,
        }

    def _parse_powertrain(self, can_data: Dict) -> Dict:
        """Parse powertrain data from CAN."""
        return {
            "gear": 0,
            "throttle_position": 0.0,
            "braking_force": 0.0,
            "engine_rpm": 0,
            "engine_temperature": 0.0,
            "oil_pressure": 0.0,
            "oil_temperature": 0.0,
            "coolant_temperature": 0.0,
            "turbo_boost_pressure": 0.0,
            "air_intake_temperature": 0.0,
            "fuel_level": 0.0,
        }

    def _parse_suspension(self, can_data: Dict) -> Dict:
        """Parse suspension data from CAN."""
        return {
            "front_left": 0.0,
            "front_right": 0.0,
            "rear_left": 0.0,
            "rear_right": 0.0,
        }

    def _parse_wheels(self, can_data: Dict) -> Dict:
        """Parse wheel speed data from CAN."""
        return {
            "front_left": 0.0,
            "front_right": 0.0,
            "rear_left": 0.0,
            "rear_right": 0.0,
        }

    def _calculate_lap_time(self) -> Optional[float]:
        """Calculate current lap time."""
        if self.lap_start_time:
            return time.time() - self.lap_start_time
        return None

    def _check_rpm_for_session_management(self) -> None:
        """Check RPM and manage session start/stop based on engine state."""
        if not self.auto_session_enabled:
            return
        can_data = self._read_can_messages()
        powertrain_data = self._parse_powertrain(can_data)
        current_rpm = powertrain_data.get("engine_rpm", 0)

        if (
            not self.session_active
            and current_rpm > self.rpm_threshold
            and self.last_rpm <= self.rpm_threshold
        ):
            self._start_new_session()
        elif (
            self.session_active
            and current_rpm <= self.rpm_threshold
            and self.last_rpm > self.rpm_threshold
        ):
            self._stop_session()
        self.last_rpm = current_rpm

    def _start_new_session(self) -> None:
        """Start a new telemetry session."""
        if self.session_active:
            return
        self.session_id = f"session_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        self.config["session_id"] = self.session_id
        self.session_active = True
        self.lap_number = 0
        self.lap_start_time = time.time()
        self.last_lap_time = None
        self.last_gps_position = None
        self.last_side_of_line = None
        self.last_crossing_time = 0
        logger.info(f"Engine started - New session created: {self.session_id}")

    def _stop_session(self) -> None:
        """Stop the current telemetry session."""
        if not self.session_active:
            return
        logger.info(f"Engine stopped - Session ended: {self.session_id}")
        self.session_active = False

    def _check_lap_crossing(self, record: Dict) -> None:
        """Check if GPS position has crossed the start/finish line and increment lap if so."""
        if not self.auto_lap_counting_enabled:
            return

        point1 = self.start_finish_line.get("point1", {})
        point2 = self.start_finish_line.get("point2", {})
        line_lat1 = point1.get("latitude", 0.0)
        line_lon1 = point1.get("longitude", 0.0)
        line_lat2 = point2.get("latitude", 0.0)
        line_lon2 = point2.get("longitude", 0.0)

        if line_lat1 == 0.0 and line_lon1 == 0.0 and line_lat2 == 0.0 and line_lon2 == 0.0:
            return

        location = record.get("location", {})
        current_lat = location.get("latitude", 0.0)
        current_lon = location.get("longitude", 0.0)

        if current_lat == 0.0 and current_lon == 0.0:
            return

        distance_to_line = point_to_line_distance(
            current_lat, current_lon, line_lat1, line_lon1, line_lat2, line_lon2
        )
        current_side = which_side_of_line(
            current_lat, current_lon, line_lat1, line_lon1, line_lat2, line_lon2
        )

        if (
            self.last_gps_position is not None
            and self.last_side_of_line is not None
            and current_side != 0
            and self.last_side_of_line != 0
            and current_side != self.last_side_of_line
            and distance_to_line <= self.crossing_threshold
        ):
            time_since_last_crossing = time.time() - self.last_crossing_time
            if time_since_last_crossing >= 5.0:
                self._increment_lap()
                self.last_crossing_time = time.time()
                logger.info(
                    f"Lap crossing detected! New lap: {self.lap_number} (distance: {distance_to_line:.2f}m)"
                )

        self.last_gps_position = (current_lat, current_lon)
        self.last_side_of_line = current_side

    def _increment_lap(self) -> None:
        """Increment lap number and reset lap timer."""
        if self.lap_start_time:
            self.last_lap_time = time.time() - self.lap_start_time
            logger.info(f"Lap {self.lap_number} completed in {self.last_lap_time:.2f} seconds")
        self.lap_number += 1
        self.lap_start_time = time.time()

    def _wifi_monitor_loop(self) -> None:
        """Monitor WiFi connectivity."""
        while self.running:
            try:
                self.wifi_monitor.update()
                time.sleep(self.config["wifi_check_interval"])
            except Exception as e:
                logger.error(f"Error in WiFi monitor: {e}")
                time.sleep(self.config["wifi_check_interval"])

    def _upload_loop(self) -> None:
        """Upload buffered data when WiFi is stable."""
        while self.running:
            try:
                if self.wifi_monitor.is_stable():
                    records = self.buffer.get_pending_records(self.config["batch_size"])
                    if records:
                        logger.info(f"Uploading {len(records)} records...")
                        upload_data = []
                        buffer_ids = []
                        for record in records:
                            buffer_ids.append(record.pop("_buffer_id"))
                            upload_data.append(record)

                        if self._upload_to_api(upload_data):
                            self.buffer.mark_uploaded(buffer_ids)
                            logger.info(f"Successfully uploaded {len(records)} records")
                        else:
                            self.buffer.mark_upload_failed(buffer_ids)
                            logger.warning(f"Failed to upload {len(records)} records")

                time.sleep(self.config.get("upload_check_interval", 5))
            except Exception as e:
                logger.error(f"Error in upload loop: {e}")
                time.sleep(self.config.get("upload_check_interval", 5))

    def _upload_to_api(self, records: List[Dict]) -> bool:
        """Upload records to API."""
        headers = {"Content-Type": "application/json"}
        api_key = self.config.get("api_key")
        if api_key:
            headers["X-API-Key"] = api_key

        for attempt in range(self.config["upload_max_retries"]):
            try:
                response = requests.post(
                    self.config["api_url"],
                    json=records,
                    headers=headers,
                    timeout=self.config["upload_timeout"],
                )
                if response.status_code == 200:
                    return True
                logger.warning(f"Upload failed with status {response.status_code}: {response.text}")
            except Exception as e:
                logger.warning(f"Upload attempt {attempt + 1} failed: {e}")
                if attempt < self.config["upload_max_retries"] - 1:
                    time.sleep(2**attempt)
        return False


def main() -> None:
    """Main entry point."""
    config = load_config()
    config["buffer_dir"].mkdir(parents=True, exist_ok=True)
    config["db_path"].parent.mkdir(parents=True, exist_ok=True)

    capture = TelemetryCapture(config)
    try:
        capture.start()
        logger.info("Telemetry capture running. Press Ctrl+C to stop.")
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        capture.stop()
        logger.info("Shutdown complete")


if __name__ == "__main__":
    main()
