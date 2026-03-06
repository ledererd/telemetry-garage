"""
Database operations for car profile data.
"""

import asyncpg
from typing import List, Optional
from datetime import datetime
import json

from .car_profile_models import CarProfile, CarProfileCreate, CarProfileUpdate


class CarProfileRepository:
    """Repository for car profile data operations."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def ensure_schema(self):
        """Ensure car profile tables exist."""
        async with self.pool.acquire() as conn:
            # Create car_profiles table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS car_profiles (
                    profile_id VARCHAR(100) PRIMARY KEY,
                    name VARCHAR(200) NOT NULL,
                    veh_pars JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            
            # Create index on name for searching
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_car_profiles_name 
                ON car_profiles(name)
            """)
    
    async def create_profile(self, profile: CarProfileCreate) -> CarProfile:
        """Create a new car profile."""
        async with self.pool.acquire() as conn:
            veh_pars_json = profile.veh_pars.model_dump_json()
            
            await conn.execute("""
                INSERT INTO car_profiles (
                    profile_id, name, veh_pars, created_at, updated_at
                ) VALUES (
                    $1, $2, $3::jsonb, NOW(), NOW()
                )
            """,
                profile.profile_id,
                profile.name,
                veh_pars_json
            )
            
            return await self.get_profile(profile.profile_id)
    
    async def get_profile(self, profile_id: str) -> Optional[CarProfile]:
        """Get a car profile by ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM car_profiles WHERE profile_id = $1
            """, profile_id)
            
            if not row:
                return None
            
            return self._row_to_profile(row)
    
    async def list_profiles(self) -> List[CarProfile]:
        """List all car profiles."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT * FROM car_profiles ORDER BY name
            """)
            
            profiles = []
            for row in rows:
                try:
                    profile = self._row_to_profile(row)
                    profiles.append(profile)
                except Exception as e:
                    # Log error but continue loading other profiles
                    print(f"Warning: Failed to load profile {row['profile_id']}: {e}")
                    import traceback
                    traceback.print_exc()
                    # Skip this profile
                    continue
            
            return profiles
    
    async def update_profile(self, profile_id: str, update: CarProfileUpdate) -> Optional[CarProfile]:
        """Update a car profile."""
        async with self.pool.acquire() as conn:
            # Build update query dynamically
            updates = []
            params = []
            param_num = 1
            
            if update.name is not None:
                updates.append(f"name = ${param_num}")
                params.append(update.name)
                param_num += 1
            
            if update.veh_pars is not None:
                updates.append(f"veh_pars = ${param_num}::jsonb")
                params.append(update.veh_pars.model_dump_json())
                param_num += 1
            
            if not updates:
                return await self.get_profile(profile_id)
            
            updates.append("updated_at = NOW()")
            params.append(profile_id)
            
            await conn.execute(f"""
                UPDATE car_profiles 
                SET {', '.join(updates)}
                WHERE profile_id = ${param_num}
            """, *params)
            
            return await self.get_profile(profile_id)
    
    async def delete_profile(self, profile_id: str) -> bool:
        """Delete a car profile."""
        async with self.pool.acquire() as conn:
            result = await conn.execute("""
                DELETE FROM car_profiles WHERE profile_id = $1
            """, profile_id)
            
            return result == "DELETE 1"
    
    def _row_to_profile(self, row) -> CarProfile:
        """Convert database row to CarProfile model."""
        # asyncpg returns JSONB as a dict, not a JSON string
        veh_pars_data = row["veh_pars"]
        if isinstance(veh_pars_data, str):
            # Fallback: if it's a string, parse it
            veh_pars_data = json.loads(veh_pars_data)
        
        # Use model_validate to properly construct the model with validation
        try:
            return CarProfile.model_validate({
                "profile_id": row["profile_id"],
                "name": row["name"],
                "veh_pars": veh_pars_data,
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None
            })
        except Exception as e:
            # Log the error for debugging with more detail
            import traceback
            error_msg = str(e)
            print(f"\n{'='*60}")
            print(f"Error validating car profile: {row['profile_id']} ({row['name']})")
            print(f"Error: {error_msg}")
            if hasattr(e, 'errors'):
                print(f"Validation errors: {e.errors()}")
            print(f"Powertrain type: {veh_pars_data.get('powertrain_type', 'unknown')}")
            print(f"Engine keys present: {list(veh_pars_data.get('engine', {}).keys())}")
            traceback.print_exc()
            print(f"{'='*60}\n")
            raise

