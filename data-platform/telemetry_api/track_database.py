"""
Database operations for track data.
"""

import asyncpg
from typing import List, Optional, Dict, Any
from datetime import datetime
import os
import json

from .track_models import Track, TrackCreate, TrackUpdate, TrackPoint, TrackAnchor


class TrackRepository:
    """Repository for track data operations."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def ensure_schema(self):
        """Ensure track tables exist."""
        async with self.pool.acquire() as conn:
            # Create tracks table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS tracks (
                    track_id VARCHAR(100) PRIMARY KEY,
                    name VARCHAR(200) NOT NULL,
                    anchor_latitude NUMERIC(10, 8) NOT NULL,
                    anchor_longitude NUMERIC(11, 8) NOT NULL,
                    anchor_x_m NUMERIC(12, 6) NOT NULL,
                    anchor_y_m NUMERIC(12, 6) NOT NULL,
                    anchor_heading NUMERIC(6, 2) NOT NULL,
                    points JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            
            # Create index on name for searching
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tracks_name 
                ON tracks(name)
            """)
    
    async def create_track(self, track: TrackCreate) -> Track:
        """Create a new track."""
        async with self.pool.acquire() as conn:
            points_json = json.dumps([p.dict() for p in track.points])
            
            await conn.execute("""
                INSERT INTO tracks (
                    track_id, name,
                    anchor_latitude, anchor_longitude,
                    anchor_x_m, anchor_y_m, anchor_heading,
                    points, created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
                )
            """,
                track.track_id,
                track.name,
                track.anchor.latitude,
                track.anchor.longitude,
                track.anchor.x_m,
                track.anchor.y_m,
                track.anchor.heading,
                points_json
            )
            
            return await self.get_track(track.track_id)
    
    async def get_track(self, track_id: str) -> Optional[Track]:
        """Get a track by ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM tracks WHERE track_id = $1
            """, track_id)
            
            if not row:
                return None
            
            return self._row_to_track(row)
    
    async def list_tracks(self) -> List[Track]:
        """List all tracks."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT * FROM tracks ORDER BY name
            """)
            
            return [self._row_to_track(row) for row in rows]
    
    async def update_track(self, track_id: str, update: TrackUpdate) -> Optional[Track]:
        """Update a track."""
        async with self.pool.acquire() as conn:
            # Build update query dynamically
            updates = []
            params = []
            param_num = 1
            
            if update.name is not None:
                updates.append(f"name = ${param_num}")
                params.append(update.name)
                param_num += 1
            
            if update.anchor is not None:
                updates.append(f"anchor_latitude = ${param_num}")
                params.append(update.anchor.latitude)
                param_num += 1
                updates.append(f"anchor_longitude = ${param_num}")
                params.append(update.anchor.longitude)
                param_num += 1
                updates.append(f"anchor_x_m = ${param_num}")
                params.append(update.anchor.x_m)
                param_num += 1
                updates.append(f"anchor_y_m = ${param_num}")
                params.append(update.anchor.y_m)
                param_num += 1
                updates.append(f"anchor_heading = ${param_num}")
                params.append(update.anchor.heading)
                param_num += 1
            
            if update.points is not None:
                updates.append(f"points = ${param_num}")
                params.append(json.dumps([p.dict() for p in update.points]))
                param_num += 1
            
            if not updates:
                return await self.get_track(track_id)
            
            updates.append(f"updated_at = NOW()")
            params.append(track_id)
            
            await conn.execute(f"""
                UPDATE tracks 
                SET {', '.join(updates)}
                WHERE track_id = ${param_num}
            """, *params)
            
            return await self.get_track(track_id)
    
    async def delete_track(self, track_id: str) -> bool:
        """Delete a track."""
        async with self.pool.acquire() as conn:
            result = await conn.execute("""
                DELETE FROM tracks WHERE track_id = $1
            """, track_id)
            
            return result == "DELETE 1"
    
    def _row_to_track(self, row) -> Track:
        """Convert database row to Track model."""
        points_data = json.loads(row["points"])
        points = [TrackPoint(**p) for p in points_data]
        
        anchor = TrackAnchor(
            latitude=float(row["anchor_latitude"]),
            longitude=float(row["anchor_longitude"]),
            x_m=float(row["anchor_x_m"]),
            y_m=float(row["anchor_y_m"]),
            heading=float(row["anchor_heading"])
        )
        
        return Track(
            track_id=row["track_id"],
            name=row["name"],
            anchor=anchor,
            points=points,
            created_at=row["created_at"].isoformat() if row["created_at"] else None,
            updated_at=row["updated_at"].isoformat() if row["updated_at"] else None
        )

