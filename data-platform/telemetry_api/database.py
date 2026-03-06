"""
Database abstraction layer for telemetry data storage.
Supports multiple database backends (PostgreSQL, TimescaleDB, InfluxDB, etc.)
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from datetime import datetime
import os

from .models import TelemetryData, TelemetryQuery


class TelemetryRepository(ABC):
    """Abstract base class for telemetry data repositories."""
    
    @abstractmethod
    async def insert_telemetry(self, data: TelemetryData) -> Dict[str, Any]:
        """Insert a single telemetry record."""
        pass
    
    @abstractmethod
    async def query_telemetry(self, query: TelemetryQuery) -> List[TelemetryData]:
        """Query telemetry data with filters."""
        pass
    
    @abstractmethod
    async def list_sessions(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """List all available sessions."""
        pass
    
    @abstractmethod
    async def get_session_laps(self, session_id: str) -> List[Dict[str, Any]]:
        """Get lap information for a session."""
        pass
    
    @abstractmethod
    async def get_session_summary(self, session_id: str) -> Dict[str, Any]:
        """Get summary statistics for a session."""
        pass
    
    @abstractmethod
    async def delete_session(self, session_id: str) -> Dict[str, Any]:
        """Delete all data for a session."""
        pass
    
    @abstractmethod
    async def rename_session(self, old_session_id: str, new_session_id: str) -> Dict[str, Any]:
        """Rename a session by updating all records with a new session ID."""
        pass


class InMemoryRepository(TelemetryRepository):
    """
    In-memory repository for development and testing.
    Data is stored in memory and will be lost on restart.
    """
    
    def __init__(self):
        self._data: List[TelemetryData] = []
        self._sessions: Dict[str, Dict[str, Any]] = {}
    
    async def insert_telemetry(self, data: TelemetryData) -> Dict[str, Any]:
        """Insert a single telemetry record."""
        self._data.append(data)
        
        # Update session tracking
        if data.session_id not in self._sessions:
            self._sessions[data.session_id] = {
                "session_id": data.session_id,
                "start_time": data.timestamp,
                "end_time": data.timestamp,
                "lap_numbers": set()
            }
        else:
            session = self._sessions[data.session_id]
            if data.timestamp < session["start_time"]:
                session["start_time"] = data.timestamp
            if data.timestamp > session["end_time"]:
                session["end_time"] = data.timestamp
            session["lap_numbers"].add(data.lap_number)
        
        return {"id": f"{data.session_id}_{len(self._data)}"}
    
    async def query_telemetry(self, query: TelemetryQuery) -> List[TelemetryData]:
        """Query telemetry data with filters."""
        results = self._data
        
        # Apply filters
        if query.session_id:
            results = [r for r in results if r.session_id == query.session_id]
        
        if query.lap_number is not None:
            results = [r for r in results if r.lap_number == query.lap_number]
        
        if query.start_time:
            results = [r for r in results if r.timestamp >= query.start_time]
        
        if query.end_time:
            results = [r for r in results if r.timestamp <= query.end_time]
        
        # Sort by timestamp
        results.sort(key=lambda x: x.timestamp)
        
        # Apply pagination
        return results[query.offset:query.offset + query.limit]
    
    async def list_sessions(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """List all available sessions."""
        sessions = []
        for session_id, session_data in self._sessions.items():
            sessions.append({
                "session_id": session_id,
                "start_time": session_data["start_time"].isoformat(),
                "end_time": session_data["end_time"].isoformat(),
                "lap_count": len(session_data["lap_numbers"]),
                "total_records": sum(1 for d in self._data if d.session_id == session_id)
            })
        
        sessions.sort(key=lambda x: x["start_time"], reverse=True)
        return sessions[offset:offset + limit]
    
    async def get_session_laps(self, session_id: str) -> List[Dict[str, Any]]:
        """Get lap information for a session."""
        session_data = self._sessions.get(session_id)
        if not session_data:
            return []
        
        laps = []
        for lap_num in sorted(session_data["lap_numbers"]):
            lap_records = [r for r in self._data 
                          if r.session_id == session_id and r.lap_number == lap_num]
            if lap_records:
                lap_times = [r.lap_time for r in lap_records if r.lap_time is not None]
                speeds = [r.vehicle_dynamics.speed for r in lap_records]
                lateral_g = [r.vehicle_dynamics.lateral_g for r in lap_records]
                longitudinal_g = [r.vehicle_dynamics.longitudinal_g for r in lap_records]
                
                laps.append({
                    "lap_number": lap_num,
                    "lap_time": max(lap_times) if lap_times else None,
                    "max_speed": max(speeds) if speeds else None,
                    "avg_speed": sum(speeds) / len(speeds) if speeds else None,
                    "max_lateral_g": max(lateral_g) if lateral_g else None,
                    "max_longitudinal_g": max(longitudinal_g) if longitudinal_g else None,
                    "record_count": len(lap_records)
                })
        
        return laps
    
    async def get_session_summary(self, session_id: str) -> Dict[str, Any]:
        """Get summary statistics for a session."""
        session_data = self._sessions.get(session_id)
        if not session_data:
            return {"error": "Session not found"}
        
        records = [r for r in self._data if r.session_id == session_id]
        if not records:
            return {"error": "No data found for session"}
        
        speeds = [r.vehicle_dynamics.speed for r in records]
        lateral_g = [r.vehicle_dynamics.lateral_g for r in records]
        longitudinal_g = [r.vehicle_dynamics.longitudinal_g for r in records]
        engine_rpm = [r.powertrain.engine_rpm for r in records]
        
        return {
            "session_id": session_id,
            "start_time": session_data["start_time"].isoformat(),
            "end_time": session_data["end_time"].isoformat(),
            "duration_seconds": (session_data["end_time"] - session_data["start_time"]).total_seconds(),
            "total_records": len(records),
            "lap_count": len(session_data["lap_numbers"]),
            "statistics": {
                "speed": {
                    "max": max(speeds),
                    "min": min(speeds),
                    "avg": sum(speeds) / len(speeds)
                },
                "lateral_g": {
                    "max": max(lateral_g),
                    "min": min(lateral_g),
                    "avg": sum(lateral_g) / len(lateral_g)
                },
                "longitudinal_g": {
                    "max": max(longitudinal_g),
                    "min": min(longitudinal_g),
                    "avg": sum(longitudinal_g) / len(longitudinal_g)
                },
                "engine_rpm": {
                    "max": max(engine_rpm),
                    "min": min(engine_rpm),
                    "avg": sum(engine_rpm) / len(engine_rpm)
                }
            }
        }
    
    async def delete_session(self, session_id: str) -> Dict[str, Any]:
        """Delete all data for a session."""
        count_before = len(self._data)
        self._data = [r for r in self._data if r.session_id != session_id]
        count_after = len(self._data)
        
        if session_id in self._sessions:
            del self._sessions[session_id]
        
        return {"count": count_before - count_after}
    
    async def rename_session(self, old_session_id: str, new_session_id: str) -> Dict[str, Any]:
        """Rename a session by updating all records with a new session ID."""
        # Update all records with the new session ID
        updated = 0
        for record in self._data:
            if record.session_id == old_session_id:
                record.session_id = new_session_id
                updated += 1
        
        # Update session metadata
        if old_session_id in self._sessions:
            self._sessions[new_session_id] = self._sessions.pop(old_session_id)
        
        return {"count": updated}


# Global shared database repository instance
_shared_telemetry_repo: Optional[TelemetryRepository] = None

# Database connection factory
def get_db() -> TelemetryRepository:
    """
    Get database repository instance.
    Returns a shared singleton instance to avoid connection pool exhaustion.
    """
    global _shared_telemetry_repo
    
    if _shared_telemetry_repo is not None:
        return _shared_telemetry_repo
    
    db_type = os.getenv("DB_TYPE", "memory").lower()
    
    if db_type == "memory":
        _shared_telemetry_repo = InMemoryRepository()
    elif db_type == "postgresql":
        from .database_postgres import PostgreSQLRepository
        _shared_telemetry_repo = PostgreSQLRepository()
    elif db_type == "influxdb":
        # TODO: Implement InfluxDB repository
        # from .database_influx import InfluxDBRepository
        # _shared_telemetry_repo = InfluxDBRepository()
        raise NotImplementedError("InfluxDB repository not yet implemented")
    else:
        raise ValueError(f"Unknown database type: {db_type}")
    
    return _shared_telemetry_repo

