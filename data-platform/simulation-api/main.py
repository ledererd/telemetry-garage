"""
Racing Line Simulation API
FastAPI application for calculating optimal racing lines and lap times.
"""

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.responses import Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
import io
import os
import sys

# Add parent directory to path to import from telemetry_api module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from telemetry_api.track_database import TrackRepository
from telemetry_api.car_profile_database import CarProfileRepository
from telemetry_api.db_pool import get_shared_db_repo
from telemetry_api.auth import get_current_user
from racing_line_optimizer import RacingLineOptimizer
from lap_time_calculator import LapTimeCalculator
import hashlib
import pickle

app = FastAPI(
    title="Racing Line Simulation API",
    description="API for calculating optimal racing lines and lap times",
    version="2.0.0"
)

# In-memory cache for racing lines (key: track_id + profile_id hash)
racing_line_cache = {}
# Track which profile_ids are in which cache keys for efficient clearing
profile_cache_index = {}  # profile_id -> set of cache_keys


def _get_cache_key(track_id: str, profile_id: str) -> str:
    """Generate a cache key from track_id and profile_id."""
    key_string = f"{track_id}:{profile_id}"
    return hashlib.md5(key_string.encode()).hexdigest()


def _get_or_optimize_racing_line(track_points, car_profile, cache_key: str, profile_id: str):
    """
    Get racing line from cache or optimize it.
    Returns the racing line numpy array.
    """
    if cache_key in racing_line_cache:
        print(f"Using cached racing line for {cache_key}")
        return racing_line_cache[cache_key]
    
    print(f"Optimizing racing line for {cache_key}")
    optimizer = RacingLineOptimizer(track_points, car_profile)
    racing_line = optimizer.optimize()
    
    # Cache the racing line
    racing_line_cache[cache_key] = racing_line
    
    # Track this cache key for the profile_id
    if profile_id not in profile_cache_index:
        profile_cache_index[profile_id] = set()
    profile_cache_index[profile_id].add(cache_key)
    
    print(f"Cached racing line for {cache_key} (profile: {profile_id})")
    
    return racing_line


def _clear_cache_for_profile(profile_id: str):
    """
    Clear all cache entries for a specific profile_id.
    This should be called when a car profile is updated.
    """
    if profile_id not in profile_cache_index:
        print(f"No cache entries found for profile {profile_id}")
        return
    
    keys_to_remove = list(profile_cache_index[profile_id])
    for cache_key in keys_to_remove:
        if cache_key in racing_line_cache:
            del racing_line_cache[cache_key]
    
    del profile_cache_index[profile_id]
    print(f"Cleared {len(keys_to_remove)} cache entries for profile {profile_id}")


def _clear_all_cache():
    """Clear all cache entries."""
    count = len(racing_line_cache)
    racing_line_cache.clear()
    profile_cache_index.clear()
    print(f"Cleared all {count} cache entries")


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "racing-line-simulation-api"}


@app.post("/api/v1/simulation/cache/clear")
async def clear_cache(
    profile_id: Optional[str] = Query(None, description="Optional profile ID to clear cache for specific profile"),
    _: str = Depends(get_current_user),
):
    """
    Clear racing line cache.
    If profile_id is provided, clears cache for that profile only.
    Otherwise, clears all cache entries.
    """
    if profile_id:
        _clear_cache_for_profile(profile_id)
        return {"message": f"Cache cleared for profile {profile_id}", "cleared": True}
    else:
        _clear_all_cache()
        return {"message": "All cache cleared", "cleared": True}


