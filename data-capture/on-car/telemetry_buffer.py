"""
Telemetry data buffer for local storage and upload.
"""

import json
import logging
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

logger = logging.getLogger(__name__)


class TelemetryBuffer:
    """Buffers telemetry data to local storage."""

    def __init__(self, db_path: Path, buffer_dir: Path):
        self.db_path = db_path
        self.buffer_dir = buffer_dir
        self.buffer_dir.mkdir(parents=True, exist_ok=True)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_database()

    def init_database(self) -> None:
        """Initialize SQLite database for buffering."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS telemetry_buffer (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                data TEXT NOT NULL,
                uploaded INTEGER DEFAULT 0,
                upload_attempts INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_uploaded ON telemetry_buffer(uploaded, created_at)"
        )
        conn.commit()
        conn.close()
        logger.info(f"Database initialized at {self.db_path}")

    def add_record(self, record: Dict) -> bool:
        """Add a telemetry record to buffer."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO telemetry_buffer (timestamp, data) VALUES (?, ?)",
                (record.get("timestamp"), json.dumps(record)),
            )
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            logger.error(f"Error adding record to buffer: {e}")
            return self._save_to_file(record)

    def _save_to_file(self, record: Dict) -> bool:
        """Fallback: save to JSON file."""
        try:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            filename = self.buffer_dir / f"telemetry_{timestamp}_{int(time.time() * 1000)}.json"
            with open(filename, "w") as f:
                json.dump(record, f)
            return True
        except Exception as e:
            logger.error(f"Error saving to file: {e}")
            return False

    def get_pending_records(self, limit: int = 100) -> List[Dict]:
        """Get pending records for upload."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, timestamp, data
                FROM telemetry_buffer
                WHERE uploaded = 0
                ORDER BY created_at ASC
                LIMIT ?
            """, (limit,))
            records = []
            for row in cursor.fetchall():
                record_id, timestamp, data = row
                record = json.loads(data)
                record["_buffer_id"] = record_id
                records.append(record)
            conn.close()
            return records
        except Exception as e:
            logger.error(f"Error getting pending records: {e}")
            return []

    def mark_uploaded(self, record_ids: List[int]) -> None:
        """Mark records as uploaded."""
        if not record_ids:
            return
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            placeholders = ",".join("?" * len(record_ids))
            cursor.execute(
                f"UPDATE telemetry_buffer SET uploaded = 1 WHERE id IN ({placeholders})",
                record_ids,
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error marking records as uploaded: {e}")

    def mark_upload_failed(self, record_ids: List[int]) -> None:
        """Mark records as upload failed (increment attempts)."""
        if not record_ids:
            return
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            placeholders = ",".join("?" * len(record_ids))
            cursor.execute(
                f"UPDATE telemetry_buffer SET upload_attempts = upload_attempts + 1 WHERE id IN ({placeholders})",
                record_ids,
            )
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error marking upload failed: {e}")
