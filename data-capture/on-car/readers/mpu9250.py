"""
MPU-9250 9-axis IMU sensor reader via I2C.
"""

import logging
import math
import time
from typing import Dict

try:
    import smbus2
    MPU9250_AVAILABLE = True
except ImportError:
    try:
        import smbus
        MPU9250_AVAILABLE = True
    except ImportError:
        MPU9250_AVAILABLE = False
        smbus2 = None
        smbus = None

logger = logging.getLogger(__name__)


class MPU9250Reader:
    """Reads data from MPU-9250 9-axis IMU sensor via I2C."""

    # MPU-9250 Register addresses
    PWR_MGMT_1 = 0x6B
    SMPLRT_DIV = 0x19
    CONFIG = 0x1A
    GYRO_CONFIG = 0x1B
    ACCEL_CONFIG = 0x1C
    ACCEL_XOUT_H = 0x3B
    GYRO_XOUT_H = 0x43
    MAG_XOUT_L = 0x03  # AK8963 magnetometer

    # Accelerometer scale factors (LSB/g)
    ACCEL_SCALE_2G = 16384.0
    ACCEL_SCALE_4G = 8192.0
    ACCEL_SCALE_8G = 4096.0
    ACCEL_SCALE_16G = 2048.0

    # Gyroscope scale factors (LSB/°/s)
    GYRO_SCALE_250 = 131.0
    GYRO_SCALE_500 = 65.5
    GYRO_SCALE_1000 = 32.8
    GYRO_SCALE_2000 = 16.4

    def __init__(self, i2c_bus: int = 1, address: int = 0x68):
        self.i2c_bus = i2c_bus
        self.address = address
        self.bus = None
        self.running = False

        self.accel_scale = self.ACCEL_SCALE_16G  # ±16G for racing
        self.gyro_scale = self.GYRO_SCALE_2000  # ±2000°/s for racing

        self.alpha = 0.98  # Complementary filter coefficient
        self.roll = 0.0
        self.pitch = 0.0
        self.last_read_time = None

        self.accel_offset = [0.0, 0.0, 0.0]
        self.gyro_offset = [0.0, 0.0, 0.0]
        self.calibrated = False

    def start(self) -> bool:
        """Initialize and start MPU-9250 sensor."""
        if not MPU9250_AVAILABLE:
            logger.error("I2C/smbus not available for MPU-9250")
            return False

        try:
            if smbus2:
                self.bus = smbus2.SMBus(self.i2c_bus)
            else:
                self.bus = smbus.SMBus(self.i2c_bus)

            try:
                who_am_i = self.bus.read_byte_data(self.address, 0x75)
                if who_am_i not in [0x71, 0x68]:
                    logger.warning(
                        f"MPU-9250 WHO_AM_I returned unexpected value: 0x{who_am_i:02X}"
                    )
            except (OSError, IOError) as e:
                logger.error(
                    f"Failed to communicate with MPU-9250 at 0x{self.address:02X}: {e}"
                )
                return False

            self.bus.write_byte_data(self.address, self.PWR_MGMT_1, 0)
            time.sleep(0.1)
            self.bus.write_byte_data(self.address, self.ACCEL_CONFIG, 0x18)  # ±16G
            time.sleep(0.01)
            self.bus.write_byte_data(self.address, self.GYRO_CONFIG, 0x18)  # ±2000°/s
            time.sleep(0.01)
            self.bus.write_byte_data(self.address, self.SMPLRT_DIV, 0)  # 1kHz
            time.sleep(0.01)
            self.bus.write_byte_data(self.address, self.CONFIG, 0x03)  # 44Hz DLPF
            time.sleep(0.01)

            self.running = True
            self.last_read_time = None
            logger.info(
                f"MPU-9250 initialized on I2C bus {self.i2c_bus}, address 0x{self.address:02X}"
            )
            self._calibrate()
            return True

        except (OSError, IOError) as e:
            logger.error(f"I/O error initializing MPU-9250: {e}")
            if self.bus:
                try:
                    self.bus.close()
                except Exception:
                    pass
                self.bus = None
            return False
        except Exception as e:
            logger.error(f"Failed to initialize MPU-9250: {e}")
            if self.bus:
                try:
                    self.bus.close()
                except Exception:
                    pass
                self.bus = None
            return False

    def _read_word_2c(self, addr: int) -> int:
        """Read a 16-bit signed value from two consecutive registers."""
        high = self.bus.read_byte_data(self.address, addr)
        low = self.bus.read_byte_data(self.address, addr + 1)
        val = (high << 8) + low
        return -((65535 - val) + 1) if val >= 0x8000 else val

    def _calibrate(self, samples: int = 100) -> None:
        """Calibrate accelerometer and gyroscope offsets."""
        logger.info("Calibrating MPU-9250 (keep sensor still)...")
        accel_sum = [0.0, 0.0, 0.0]
        gyro_sum = [0.0, 0.0, 0.0]

        for _ in range(samples):
            accel_sum[0] += self._read_word_2c(self.ACCEL_XOUT_H)
            accel_sum[1] += self._read_word_2c(self.ACCEL_XOUT_H + 2)
            accel_sum[2] += self._read_word_2c(self.ACCEL_XOUT_H + 4)
            gyro_sum[0] += self._read_word_2c(self.GYRO_XOUT_H)
            gyro_sum[1] += self._read_word_2c(self.GYRO_XOUT_H + 2)
            gyro_sum[2] += self._read_word_2c(self.GYRO_XOUT_H + 4)
            time.sleep(0.01)

        self.accel_offset[0] = accel_sum[0] / samples
        self.accel_offset[1] = accel_sum[1] / samples
        self.accel_offset[2] = (accel_sum[2] / samples) - self.accel_scale
        self.gyro_offset[0] = gyro_sum[0] / samples
        self.gyro_offset[1] = gyro_sum[1] / samples
        self.gyro_offset[2] = gyro_sum[2] / samples
        self.calibrated = True
        logger.info("MPU-9250 calibration complete")

    def read_accelerometer(self) -> tuple:
        """Read accelerometer data in G-forces."""
        if not self.running:
            return (0.0, 0.0, 0.0)
        try:
            accel_y = (self._read_word_2c(self.ACCEL_XOUT_H) - self.accel_offset[0]) / self.accel_scale
            accel_x = (self._read_word_2c(self.ACCEL_XOUT_H + 2) - self.accel_offset[1]) / self.accel_scale
            accel_z = (self._read_word_2c(self.ACCEL_XOUT_H + 4) - self.accel_offset[2]) / self.accel_scale
            return (accel_x, accel_y, accel_z)
        except Exception as e:
            logger.error(f"Error reading accelerometer: {e}")
            return (0.0, 0.0, 0.0)

    def read_gyroscope(self) -> tuple:
        """Read gyroscope data in degrees per second."""
        if not self.running:
            return (0.0, 0.0, 0.0)
        try:
            gyro_x = (self._read_word_2c(self.GYRO_XOUT_H) - self.gyro_offset[0]) / self.gyro_scale
            gyro_y = (self._read_word_2c(self.GYRO_XOUT_H + 2) - self.gyro_offset[1]) / self.gyro_scale
            gyro_z = (self._read_word_2c(self.GYRO_XOUT_H + 4) - self.gyro_offset[2]) / self.gyro_scale
            return (gyro_x, gyro_y, gyro_z)
        except Exception as e:
            logger.error(f"Error reading gyroscope: {e}")
            return (0.0, 0.0, 0.0)

    def read_all(self) -> Dict:
        """Read all sensor data and calculate attitude."""
        if not self.running:
            return {
                "accel": (0.0, 0.0, 0.0),
                "gyro": (0.0, 0.0, 0.0),
                "roll": 0.0,
                "pitch": 0.0,
                "yaw": 0.0,
                "lateral_g": 0.0,
                "longitudinal_g": 0.0,
                "vertical_g": 0.0,
            }

        accel_x, accel_y, accel_z = self.read_accelerometer()
        gyro_x, gyro_y, gyro_z = self.read_gyroscope()

        current_time = time.time()
        dt = 0.1 if self.last_read_time is None else current_time - self.last_read_time
        dt = max(0.001, min(dt, 1.0))
        self.last_read_time = current_time

        accel_roll = math.atan2(accel_y, math.sqrt(accel_x**2 + accel_z**2)) * 180.0 / math.pi
        accel_pitch = math.atan2(-accel_x, math.sqrt(accel_y**2 + accel_z**2)) * 180.0 / math.pi

        total_angular_velocity = math.sqrt(gyro_x**2 + gyro_y**2 + gyro_z**2)
        rotation_threshold = 5.0
        dynamic_alpha = (
            min(0.995, self.alpha + 0.01 * (total_angular_velocity / 100.0))
            if total_angular_velocity > rotation_threshold
            else self.alpha
        )

        self.roll = dynamic_alpha * (self.roll + gyro_x * dt) + (1 - dynamic_alpha) * accel_roll
        self.pitch = dynamic_alpha * (self.pitch + gyro_y * dt) + (1 - dynamic_alpha) * accel_pitch

        lateral_g = accel_y
        longitudinal_g = accel_x
        vertical_g = accel_z - 1.0

        return {
            "accel": (accel_x, accel_y, accel_z),
            "gyro": (gyro_x, gyro_y, gyro_z),
            "roll": self.roll,
            "pitch": self.pitch,
            "yaw": gyro_z,
            "lateral_g": lateral_g,
            "longitudinal_g": longitudinal_g,
            "vertical_g": vertical_g,
        }

    def stop(self) -> None:
        """Stop MPU-9250 sensor."""
        self.running = False
        if self.bus:
            try:
                self.bus.write_byte_data(self.address, self.PWR_MGMT_1, 0x40)
            except Exception:
                pass
        logger.info("MPU-9250 stopped")
