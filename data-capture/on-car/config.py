"""
Configuration loading for the telemetry capture system.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Fields that must never be overwritten from remote (stay in local config only)
LOCAL_ONLY_KEYS = {"api_key"}

# Default configuration (used if config file is not found)
DEFAULT_CONFIG = {
    "can_interface": "can0",  # or "vcan0" for virtual CAN
    "can_bitrate": 500000,  # 500 kbps for CAN FD
    "gps_port": "/dev/ttyS0",  # Adjust for your GPS device
    "gps_baudrate": 9600,
    "mpu9250_i2c_bus": 1,  # I2C bus number (usually 1 for Raspberry Pi)
    "mpu9250_address": 0x68,  # I2C address (0x68 or 0x69)
    "api_url": "http://localhost:8000/api/v1/telemetry/upload/batch",
    "api_key": None,  # Optional: set for API key auth (X-API-Key header). Omit for open API.
    "buffer_dir": "~/.racing_telemetry/buffer",
    "db_path": "~/.racing_telemetry/telemetry.db",
    "sampling_rate": 10,  # Hz (10 samples per second)
    "batch_size": 100,  # Upload in batches of 100 records
    "wifi_check_interval": 5,  # Check WiFi every 5 seconds
    "wifi_stability_time": 10,  # WiFi must be stable for 10 seconds before upload
    "internet_check_host": "8.8.8.8",  # Host to probe for internet connectivity
    "internet_check_port": 53,  # Port to probe (53=DNS, 80=HTTP)
    "upload_timeout": 30,  # Upload timeout in seconds
    "upload_check_interval": 5,  # Check for uploads every N seconds
    "upload_max_retries": 3,
    "device_id": "telemetry_unit_001",
    "log_level": "INFO",  # Logging level: DEBUG, INFO, WARNING, ERROR, CRITICAL
    "auto_session_management": False,  # Auto start/stop sessions based on engine RPM
    "auto_lap_counting": False,  # Auto increment lap number when crossing start/finish line
    "speed_from_gps": False,  # True: infer speed from GPS; False: use speed from CAN bus
    "start_finish_line": {
        "point1": {"latitude": 0.0, "longitude": 0.0},
        "point2": {"latitude": 0.0, "longitude": 0.0},
        "crossing_threshold_meters": 10.0,  # Distance from line to trigger crossing
        "debounce_distance_meters": 50.0,  # Must be this far from line before next crossing
    },
}


def load_config(config_path: Optional[Path] = None) -> Dict:
    """
    Load configuration from JSON file.

    Args:
        config_path: Path to config file. If None, looks for config.json in script directory.

    Returns:
        Dictionary with configuration values.
    """
    if config_path is None:
        script_dir = Path(__file__).parent
        config_path = script_dir / "config.json"

    config = DEFAULT_CONFIG.copy()

    if config_path.exists():
        try:
            with open(config_path, "r") as f:
                file_config = json.load(f)
                config.update(file_config)
                logger.info(f"Loaded configuration from {config_path}")
        except Exception as e:
            logger.warning(f"Failed to load config from {config_path}: {e}. Using defaults.")
    else:
        logger.info(f"Config file not found at {config_path}. Using default configuration.")

    # Fetch and merge remote config from data platform (if api_url and api_key are set)
    config = _fetch_and_merge_remote_config(config, config_path)

    # Convert string paths to Path objects and expand user home directory
    if isinstance(config.get("buffer_dir"), str):
        config["buffer_dir"] = Path(config["buffer_dir"].replace("~", str(Path.home())))
    if isinstance(config.get("db_path"), str):
        config["db_path"] = Path(config["db_path"].replace("~", str(Path.home())))

    # Convert MPU-9250 address - handle both decimal and hex
    _normalize_mpu_address(config)

    # session_id will be set at start
    config["session_id"] = None

    # Update logging level based on config
    _apply_log_level(config.get("log_level", "INFO"))

    return config


def _fetch_and_merge_remote_config(config: Dict, config_path: Path) -> Dict:
    """
    Fetch device configuration from data platform and merge with local config.
    Preserves api_key from local config (never overwrite from remote).
    Writes merged config to config.json on success.
    """
    api_url = config.get("api_url")
    api_key = config.get("api_key")

    if not api_url or not api_key:
        logger.warning("Skipping remote config fetch: api_url or api_key not set")
        return config

    config_url = api_url.replace("/api/v1/telemetry/upload/batch", "") + "/api/v1/devices/config"
    if config_url == api_url:
        logger.warning("Could not derive config URL from api_url")
        return config

    try:
        import urllib.request
        req = urllib.request.Request(config_url, headers={"X-API-Key": str(api_key)})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            remote_config = data.get("config")
            if not remote_config:
                logger.warning("Remote config empty or missing")
                return config

            merged = {**remote_config}
            for key in LOCAL_ONLY_KEYS:
                merged[key] = config.get(key)

            with open(config_path, "w") as f:
                json.dump(merged, f, indent=2)
            logger.info(f"Fetched and merged remote config, wrote to {config_path}")

            return merged
    except Exception as e:
        logger.warning(f"Could not fetch remote config: {e}. Using local config.")
        return config


def _normalize_mpu_address(config: Dict) -> None:
    """Normalize MPU-9250 address from config (handles 68/69 as hex)."""
    mpu_address = config.get("mpu9250_address", 0x68)

    if isinstance(mpu_address, int):
        if mpu_address == 68:
            config["mpu9250_address"] = 0x68
            logger.info("Interpreting mpu9250_address=68 as 0x68 (hexadecimal)")
        elif mpu_address == 69:
            config["mpu9250_address"] = 0x69
            logger.info("Interpreting mpu9250_address=69 as 0x69 (hexadecimal)")
        elif mpu_address in [0x68, 0x69]:
            config["mpu9250_address"] = mpu_address
        elif mpu_address in [104, 105]:
            config["mpu9250_address"] = mpu_address
        else:
            config["mpu9250_address"] = mpu_address
    elif isinstance(mpu_address, str):
        try:
            if mpu_address.startswith("0x") or mpu_address.startswith("0X"):
                config["mpu9250_address"] = int(mpu_address, 16)
            else:
                try:
                    config["mpu9250_address"] = int(mpu_address, 16)
                except ValueError:
                    parsed = int(mpu_address, 10)
                    if parsed == 68:
                        config["mpu9250_address"] = 0x68
                        logger.info("Interpreting mpu9250_address='68' as 0x68 (hexadecimal)")
                    elif parsed == 69:
                        config["mpu9250_address"] = 0x69
                        logger.info("Interpreting mpu9250_address='69' as 0x69 (hexadecimal)")
                    else:
                        config["mpu9250_address"] = parsed
        except ValueError:
            logger.warning(f"Invalid mpu9250_address format: {mpu_address}. Using default 0x68")
            config["mpu9250_address"] = 0x68
    else:
        logger.warning(f"Invalid mpu9250_address type: {type(mpu_address)}. Using default 0x68")
        config["mpu9250_address"] = 0x68


def _apply_log_level(log_level_str: str) -> None:
    """Apply logging level to root logger."""
    log_level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL,
    }
    log_level = log_level_map.get(log_level_str.upper(), logging.INFO)
    logging.getLogger().setLevel(log_level)
    for handler in logging.getLogger().handlers:
        handler.setLevel(log_level)
    logger.info(f"Logging level set to {log_level_str}")
