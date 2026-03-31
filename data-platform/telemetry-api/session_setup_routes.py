"""
Session car-setup change log (tire pressures, ride heights, dampers, aero, etc.).
"""

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .auth import get_current_user
from .database_postgres import PostgreSQLRepository
from .db_pool import get_shared_db_repo

router = APIRouter(
    prefix="/api/v1/telemetry/sessions",
    tags=["session-setup"],
)


class SessionSetupEventCreate(BaseModel):
    """Body for logging a setup snapshot or change."""

    recorded_at: Optional[datetime] = Field(
        None,
        description="When this setup applied (ISO 8601; default: now UTC)",
    )
    source: str = Field(default="analyst_ui", max_length=50)
    setup: Dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = Field(None, max_length=10000)


async def _get_pg_repo() -> PostgreSQLRepository:
    return await get_shared_db_repo()


async def _session_exists(repo: PostgreSQLRepository, session_id: str) -> bool:
    async with repo.pool.acquire() as conn:
        s = await conn.fetchval(
            "SELECT 1 FROM telemetry_sessions WHERE session_id = $1",
            session_id,
        )
        if s:
            return True
        d = await conn.fetchval(
            "SELECT 1 FROM telemetry_data WHERE session_id = $1 LIMIT 1",
            session_id,
        )
        return bool(d)


@router.get("/{session_id}/setup/events")
async def list_session_setup_events(
    session_id: str,
    repo: PostgreSQLRepository = Depends(_get_pg_repo),
    _: str = Depends(get_current_user),
):
    if not await _session_exists(repo, session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    events = await repo.list_session_setup_events(session_id)
    return {"session_id": session_id, "events": events, "count": len(events)}


@router.post("/{session_id}/setup/events")
async def create_session_setup_event(
    session_id: str,
    body: SessionSetupEventCreate,
    repo: PostgreSQLRepository = Depends(_get_pg_repo),
    username: str = Depends(get_current_user),
):
    if not await _session_exists(repo, session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    recorded_at = body.recorded_at or datetime.now(timezone.utc)
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
    try:
        return await repo.append_session_setup_event(
            session_id=session_id,
            recorded_at=recorded_at,
            source=body.source,
            setup=body.setup or {},
            notes=body.notes,
            created_by=username,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{session_id}/setup/events/{event_id}")
async def delete_session_setup_event_route(
    session_id: str,
    event_id: int,
    repo: PostgreSQLRepository = Depends(_get_pg_repo),
    _: str = Depends(get_current_user),
):
    ok = await repo.delete_session_setup_event(session_id, event_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Setup event not found")
    return {"success": True, "id": event_id}
