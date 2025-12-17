"""
GCP Credentials utility for admin backend
Simplified version for Cloud SQL connector authentication
"""
import os
import json
import base64
from pathlib import Path
from typing import Optional, Dict, Any


def _read_file_if_exists(candidate: str) -> Optional[str]:
    """Read file if it exists."""
    candidate = candidate.strip().strip('"').strip("'")
    if not candidate:
        return None
    path = Path(candidate)
    if path.exists() and path.is_file():
        try:
            return path.read_text(encoding="utf-8")
        except OSError:
            return None
    return None


def _maybe_base64_decode(value: str) -> Optional[str]:
    """Try to decode base64 string."""
    try:
        decoded = base64.b64decode(value, validate=True)
        text = decoded.decode("utf-8")
        if text.strip().startswith("{"):
            return text
    except Exception:
        return None
    return None


def ensure_application_default_credentials(
    *json_candidates: Optional[str],
) -> Optional[str]:
    """
    Ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid JSON file.
    """
    existing_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if existing_path and Path(existing_path).exists():
        return existing_path

    # Allow direct file path candidates
    for candidate in json_candidates:
        if not candidate:
            continue
        path = Path(candidate.strip('"').strip("'"))
        if path.exists() and path.is_file():
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(path)
            return str(path)

    # Try to load from JSON string or base64
    fallback_env = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "")
    for candidate in json_candidates + (fallback_env,):
        if not candidate:
            continue
        
        # Try as file path
        file_contents = _read_file_if_exists(candidate)
        if file_contents:
            # Write to temp file
            import tempfile
            temp_dir = Path(tempfile.gettempdir()) / "medilink-admin-google"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_path = temp_dir / "credentials.json"
            temp_path.write_text(file_contents, encoding="utf-8")
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(temp_path)
            return str(temp_path)
        
        # Try as inline JSON
        if candidate.strip().startswith("{") and candidate.strip().endswith("}"):
            import tempfile
            temp_dir = Path(tempfile.gettempdir()) / "medilink-admin-google"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_path = temp_dir / "credentials.json"
            temp_path.write_text(candidate, encoding="utf-8")
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(temp_path)
            return str(temp_path)
        
        # Try as base64
        decoded = _maybe_base64_decode(candidate)
        if decoded:
            import tempfile
            temp_dir = Path(tempfile.gettempdir()) / "medilink-admin-google"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_path = temp_dir / "credentials.json"
            temp_path.write_text(decoded, encoding="utf-8")
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(temp_path)
            return str(temp_path)

    return None

