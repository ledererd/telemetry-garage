"""
Database operations for web user authentication.
"""

import hashlib
import asyncpg
import bcrypt
from typing import Optional


def _prehash(password: str) -> bytes:
    """SHA-256 pre-hash to avoid bcrypt's 72-byte limit. Output is always 64 bytes."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest().encode("utf-8")


class UserRepository:
    """Repository for web user management."""

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def ensure_schema(self):
        """Ensure web_users table exists."""
        async with self.pool.acquire() as conn:
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS web_users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(100) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_web_users_username
                ON web_users(username)
            """)

    async def count_users(self) -> int:
        """Return the number of registered users."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("SELECT COUNT(*) as n FROM web_users")
            return row["n"] or 0

    async def get_user_by_username(self, username: str) -> Optional[dict]:
        """Get user by username. Returns dict with id, username, password_hash."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id, username, password_hash FROM web_users WHERE username = $1",
                username.strip().lower(),
            )
            if not row:
                return None
            return dict(row)

    async def verify_password(self, plain_password: str, password_hash: str) -> bool:
        """Verify plain password against stored hash."""
        try:
            return bcrypt.checkpw(
                _prehash(plain_password),
                password_hash.encode("utf-8"),
            )
        except (ValueError, TypeError):
            return False

    def hash_password(self, password: str) -> str:
        """Hash a password for storage. Pre-hashes with SHA-256 to avoid bcrypt's 72-byte limit."""
        hashed = bcrypt.hashpw(_prehash(password), bcrypt.gensalt())
        return hashed.decode("utf-8")

    async def create_user(self, username: str, password: str) -> dict:
        """Create a new user. Returns user dict without password_hash."""
        username = username.strip().lower()
        if len(username) < 2:
            raise ValueError("Username must be at least 2 characters")
        if len(password) < 6:
            raise ValueError("Password must be at least 6 characters")

        password_hash = self.hash_password(password)
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO web_users (username, password_hash)
                VALUES ($1, $2)
                RETURNING id, username, created_at
                """,
                username,
                password_hash,
            )
        return {
            "id": row["id"],
            "username": row["username"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        }

    async def list_users(self) -> list:
        """List all users (id, username, created_at). Excludes password_hash."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, username, created_at FROM web_users ORDER BY created_at ASC"
            )
        return [
            {
                "id": r["id"],
                "username": r["username"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in rows
        ]

    async def delete_user(self, username: str) -> bool:
        """Delete a user by username. Returns True if deleted."""
        async with self.pool.acquire() as conn:
            result = await conn.execute(
                "DELETE FROM web_users WHERE username = $1",
                username.strip().lower(),
            )
        return result == "DELETE 1"
