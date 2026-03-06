# Racing Car Telemetry Capture System

Python script for capturing telemetry data from a racing car's CAN bus and GPS, buffering it locally, and uploading to the cloud API when WiFi is available.

## Project Structure

The telemetry capture system is split into modules for maintainability:

- `telemetry_capture.py` - Main entry point and orchestrator
- `config.py` - Configuration loading and defaults
- `readers/` - Hardware readers
  - `mpu9250.py` - MPU-9250 IMU sensor (I2C)
  - `can_bus.py` - CAN bus interface
  - `gps.py` - GPS/NMEA serial reader
- `wifi_monitor.py` - WiFi connectivity monitoring
- `telemetry_buffer.py` - Local SQLite buffering
- `geometry.py` - Lap crossing geometry utilities

## Features

- ✅ Continuous CAN bus data capture
- ✅ GPS position tracking (NMEA)
- ✅ MPU-9250 9-axis IMU sensor integration (I2C)
  - Roll, Pitch, Yaw calculation
  - Lateral, Longitudinal, and Vertical G-forces
  - Complementary filter for accurate attitude estimation
- ✅ Local buffering to SQLite database
- ✅ Automatic WiFi connectivity monitoring
- ✅ Stable WiFi detection before upload
- ✅ Batch upload to API
- ✅ Retry logic with exponential backoff
- ✅ Graceful error handling
- ✅ Configurable sampling rates

## Hardware Requirements

- PiCAN FD board (CAN FD interface)
- GNSS/GPS module (NEO-M8M or compatible)
- MPU-9250 9-axis IMU sensor (connected via I2C)
- Raspberry Pi or compatible Linux system
- WiFi adapter

## Installation

### 1. Install System Dependencies

```bash
# CAN bus support
sudo apt-get update
sudo apt-get install can-utils

# Load CAN kernel modules
sudo modprobe can
sudo modprobe can_raw
sudo modprobe vcan  # For virtual CAN (testing)

# For real CAN interface (e.g., PiCAN FD)
sudo ip link set can0 up type can bitrate 500000

# Enable I2C interface (for MPU-9250)
sudo raspi-config
# Navigate to: Interface Options -> I2C -> Enable
# Or manually:
echo "dtparam=i2c_arm=on" | sudo tee -a /boot/config.txt
sudo reboot
```

### 2. Install Python Dependencies

```bash
cd data-capture/on-car
pip install -r requirements.txt
```

### 3. Configure the Script

Edit `config.json` in the same directory as `telemetry_capture.py`:

```json
{
  "can_interface": "can0",
  "can_bitrate": 500000,
  "gps_port": "/dev/ttyUSB0",
  "gps_baudrate": 9600,
  "mpu9250_i2c_bus": 1,
  "mpu9250_address": 68,
  "api_url": "http://your-api-server:8000/api/v1/telemetry/upload/batch",
  "sampling_rate": 10,
  "batch_size": 100,
  "wifi_check_interval": 5,
  "wifi_stability_time": 10,
  "upload_timeout": 30,
  "max_retries": 3,
  "device_id": "telemetry_unit_001",
  "api_key": null,
  "speed_from_gps": false
}
```

**Note**: If `config.json` is not found, the script will use default values. The `mpu9250_address` can be specified as a decimal integer (68 for 0x68) or as a hex string ("0x68"). Paths using `~` will be expanded to the user's home directory.

**Speed source**: Set `speed_from_gps: true` to infer vehicle speed from GPS (NMEA RMC speed over ground). When `false` (default), speed is taken from the CAN bus (requires CAN protocol implementation).

**API key**: Register your device in the data platform's **Device Management** screen to generate an API key. Add the key to `api_key` in config.json; it is sent via the `X-API-Key` header on upload requests. The `device_id` must match the device you registered. Omit or leave empty if no devices are registered on the API (open mode).

### 4. Verify MPU-9250 Connection

Check if the MPU-9250 is detected on I2C:

```bash
# Install i2c-tools
sudo apt-get install i2c-tools

# Scan I2C bus
sudo i2cdetect -y 1

# Should show device at address 0x68 (or 0x69)
```

## Usage

### Basic Usage

```bash
python telemetry_capture.py
```

### Run as a Service (systemd)

Create `/etc/systemd/system/telemetry-garage-capture.service`:

```ini
[Unit]
Description=Telemetry Garage - On-Car Telemetry Capture
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/path/to/anu-racing/data-capture/on-car
ExecStart=/usr/bin/python3 /path/to/anu-racing/data-capture/on-car/telemetry_capture.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable telemetry-garage-capture
sudo systemctl start telemetry-garage-capture
sudo systemctl status telemetry-garage-capture
```

## Sensor Integration

### MPU-9250 IMU Sensor

The MPU-9250 provides:
- **Roll, Pitch, Yaw** - Calculated using complementary filter (accelerometer + gyroscope)
- **Lateral G-force** - Left/right acceleration
- **Longitudinal G-force** - Forward/backward acceleration  
- **Vertical G-force** - Up/down acceleration (gravity removed)

The sensor automatically calibrates on startup. Keep the vehicle stationary during the first few seconds after starting.

**Sensor Orientation:**
- X-axis: Longitudinal (forward/backward)
- Y-axis: Lateral (left/right)
- Z-axis: Vertical (up/down)

If your sensor is mounted differently, adjust the axis mapping in `MPU9250Reader.read_all()`.

### CAN Protocol Customization

The script includes placeholder functions for parsing CAN messages. You need to customize these based on your vehicle's CAN protocol:

