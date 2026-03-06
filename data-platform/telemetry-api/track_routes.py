"""
API routes for track management.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import List, Optional
import asyncpg
import os
import csv
import io
import uuid

from .track_models import Track, TrackCreate, TrackUpdate, TrackList, TrackPoint, TrackAnchor
from .track_database import TrackRepository
from .db_pool import get_shared_db_repo
from .weather import weather_service
from .auth import get_current_user


router = APIRouter(
    prefix="/api/v1/tracks",
    tags=["tracks"],
    dependencies=[Depends(get_current_user)],
)


async def get_track_repo() -> TrackRepository:
    """Get track repository instance using shared database pool."""
    db_repo = await get_shared_db_repo()
    track_repo = TrackRepository(db_repo.pool)
    await track_repo.ensure_schema()
    return track_repo


@router.post("", response_model=Track, status_code=201)
async def create_track(track: TrackCreate, repo: TrackRepository = Depends(get_track_repo)):
    """Create a new track."""
    # Check if track_id already exists
    existing = await repo.get_track(track.track_id)
    if existing:
        raise HTTPException(status_code=400, detail=f"Track with ID '{track.track_id}' already exists")
    
    return await repo.create_track(track)


@router.get("", response_model=TrackList)
async def list_tracks(repo: TrackRepository = Depends(get_track_repo)):
    """List all tracks."""
    tracks = await repo.list_tracks()
    return TrackList(tracks=tracks, count=len(tracks))


@router.get("/{track_id}", response_model=Track)
async def get_track(track_id: str, repo: TrackRepository = Depends(get_track_repo)):
    """Get a track by ID."""
    track = await repo.get_track(track_id)
    if not track:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
    return track


@router.put("/{track_id}", response_model=Track)
async def update_track(track_id: str, update: TrackUpdate, repo: TrackRepository = Depends(get_track_repo)):
    """Update a track."""
    existing = await repo.get_track(track_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
    
    updated = await repo.update_track(track_id, update)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update track")
    
    return updated


@router.delete("/{track_id}", status_code=204)
async def delete_track(track_id: str, repo: TrackRepository = Depends(get_track_repo)):
    """Delete a track."""
    success = await repo.delete_track(track_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
    return None


@router.post("/upload", response_model=Track, status_code=201)
async def upload_track_csv(
    file: UploadFile = File(...),
    track_id: Optional[str] = Form(None),
    track_name: str = Form(...),
    anchor_latitude: float = Form(...),
    anchor_longitude: float = Form(...),
    anchor_x_m: float = Form(0.0),
    anchor_y_m: float = Form(0.0),
    anchor_heading: float = Form(0.0),
    repo: TrackRepository = Depends(get_track_repo)
):
    """
    Upload track data from CSV file.
    
    CSV format:
    # x_m,y_m,w_tr_right_m,w_tr_left_m
    0.0,0.0,12.0,12.0
    100.0,0.0,12.0,12.0
    ...
    
    The first line starting with # is treated as a header/comment.
    """
    # Generate track_id if not provided
    if not track_id or not track_id.strip():
        # Generate from track_name
        track_id = track_name.lower().replace(' ', '_').replace('-', '_')
        # Remove special characters
        track_id = ''.join(c for c in track_id if c.isalnum() or c == '_')
        # Ensure uniqueness
        base_id = track_id
        counter = 1
        while await repo.get_track(track_id):
            track_id = f"{base_id}_{counter}"
            counter += 1
    else:
        # Check if provided track_id already exists
        existing = await repo.get_track(track_id)
        if existing:
            raise HTTPException(status_code=400, detail=f"Track with ID '{track_id}' already exists")
    
    # Read and parse CSV
    try:
        contents = await file.read()
        text = contents.decode('utf-8')
        
        # Parse CSV
        points = []
        lines = text.strip().split('\n')
        
        for line_num, line in enumerate(lines, start=1):
            line = line.strip()
            
            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue
            
            # Parse CSV line
            try:
                reader = csv.reader([line])
                row = next(reader)
                
                if len(row) < 4:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Line {line_num}: Expected 4 columns (x_m, y_m, w_tr_right_m, w_tr_left_m), got {len(row)}"
                    )
                
                point = TrackPoint(
                    x_m=float(row[0]),
                    y_m=float(row[1]),
                    w_tr_right_m=float(row[2]),
                    w_tr_left_m=float(row[3])
                )
                points.append(point)
                
            except ValueError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Line {line_num}: Invalid number format - {str(e)}"
                )
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Line {line_num}: Error parsing CSV - {str(e)}"
                )
        
        if len(points) < 2:
            raise HTTPException(
                status_code=400,
                detail="Track must have at least 2 points"
            )
        
        # Create track
        anchor = TrackAnchor(
            latitude=anchor_latitude,
            longitude=anchor_longitude,
            x_m=anchor_x_m,
            y_m=anchor_y_m,
            heading=anchor_heading
        )
        
        track_create = TrackCreate(
            track_id=track_id,
            name=track_name,
            anchor=anchor,
            points=points
        )
        
        track = await repo.create_track(track_create)
        return track
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing CSV file: {str(e)}"
        )


@router.get("/{track_id}/weather")
async def get_track_weather(track_id: str, repo: TrackRepository = Depends(get_track_repo)):
    """Get current weather for a track's location."""
    track = await repo.get_track(track_id)
    if not track:
        raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
    
    weather = weather_service.get_weather(
        track.anchor.latitude,
        track.anchor.longitude
    )
    
    return weather

