#!/usr/bin/env python3
"""
Generate a complete lap simulation with realistic telemetry data.
Creates data points at configurable sampling rate for a full racing lap.
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
import math


def generate_lap_simulation(
    session_id: str = "session_20240115_race_2",
    lap_number: int = 5,
    lap_time_seconds: float = 87.456,
    sampling_rate: int = 10,  # Hz
    start_latitude: float = -35.2809,
    start_longitude: float = 149.1300,
    track_radius_km: float = 0.5,  # Approximate track radius
    device_id: str = "telemetry_unit_001"
) -> list:
    """
    Generate a complete lap simulation.
    
    Args:
        session_id: Session identifier
        lap_number: Lap number
        lap_time_seconds: Total lap time in seconds
        sampling_rate: Samples per second
        start_latitude: Starting GPS latitude
        start_longitude: Starting GPS longitude
        track_radius_km: Approximate track radius in km
        device_id: Device identifier
    
    Returns:
        List of telemetry records
    """
    records = []
    num_samples = int(lap_time_seconds * sampling_rate)
    start_time = datetime.now(timezone.utc)
    
    # Track characteristics (simulated)
    # Speed profile: acceleration -> high speed -> braking -> corner -> acceleration
    max_speed = 195.0  # km/h
    min_speed_corner = 75.0  # km/h
    corner_entry_time = 0.15  # 15% of lap
    corner_exit_time = 0.25  # 25% of lap
    second_corner_entry = 0.40
    second_corner_exit = 0.50
    third_corner_entry = 0.65
    third_corner_exit = 0.75
    
    # Generate GPS track (circular approximation)
    center_lat = start_latitude
    center_lon = start_longitude
    
    for i in range(num_samples):
        t = i / num_samples  # Normalized time (0 to 1)
        current_time = start_time + timedelta(seconds=i / sampling_rate)
        lap_time = i / sampling_rate
        
        # Calculate speed profile
        if t < corner_entry_time:
            # Acceleration phase
            speed = min_speed_corner + (max_speed - min_speed_corner) * (t / corner_entry_time) * 1.2
        elif t < corner_exit_time:
            # First corner (braking and cornering)
            corner_progress = (t - corner_entry_time) / (corner_exit_time - corner_entry_time)
            if corner_progress < 0.3:
                # Braking
                speed = max_speed - (max_speed - min_speed_corner) * (corner_progress / 0.3)
            elif corner_progress < 0.7:
                # Mid-corner
                speed = min_speed_corner
            else:
                # Exit acceleration
                speed = min_speed_corner + (max_speed * 0.9 - min_speed_corner) * ((corner_progress - 0.7) / 0.3)
        elif t < second_corner_entry:
            # Straight section
            speed = max_speed * 0.95
        elif t < second_corner_exit:
            # Second corner
            corner_progress = (t - second_corner_entry) / (second_corner_exit - second_corner_entry)
            if corner_progress < 0.3:
                speed = max_speed * 0.95 - (max_speed * 0.95 - min_speed_corner) * (corner_progress / 0.3)
            elif corner_progress < 0.7:
                speed = min_speed_corner
            else:
                speed = min_speed_corner + (max_speed * 0.9 - min_speed_corner) * ((corner_progress - 0.7) / 0.3)
        elif t < third_corner_entry:
            # Straight section
            speed = max_speed
        elif t < third_corner_exit:
            # Third corner
            corner_progress = (t - third_corner_entry) / (third_corner_exit - third_corner_entry)
            if corner_progress < 0.3:
                speed = max_speed - (max_speed - min_speed_corner * 1.1) * (corner_progress / 0.3)
            elif corner_progress < 0.7:
                speed = min_speed_corner * 1.1
            else:
                speed = min_speed_corner * 1.1 + (max_speed * 0.85 - min_speed_corner * 1.1) * ((corner_progress - 0.7) / 0.3)
        else:
            # Final straight
            speed = max_speed * 0.9
        
        speed = max(min_speed_corner, min(max_speed, speed))
        
        # Calculate GPS position (circular track approximation)
        angle = t * 2 * math.pi  # Full circle
        lat_offset = track_radius_km * math.cos(angle) / 111.0  # ~111 km per degree latitude
        lon_offset = track_radius_km * math.sin(angle) / (111.0 * math.cos(math.radians(center_lat)))
        
        latitude = center_lat + lat_offset
        longitude = center_lon + lon_offset
        heading = (angle * 180 / math.pi + 90) % 360
        
        # Calculate G-forces based on speed and cornering
        is_cornering = (
            (corner_entry_time <= t <= corner_exit_time) or
            (second_corner_entry <= t <= second_corner_exit) or
            (third_corner_entry <= t <= third_corner_exit)
        )
        
        if is_cornering:
            lateral_g = 1.5 + abs(math.sin(t * 4 * math.pi)) * 0.8  # 1.5-2.3 G
            longitudinal_g = -0.6 if speed < max_speed * 0.7 else 0.3
            steering_angle = 15.0 + abs(math.sin(t * 4 * math.pi)) * 15.0  # 15-30 degrees
        else:
            lateral_g = 0.1 + abs(math.sin(t * 8 * math.pi)) * 0.2
            longitudinal_g = 0.4 if speed > max_speed * 0.8 else 0.6
            steering_angle = 2.0 + abs(math.sin(t * 8 * math.pi)) * 3.0
        
        # Calculate powertrain data
        if speed < 50:
            gear = 2
            engine_rpm = 4000 + (speed / 50) * 2000
        elif speed < 100:
            gear = 3
            engine_rpm = 5000 + ((speed - 50) / 50) * 2000
        elif speed < 150:
            gear = 4
            engine_rpm = 6000 + ((speed - 100) / 50) * 1500
        else:
            gear = 5
            engine_rpm = 7000 + ((speed - 150) / 45) * 500
        
        engine_rpm = min(7500, max(3000, engine_rpm))
        
        throttle_position = 100.0 if longitudinal_g > 0.3 else max(0, 100.0 - abs(longitudinal_g) * 120)
        braking_force = abs(longitudinal_g) * 100 if longitudinal_g < -0.3 else 0.0
        
        # Sector calculation
        if t < 0.33:
            sector = 0
        elif t < 0.67:
            sector = 1
        else:
            sector = 2
        
        # Create record
        record = {
            "timestamp": current_time.isoformat(),
            "session_id": session_id,
            "lap_number": lap_number,
            "lap_time": round(lap_time, 3),
            "sector": sector,
            "location": {
                "latitude": round(latitude, 6),
                "longitude": round(longitude, 6),
                "altitude": round(580.0 + t * 6.5, 1),
                "heading": round(heading, 1),
                "satellites": 12
            },
            "vehicle_dynamics": {
                "speed": round(speed, 1),
                "yaw": round(abs(math.sin(t * 4 * math.pi)) * 4.0, 1),
                "roll": round(-abs(math.sin(t * 4 * math.pi)) * 2.8, 1) if is_cornering else round(abs(math.sin(t * 8 * math.pi)) * 0.2, 1),
                "pitch": round(abs(math.sin(t * 8 * math.pi)) * 0.6, 1),
                "lateral_g": round(lateral_g, 1),
                "longitudinal_g": round(longitudinal_g, 1),
                "vertical_g": round(1.0 + abs(math.sin(t * 16 * math.pi)) * 0.3, 1),
                "steering_angle": round(steering_angle, 1)
            },
            "powertrain": {
                "gear": gear,
                "throttle_position": round(throttle_position, 1),
                "braking_force": round(braking_force, 1),
                "engine_rpm": int(engine_rpm),
                "engine_temperature": round(92.0 + t * 11.0, 1),
                "oil_pressure": round(62.0 + t * 8.5, 1),
                "oil_temperature": round(108.0 + t * 14.5, 1),
                "coolant_temperature": round(87.0 + t * 11.0, 1),
                "turbo_boost_pressure": round(0.5 + (throttle_position / 100) * 1.0, 1),
                "air_intake_temperature": round(31.0 + t * 8.8, 1),
                "fuel_level": round(45.3 - t * 2.3, 1)
            },
            "suspension": {
                "front_left": round(8.0 + abs(lateral_g) * 10.0 + abs(longitudinal_g) * 2.0, 1),
                "front_right": round(8.0 + abs(lateral_g) * 9.0 + abs(longitudinal_g) * 1.8, 1),
                "rear_left": round(6.0 + abs(lateral_g) * 6.0 + abs(longitudinal_g) * 1.5, 1),
                "rear_right": round(6.0 + abs(lateral_g) * 5.5 + abs(longitudinal_g) * 1.3, 1)
            },
            "wheels": {
                "front_left": round(speed * (1.0 + abs(math.sin(t * 16 * math.pi)) * 0.002), 1),
                "front_right": round(speed * (1.0 + abs(math.cos(t * 16 * math.pi)) * 0.002), 1),
                "rear_left": round(speed * (1.0 - abs(math.sin(t * 16 * math.pi)) * 0.001), 1),
                "rear_right": round(speed * (1.0 - abs(math.cos(t * 16 * math.pi)) * 0.001), 1)
            },
            "environment": {
                "ambient_temperature": 28.5,
                "track_surface_temperature": round(42.0 + t * 5.5, 1),
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
                "sampling_rate": sampling_rate,
                "device_id": device_id
            }
        }
        
        records.append(record)
    
    return records


def main():
    """Generate and save lap simulation."""
    print("Generating lap simulation...")
    
    # Generate full lap at 10 Hz
    records = generate_lap_simulation(
        session_id="session_20240115_race_2",
        lap_number=5,
        lap_time_seconds=87.456,
        sampling_rate=10
    )
    
    print(f"Generated {len(records)} data points")
    print(f"Lap time: {records[-1]['lap_time']:.3f} seconds")
    print(f"Max speed: {max(r['vehicle_dynamics']['speed'] for r in records):.1f} km/h")
    print(f"Min speed: {min(r['vehicle_dynamics']['speed'] for r in records):.1f} km/h")
    print(f"Max lateral G: {max(r['vehicle_dynamics']['lateral_g'] for r in records):.1f} G")
    
    # Save to file
    output_file = Path(__file__).parent / "lap-simulation-full.json"
    with open(output_file, 'w') as f:
        json.dump(records, f, indent=2)
    
    print(f"\nSaved to: {output_file}")
    
    # Also create a summary version (every 2 seconds)
    summary_records = [r for i, r in enumerate(records) if i % 20 == 0]
    summary_file = Path(__file__).parent / "lap-simulation-summary.json"
    with open(summary_file, 'w') as f:
        json.dump(summary_records, f, indent=2)
    
    print(f"Summary version ({len(summary_records)} points) saved to: {summary_file}")


if __name__ == "__main__":
    main()