- `_parse_vehicle_dynamics()` - Uses MPU-9250 for IMU data. Speed from CAN bus by default; set `speed_from_gps: true` in config to use GPS-inferred speed instead.
- `_parse_powertrain()` - Parse engine, transmission, fuel data
- `_parse_suspension()` - Parse suspension travel sensors
- `_parse_wheels()` - Parse wheel speed sensors

Example CAN message parsing:

```python
def _parse_powertrain(self, can_data: Dict) -> Dict:
    """Parse powertrain data from CAN."""
    result = {
        "gear": 0,
        "throttle_position": 0.0,
        "engine_rpm": 0,
        # ... defaults
    }
    
    # Example: Parse engine RPM from CAN ID 0x123
    if 0x123 in can_data:
        msg = can_data[0x123]
        data = bytes.fromhex(msg["data"])
        # Assuming RPM is in bytes 0-1 (little endian)
        result["engine_rpm"] = int.from_bytes(data[0:2], byteorder='little')
    
    return result
```

## Data Flow

1. **Capture**: CAN and GPS data sampled at configured rate (default 10 Hz)
2. **Buffer**: Data stored in SQLite database locally
3. **Monitor**: WiFi connectivity checked every 5 seconds
4. **Upload**: When WiFi is stable for 10+ seconds, buffered data uploaded in batches
5. **Retry**: Failed uploads retried with exponential backoff

## Buffer Management

Data is stored in SQLite database at `~/.racing_telemetry/telemetry.db`:

- Records marked as `uploaded=0` are pending upload
- Records marked as `uploaded=1` have been successfully uploaded
- `upload_attempts` tracks retry count

To check buffer status:

```bash
sqlite3 ~/.racing_telemetry/telemetry.db "SELECT COUNT(*) FROM telemetry_buffer WHERE uploaded=0;"
```

## Logging

Logs are written to:
- File: `~/.racing_telemetry/capture.log`
- Console: stdout/stderr

View logs:

```bash
tail -f ~/.racing_telemetry/capture.log
```

## Troubleshooting

### CAN Bus Not Working

```bash
# Check if CAN interface is up
ip link show can0

# Test CAN bus
candump can0

# Check kernel modules
lsmod | grep can
```

### GPS Not Working

```bash
# Check GPS device
ls -l /dev/ttyUSB*

# Test GPS with gpsd
sudo apt-get install gpsd gpsd-clients
gpsmon /dev/ttyUSB0
```

### MPU-9250 Not Working

```bash
# Check I2C is enabled
lsmod | grep i2c

# Check if device is detected
sudo i2cdetect -y 1

# Test I2C communication
sudo i2cget -y 1 0x68 0x75  # Should return 0x71 (MPU-9250 WHO_AM_I register)

# Check permissions
sudo usermod -a -G i2c $USER
# Log out and back in for group changes to take effect
```

### WiFi Not Detected

The script checks WiFi connectivity by:
1. Checking `iwconfig` for WiFi interface
2. Testing internet connectivity (configurable via `internet_check_host` and `internet_check_port` in config.json, default: 8.8.8.8:53)
3. Testing API endpoint reachability

Ensure WiFi is connected:

```bash
iwconfig
ping -c 3 8.8.8.8
```

### Upload Failures

Check API connectivity:

```bash
curl http://your-api-server:8000/health
```

Check buffer for failed uploads:

```bash
sqlite3 ~/.racing_telemetry/telemetry.db "SELECT COUNT(*), MAX(upload_attempts) FROM telemetry_buffer WHERE uploaded=0;"
```

## Configuration Options

Configuration is stored in `config.json` in the same directory as the script. All options are optional and will use defaults if not specified.

| Option | Default | Description |
|--------|---------|-------------|
| `can_interface` | "can0" | CAN bus interface name |
| `can_bitrate` | 500000 | CAN bus bitrate (bps) |
| `gps_port` | "/dev/ttyS0" | GPS serial port |
| `gps_baudrate` | 9600 | GPS baud rate |
| `mpu9250_i2c_bus` | 1 | I2C bus number (usually 1 for Raspberry Pi) |
| `mpu9250_address` | 68 | I2C address (decimal: 68 for 0x68, or 105 for 0x69) |
| `api_url` | "http://localhost:8000/api/v1/telemetry/upload/batch" | API endpoint URL |
| `buffer_dir` | "~/.racing_telemetry/buffer" | Buffer directory (use ~ for home directory) |
| `db_path` | "~/.racing_telemetry/telemetry.db" | SQLite database path |
| `sampling_rate` | 10 | Samples per second (Hz) |
| `batch_size` | 100 | Records per upload batch |
| `wifi_check_interval` | 5 | Seconds between WiFi checks |
| `wifi_stability_time` | 10 | Seconds WiFi must be stable before upload |
| `upload_timeout` | 30 | Upload request timeout (seconds) |
| `max_retries` | 3 | Maximum upload retries |
| `device_id` | "telemetry_unit_001" | Unique device identifier (must match Device Management) |
| `api_key` | null | API key from Device Management; sent as X-API-Key header |

## Performance Considerations

- **Sampling Rate**: Higher rates (20+ Hz) generate more data but provide better resolution
- **Batch Size**: Larger batches (200+) reduce API calls but require more memory
- **Buffer Size**: SQLite handles millions of records efficiently
- **Network**: Ensure stable WiFi connection for reliable uploads

## Security Notes

- Store API credentials securely (use environment variables)
- Consider using HTTPS for API communication
- Protect buffer database from unauthorized access
- Use read-only filesystem for production deployments

## License

[Add your license here]