@app.get("/api/v1/simulation/racing-line")
@app.post("/api/v1/simulation/racing-line")
async def generate_racing_line(
    track_id: str = Query(..., description="Track ID from database"),
    profile_id: str = Query(..., description="Car profile ID from database"),
    _: str = Depends(get_current_user),
):
    """
    Generate the optimal racing line plot for a given track and car profile.
    Uses cached racing line if available, otherwise optimizes it.
    
    Returns PNG image of the racing line plot.
    """
    try:
        # Get database connection
        db_repo = await get_shared_db_repo()
        
        # Ensure pool is initialized
        if db_repo.pool is None:
            try:
                await db_repo.initialize()
            except Exception as init_error:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to initialize database connection: {str(init_error)}. Check DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD environment variables."
                )
        
        if db_repo.pool is None:
            raise HTTPException(
                status_code=500,
                detail="Database connection pool not initialized. Check database configuration and environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)."
            )
        
        # Fetch track from database
        track_repo = TrackRepository(db_repo.pool)
        await track_repo.ensure_schema()
        track = await track_repo.get_track(track_id)
        if not track:
            raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
        
        # Fetch car profile from database
        profile_repo = CarProfileRepository(db_repo.pool)
        await profile_repo.ensure_schema()
        profile = await profile_repo.get_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Car profile '{profile_id}' not found")
        
        # Convert track points to numpy arrays
        track_points = []
        for point in track.points:
            track_points.append([point.x_m, point.y_m, point.w_tr_right_m, point.w_tr_left_m])
        
        # Get or optimize racing line (uses cache if available)
        cache_key = _get_cache_key(track_id, profile_id)
        racing_line = _get_or_optimize_racing_line(track_points, profile.veh_pars, cache_key, profile_id)
        
        # Initialize optimizer for plot generation (doesn't need to optimize again)
        optimizer = RacingLineOptimizer(track_points, profile.veh_pars)
        
        # Generate plot
        plot_bytes = optimizer.generate_plot(racing_line, track_points)
        
        return Response(content=plot_bytes, media_type="image/png")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating racing line: {str(e)}")


