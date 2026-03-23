"""
Racing Telemetry API
FastAPI application for uploading and downloading racing car telemetry data.
"""

from fastapi import FastAPI, HTTPException, Query, Depends, WebSocket, WebSocketDisconnect, Header
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from typing import List, Optional
from pathlib import Path
import asyncio
import logging

from .models import TelemetryData, TelemetryResponse, TelemetryQuery
from .database import get_db, TelemetryRepository
from .schema_validator import validate_telemetry_data
from .track_routes import router as tracks_router
from .car_profile_routes import router as car_profiles_router
from .simulation_routes import router as simulation_router
from .device_routes import router as devices_router
from .auth_routes import router as auth_router
from .auth import get_current_user
from .websocket_manager import websocket_manager

# Load schema for validation
SCHEMA_PATH = Path(__file__).parent.parent / "data-structure" / "telemetry-schema.json"

# Setup logging
logger = logging.getLogger(__name__)


async def get_device_repo_for_auth():
    """Get device repository for API key validation."""
    from .db_pool import get_shared_db_repo
    from .device_database import DeviceRepository
    db_repo = await get_shared_db_repo()
    device_repo = DeviceRepository(db_repo.pool)
    await device_repo.ensure_schema()
    return device_repo


async def verify_upload_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
    device_repo=Depends(get_device_repo_for_auth),
) -> Optional[str]:
    """
    Verify API key for telemetry upload endpoints.
    Keys are managed via Device Management (database). Returns device_id when valid.
    If no devices are registered, uploads are allowed without auth (for initial setup).
    """
    provided_key = None
    if x_api_key:
        provided_key = x_api_key.strip()
    elif authorization and authorization.lower().startswith("bearer "):
        provided_key = authorization[7:].strip()

    devices = await device_repo.list_devices()
    if not devices:
        return None  # No devices registered - allow uploads (for initial setup)

    if not provided_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key. Register devices in Device Management and provide X-API-Key header.",
        )
    device_id = await device_repo.get_device_by_key(provided_key)
    if not device_id:
        raise HTTPException(status_code=401, detail="Invalid API key.")
    return device_id

app = FastAPI(
    title="Racing Telemetry API",
    description="API for uploading and downloading racing car telemetry data",
    version="1.0.0"
)

# Include track routes
app.include_router(tracks_router)

# Include car profile routes
app.include_router(car_profiles_router)

# Include simulation routes
app.include_router(simulation_router)

# On-car config endpoint (must be before devices_router so /config doesn't match /{device_id})
@app.get("/api/v1/devices/config")
async def get_device_config_for_device(
    device_id: str = Depends(verify_upload_api_key),
    device_repo=Depends(get_device_repo_for_auth),
):
    """
    Get stored configuration for the authenticated device.
    Called by the on-car capture on startup. Requires X-API-Key header.
    Returns 404 if no configuration has been stored for this device.
    """
    config = await device_repo.get_device_config(device_id)
    if config is None:
        raise HTTPException(
            status_code=404,
            detail="No configuration stored for this device. Add one in Device Management.",
        )
    await device_repo.record_seen(device_id)
    return {"config": config}


@app.post("/api/v1/devices/ping")
async def device_ping(
    device_id: str = Depends(verify_upload_api_key),
    device_repo=Depends(get_device_repo_for_auth),
):
    """
    Heartbeat endpoint for on-car devices. Updates last_seen_at.
    Call periodically (e.g. every 2 min) to indicate device is live.
    """
    await device_repo.record_seen(device_id)
    return {"ok": True}


# Include device management routes
app.include_router(devices_router)

# Include auth routes (login, register, me)
app.include_router(auth_router)


