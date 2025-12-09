"""
FastAPI middleware for rate limiting.
"""
import time
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from services.rate_limiter import check_api_rate_limit, check_login_rate_limit
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to apply rate limiting to all requests."""
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path in ["/auth/health", "/docs", "/openapi.json", "/redoc"]:
            return await call_next(request)
        
        # Get user ID if authenticated (from cookie or header)
        user_id = None
        access_token = request.cookies.get("access_token")
        
        # Try to get user ID from token (simplified - you'd decode JWT here)
        # For now, use IP address as identifier
        client_ip = request.client.host if request.client else "unknown"
        identifier = f"ip:{client_ip}"
        
        # If user is authenticated, use user ID instead
        # You would decode JWT here to get user_id
        # For now, we'll use IP-based limiting
        
        # Check rate limit
        allowed, info = await check_api_rate_limit(
            user_id=hash(identifier) % 1000000,  # Convert to int-like
            endpoint=request.url.path.split("/")[1] if len(request.url.path.split("/")) > 1 else "general"
        )
        
        if not allowed:
            # Rate limit exceeded
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "detail": "Rate limit exceeded. Please try again later.",
                    "retry_after": info.get("reset_time", 60) - int(time.time()),
                    "limit": info.get("limit"),
                },
                headers={
                    "X-RateLimit-Limit": str(info.get("limit", 100)),
                    "X-RateLimit-Remaining": str(info.get("remaining", 0)),
                    "X-RateLimit-Reset": str(info.get("reset_time", 0)),
                    "Retry-After": str(info.get("reset_time", 60) - int(time.time())),
                }
            )
        
        # Add rate limit headers to response
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(info.get("limit", 100))
        response.headers["X-RateLimit-Remaining"] = str(info.get("remaining", 0))
        response.headers["X-RateLimit-Reset"] = str(info.get("reset_time", 0))
        
        return response


# Dependency function for endpoint-specific rate limiting
async def rate_limit_dependency(
    request: Request,
    limit: int = 100,
    window_seconds: int = 60,
    identifier: Optional[str] = None,
):
    """
    Dependency to check rate limit for specific endpoints.
    
    Usage:
        @router.post("/endpoint")
        async def my_endpoint(
            request: Request,
            rate_limit = Depends(rate_limit_dependency(limit=10, window_seconds=60))
        ):
            ...
    """
    from services.rate_limiter import rate_limiter
    
    # Get identifier (user ID, IP, etc.)
    if identifier is None:
        client_ip = request.client.host if request.client else "unknown"
        identifier = f"ip:{client_ip}"
    
    allowed, info = await rate_limiter.check_rate_limit_fixed_window(
        key=f"endpoint:{request.url.path}:{identifier}",
        limit=limit,
        window_seconds=window_seconds,
    )
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": "Rate limit exceeded",
                "retry_after": info.get("reset_time", 60) - int(time.time()),
                "limit": info.get("limit"),
            }
        )
    
    return info

