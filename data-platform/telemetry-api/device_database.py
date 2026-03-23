"""
Database operations for telemetry device management.
"""

import asyncpg
import json
import secrets
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

# Device considered "connected" if seen within this period
CONNECTED_THRESHOLD_SECONDS = 300  # 5 minutes


def _config_to_dict(value: Any) -> Optional[Dict[str, Any]]:
    """Convert asyncpg JSONB value to Python dict. Handles dict, str, or None."""
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        return json.loads(value)
    return dict(value)


class DeviceRepository:
    """Repository for telemetry device and API key management."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def ensure_schema(self):
        """Ensure telemetry_devices table exists."""
        async with self.pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS telemetry_devices (
                    device_id VARCHAR(100) PRIMARY KEY,
                    api_key VARCHAR(255) NOT NULL,
                    config JSONB,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            # Add config column if it doesn't exist (migration for existing DBs)
            try:
                await conn.execute("ALTER TABLE telemetry_devices ADD COLUMN config JSONB")
            except Exception as e:
                if "already exists" not in str(e):
                    raise
            # Add last_seen_at for device connectivity indicator (migration)
            try:
                await conn.execute("ALTER TABLE telemetry_devices ADD COLUMN last_seen_at TIMESTAMPTZ")
            except Exception as e:
                if "already exists" not in str(e):
                    raise
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_telemetry_devices_api_key
                ON telemetry_devices(api_key)
            """)

    async def get_device_by_key(self, api_key: str) -> Optional[str]:
        """Look up device_id by API key. Returns device_id or None."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT device_id FROM telemetry_devices WHERE api_key = $1",
                api_key.strip(),
            )
            return row["device_id"] if row else None

    async def record_seen(self, device_id: str) -> None:
        """Update last_seen_at for a device (ping, config fetch, or upload)."""
        async with self.pool.acquire() as conn:
            await conn.execute(
                "UPDATE telemetry_devices SET last_seen_at = NOW() WHERE device_id = $1",
                device_id,
            )

    def _is_connected(self, last_seen_at) -> bool:
        """True if last_seen_at is within CONNECTED_THRESHOLD_SECONDS."""
        if last_seen_at is None:
            return False
        delta = datetime.now(timezone.utc) - (last_seen_at if last_seen_at.tzinfo else last_seen_at.replace(tzinfo=timezone.utc))
        return delta.total_seconds() < CONNECTED_THRESHOLD_SECONDS

    async def list_devices(self) -> List[dict]:
        """List all devices (without exposing full API keys). Includes connection status."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT device_id, created_at, updated_at, last_seen_at,
                       LEFT(api_key, 8) || '...' as api_key_preview
                FROM telemetry_devices
                ORDER BY created_at DESC
            """)
            return [
                {
                    "device_id": r["device_id"],
                    "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                    "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
                    "last_seen_at": r["last_seen_at"].isoformat() if r["last_seen_at"] else None,
                    "connected": self._is_connected(r["last_seen_at"]),
                    "api_key_preview": r["api_key_preview"],
                }
                for r in rows
            ]

    async def get_device(self, device_id: str) -> Optional[dict]:
        """Get device by ID (without full API key). Includes config and connection status."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """SELECT device_id, created_at, updated_at, last_seen_at, config,
                          LEFT(api_key, 8) || '...' as api_key_preview
                   FROM telemetry_devices WHERE device_id = $1""",
                device_id,
            )
            if not row:
                return None
            config = _config_to_dict(row["config"])
            return {
                "device_id": row["device_id"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
                "last_seen_at": row["last_seen_at"].isoformat() if row["last_seen_at"] else None,
                "connected": self._is_connected(row["last_seen_at"]),
                "api_key_preview": row["api_key_preview"],
                "config": config,
            }

    async def create_device(self, device_id: str) -> dict:
        """Register a new device and generate API key. Returns device with full api_key (only time it's shown)."""
        api_key = secrets.token_urlsafe(32)
        async with self.pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO telemetry_devices (device_id, api_key)
                VALUES ($1, $2)
            """, device_id, api_key)
        return {
            "device_id": device_id,
            "api_key": api_key,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }

    async def refresh_key(self, device_id: str) -> dict:
        """Generate new API key for device. Returns device with full api_key (only time it's shown)."""
        api_key = secrets.token_urlsafe(32)
        async with self.pool.acquire() as conn:
            result = await conn.execute("""
                UPDATE telemetry_devices
                SET api_key = $1, updated_at = NOW()
                WHERE device_id = $2
            """, api_key, device_id)
            if result == "UPDATE 0":
                return None
        return {
            "device_id": device_id,
            "api_key": api_key,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }

    async def delete_device(self, device_id: str) -> bool:
        """Delete a device. Returns True if deleted."""
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM telemetry_devices WHERE device_id = $1",
                device_id,
            )
            return result == "DELETE 1"

    async def get_device_config(self, device_id: str) -> Optional[Dict[str, Any]]:
        """Get stored configuration for a device. Returns None if no config stored."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT config FROM telemetry_devices WHERE device_id = $1",
                device_id,
            )
            if not row or row["config"] is None:
                return None
            return _config_to_dict(row["config"])

    async def update_device_config(self, device_id: str, config: Dict[str, Any]) -> bool:
        """Update stored configuration for a device. Returns True if updated."""
        config_json = json.dumps(config)
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                """
                UPDATE telemetry_devices
                SET config = $1::jsonb, updated_at = NOW()
                WHERE device_id = $2
                """,
                config_json,
                device_id,
            )
            return result == "UPDATE 1"
