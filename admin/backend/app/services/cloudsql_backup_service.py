"""
Cloud SQL Backup Service
Fetches backup information from Google Cloud SQL Admin API
"""
import os
from typing import Any, Dict, List, Optional
from datetime import datetime

from googleapiclient import discovery
from google.oauth2 import service_account
from google.auth import default


class CloudSQLBackupService:
    """
    Service to interact with Cloud SQL Admin API for backup information.
    """

    def __init__(self, project_id: str, instance_name: str):
        """
        Initialize the Cloud SQL Backup Service.
        
        Args:
            project_id: GCP Project ID (e.g., 'ethereal-effort-475219-c2')
            instance_name: Cloud SQL instance name (e.g., 'medihealth-db-main')
        """
        self.project_id = project_id
        self.instance_name = instance_name
        
        # Use default credentials (from GOOGLE_APPLICATION_CREDENTIALS)
        try:
            credentials, _ = default()
            self.service = discovery.build('sqladmin', 'v1', credentials=credentials)
        except Exception as e:
            print(f"[CloudSQLBackupService] Error initializing API client: {e}")
            self.service = None
        
    def get_instance_connection_string(self) -> str:
        """Get the full instance connection string."""
        return f"projects/{self.project_id}/instances/{self.instance_name}"

    def fetch_recent_backups(self, max_results: int = 10) -> List[Dict[str, Any]]:
        """
        Fetch recent backup runs for the Cloud SQL instance.
        
        Args:
            max_results: Maximum number of backups to return
            
        Returns:
            List of backup information dictionaries
        """
        if not self.service:
            print("[CloudSQLBackupService] Service not initialized")
            return []
            
        try:
            request = self.service.backupRuns().list(
                project=self.project_id,
                instance=self.instance_name,
                maxResults=max_results
            )
            
            response = request.execute()
            
            backups = []
            items = response.get('items', [])
            
            for backup_run in items:
                backup_info = {
                    "id": str(backup_run.get('id', 'unknown')),
                    "status": backup_run.get('status', 'UNKNOWN'),
                    "type": backup_run.get('type', 'UNKNOWN'),
                    "start_time": backup_run.get('startTime'),
                    "end_time": backup_run.get('endTime'),
                    "description": backup_run.get('description', ''),
                    "location": backup_run.get('location', ''),
                }
                backups.append(backup_info)
            
            return backups
            
        except Exception as e:
            print(f"[CloudSQLBackupService] Error fetching backups: {e}")
            return []

    def fetch_backup_summary(self) -> Dict[str, Any]:
        """
        Fetch a summary of backup status.
        
        Returns:
            Dictionary with backup summary information
        """
        try:
            backups = self.fetch_recent_backups(max_results=20)
            
            if not backups:
                return {
                    "total_backups": 0,
                    "successful_backups": 0,
                    "failed_backups": 0,
                    "last_backup_time": None,
                    "last_backup_status": "UNKNOWN",
                    "automated_backups_enabled": True,  # Assumed based on user description
                    "retention_days": 7,  # Based on user description
                }
            
            # Count by status
            successful = sum(1 for b in backups if b["status"] == "SUCCESSFUL")
            failed = sum(1 for b in backups if b["status"] == "FAILED")
            
            # Get most recent backup
            recent_backup = backups[0] if backups else None
            last_backup_time = recent_backup["end_time"] or recent_backup["start_time"] if recent_backup else None
            last_backup_status = recent_backup["status"] if recent_backup else "UNKNOWN"
            
            return {
                "total_backups": len(backups),
                "successful_backups": successful,
                "failed_backups": failed,
                "last_backup_time": last_backup_time,
                "last_backup_status": last_backup_status,
                "automated_backups_enabled": True,
                "retention_days": 7,
                "project_id": self.project_id,
                "instance_name": self.instance_name,
            }
            
        except Exception as e:
            print(f"[CloudSQLBackupService] Error fetching backup summary: {e}")
            return {
                "total_backups": 0,
                "successful_backups": 0,
                "failed_backups": 0,
                "last_backup_time": None,
                "last_backup_status": "ERROR",
                "error": str(e),
            }


def get_cloudsql_backup_service() -> Optional[CloudSQLBackupService]:
    """
    Factory function to create CloudSQLBackupService instance.
    Extracts project_id and instance_name from INSTANCE_CONNECTION_NAME env variable.
    
    Returns:
        CloudSQLBackupService instance or None if not configured
    """
    instance_connection_name = os.getenv("INSTANCE_CONNECTION_NAME", "").strip()
    
    if not instance_connection_name:
        print("[CloudSQLBackupService] INSTANCE_CONNECTION_NAME not configured")
        return None
    
    try:
        # Parse INSTANCE_CONNECTION_NAME format: project:region:instance
        parts = instance_connection_name.split(":")
        if len(parts) != 3:
            print(f"[CloudSQLBackupService] Invalid INSTANCE_CONNECTION_NAME format: {instance_connection_name}")
            return None
        
        project_id = parts[0]
        instance_name = parts[2]
        
        return CloudSQLBackupService(project_id=project_id, instance_name=instance_name)
        
    except Exception as e:
        print(f"[CloudSQLBackupService] Error initializing service: {e}")
        return None