@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for live telemetry data.
    Clients connect here to receive real-time telemetry updates.
    """
    await websocket_manager.connect(websocket)
    try:
        # Send periodic ping to keep connection alive
        ping_task = asyncio.create_task(_ping_client(websocket))
        
        try:
            while True:
                # Wait for messages (with timeout to allow ping to work)
                try:
                    # Use receive with timeout to allow ping task to run
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                    # Client can send messages if needed, but we don't require them
                    # Just keep the connection alive
                except asyncio.TimeoutError:
                    # Timeout is normal - just continue to keep connection alive
                    continue
        finally:
            ping_task.cancel()
            try:
                await ping_task
            except asyncio.CancelledError:
                pass
    except WebSocketDisconnect:
        await websocket_manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket_manager.disconnect(websocket)


async def _ping_client(websocket: WebSocket):
    """Send periodic ping to keep WebSocket connection alive."""
    try:
        while True:
            await asyncio.sleep(20)  # Send ping every 20 seconds
            try:
                await websocket.send_text('{"type":"ping"}')
            except Exception:
                # Connection is dead, exit
                break
    except asyncio.CancelledError:
        pass

# Global database instance for startup/shutdown
_db_instance = None

# Startup and shutdown events for database connection management
@app.on_event("startup")
async def startup_event():
    """Initialize database connections on startup."""
    global _db_instance
    _db_instance = get_db()
    if hasattr(_db_instance, 'initialize'):
        await _db_instance.initialize()
    
    # Initialize shared database pool for other repositories (car profiles, tracks, etc.)
    from .db_pool import get_shared_db_repo
    await get_shared_db_repo()

@app.on_event("shutdown")
async def shutdown_event():
    """Close database connections on shutdown."""
    global _db_instance
    if _db_instance and hasattr(_db_instance, 'close'):
        await _db_instance.close()
    
    # Close shared database pool
    from .db_pool import close_shared_db_repo
    await close_shared_db_repo()

# CORS middleware for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "Racing Telemetry API",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Detailed health check."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": "connected"  # Add actual DB health check
    }


def _validate_device_id(data: TelemetryData, expected_device_id: Optional[str]) -> None:
    """When using per-device keys, ensure request device_id matches the key's device."""
    if not expected_device_id:
        return
    actual = (data.metadata.device_id if data.metadata else None) or ""
    if actual != expected_device_id:
        raise HTTPException(
            status_code=403,
            detail=f"API key is not valid for device_id '{actual}'. Expected '{expected_device_id}'.",
        )


