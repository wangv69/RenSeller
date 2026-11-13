import os
from functools import lru_cache

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

router = APIRouter(prefix="/auth", tags=["Authentication"])
bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache
def get_jwks_client() -> jwt.PyJWKClient:
    supabase_url = os.environ.get("SUPABASE_URL")
    if not supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured")
    return jwt.PyJWKClient(f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    supabase_url = os.environ.get("SUPABASE_URL")
    if not supabase_url:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Authentication is not configured")

    try:
        signing_key = get_jwks_client().get_signing_key_from_jwt(credentials.credentials)
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            audience="authenticated",
            issuer=f"{supabase_url.rstrip('/')}/auth/v1",
        )
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token") from error

    email = claims.get("email")
    if not isinstance(email, str) or not email.lower().endswith("@rpi.edu"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="An RPI email address is required")
    return claims


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)) -> dict:
    metadata = user.get("user_metadata", {})
    username = metadata.get("username") if isinstance(metadata, dict) else None
    if not isinstance(username, str) or not username:
        username = user.get("email", "").split("@", 1)[0]
    app_metadata = user.get("app_metadata")
    group = "admin" if isinstance(app_metadata, dict) and app_metadata.get("group") == "admin" else "user"
    return {"id": user.get("sub"), "email": user.get("email"), "username": username, "group": group}
