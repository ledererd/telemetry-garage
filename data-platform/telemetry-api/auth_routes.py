"""
API routes for user authentication.
"""

import secrets
import asyncpg
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from .user_database import UserRepository
from .auth import create_access_token, get_current_user
from .db_pool import get_shared_db_repo


router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1)


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=6)


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=6)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)


async def get_user_repo() -> UserRepository:
    """Get user repository instance using shared database pool."""
    db_repo = await get_shared_db_repo()
    user_repo = UserRepository(db_repo.pool)
    await user_repo.ensure_schema()
    return user_repo


@router.post("/login")
async def login(
    body: LoginRequest,
    repo: UserRepository = Depends(get_user_repo),
):
    """
    Authenticate with username and password.
    Returns an access token for use in Authorization: Bearer header.
    """
    user = await repo.get_user_by_username(body.username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not await repo.verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user["username"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"username": user["username"]},
    }


@router.post("/register")
async def register(
    body: RegisterRequest,
    repo: UserRepository = Depends(get_user_repo),
):
    """
    Register a new user. Only available when no users exist (bootstrap).
    After the first user registers, this endpoint is disabled.
    """
    count = await repo.count_users()
    if count > 0:
        raise HTTPException(
            status_code=403,
            detail="Registration is disabled. Users already exist.",
        )

    try:
        user = await repo.create_user(body.username, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=409,
            detail="Registration already completed by another user.",
        )

    token = create_access_token(user["username"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"username": user["username"]},
    }


@router.get("/me")
async def me(username: str = Depends(get_current_user)):
    """Return the current authenticated user."""
    return {"username": username}


@router.post("/me/change-password")
async def change_my_password(
    body: ChangePasswordRequest,
    username: str = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repo),
):
    """
    Change password for the current user. Requires old password verification.
    """
    user = await repo.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not await repo.verify_password(body.old_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    try:
        updated = await repo.update_password(username, body.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update password")
    return {"message": "Password changed successfully"}


@router.post("/users/{username}/reset-password")
async def reset_user_password(
    username: str,
    _: str = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repo),
):
    """
    Reset a user's password to a random value. Any authenticated user can do this.
    Returns the new password so it can be communicated to the user (no email).
    """
    user = await repo.get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    new_password = secrets.token_urlsafe(12)
    try:
        updated = await repo.update_password(username, new_password)
    except ValueError:
        raise HTTPException(status_code=500, detail="Failed to generate password")
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update password")
    return {"username": username, "password": new_password}


@router.get("/registration-open")
async def registration_open(repo: UserRepository = Depends(get_user_repo)):
    """Check if registration is open (no users exist yet). Does not require auth."""
    count = await repo.count_users()
    return {"registration_open": count == 0}


@router.get("/users")
async def list_users(
    _: str = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repo),
):
    """List all registered users."""
    users = await repo.list_users()
    return {"users": users}


@router.post("/users", status_code=201)
async def create_user(
    body: CreateUserRequest,
    _: str = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repo),
):
    """
    Create a new user. Requires an authenticated user (any logged-in user can create users).
    """
    try:
        user = await repo.create_user(body.username, body.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=409,
            detail=f"Username '{body.username}' already exists.",
        )
    return {"username": user["username"], "created_at": user["created_at"]}


@router.delete("/users/{username}")
async def delete_user(
    username: str,
    _: str = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repo),
):
    """Delete a user by username."""
    deleted = await repo.delete_user(username)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    return {"message": f"User '{username}' deleted"}
