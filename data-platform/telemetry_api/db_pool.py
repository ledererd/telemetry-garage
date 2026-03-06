"""
Shared database connection pool manager.
This module provides a singleton database pool that's shared across all requests.
"""

from typing import Optional
from .database_postgres import PostgreSQLRepository

# Global shared database repository instance
_shared_db_repo: Optional[PostgreSQLRepository] = None


async def get_shared_db_repo() -> PostgreSQLRepository:
    """
    Get or create the shared database repository instance.
    This should be called once at startup to initialize the pool.
    """
    global _shared_db_repo
    if _shared_db_repo is None:
        _shared_db_repo = PostgreSQLRepository()
        await _shared_db_repo.initialize()
    return _shared_db_repo


async def close_shared_db_repo():
    """Close the shared database repository pool."""
    global _shared_db_repo
    if _shared_db_repo is not None:
        await _shared_db_repo.close()
        _shared_db_repo = None