@app.post("/api/v1/telemetry/upload", response_model=TelemetryResponse)
async def upload_telemetry(
    data: TelemetryData,
    db: TelemetryRepository = Depends(get_db),
    auth_device_id: Optional[str] = Depends(verify_upload_api_key),
    device_repo=Depends(get_device_repo_for_auth),
):
    """
    Upload a single telemetry data point.
    
    Validates the data against the JSON schema and stores it in the database.
    """
    _validate_device_id(data, auth_device_id)
    if auth_device_id:
        await device_repo.record_seen(auth_device_id)
    try:
        # Validate against JSON schema
        validation_result = validate_telemetry_data(data.model_dump(mode='json'))
        if not validation_result["valid"]:
            raise HTTPException(
                status_code=400,
                detail=f"Schema validation failed: {validation_result['errors']}"
            )
        
        # Store in database
        result = await db.insert_telemetry(data)
        
        # Broadcast to WebSocket clients
        # Use model_dump() which will include datetime objects, and let the JSON serializer handle them
        await websocket_manager.broadcast_telemetry(data.model_dump())
        
        return TelemetryResponse(
            success=True,
            message="Telemetry data uploaded successfully",
            timestamp=datetime.now(timezone.utc).isoformat(),
            record_id=str(result.get("id")) if result.get("id") is not None else None
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/v1/telemetry/upload/batch", response_model=dict)
async def upload_telemetry_batch(
    data: List[TelemetryData],
    db: TelemetryRepository = Depends(get_db),
    auth_device_id: Optional[str] = Depends(verify_upload_api_key),
    device_repo=Depends(get_device_repo_for_auth),
):
    """
    Upload multiple telemetry data points in a single request.
    
    Useful for bulk uploads after a session or lap.
    """
    if not data:
        raise HTTPException(status_code=400, detail="Empty data array provided")
    
    if len(data) > 10000:  # Limit batch size
        raise HTTPException(
            status_code=400,
            detail="Batch size exceeds maximum of 10,000 records"
        )

    if auth_device_id:
        await device_repo.record_seen(auth_device_id)
    if auth_device_id and data:
        _validate_device_id(data[0], auth_device_id)

    validated_count = 0
    errors = []
    
    for idx, record in enumerate(data):
        try:
            # Use model_dump() for Pydantic v2 compatibility
            validation_result = validate_telemetry_data(record.model_dump(mode='json'))
            if not validation_result["valid"]:
                errors.append({
                    "index": idx,
                    "errors": validation_result["errors"]
                })
                logger.warning(f"Validation failed for record {idx}: {validation_result['errors']}")
                continue
            
            result = await db.insert_telemetry(record)
            logger.info(f"Inserted record {idx}: session_id={record.session_id}, id={result.get('id')}")
            # Broadcast each record to WebSocket clients
            await websocket_manager.broadcast_telemetry(record.model_dump(mode='json'))
            validated_count += 1
        except Exception as e:
            logger.error(f"Error processing record {idx}: {str(e)}", exc_info=True)
            errors.append({
                "index": idx,
                "error": str(e)
            })
    
    return {
        "success": len(errors) == 0,
        "total_records": len(data),
        "uploaded": validated_count,
        "failed": len(errors),
        "errors": errors if errors else None,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/v1/telemetry/download", response_model=List[TelemetryData])
async def download_telemetry(
    session_id: Optional[str] = Query(None, description="Filter by session ID"),
    lap_number: Optional[int] = Query(None, description="Filter by lap number"),
    start_time: Optional[datetime] = Query(None, description="Start timestamp (ISO 8601)"),
    end_time: Optional[datetime] = Query(None, description="End timestamp (ISO 8601)"),
    limit: int = Query(100000, ge=1, le=1000000, description="Maximum number of records to return"),
    offset: int = Query(0, ge=0, description="Number of records to skip"),
    db: TelemetryRepository = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Download telemetry data with optional filters.
    
    Supports filtering by:
    - session_id
    - lap_number
    - time range (start_time, end_time)
    
    Returns paginated results.
    """
    query = TelemetryQuery(
        session_id=session_id,
        lap_number=lap_number,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        offset=offset
    )
    
    try:
        results = await db.query_telemetry(query)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@app.get("/api/v1/telemetry/sessions")
async def list_sessions(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: TelemetryRepository = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """List all available telemetry sessions."""
    try:
        sessions = await db.list_sessions(limit=limit, offset=offset)
        return {
            "sessions": sessions,
            "count": len(sessions),
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list sessions: {str(e)}")


@app.get("/api/v1/telemetry/sessions/{session_id}/laps")
async def get_session_laps(
    session_id: str,
    db: TelemetryRepository = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Get lap information for a specific session."""
    try:
        laps = await db.get_session_laps(session_id)
        return {
            "session_id": session_id,
            "laps": laps,
            "lap_count": len(laps)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get laps: {str(e)}")


@app.get("/api/v1/telemetry/sessions/{session_id}/summary")
async def get_session_summary(
    session_id: str,
    db: TelemetryRepository = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Get summary statistics for a session."""
    try:
        summary = await db.get_session_summary(session_id)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get summary: {str(e)}")


@app.delete("/api/v1/telemetry/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: TelemetryRepository = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Delete all telemetry data for a session."""
    try:
        result = await db.delete_session(session_id)
        return {
            "success": True,
            "message": f"Session {session_id} deleted",
            "records_deleted": result.get("count", 0)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")


@app.patch("/api/v1/telemetry/sessions/{session_id}/rename")
async def rename_session(
    session_id: str,
    new_session_id: str = Query(..., description="New session ID"),
    db: TelemetryRepository = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Rename a session by updating all records with a new session ID."""
    try:
        # Check if new session ID already exists
        sessions = await db.list_sessions(limit=1000)
        if any(s["session_id"] == new_session_id for s in sessions):
            raise HTTPException(status_code=400, detail=f"Session ID '{new_session_id}' already exists")
        
        # Rename session in database
        if hasattr(db, 'rename_session'):
            result = await db.rename_session(session_id, new_session_id)
        else:
            # Fallback: implement rename by updating all records
            raise HTTPException(status_code=501, detail="Rename not implemented for this database backend")
        
        return {
            "success": True,
            "message": f"Session renamed from '{session_id}' to '{new_session_id}'",
            "old_session_id": session_id,
            "new_session_id": new_session_id,
            "records_updated": result.get("count", 0)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rename session: {str(e)}")


@app.get("/api/v1/telemetry/sessions/{session_id}/export")
async def export_session(
    session_id: str,
    db: TelemetryRepository = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Export all telemetry data for a session as JSON."""
    try:
        
        # Get all telemetry data for the session
        query = TelemetryQuery(
            session_id=session_id,
            limit=100000,  # Large limit to get all records
            offset=0
        )
        records = await db.query_telemetry(query)
        
        # Convert to JSON-serializable format
        export_data = [record.model_dump(mode='json') for record in records]
        
        return JSONResponse(
            content=export_data,
            media_type="application/json",
            headers={
                "Content-Disposition": f'attachment; filename="session_{session_id}.json"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export session: {str(e)}")


@app.post("/api/v1/telemetry/sessions/import")
async def import_session(
    data: List[TelemetryData],
    db: TelemetryRepository = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Import telemetry data from a JSON file."""
    try:
        imported_count = 0
        errors = []
        
        # Validate and import each record
        for i, record in enumerate(data):
            try:
                # Validate against JSON schema
                validation_result = validate_telemetry_data(record.model_dump())
                if not validation_result["valid"]:
                    errors.append(f"Record {i}: {validation_result['errors']}")
                    continue
                
                # Insert record
                await db.insert_telemetry(record)
                imported_count += 1
            except Exception as e:
                errors.append(f"Record {i}: {str(e)}")
        
        return {
            "success": True,
            "imported_count": imported_count,
            "total_count": len(data),
            "errors": errors if errors else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to import session: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