@app.get("/api/v1/simulation/racing-line/csv")
async def get_racing_line_csv(
    track_id: str = Query(..., description="Track ID from database"),
    profile_id: str = Query(..., description="Car profile ID from database"),
    _: str = Depends(get_current_user),
):
    """
    Get the racing line as a CSV file for driver training.
    Uses cached racing line if available, otherwise optimizes it.
    """
    try:
        # Get database connection
        db_repo = await get_shared_db_repo()
        
        # Ensure pool is initialized
        if db_repo.pool is None:
            try:
                await db_repo.initialize()
            except Exception as init_error:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to initialize database connection: {str(init_error)}. Check DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD environment variables."
                )
        
        if db_repo.pool is None:
            raise HTTPException(
                status_code=500,
                detail="Database connection pool not initialized. Check database configuration and environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)."
            )
        
        # Fetch track from database
        track_repo = TrackRepository(db_repo.pool)
        await track_repo.ensure_schema()
        track = await track_repo.get_track(track_id)
        if not track:
            raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
        
        # Fetch car profile from database
        profile_repo = CarProfileRepository(db_repo.pool)
        await profile_repo.ensure_schema()
        profile = await profile_repo.get_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Car profile '{profile_id}' not found")
        
        # Convert track points to numpy arrays
        track_points = []
        for point in track.points:
            track_points.append([point.x_m, point.y_m, point.w_tr_right_m, point.w_tr_left_m])
        
        # Get or optimize racing line (uses cache if available)
        cache_key = _get_cache_key(track_id, profile_id)
        racing_line = _get_or_optimize_racing_line(track_points, profile.veh_pars, cache_key, profile_id)
        
        # Initialize optimizer for CSV generation (doesn't need to optimize again)
        optimizer = RacingLineOptimizer(track_points, profile.veh_pars)
        
        # Generate CSV
        csv_content = optimizer.generate_csv(racing_line)
        
        # Return CSV file
        return StreamingResponse(
            io.BytesIO(csv_content.encode('utf-8')),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="racing_line_{track_id}_{profile_id}.csv"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating racing line CSV: {str(e)}")


@app.get("/api/v1/simulation/lap-time")
async def calculate_lap_time(
    track_id: str = Query(..., description="Track ID from database"),
    profile_id: str = Query(..., description="Car profile ID from database"),
    _: str = Depends(get_current_user),
):
    """
    Calculate the fastest lap time for a given track and car profile.
    
    Returns the lap time in seconds.
    """
    try:
        # Get database connection
        db_repo = await get_shared_db_repo()
        
        # Ensure pool is initialized
        if db_repo.pool is None:
            try:
                await db_repo.initialize()
            except Exception as init_error:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to initialize database connection: {str(init_error)}. Check DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD environment variables."
                )
        
        if db_repo.pool is None:
            raise HTTPException(
                status_code=500,
                detail="Database connection pool not initialized. Check database configuration and environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)."
            )
        
        # Fetch track from database
        track_repo = TrackRepository(db_repo.pool)
        await track_repo.ensure_schema()
        track = await track_repo.get_track(track_id)
        if not track:
            raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
        
        # Fetch car profile from database
        profile_repo = CarProfileRepository(db_repo.pool)
        await profile_repo.ensure_schema()
        profile = await profile_repo.get_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Car profile '{profile_id}' not found")
        
        # Convert track points to numpy arrays
        track_points = []
        for point in track.points:
            track_points.append([point.x_m, point.y_m, point.w_tr_right_m, point.w_tr_left_m])
        
        # Get or optimize racing line (uses cache if available)
        cache_key = _get_cache_key(track_id, profile_id)
        was_cached = cache_key in racing_line_cache
        print(f"Lap time calculation: track_id={track_id}, profile_id={profile_id}, cache_key={cache_key}, was_cached={was_cached}")
        racing_line = _get_or_optimize_racing_line(track_points, profile.veh_pars, cache_key, profile_id)
        
        # Calculate lap time with speed profile using the current profile's parameters
        calculator = LapTimeCalculator(track_points, profile.veh_pars)
        lap_time, speed_profile = calculator.calculate_lap_time(racing_line, return_speed_profile=True)
        print(f"Calculated lap time: {lap_time:.3f}s for profile {profile_id} ({profile.name})")
        
        return {
            "lap_time": lap_time,
            "speed_profile": speed_profile,
            "unit": "seconds",
            "track_id": track_id,
            "track_name": track.name,
            "profile_id": profile_id,
            "profile_name": profile.name,
            "cached": was_cached
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating lap time: {str(e)}")


@app.post("/api/v1/simulation/full")
async def full_simulation(
    track_id: str = Query(..., description="Track ID from database"),
    profile_id: str = Query(..., description="Car profile ID from database"),
    include_plot: bool = Query(False, description="Whether to generate plot (slower)"),
    _: str = Depends(get_current_user),
):
    """
    Perform a full simulation: calculate lap time and optionally generate racing line plot.
    Uses cached racing line if available.
    
    Returns JSON with lap time and links to download plot and CSV.
    """
    try:
        # Get database connection
        db_repo = await get_shared_db_repo()
        
        # Ensure pool is initialized
        if db_repo.pool is None:
            try:
                await db_repo.initialize()
            except Exception as init_error:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to initialize database connection: {str(init_error)}. Check DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD environment variables."
                )
        
        if db_repo.pool is None:
            raise HTTPException(
                status_code=500,
                detail="Database connection pool not initialized. Check database configuration and environment variables (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)."
            )
        
        # Fetch track from database
        track_repo = TrackRepository(db_repo.pool)
        await track_repo.ensure_schema()
        track = await track_repo.get_track(track_id)
        if not track:
            raise HTTPException(status_code=404, detail=f"Track '{track_id}' not found")
        
        # Fetch car profile from database
        profile_repo = CarProfileRepository(db_repo.pool)
        await profile_repo.ensure_schema()
        profile = await profile_repo.get_profile(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail=f"Car profile '{profile_id}' not found")
        
        # Convert track points to numpy arrays
        track_points = []
        for point in track.points:
            track_points.append([point.x_m, point.y_m, point.w_tr_right_m, point.w_tr_left_m])
        
        # Get or optimize racing line (uses cache if available)
        cache_key = _get_cache_key(track_id, profile_id)
        was_cached = cache_key in racing_line_cache
        racing_line = _get_or_optimize_racing_line(track_points, profile.veh_pars, cache_key, profile_id)
        
        # Calculate lap time
        calculator = LapTimeCalculator(track_points, profile.veh_pars)
        lap_time = calculator.calculate_lap_time(racing_line)
        
        return {
            "lap_time": lap_time,
            "unit": "seconds",
            "track_id": track_id,
            "track_name": track.name,
            "profile_id": profile_id,
            "profile_name": profile.name,
            "plot_url": f"/api/v1/simulation/racing-line?track_id={track_id}&profile_id={profile_id}",
            "csv_url": f"/api/v1/simulation/racing-line/csv?track_id={track_id}&profile_id={profile_id}",
            "cached": was_cached
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing simulation: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("API_PORT", 8002))
    uvicorn.run(app, host="0.0.0.0", port=port)
