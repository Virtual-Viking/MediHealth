"""
User Retention Service using Redis Bitmaps.

User retention tracks whether users who were active in one period
are still active in subsequent periods.

Example:
- Week 1: 1000 users active
- Week 2: 800 of those 1000 users active again
- Retention Rate: 800/1000 = 80%
"""
import time
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
from services.redis_service import get_redis_client
import logging

logger = logging.getLogger(__name__)


class RetentionService:
    """Service for tracking and calculating user retention using Redis bitmaps."""
    
    def __init__(self):
        self._client = None
    
    async def _get_client(self):
        """Get Redis client (lazy initialization)."""
        if self._client is None:
            self._client = await get_redis_client()
        return self._client
    
    def _get_dau_key(self, date: str) -> str:
        """Get Redis key for daily active users."""
        return f"dau:{date}"
    
    def _get_wau_key(self, week_start: str) -> str:
        """Get Redis key for weekly active users."""
        return f"wau:{week_start}"
    
    def _get_mau_key(self, month: str) -> str:
        """Get Redis key for monthly active users."""
        return f"mau:{month}"
    
    async def mark_user_active(self, user_id: int, date: Optional[str] = None) -> bool:
        """
        Mark a user as active on a specific date.
        
        Args:
            user_id: User ID
            date: Date in YYYY-MM-DD format (defaults to today)
        
        Returns:
            True if successful
        """
        try:
            client = await self._get_client()
            
            if date is None:
                date = datetime.now().strftime("%Y-%m-%d")
            
            # Mark user as active in daily bitmap
            dau_key = self._get_dau_key(date)
            await client.setbit(dau_key, user_id, 1)
            
            # Set expiration (keep for 90 days for retention calculations)
            await client.expire(dau_key, 86400 * 90)
            
            logger.debug(f"Marked user {user_id} as active on {date}")
            return True
            
        except Exception as e:
            logger.error(f"Error marking user {user_id} as active: {e}")
            return False
    
    async def mark_users_active_batch(self, user_ids: List[int], date: Optional[str] = None) -> int:
        """
        Mark multiple users as active (batch operation).
        
        Args:
            user_ids: List of user IDs
            date: Date in YYYY-MM-DD format (defaults to today)
        
        Returns:
            Number of users marked
        """
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")
        
        dau_key = self._get_dau_key(date)
        client = await self._get_client()
        
        # Use pipeline for batch operations
        pipeline = client.pipeline()
        for user_id in user_ids:
            pipeline.setbit(dau_key, user_id, 1)
        pipeline.expire(dau_key, 86400 * 90)
        await pipeline.execute()
        
        return len(user_ids)
    
    async def calculate_day_retention(
        self,
        cohort_date: str,
        retention_date: str
    ) -> Dict[str, any]:
        """
        Calculate Day N retention (e.g., Day 1, Day 7, Day 30).
        
        Example:
        - cohort_date: "2024-01-01" (users active on this date)
        - retention_date: "2024-01-08" (check if they're active 7 days later)
        - Returns: Day 7 retention rate
        
        Args:
            cohort_date: Date when users were first active (YYYY-MM-DD)
            retention_date: Date to check if they're still active (YYYY-MM-DD)
        
        Returns:
            Dict with retention metrics
        """
        try:
            client = await self._get_client()
            
            cohort_key = self._get_dau_key(cohort_date)
            retention_key = self._get_dau_key(retention_date)
            
            # Count users active on cohort date
            cohort_count = await client.bitcount(cohort_key)
            
            if cohort_count == 0:
                return {
                    "cohort_date": cohort_date,
                    "retention_date": retention_date,
                    "cohort_size": 0,
                    "retained_users": 0,
                    "retention_rate": 0.0,
                    "days_between": 0,
                }
            
            # Use AND operation to find users active on both dates
            result_key = f"retention:day:{cohort_date}:{retention_date}"
            await client.bitop("AND", result_key, cohort_key, retention_key)
            
            # Count retained users
            retained_count = await client.bitcount(result_key)
            
            # Calculate days between
            cohort_dt = datetime.strptime(cohort_date, "%Y-%m-%d")
            retention_dt = datetime.strptime(retention_date, "%Y-%m-%d")
            days_between = (retention_dt - cohort_dt).days
            
            # Calculate retention rate
            retention_rate = (retained_count / cohort_count) * 100 if cohort_count > 0 else 0.0
            
            # Clean up temporary key
            await client.delete(result_key)
            
            return {
                "cohort_date": cohort_date,
                "retention_date": retention_date,
                "cohort_size": cohort_count,
                "retained_users": retained_count,
                "retention_rate": round(retention_rate, 2),
                "days_between": days_between,
            }
            
        except Exception as e:
            logger.error(f"Error calculating day retention: {e}")
            return {
                "cohort_date": cohort_date,
                "retention_date": retention_date,
                "cohort_size": 0,
                "retained_users": 0,
                "retention_rate": 0.0,
                "days_between": 0,
                "error": str(e),
            }
    
    async def calculate_retention_curve(
        self,
        cohort_date: str,
        days: List[int] = [1, 3, 7, 14, 30, 60, 90]
    ) -> Dict[str, any]:
        """
        Calculate retention curve for multiple days.
        
        Example:
        - cohort_date: "2024-01-01"
        - days: [1, 7, 30]
        - Returns: Retention rates for Day 1, Day 7, Day 30
        
        Args:
            cohort_date: Date when users were first active
            days: List of days to check retention (e.g., [1, 7, 30])
        
        Returns:
            Dict with retention curve data
        """
        cohort_dt = datetime.strptime(cohort_date, "%Y-%m-%d")
        results = []
        
        for day in days:
            retention_date = (cohort_dt + timedelta(days=day)).strftime("%Y-%m-%d")
            retention_data = await self.calculate_day_retention(cohort_date, retention_date)
            results.append({
                "day": day,
                **retention_data
            })
        
        return {
            "cohort_date": cohort_date,
            "retention_curve": results,
        }
    
    async def calculate_weekly_retention(
        self,
        cohort_week: str,
        retention_week: str
    ) -> Dict[str, any]:
        """
        Calculate weekly retention.
        
        Args:
            cohort_week: Week start date (YYYY-MM-DD) - users active this week
            retention_week: Week start date (YYYY-MM-DD) - check if active this week
        
        Returns:
            Dict with weekly retention metrics
        """
        try:
            client = await self._get_client()
            
            # Build weekly bitmaps (OR all days in the week)
            cohort_key = f"wau:{cohort_week}"
            retention_key = f"wau:{retention_week}"
            
            # Get all dates in cohort week
            cohort_start = datetime.strptime(cohort_week, "%Y-%m-%d")
            cohort_dates = [
                (cohort_start + timedelta(days=i)).strftime("%Y-%m-%d")
                for i in range(7)
            ]
            
            # Build cohort week bitmap (OR all days)
            temp_cohort_key = f"temp:cohort:{cohort_week}"
            for i, date in enumerate(cohort_dates):
                dau_key = self._get_dau_key(date)
                if i == 0:
                    await client.copy(dau_key, temp_cohort_key)
                else:
                    await client.bitop("OR", temp_cohort_key, temp_cohort_key, dau_key)
            
            # Get all dates in retention week
            retention_start = datetime.strptime(retention_week, "%Y-%m-%d")
            retention_dates = [
                (retention_start + timedelta(days=i)).strftime("%Y-%m-%d")
                for i in range(7)
            ]
            
            # Build retention week bitmap (OR all days)
            temp_retention_key = f"temp:retention:{retention_week}"
            for i, date in enumerate(retention_dates):
                dau_key = self._get_dau_key(date)
                if i == 0:
                    await client.copy(dau_key, temp_retention_key)
                else:
                    await client.bitop("OR", temp_retention_key, temp_retention_key, dau_key)
            
            # Count cohort size
            cohort_count = await client.bitcount(temp_cohort_key)
            
            if cohort_count == 0:
                await client.delete(temp_cohort_key, temp_retention_key)
                return {
                    "cohort_week": cohort_week,
                    "retention_week": retention_week,
                    "cohort_size": 0,
                    "retained_users": 0,
                    "retention_rate": 0.0,
                }
            
            # Find users active in both weeks (AND operation)
            result_key = f"retention:week:{cohort_week}:{retention_week}"
            await client.bitop("AND", result_key, temp_cohort_key, temp_retention_key)
            
            # Count retained users
            retained_count = await client.bitcount(result_key)
            retention_rate = (retained_count / cohort_count) * 100 if cohort_count > 0 else 0.0
            
            # Clean up
            await client.delete(temp_cohort_key, temp_retention_key, result_key)
            
            return {
                "cohort_week": cohort_week,
                "retention_week": retention_week,
                "cohort_size": cohort_count,
                "retained_users": retained_count,
                "retention_rate": round(retention_rate, 2),
            }
            
        except Exception as e:
            logger.error(f"Error calculating weekly retention: {e}")
            return {
                "cohort_week": cohort_week,
                "retention_week": retention_week,
                "cohort_size": 0,
                "retained_users": 0,
                "retention_rate": 0.0,
                "error": str(e),
            }
    
    async def calculate_monthly_retention(
        self,
        cohort_month: str,
        retention_month: str
    ) -> Dict[str, any]:
        """
        Calculate monthly retention.
        
        Args:
            cohort_month: Month in YYYY-MM format (e.g., "2024-01")
            retention_month: Month in YYYY-MM format
        
        Returns:
            Dict with monthly retention metrics
        """
        try:
            client = await self._get_client()
            
            # Get all dates in cohort month
            cohort_start = datetime.strptime(f"{cohort_month}-01", "%Y-%m-%d")
            if cohort_start.month == 12:
                cohort_end = datetime(cohort_start.year + 1, 1, 1)
            else:
                cohort_end = datetime(cohort_start.year, cohort_start.month + 1, 1)
            
            cohort_dates = []
            current = cohort_start
            while current < cohort_end:
                cohort_dates.append(current.strftime("%Y-%m-%d"))
                current += timedelta(days=1)
            
            # Build cohort month bitmap (OR all days)
            temp_cohort_key = f"temp:cohort:month:{cohort_month}"
            for i, date in enumerate(cohort_dates):
                dau_key = self._get_dau_key(date)
                if i == 0:
                    try:
                        await client.copy(dau_key, temp_cohort_key)
                    except:
                        # Key doesn't exist, skip
                        continue
                else:
                    await client.bitop("OR", temp_cohort_key, temp_cohort_key, dau_key)
            
            # Get all dates in retention month
            retention_start = datetime.strptime(f"{retention_month}-01", "%Y-%m-%d")
            if retention_start.month == 12:
                retention_end = datetime(retention_start.year + 1, 1, 1)
            else:
                retention_end = datetime(retention_start.year, retention_start.month + 1, 1)
            
            retention_dates = []
            current = retention_start
            while current < retention_end:
                retention_dates.append(current.strftime("%Y-%m-%d"))
                current += timedelta(days=1)
            
            # Build retention month bitmap (OR all days)
            temp_retention_key = f"temp:retention:month:{retention_month}"
            for i, date in enumerate(retention_dates):
                dau_key = self._get_dau_key(date)
                if i == 0:
                    try:
                        await client.copy(dau_key, temp_retention_key)
                    except:
                        continue
                else:
                    await client.bitop("OR", temp_retention_key, temp_retention_key, dau_key)
            
            # Count cohort size
            cohort_count = await client.bitcount(temp_cohort_key)
            
            if cohort_count == 0:
                await client.delete(temp_cohort_key, temp_retention_key)
                return {
                    "cohort_month": cohort_month,
                    "retention_month": retention_month,
                    "cohort_size": 0,
                    "retained_users": 0,
                    "retention_rate": 0.0,
                }
            
            # Find users active in both months (AND operation)
            result_key = f"retention:month:{cohort_month}:{retention_month}"
            await client.bitop("AND", result_key, temp_cohort_key, temp_retention_key)
            
            # Count retained users
            retained_count = await client.bitcount(result_key)
            retention_rate = (retained_count / cohort_count) * 100 if cohort_count > 0 else 0.0
            
            # Clean up
            await client.delete(temp_cohort_key, temp_retention_key, result_key)
            
            return {
                "cohort_month": cohort_month,
                "retention_month": retention_month,
                "cohort_size": cohort_count,
                "retained_users": retained_count,
                "retention_rate": round(retention_rate, 2),
            }
            
        except Exception as e:
            logger.error(f"Error calculating monthly retention: {e}")
            return {
                "cohort_month": cohort_month,
                "retention_month": retention_month,
                "cohort_size": 0,
                "retained_users": 0,
                "retention_rate": 0.0,
                "error": str(e),
            }
    
    async def get_retention_cohorts(
        self,
        start_date: str,
        end_date: str
    ) -> List[Dict[str, any]]:
        """
        Get retention data for multiple cohorts.
        
        Args:
            start_date: Start date for cohorts (YYYY-MM-DD)
            end_date: End date for cohorts (YYYY-MM-DD)
        
        Returns:
            List of cohort retention data
        """
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        
        cohorts = []
        current = start_dt
        
        while current <= end_dt:
            cohort_date = current.strftime("%Y-%m-%d")
            
            # Calculate Day 1, Day 7, Day 30 retention
            retention_curve = await self.calculate_retention_curve(
                cohort_date,
                days=[1, 7, 30]
            )
            
            cohorts.append(retention_curve)
            current += timedelta(days=1)
        
        return cohorts
    
    async def get_retention_summary(
        self,
        date: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Get retention summary for a specific date.
        
        Args:
            date: Date to analyze (defaults to today)
        
        Returns:
            Dict with retention summary
        """
        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")
        
        date_dt = datetime.strptime(date, "%Y-%m-%d")
        
        # Calculate various retention metrics
        day_1 = await self.calculate_day_retention(
            date,
            (date_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        )
        
        day_7 = await self.calculate_day_retention(
            date,
            (date_dt + timedelta(days=7)).strftime("%Y-%m-%d")
        )
        
        day_30 = await self.calculate_day_retention(
            date,
            (date_dt + timedelta(days=30)).strftime("%Y-%m-%d")
        )
        
        return {
            "cohort_date": date,
            "cohort_size": day_1.get("cohort_size", 0),
            "day_1_retention": day_1.get("retention_rate", 0.0),
            "day_7_retention": day_7.get("retention_rate", 0.0),
            "day_30_retention": day_30.get("retention_rate", 0.0),
        }


# Global retention service instance
retention_service = RetentionService()






