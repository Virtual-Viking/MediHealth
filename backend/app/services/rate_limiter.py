"""
Rate Limiting Service using Redis.
Implements multiple rate limiting algorithms for different use cases.
"""
import time
import logging
from typing import Optional, Tuple
from services.redis_service import get_redis_client

logger = logging.getLogger(__name__)


class RateLimiter:
    """Rate limiter service using Redis for distributed rate limiting."""
    
    def __init__(self):
        self._client = None
    
    async def _get_client(self):
        """Get Redis client (lazy initialization)."""
        if self._client is None:
            self._client = await get_redis_client()
        return self._client
    
    async def check_rate_limit_fixed_window(
        self,
        key: str,
        limit: int,
        window_seconds: int,
    ) -> Tuple[bool, dict]:
        """
        Fixed window rate limiting.
        
        Args:
            key: Unique identifier (e.g., "user:123", "ip:192.168.1.1")
            limit: Maximum number of requests allowed
            window_seconds: Time window in seconds
        
        Returns:
            Tuple of (is_allowed, info_dict)
            info_dict contains: allowed, remaining, reset_time, limit
        """
        try:
            client = await self._get_client()
            redis_key = f"rate_limit:fixed:{key}"
            
            # Get current count
            current = await client.get(redis_key)
            
            if current is None:
                # First request in window - set count to 1
                await client.setex(redis_key, window_seconds, "1")
                remaining = limit - 1
                reset_time = int(time.time()) + window_seconds
                return True, {
                    "allowed": True,
                    "remaining": remaining,
                    "reset_time": reset_time,
                    "limit": limit,
                }
            
            current_count = int(current)
            
            if current_count >= limit:
                # Rate limit exceeded
                ttl = await client.ttl(redis_key)
                reset_time = int(time.time()) + (ttl if ttl > 0 else window_seconds)
                return False, {
                    "allowed": False,
                    "remaining": 0,
                    "reset_time": reset_time,
                    "limit": limit,
                }
            
            # Increment counter
            new_count = await client.incr(redis_key)
            remaining = limit - new_count
            ttl = await client.ttl(redis_key)
            reset_time = int(time.time()) + (ttl if ttl > 0 else window_seconds)
            
            return True, {
                "allowed": True,
                "remaining": remaining,
                "reset_time": reset_time,
                "limit": limit,
            }
            
        except Exception as e:
            logger.error(f"Rate limit check failed for key {key}: {e}")
            # Fail open - allow request if Redis fails
            return True, {
                "allowed": True,
                "remaining": limit,
                "reset_time": int(time.time()) + window_seconds,
                "limit": limit,
                "error": "Rate limiter unavailable, request allowed",
            }
    
    async def check_rate_limit_sliding_window(
        self,
        key: str,
        limit: int,
        window_seconds: int,
    ) -> Tuple[bool, dict]:
        """
        Sliding window rate limiting (more accurate than fixed window).
        
        Uses Redis sorted sets to track request timestamps.
        
        Args:
            key: Unique identifier
            limit: Maximum number of requests allowed
            window_seconds: Time window in seconds
        
        Returns:
            Tuple of (is_allowed, info_dict)
        """
        try:
            client = await self._get_client()
            redis_key = f"rate_limit:sliding:{key}"
            now = time.time()
            window_start = now - window_seconds
            
            # Remove old entries (outside window)
            await client.zremrangebyscore(redis_key, 0, window_start)
            
            # Count requests in current window
            current_count = await client.zcard(redis_key)
            
            if current_count >= limit:
                # Rate limit exceeded
                # Get oldest request timestamp to calculate reset time
                oldest = await client.zrange(redis_key, 0, 0, withscores=True)
                if oldest:
                    reset_time = int(oldest[0][1]) + window_seconds
                else:
                    reset_time = int(now) + window_seconds
                
                return False, {
                    "allowed": False,
                    "remaining": 0,
                    "reset_time": reset_time,
                    "limit": limit,
                }
            
            # Add current request
            await client.zadd(redis_key, {str(now): now})
            await client.expire(redis_key, window_seconds)
            
            remaining = limit - current_count - 1
            reset_time = int(now) + window_seconds
            
            return True, {
                "allowed": True,
                "remaining": remaining,
                "reset_time": reset_time,
                "limit": limit,
            }
            
        except Exception as e:
            logger.error(f"Sliding window rate limit check failed for key {key}: {e}")
            # Fail open
            return True, {
                "allowed": True,
                "remaining": limit,
                "reset_time": int(time.time()) + window_seconds,
                "limit": limit,
                "error": "Rate limiter unavailable, request allowed",
            }
    
    async def check_rate_limit_token_bucket(
        self,
        key: str,
        capacity: int,
        refill_rate: float,  # tokens per second
    ) -> Tuple[bool, dict]:
        """
        Token bucket rate limiting.
        
        Args:
            key: Unique identifier
            capacity: Maximum tokens in bucket
            refill_rate: Tokens added per second
        
        Returns:
            Tuple of (is_allowed, info_dict)
        """
        try:
            client = await self._get_client()
            redis_key = f"rate_limit:bucket:{key}"
            now = time.time()
            
            # Get current bucket state
            bucket_data = await client.hgetall(redis_key)
            
            if not bucket_data:
                # Initialize bucket
                tokens = capacity - 1  # Consume 1 token for this request
                last_refill = now
                await client.hset(redis_key, mapping={
                    "tokens": str(tokens),
                    "last_refill": str(last_refill),
                })
                await client.expire(redis_key, int(capacity / refill_rate) + 60)
                
                return True, {
                    "allowed": True,
                    "remaining": tokens,
                    "reset_time": int(now) + int(capacity / refill_rate),
                    "capacity": capacity,
                }
            
            # Refill tokens based on time passed
            tokens = float(bucket_data.get("tokens", 0))
            last_refill = float(bucket_data.get("last_refill", now))
            time_passed = now - last_refill
            tokens_to_add = time_passed * refill_rate
            tokens = min(capacity, tokens + tokens_to_add)
            
            if tokens < 1:
                # Not enough tokens
                time_until_token = (1 - tokens) / refill_rate
                reset_time = int(now) + int(time_until_token)
                return False, {
                    "allowed": False,
                    "remaining": 0,
                    "reset_time": reset_time,
                    "capacity": capacity,
                }
            
            # Consume 1 token
            tokens -= 1
            await client.hset(redis_key, mapping={
                "tokens": str(tokens),
                "last_refill": str(now),
            })
            await client.expire(redis_key, int(capacity / refill_rate) + 60)
            
            return True, {
                "allowed": True,
                "remaining": int(tokens),
                "reset_time": int(now) + int((capacity - tokens) / refill_rate),
                "capacity": capacity,
            }
            
        except Exception as e:
            logger.error(f"Token bucket rate limit check failed for key {key}: {e}")
            # Fail open
            return True, {
                "allowed": True,
                "remaining": capacity,
                "reset_time": int(time.time()) + int(capacity / refill_rate),
                "capacity": capacity,
                "error": "Rate limiter unavailable, request allowed",
            }


