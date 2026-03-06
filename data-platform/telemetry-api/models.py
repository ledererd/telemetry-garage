"""
Pydantic models for telemetry data validation and serialization.
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any
from datetime import datetime


class Location(BaseModel):
    """GPS location data."""
    latitude: float = Field(..., ge=-90, le=90, description="GPS latitude in decimal degrees")
    longitude: float = Field(..., ge=-180, le=180, description="GPS longitude in decimal degrees")
    altitude: Optional[float] = Field(None, description="GPS altitude in meters")
    heading: Optional[float] = Field(None, ge=0, le=360, description="GPS heading in degrees")
    satellites: Optional[int] = Field(None, ge=0, description="Number of GPS satellites in view")


class VehicleDynamics(BaseModel):
    """Vehicle dynamics and motion data."""
    speed: float = Field(..., ge=0, description="Vehicle speed in km/h")
    yaw: float = Field(..., description="Vehicle yaw angle in degrees")
    roll: float = Field(..., description="Vehicle roll angle in degrees")
    pitch: Optional[float] = Field(None, description="Vehicle pitch angle in degrees")
    lateral_g: float = Field(..., description="Lateral G-force (left/right)")
    longitudinal_g: float = Field(..., description="Longitudinal G-force (forward/backward)")
    vertical_g: Optional[float] = Field(None, description="Vertical G-force")
    steering_angle: float = Field(..., description="Steering wheel angle in degrees")


class Powertrain(BaseModel):
    """Powertrain and engine data."""
    gear: int = Field(..., ge=-1, le=8, description="Current gear (-1 = reverse, 0 = neutral)")
    throttle_position: float = Field(..., ge=0, le=100, description="Throttle position percentage (0-100)")
    braking_force: float = Field(..., ge=0, le=100, description="Braking force percentage (0-100)")
    engine_rpm: int = Field(..., ge=0, description="Engine RPM")
    engine_temperature: float = Field(..., description="Engine temperature in Celsius")
    oil_pressure: float = Field(..., ge=0, description="Engine oil pressure in PSI or bar")
    oil_temperature: float = Field(..., description="Engine oil temperature in Celsius")
    coolant_temperature: float = Field(..., description="Coolant temperature in Celsius")
    turbo_boost_pressure: float = Field(..., description="Turbo boost pressure in PSI or bar")
    air_intake_temperature: float = Field(..., description="Air intake temperature in Celsius")
    fuel_level: float = Field(..., ge=0, le=100, description="Fuel level percentage (0-100)")


class Suspension(BaseModel):
    """Suspension travel data for all four corners."""
    front_left: float = Field(..., description="Front left suspension travel in mm")
    front_right: float = Field(..., description="Front right suspension travel in mm")
    rear_left: float = Field(..., description="Rear left suspension travel in mm")
    rear_right: float = Field(..., description="Rear right suspension travel in mm")


class Wheels(BaseModel):
    """Wheel speed sensor data."""
    front_left: float = Field(..., ge=0, description="Front left wheel speed in km/h")
    front_right: float = Field(..., ge=0, description="Front right wheel speed in km/h")
    rear_left: float = Field(..., ge=0, description="Rear left wheel speed in km/h")
    rear_right: float = Field(..., ge=0, description="Rear right wheel speed in km/h")


class Environment(BaseModel):
    """Environmental conditions."""
    ambient_temperature: float = Field(..., description="Ambient air temperature in Celsius")
    track_surface_temperature: float = Field(..., description="Track surface temperature in Celsius")
    humidity: float = Field(..., ge=0, le=100, description="Relative humidity percentage (0-100)")


class DataQuality(BaseModel):
    """Data quality indicators."""
    gps_quality: Optional[str] = Field(None, description="GPS signal quality indicator")
    sensor_health: Optional[Dict[str, Any]] = Field(None, description="Individual sensor health status")


class Metadata(BaseModel):
    """Metadata about the telemetry record."""
    data_quality: Optional[DataQuality] = Field(None, description="Data quality information")
    sampling_rate: Optional[int] = Field(None, description="Actual sampling rate in Hz")
    device_id: Optional[str] = Field(None, description="Identifier for the data capture device")


class TelemetryData(BaseModel):
    """Complete telemetry data record."""
    timestamp: datetime = Field(..., description="ISO 8601 timestamp with millisecond precision")
    session_id: str = Field(..., description="Unique identifier for the racing session")
    lap_number: int = Field(..., ge=-1, description="Current lap number (0 = out lap, -1 = in lap)")
    lap_time: Optional[float] = Field(None, description="Time elapsed in current lap (seconds)")
    sector: Optional[int] = Field(None, ge=0, le=2, description="Current sector number (0, 1, 2)")
    location: Location
    vehicle_dynamics: VehicleDynamics
    powertrain: Powertrain
    suspension: Suspension
    wheels: Wheels
    environment: Environment
    metadata: Optional[Metadata] = None

    @validator('timestamp', pre=True)
    def parse_timestamp(cls, v):
        """Parse timestamp from string if needed."""
        if isinstance(v, str):
            try:
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                raise ValueError(f"Invalid timestamp format: {v}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "timestamp": "2024-01-15T14:30:45.123Z",
                "session_id": "session_20240115_race_1",
                "lap_number": 5,
                "lap_time": 87.456,
                "sector": 1,
                "location": {
                    "latitude": -35.2809,
                    "longitude": 149.1300,
                    "altitude": 580.5,
                    "heading": 125.3,
                    "satellites": 12
                },
                "vehicle_dynamics": {
                    "speed": 185.7,
                    "yaw": 2.3,
                    "roll": -1.2,
                    "pitch": 0.5,
                    "lateral_g": 1.8,
                    "longitudinal_g": 0.3,
                    "vertical_g": 1.1,
                    "steering_angle": 15.5
                },
                "powertrain": {
                    "gear": 4,
                    "throttle_position": 85.5,
                    "braking_force": 0.0,
                    "engine_rpm": 7200,
                    "engine_temperature": 95.2,
                    "oil_pressure": 65.3,
                    "oil_temperature": 110.5,
                    "coolant_temperature": 88.7,
                    "turbo_boost_pressure": 1.2,
                    "air_intake_temperature": 32.1,
                    "fuel_level": 45.3
                },
                "suspension": {
                    "front_left": 12.5,
                    "front_right": 11.8,
                    "rear_left": 8.3,
                    "rear_right": 8.7
                },
                "wheels": {
                    "front_left": 185.2,
                    "front_right": 186.1,
                    "rear_left": 185.5,
                    "rear_right": 185.9
                },
                "environment": {
                    "ambient_temperature": 28.5,
                    "track_surface_temperature": 42.3,
                    "humidity": 65.0
                },
                "metadata": {
                    "data_quality": {
                        "gps_quality": "excellent",
                        "sensor_health": {
                            "engine_rpm": "ok",
                            "gps": "ok",
                            "imu": "ok"
                        }
                    },
                    "sampling_rate": 10,
                    "device_id": "telemetry_unit_001"
                }
            }
        }


class TelemetryResponse(BaseModel):
    """Response model for telemetry upload operations."""
    success: bool
    message: str
    timestamp: str
    record_id: Optional[str] = None


class TelemetryQuery(BaseModel):
    """Query parameters for telemetry data retrieval."""
    session_id: Optional[str] = None
    lap_number: Optional[int] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = 1000
    offset: int = 0

