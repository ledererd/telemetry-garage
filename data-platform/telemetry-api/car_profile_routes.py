"""
API routes for car profile management.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List
import uuid

from .car_profile_models import CarProfile, CarProfileCreate, CarProfileUpdate, CarProfileList
from .car_profile_database import CarProfileRepository
from .db_pool import get_shared_db_repo
from .auth import get_current_user


router = APIRouter(
    prefix="/api/v1/car-profiles",
    tags=["car-profiles"],
    dependencies=[Depends(get_current_user)],
)


async def get_car_profile_repo() -> CarProfileRepository:
    """Get car profile repository instance using shared database pool."""
    db_repo = await get_shared_db_repo()
    profile_repo = CarProfileRepository(db_repo.pool)
    await profile_repo.ensure_schema()
    return profile_repo


@router.post("", response_model=CarProfile, status_code=201)
async def create_profile(
    profile: CarProfileCreate,
    repo: CarProfileRepository = Depends(get_car_profile_repo)
):
    """
    Create a new car profile.
    """
    # Check if profile_id already exists
    existing = await repo.get_profile(profile.profile_id)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Car profile with ID '{profile.profile_id}' already exists"
        )
    
    return await repo.create_profile(profile)


@router.get("", response_model=CarProfileList)
async def list_profiles(
    repo: CarProfileRepository = Depends(get_car_profile_repo)
):
    """
    List all car profiles.
    """
    try:
        profiles = await repo.list_profiles()
        return CarProfileList(profiles=profiles, count=len(profiles))
    except Exception as e:
        import traceback
        print(f"Error listing car profiles: {e}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list car profiles: {str(e)}"
        )


@router.get("/{profile_id}", response_model=CarProfile)
async def get_profile(
    profile_id: str,
    repo: CarProfileRepository = Depends(get_car_profile_repo)
):
    """
    Get a car profile by ID.
    """
    profile = await repo.get_profile(profile_id)
    if not profile:
        raise HTTPException(
            status_code=404,
            detail=f"Car profile '{profile_id}' not found"
        )
    return profile


@router.put("/{profile_id}", response_model=CarProfile)
async def update_profile(
    profile_id: str,
    update: CarProfileUpdate,
    repo: CarProfileRepository = Depends(get_car_profile_repo)
):
    """
    Update a car profile.
    """
    # Check if profile exists
    existing = await repo.get_profile(profile_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"Car profile '{profile_id}' not found"
        )
    
    return await repo.update_profile(profile_id, update)


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(
    profile_id: str,
    repo: CarProfileRepository = Depends(get_car_profile_repo)
):
    """
    Delete a car profile.
    """
    success = await repo.delete_profile(profile_id)
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"Car profile '{profile_id}' not found"
        )


@router.post("/{profile_id}/clone", response_model=CarProfile, status_code=201)
async def clone_profile(
    profile_id: str,
    new_profile_id: str = Query(..., description="ID for the new cloned profile"),
    new_name: str = Query(..., description="Name for the new cloned profile"),
    repo: CarProfileRepository = Depends(get_car_profile_repo)
):
    """
    Clone an existing car profile to create a new version.
    """
    # Get the source profile
    source = await repo.get_profile(profile_id)
    if not source:
        raise HTTPException(
            status_code=404,
            detail=f"Source car profile '{profile_id}' not found"
        )
    
    # Check if new profile_id already exists
    existing = await repo.get_profile(new_profile_id)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Car profile with ID '{new_profile_id}' already exists"
        )
    
    # Create new profile with cloned data
    new_profile = CarProfileCreate(
        profile_id=new_profile_id,
        name=new_name,
        veh_pars=source.veh_pars
    )
    
    return await repo.create_profile(new_profile)