# Global rate limiter instance
rate_limiter = RateLimiter()


# Convenience functions for common use cases
async def check_login_rate_limit(identifier: str) -> Tuple[bool, dict]:
    """
    Rate limit for login attempts.
    Limit: 5 attempts per 15 minutes per IP/user.
    
    Args:
        identifier: IP address or user ID
    
    Returns:
        Tuple of (is_allowed, info_dict)
    """
    return await rate_limiter.check_rate_limit_fixed_window(
        key=f"login:{identifier}",
        limit=5,
        window_seconds=900,  # 15 minutes
    )


async def check_otp_rate_limit(user_id: int) -> Tuple[bool, dict]:
    """
    Rate limit for OTP requests.
    Limit: 3 requests per hour per user.
    
    Args:
        user_id: User ID
    
    Returns:
        Tuple of (is_allowed, info_dict)
    """
    return await rate_limiter.check_rate_limit_fixed_window(
        key=f"otp:user:{user_id}",
        limit=3,
        window_seconds=3600,  # 1 hour
    )


async def check_api_rate_limit(user_id: int, endpoint: str = "general") -> Tuple[bool, dict]:
    """
    Rate limit for API endpoints.
    Limit: 100 requests per minute per user.
    
    Args:
        user_id: User ID
        endpoint: Optional endpoint identifier
    
    Returns:
        Tuple of (is_allowed, info_dict)
    """
    return await rate_limiter.check_rate_limit_sliding_window(
        key=f"api:{endpoint}:user:{user_id}",
        limit=100,
        window_seconds=60,  # 1 minute
    )


async def check_upload_rate_limit(user_id: int) -> Tuple[bool, dict]:
    """
    Rate limit for file uploads.
    Limit: 5 uploads per hour per user.
    
    Args:
        user_id: User ID
    
    Returns:
        Tuple of (is_allowed, info_dict)
    """
    return await rate_limiter.check_rate_limit_fixed_window(
        key=f"upload:user:{user_id}",
        limit=5,
        window_seconds=3600,  # 1 hour
    )


async def check_search_rate_limit(identifier: str) -> Tuple[bool, dict]:
    """
    Rate limit for search operations.
    Limit: 50 searches per minute per IP/user.
    
    Args:
        identifier: IP address or user ID
    
    Returns:
        Tuple of (is_allowed, info_dict)
    """
    return await rate_limiter.check_rate_limit_sliding_window(
        key=f"search:{identifier}",
        limit=50,
        window_seconds=60,  # 1 minute
    )


