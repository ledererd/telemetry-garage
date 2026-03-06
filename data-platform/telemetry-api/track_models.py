"""
Pydantic models for track data.
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from decimal import Decimal


class TrackPoint(BaseModel):
    """A single point on the track centerline."""
    x_m: float = Field(..., description="X coordinate in meters (6 decimal precision)")
    y_m: float = Field(..., description="Y coordinate in meters (6 decimal precision)")
    w_tr_right_m: float = Field(..., ge=0, description="Track width to the right of centerline in meters")
    w_tr_left_m: float = Field(..., ge=0, description="Track width to the left of centerline in meters")


class TrackAnchor(BaseModel):
    """GPS anchor point for mapping track coordinates to GPS."""
    latitude: float = Field(..., ge=-90, le=90, description="GPS latitude of anchor point")
    longitude: float = Field(..., ge=-180, le=180, description="GPS longitude of anchor point")
    x_m: float = Field(..., description="X coordinate in meters at anchor point")
    y_m: float = Field(..., description="Y coordinate in meters at anchor point")
    heading: float = Field(..., ge=0, le=360, description="Heading/rotation of track coordinate system in degrees")


class TrackCreate(BaseModel):
    """Model for creating a new track."""
    track_id: str = Field(..., description="Unique track identifier")
    name: str = Field(..., description="Track name")
    anchor: TrackAnchor = Field(..., description="GPS anchor point for coordinate mapping")
    points: List[TrackPoint] = Field(..., min_items=2, description="Track centerline points")


class TrackUpdate(BaseModel):
    """Model for updating a track."""
    name: Optional[str] = Field(None, description="Track name")
    anchor: Optional[TrackAnchor] = Field(None, description="GPS anchor point")
    points: Optional[List[TrackPoint]] = Field(None, min_items=2, description="Track centerline points")


class Track(BaseModel):
    """Complete track model."""
    track_id: str = Field(..., description="Unique track identifier")
    name: str = Field(..., description="Track name")
    anchor: TrackAnchor = Field(..., description="GPS anchor point")
    points: List[TrackPoint] = Field(..., description="Track centerline points")
    created_at: Optional[str] = Field(None, description="Creation timestamp")
    updated_at: Optional[str] = Field(None, description="Last update timestamp")

    class Config:
        json_schema_extra = {
            "example": {
                "track_id": "phillip_island",
                "name": "Phillip Island Grand Prix Circuit",
                "anchor": {
                    "latitude": -38.5075,
                    "longitude": 145.2300,
                    "x_m": 0.0,
                    "y_m": 0.0,
                    "heading": 0.0
                },
                "points": [
                    {
                        "x_m": 0.0,
                        "y_m": 0.0,
                        "w_tr_right_m": 12.0,
                        "w_tr_left_m": 12.0
                    },
                    {
                        "x_m": 100.0,
                        "y_m": 0.0,
                        "w_tr_right_m": 12.0,
                        "w_tr_left_m": 12.0
                    }
                ]
            }
        }


class TrackList(BaseModel):
    """List of tracks."""
    tracks: List[Track]
    count: int

