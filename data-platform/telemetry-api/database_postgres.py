"""
PostgreSQL repository implementation for telemetry data storage.
Uses asyncpg for async PostgreSQL operations.
"""

import asyncpg
from typing import List, Optional, Dict, Any
from datetime import datetime
import os
import json
from decimal import Decimal

from .models import TelemetryData, TelemetryQuery, Location, VehicleDynamics, Powertrain, Suspension, Wheels, Environment, Metadata


class PostgreSQLRepository:
    """
    PostgreSQL repository for telemetry data.
    Uses asyncpg for async database operations.
    """
    
    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self._connection_string = self._build_connection_string()
    
    def _build_connection_string(self) -> str:
        """Build PostgreSQL connection string from environment variables."""
        host = os.getenv("DB_HOST", "localhost")
        port = os.getenv("DB_PORT", "5432")
        database = os.getenv("DB_NAME", "telemetry")
        user = os.getenv("DB_USER", "telemetry_user")
        password = os.getenv("DB_PASSWORD", "telemetry_password")
        
        return f"postgresql://{user}:{password}@{host}:{port}/{database}"
    
    async def initialize(self):
        """Initialize database connection pool."""
        if self.pool is None:
            self.pool = await asyncpg.create_pool(
                self._connection_string,
                min_size=2,
                max_size=20,  # Increased from 10 to handle more concurrent requests
                command_timeout=60
            )
            await self._ensure_schema()
    
    async def close(self):
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()
            self.pool = None
    
    async def _ensure_schema(self):
        """Ensure database schema exists. Handles race when multiple workers create schema concurrently."""
        try:
            async with self.pool.acquire() as conn:
                # Create telemetry_data table
                await conn.execute("""
                CREATE TABLE IF NOT EXISTS telemetry_data (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMPTZ NOT NULL,
                    session_id VARCHAR(100) NOT NULL,
                    lap_number INTEGER NOT NULL,
                    lap_time NUMERIC(10, 3),
                    sector INTEGER,
                    
                    -- Location data
                    latitude NUMERIC(10, 8),
                    longitude NUMERIC(11, 8),
                    altitude NUMERIC(8, 2),
                    heading NUMERIC(5, 2),
                    gps_satellites INTEGER,
                    
                    -- Vehicle dynamics
                    speed NUMERIC(6, 2),
                    yaw NUMERIC(6, 2),
                    roll NUMERIC(6, 2),
                    pitch NUMERIC(6, 2),
                    lateral_g NUMERIC(5, 2),
                    longitudinal_g NUMERIC(5, 2),
                    vertical_g NUMERIC(5, 2),
                    steering_angle NUMERIC(6, 2),
                    
                    -- Powertrain
                    gear INTEGER,
                    throttle_position NUMERIC(5, 2),
                    braking_force NUMERIC(5, 2),
                    engine_rpm INTEGER,
                    engine_temperature NUMERIC(5, 2),
                    oil_pressure NUMERIC(6, 2),
                    oil_temperature NUMERIC(5, 2),
                    coolant_temperature NUMERIC(5, 2),
                    turbo_boost_pressure NUMERIC(5, 2),
                    air_intake_temperature NUMERIC(5, 2),
                    fuel_level NUMERIC(5, 2),
                    
                    -- Suspension
                    suspension_fl NUMERIC(6, 2),
                    suspension_fr NUMERIC(6, 2),
                    suspension_rl NUMERIC(6, 2),
                    suspension_rr NUMERIC(6, 2),
                    
                    -- Wheel speeds
                    wheel_speed_fl NUMERIC(6, 2),
                    wheel_speed_fr NUMERIC(6, 2),
                    wheel_speed_rl NUMERIC(6, 2),
                    wheel_speed_rr NUMERIC(6, 2),
                    
                    -- Environment
                    ambient_temperature NUMERIC(5, 2),
                    track_surface_temperature NUMERIC(5, 2),
                    humidity NUMERIC(5, 2),
                    
                    -- Metadata (stored as JSONB)
                    metadata JSONB
                )
            """)
                # Create indexes
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_telemetry_session_lap 
                    ON telemetry_data(session_id, lap_number)
                """)
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp 
                    ON telemetry_data(timestamp DESC)
                """)
                await conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_telemetry_session 
                    ON telemetry_data(session_id)
                """)
                # Create sessions table
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS telemetry_sessions (
                        session_id VARCHAR(100) PRIMARY KEY,
                        start_time TIMESTAMPTZ NOT NULL,
                        end_time TIMESTAMPTZ,
                        total_laps INTEGER DEFAULT 0,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
                # Create lap_summaries table
                await conn.execute("""
                    CREATE TABLE IF NOT EXISTS lap_summaries (
                        session_id VARCHAR(100) NOT NULL,
                        lap_number INTEGER NOT NULL,
                        lap_time NUMERIC(10, 3),
                        max_speed NUMERIC(6, 2),
                        avg_speed NUMERIC(6, 2),
                        max_lateral_g NUMERIC(5, 2),
                        max_longitudinal_g NUMERIC(5, 2),
                        record_count INTEGER,
                        PRIMARY KEY (session_id, lap_number),
                        FOREIGN KEY (session_id) REFERENCES telemetry_sessions(session_id) ON DELETE CASCADE
                    )
                """)
                await conn.execute("""
                    ALTER TABLE telemetry_sessions
                    ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT FALSE
                """)
        except asyncpg.exceptions.UniqueViolationError:
            # Schema already exists (race with another worker or previous run)
            pass
    
    async def insert_telemetry(self, data: TelemetryData) -> Dict[str, Any]:
        """Insert a single telemetry record."""
        # Ensure pool is initialized (should already be done at startup)
        if self.pool is None:
            await self.initialize()
        
        async with self.pool.acquire() as conn:
            paused_row = await conn.fetchrow(
                "SELECT paused FROM telemetry_sessions WHERE session_id = $1",
                data.session_id,
            )
            if paused_row and paused_row["paused"]:
                return {"id": None, "discarded": True}

            # Insert telemetry data
            row = await conn.fetchrow("""
                INSERT INTO telemetry_data (
                    timestamp, session_id, lap_number, lap_time, sector,
                    latitude, longitude, altitude, heading, gps_satellites,
                    speed, yaw, roll, pitch, lateral_g, longitudinal_g, vertical_g, steering_angle,
                    gear, throttle_position, braking_force, engine_rpm,
                    engine_temperature, oil_pressure, oil_temperature, coolant_temperature,
                    turbo_boost_pressure, air_intake_temperature, fuel_level,
                    suspension_fl, suspension_fr, suspension_rl, suspension_rr,
                    wheel_speed_fl, wheel_speed_fr, wheel_speed_rl, wheel_speed_rr,
                    ambient_temperature, track_surface_temperature, humidity,
                    metadata
                ) VALUES (
                    $1::timestamptz, $2::varchar(100), $3, $4, $5,
                    $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18,
                    $19, $20, $21, $22,
                    $23, $24, $25, $26,
                    $27, $28, $29,
                    $30, $31, $32, $33,
                    $34, $35, $36, $37,
                    $38, $39, $40,
                    $41::jsonb
                ) RETURNING id
            """,
                data.timestamp,
                data.session_id,
                data.lap_number,
                data.lap_time,
                data.sector,
                data.location.latitude,
                data.location.longitude,
                data.location.altitude,
                data.location.heading,
                data.location.satellites,
                data.vehicle_dynamics.speed,
                data.vehicle_dynamics.yaw,
                data.vehicle_dynamics.roll,
                data.vehicle_dynamics.pitch,
                data.vehicle_dynamics.lateral_g,
                data.vehicle_dynamics.longitudinal_g,
                data.vehicle_dynamics.vertical_g,
                data.vehicle_dynamics.steering_angle,
                data.powertrain.gear,
                data.powertrain.throttle_position,
                data.powertrain.braking_force,
                data.powertrain.engine_rpm,
                data.powertrain.engine_temperature,
                data.powertrain.oil_pressure,
                data.powertrain.oil_temperature,
                data.powertrain.coolant_temperature,
                data.powertrain.turbo_boost_pressure,
                data.powertrain.air_intake_temperature,
                data.powertrain.fuel_level,
                data.suspension.front_left,
                data.suspension.front_right,
                data.suspension.rear_left,
                data.suspension.rear_right,
                data.wheels.front_left,
                data.wheels.front_right,
                data.wheels.rear_left,
                data.wheels.rear_right,
                data.environment.ambient_temperature,
                data.environment.track_surface_temperature,
                data.environment.humidity,
                json.dumps(data.metadata.dict()) if data.metadata else None
            )
            
            # Update session tracking (including total_laps from actual telemetry data)
            await conn.execute("""
                INSERT INTO telemetry_sessions (session_id, start_time, end_time, total_laps)
                VALUES ($1::varchar(100), $2::timestamptz, $2::timestamptz, (SELECT COUNT(DISTINCT lap_number) FROM telemetry_data WHERE session_id = $1::varchar(100)))
                ON CONFLICT (session_id) DO UPDATE SET
                    start_time = LEAST(telemetry_sessions.start_time, $2::timestamptz),
                    end_time = GREATEST(telemetry_sessions.end_time, $2::timestamptz),
                    total_laps = (SELECT COUNT(DISTINCT lap_number) FROM telemetry_data WHERE session_id = $1::varchar(100))
            """, data.session_id, data.timestamp)
            
            return {"id": row["id"]}
    
    async def query_telemetry(self, query: TelemetryQuery) -> List[TelemetryData]:
        """Query telemetry data with filters."""
        if self.pool is None:
            await self.initialize()
        
        conditions = []
        params = []
        param_num = 1
        
        if query.session_id:
            conditions.append(f"session_id = ${param_num}")
            params.append(query.session_id)
            param_num += 1
        
        if query.lap_number is not None:
            conditions.append(f"lap_number = ${param_num}")
            params.append(query.lap_number)
            param_num += 1
        
        if query.start_time:
            conditions.append(f"timestamp >= ${param_num}")
            params.append(query.start_time)
            param_num += 1
        
        if query.end_time:
            conditions.append(f"timestamp <= ${param_num}")
            params.append(query.end_time)
            param_num += 1
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        params.append(query.limit)
        params.append(query.offset)
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT * FROM telemetry_data
                WHERE {where_clause}
                ORDER BY timestamp ASC
                LIMIT ${param_num} OFFSET ${param_num + 1}
            """, *params)
            
            return [self._row_to_telemetry_data(row) for row in rows]
    
    def _row_to_telemetry_data(self, row) -> TelemetryData:
        """Convert database row to TelemetryData model."""
        metadata_dict = json.loads(row["metadata"]) if row["metadata"] else None
        
        return TelemetryData(
            timestamp=row["timestamp"],
            session_id=row["session_id"],
            lap_number=row["lap_number"],
            lap_time=float(row["lap_time"]) if row["lap_time"] else None,
            sector=row["sector"],
            location=Location(
                latitude=float(row["latitude"]),
                longitude=float(row["longitude"]),
                altitude=float(row["altitude"]) if row["altitude"] else None,
                heading=float(row["heading"]) if row["heading"] else None,
                satellites=row["gps_satellites"]
            ),
            vehicle_dynamics=VehicleDynamics(
                speed=float(row["speed"]),
                yaw=float(row["yaw"]),
                roll=float(row["roll"]),
                pitch=float(row["pitch"]) if row["pitch"] else None,
                lateral_g=float(row["lateral_g"]),
                longitudinal_g=float(row["longitudinal_g"]),
                vertical_g=float(row["vertical_g"]) if row["vertical_g"] else None,
                steering_angle=float(row["steering_angle"])
            ),
            powertrain=Powertrain(
                gear=row["gear"],
                throttle_position=float(row["throttle_position"]),
                braking_force=float(row["braking_force"]),
                engine_rpm=row["engine_rpm"],
                engine_temperature=float(row["engine_temperature"]),
                oil_pressure=float(row["oil_pressure"]),
                oil_temperature=float(row["oil_temperature"]),
                coolant_temperature=float(row["coolant_temperature"]),
                turbo_boost_pressure=float(row["turbo_boost_pressure"]),
                air_intake_temperature=float(row["air_intake_temperature"]),
                fuel_level=float(row["fuel_level"])
            ),
            suspension=Suspension(
                front_left=float(row["suspension_fl"]),
                front_right=float(row["suspension_fr"]),
                rear_left=float(row["suspension_rl"]),
                rear_right=float(row["suspension_rr"])
            ),
            wheels=Wheels(
                front_left=float(row["wheel_speed_fl"]),
                front_right=float(row["wheel_speed_fr"]),
                rear_left=float(row["wheel_speed_rl"]),
                rear_right=float(row["wheel_speed_rr"])
            ),
            environment=Environment(
                ambient_temperature=float(row["ambient_temperature"]),
                track_surface_temperature=float(row["track_surface_temperature"]),
                humidity=float(row["humidity"])
            ),
            metadata=Metadata(**metadata_dict) if metadata_dict else None
        )
    
    async def list_sessions(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """List all available sessions.
        Includes sessions from telemetry_sessions and orphan sessions that exist only in
        telemetry_data (e.g. from batch uploads where session tracking was missed).
        Orphan sessions are backfilled into telemetry_sessions for consistency.
        """
        if self.pool is None:
            await self.initialize()
        
        async with self.pool.acquire() as conn:
            # Backfill orphan sessions: telemetry_data rows with no telemetry_sessions entry
            await conn.execute("""
                INSERT INTO telemetry_sessions (session_id, start_time, end_time, total_laps)
                SELECT
                    t.session_id,
                    MIN(t.timestamp),
                    MAX(t.timestamp),
                    (SELECT COUNT(DISTINCT lap_number) FROM telemetry_data WHERE session_id = t.session_id)
                FROM telemetry_data t
                WHERE NOT EXISTS (
                    SELECT 1 FROM telemetry_sessions s WHERE s.session_id = t.session_id
                )
                GROUP BY t.session_id
            """)
            
            rows = await conn.fetch("""
                SELECT 
                    s.session_id,
                    s.start_time,
                    s.end_time,
                    COUNT(t.id) as total_records,
                    COUNT(DISTINCT t.lap_number) as lap_count,
                    COALESCE(s.paused, FALSE) as paused,
                    MAX(t.timestamp) as last_telemetry_at,
                    (SELECT (td.metadata->>'device_id')
                     FROM telemetry_data td
                     WHERE td.session_id = s.session_id
                       AND td.metadata IS NOT NULL
                       AND td.metadata->>'device_id' IS NOT NULL
                     LIMIT 1) as device_id
                FROM telemetry_sessions s
                LEFT JOIN telemetry_data t ON s.session_id = t.session_id
                GROUP BY s.session_id, s.start_time, s.end_time, s.paused
                ORDER BY s.start_time DESC
                LIMIT $1 OFFSET $2
            """, limit, offset)
            
            return [
                {
                    "session_id": row["session_id"],
                    "start_time": row["start_time"].isoformat(),
                    "end_time": row["end_time"].isoformat() if row["end_time"] else None,
                    "lap_count": row["lap_count"] or 0,
                    "total_records": row["total_records"],
                    "device_id": row["device_id"] or None,
                    "paused": bool(row["paused"]),
                    "last_telemetry_at": row["last_telemetry_at"].isoformat() if row["last_telemetry_at"] else None,
                }
                for row in rows
            ]
    
    async def get_session_laps(self, session_id: str) -> List[Dict[str, Any]]:
        """Get lap information for a session."""
        if self.pool is None:
            await self.initialize()
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT 
                    lap_number,
                    MAX(lap_time) as lap_time,
                    MAX(speed) as max_speed,
                    AVG(speed) as avg_speed,
                    MAX(lateral_g) as max_lateral_g,
                    MAX(longitudinal_g) as max_longitudinal_g,
                    COUNT(*) as record_count
                FROM telemetry_data
                WHERE session_id = $1
                GROUP BY lap_number
                ORDER BY lap_number
            """, session_id)
            
            return [
                {
                    "lap_number": row["lap_number"],
                    "lap_time": float(row["lap_time"]) if row["lap_time"] else None,
                    "max_speed": float(row["max_speed"]) if row["max_speed"] else None,
                    "avg_speed": float(row["avg_speed"]) if row["avg_speed"] else None,
                    "max_lateral_g": float(row["max_lateral_g"]) if row["max_lateral_g"] else None,
                    "max_longitudinal_g": float(row["max_longitudinal_g"]) if row["max_longitudinal_g"] else None,
                    "record_count": row["record_count"]
                }
                for row in rows
            ]
    
    async def get_session_summary(self, session_id: str) -> Dict[str, Any]:
        """Get summary statistics for a session."""
        if self.pool is None:
            await self.initialize()
        
        async with self.pool.acquire() as conn:
            # Get session info
            session_row = await conn.fetchrow("""
                SELECT * FROM telemetry_sessions WHERE session_id = $1
            """, session_id)
            
            if not session_row:
                return {"error": "Session not found"}
            
            # Get statistics
            stats_row = await conn.fetchrow("""
                SELECT 
                    COUNT(*) as total_records,
                    COUNT(DISTINCT lap_number) as lap_count,
                    MAX(speed) as max_speed,
                    MIN(speed) as min_speed,
                    AVG(speed) as avg_speed,
                    MAX(lateral_g) as max_lateral_g,
                    MIN(lateral_g) as min_lateral_g,
                    AVG(lateral_g) as avg_lateral_g,
                    MAX(longitudinal_g) as max_longitudinal_g,
                    MIN(longitudinal_g) as min_longitudinal_g,
                    AVG(longitudinal_g) as avg_longitudinal_g,
                    MAX(engine_rpm) as max_engine_rpm,
                    MIN(engine_rpm) as min_engine_rpm,
                    AVG(engine_rpm) as avg_engine_rpm
                FROM telemetry_data
                WHERE session_id = $1
            """, session_id)
            
            if not stats_row or stats_row["total_records"] == 0:
                return {"error": "No data found for session"}
            
            return {
                "session_id": session_id,
                "start_time": session_row["start_time"].isoformat(),
                "end_time": session_row["end_time"].isoformat() if session_row["end_time"] else None,
                "duration_seconds": (
                    (session_row["end_time"] - session_row["start_time"]).total_seconds()
                    if session_row["end_time"] and session_row["start_time"] else None
                ),
                "total_records": stats_row["total_records"],
                "lap_count": stats_row["lap_count"],
                "statistics": {
                    "speed": {
                        "max": float(stats_row["max_speed"]) if stats_row["max_speed"] else None,
                        "min": float(stats_row["min_speed"]) if stats_row["min_speed"] else None,
                        "avg": float(stats_row["avg_speed"]) if stats_row["avg_speed"] else None
                    },
                    "lateral_g": {
                        "max": float(stats_row["max_lateral_g"]) if stats_row["max_lateral_g"] else None,
                        "min": float(stats_row["min_lateral_g"]) if stats_row["min_lateral_g"] else None,
                        "avg": float(stats_row["avg_lateral_g"]) if stats_row["avg_lateral_g"] else None
                    },
                    "longitudinal_g": {
                        "max": float(stats_row["max_longitudinal_g"]) if stats_row["max_longitudinal_g"] else None,
                        "min": float(stats_row["min_longitudinal_g"]) if stats_row["min_longitudinal_g"] else None,
                        "avg": float(stats_row["avg_longitudinal_g"]) if stats_row["avg_longitudinal_g"] else None
                    },
                    "engine_rpm": {
                        "max": int(stats_row["max_engine_rpm"]) if stats_row["max_engine_rpm"] else None,
                        "min": int(stats_row["min_engine_rpm"]) if stats_row["min_engine_rpm"] else None,
                        "avg": float(stats_row["avg_engine_rpm"]) if stats_row["avg_engine_rpm"] else None
                    }
                }
            }
    
    async def delete_session(self, session_id: str) -> Dict[str, Any]:
        """Delete all data for a session."""
        if self.pool is None:
            await self.initialize()
        
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Count before deletion
                count_before = await conn.fetchval("""
                    SELECT COUNT(*) FROM telemetry_data WHERE session_id = $1
                """, session_id)
                
                # Delete telemetry data first (no foreign key constraint, so must delete explicitly)
                await conn.execute("""
                    DELETE FROM telemetry_data WHERE session_id = $1
                """, session_id)
                
                # Delete from lap_summaries (has foreign key with CASCADE, but delete explicitly for clarity)
                await conn.execute("""
                    DELETE FROM lap_summaries WHERE session_id = $1
                """, session_id)
                
                # Delete session record
                await conn.execute("""
                    DELETE FROM telemetry_sessions WHERE session_id = $1
                """, session_id)
            
            return {"count": count_before}

    async def set_session_paused(self, session_id: str, paused: bool) -> Dict[str, Any]:
        """Mark a session as paused (server discards incoming telemetry) or resume.
        Creates a telemetry_sessions row if none exists so pause works before first sample.
        """
        if self.pool is None:
            await self.initialize()

        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO telemetry_sessions (session_id, start_time, end_time, total_laps, paused)
                VALUES ($1::varchar(100), NOW(), NOW(), 0, $2)
                ON CONFLICT (session_id) DO UPDATE SET paused = EXCLUDED.paused
                """,
                session_id,
                paused,
            )
            return {"session_id": session_id, "paused": paused}
    
    async def rename_session(self, old_session_id: str, new_session_id: str) -> Dict[str, Any]:
        """Rename a session by updating all records with a new session ID."""
        if self.pool is None:
            await self.initialize()
        
        async with self.pool.acquire() as conn:
            # Update telemetry_data table
            result = await conn.execute("""
                UPDATE telemetry_data 
                SET session_id = $1 
                WHERE session_id = $2
            """, new_session_id, old_session_id)
            
            # Update telemetry_sessions table
            await conn.execute("""
                UPDATE telemetry_sessions 
                SET session_id = $1 
                WHERE session_id = $2
            """, new_session_id, old_session_id)
            
            # Update lap_summaries table
            await conn.execute("""
                UPDATE lap_summaries 
                SET session_id = $1 
                WHERE session_id = $2
            """, new_session_id, old_session_id)
            
            # Get count of updated records
            count = await conn.fetchval("""
                SELECT COUNT(*) FROM telemetry_data WHERE session_id = $1
            """, new_session_id)
            
            return {"count": count}

