"""
API routes for telemetry device management.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from .device_database import DeviceRepository
from .db_pool import get_shared_db_repo
from .auth import get_current_user


router = APIRouter(
    prefix="/api/v1/devices",
    tags=["devices"],
    dependencies=[Depends(get_current_user)],
)


class DeviceRegister(BaseModel):
    """Request body for registering a new device."""
    device_id: str = Field(..., min_length=1, max_length=100)


async def get_device_repo() -> DeviceRepository:
    """Get device repository instance using shared database pool."""
    db_repo = await get_shared_db_repo()
    device_repo = DeviceRepository(db_repo.pool)
    await device_repo.ensure_schema()
    return device_repo


@router.get("")
async def list_devices(repo: DeviceRepository = Depends(get_device_repo)):
    """List all registered devices."""
    devices = await repo.list_devices()
    return {"devices": devices, "count": len(devices)}


@router.post("", status_code=201)
async def register_device(
    body: DeviceRegister,
    repo: DeviceRepository = Depends(get_device_repo),
):
    """
    Register a new device and generate an API key.
    The full API key is returned only once - copy it to the device's config.json.
    """
    device_id = body.device_id
    existing = await repo.get_device(device_id)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Device '{device_id}' already exists. Use refresh-key to generate a new key.",
        )
    device = await repo.create_device(device_id)
    return device


@router.post("/{device_id}/refresh-key")
async def refresh_device_key(
    device_id: str,
    repo: DeviceRepository = Depends(get_device_repo),
):
    """
    Generate a new API key for the device.
    The full API key is returned only once - copy it to the device's config.json.
    The old key is immediately invalidated.
    """
    device = await repo.refresh_key(device_id)
    if not device:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found")
    return device


@router.delete("/{device_id}")
async def delete_device(
    device_id: str,
    repo: DeviceRepository = Depends(get_device_repo),
):
    """Delete a device. The device will no longer be able to upload telemetry."""
    deleted = await repo.delete_device(device_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Device '{device_id}' not found")
    return {"success": True, "message": f"Device '{device_id}' deleted"}
