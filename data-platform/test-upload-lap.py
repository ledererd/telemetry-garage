#!/usr/bin/env python3
"""
Test script to upload lap simulation data to the Racing Telemetry API.
"""

import json
import requests
import sys
from pathlib import Path
from datetime import datetime

# API configuration
API_BASE_URL = "http://localhost:8000"
BATCH_UPLOAD_ENDPOINT = f"{API_BASE_URL}/api/v1/telemetry/upload/batch"

# Path to the lap simulation file
LAP_SIMULATION_FILE = Path(__file__).parent / "data-structure" / "lap-simulation-full.json"


def check_api_health():
    """Check if the API is running."""
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("✓ API is healthy")
            return True
        else:
            print(f"✗ API returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to API. Is it running?")
        print(f"  Expected at: {API_BASE_URL}")
        return False
    except Exception as e:
        print(f"✗ Error checking API health: {e}")
        return False


def upload_lap_data(file_path: Path, chunk_size: int = 100):
    """
    Upload lap simulation data to the API.
    
    Args:
        file_path: Path to the JSON file containing telemetry records
        chunk_size: Number of records to upload per batch (default: 100)
    """
    print(f"\nLoading data from: {file_path}")
    
    try:
        with open(file_path, 'r') as f:
            records = json.load(f)
    except FileNotFoundError:
        print(f"✗ File not found: {file_path}")
        return False
    except json.JSONDecodeError as e:
        print(f"✗ Invalid JSON: {e}")
        return False
    
    total_records = len(records)
    print(f"✓ Loaded {total_records} telemetry records")
    
    # Upload in chunks if needed (API limit is 10,000 per batch)
    if total_records <= chunk_size:
        # Upload all at once
        print(f"\nUploading {total_records} records in a single batch...")
        return upload_batch(records, 1, 1)
    else:
        # Upload in chunks
        num_chunks = (total_records + chunk_size - 1) // chunk_size
        print(f"\nUploading {total_records} records in {num_chunks} batches of ~{chunk_size} records...")
        
        success_count = 0
        failed_count = 0
        
        for i in range(0, total_records, chunk_size):
            chunk = records[i:i + chunk_size]
            chunk_num = (i // chunk_size) + 1
            
            print(f"\nBatch {chunk_num}/{num_chunks}: Uploading {len(chunk)} records...", end=" ")
            
            if upload_batch(chunk, chunk_num, num_chunks):
                success_count += len(chunk)
                print("✓")
            else:
                failed_count += len(chunk)
                print("✗")
        
        print(f"\n{'='*60}")
        print(f"Upload Summary:")
        print(f"  Total records: {total_records}")
        print(f"  Successful: {success_count}")
        print(f"  Failed: {failed_count}")
        print(f"{'='*60}")
        
        return failed_count == 0


def upload_batch(records: list, batch_num: int = 1, total_batches: int = 1) -> bool:
    """Upload a single batch of records."""
    try:
        response = requests.post(
            BATCH_UPLOAD_ENDPOINT,
            json=records,
            timeout=60,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            result = response.json()
            if result.get("success", False):
                uploaded = result.get("uploaded", 0)
                failed = result.get("failed", 0)
                if failed > 0:
                    print(f"\n  ⚠ Warning: {failed} records failed validation")
                    if result.get("errors"):
                        print(f"  Errors: {result['errors'][:3]}...")  # Show first 3 errors
                return True
            else:
                print(f"\n  ✗ Upload failed: {result.get('errors', 'Unknown error')}")
                return False
        else:
            print(f"\n  ✗ HTTP {response.status_code}: {response.text[:200]}")
            return False
            
    except requests.exceptions.Timeout:
        print(f"\n  ✗ Request timed out")
        return False
    except requests.exceptions.RequestException as e:
        print(f"\n  ✗ Request failed: {e}")
        return False
    except Exception as e:
        print(f"\n  ✗ Unexpected error: {e}")
        return False


def verify_upload(session_id: str):
    """Verify the uploaded data by querying the API."""
    print(f"\n{'='*60}")
    print("Verifying upload...")
    
    try:
        # Get session summary
        response = requests.get(
            f"{API_BASE_URL}/api/v1/telemetry/sessions/{session_id}/summary",
            timeout=10
        )
        
        if response.status_code == 200:
            summary = response.json()
            print(f"✓ Session verified: {session_id}")
            print(f"  Total records: {summary.get('total_records', 'N/A')}")
            print(f"  Lap count: {summary.get('lap_count', 'N/A')}")
            if 'statistics' in summary:
                stats = summary['statistics']
                if 'speed' in stats:
                    print(f"  Max speed: {stats['speed'].get('max', 'N/A')} km/h")
        else:
            print(f"⚠ Could not verify session (status {response.status_code})")
            
        # Get session laps
        response = requests.get(
            f"{API_BASE_URL}/api/v1/telemetry/sessions/{session_id}/laps",
            timeout=10
        )
        
        if response.status_code == 200:
            laps = response.json()
            print(f"  Laps: {laps.get('lap_count', 'N/A')}")
            
    except Exception as e:
        print(f"⚠ Verification error: {e}")


def main():
    """Main function."""
    print("=" * 60)
    print("Racing Telemetry API - Lap Simulation Upload Test")
    print("=" * 60)
    
    # Check API health
    if not check_api_health():
        sys.exit(1)
    
    # Upload the data
    if not upload_lap_data(LAP_SIMULATION_FILE, chunk_size=100):
        print("\n✗ Upload failed!")
        sys.exit(1)
    
    # Extract session ID from the first record
    try:
        with open(LAP_SIMULATION_FILE, 'r') as f:
            records = json.load(f)
            if records:
                session_id = records[0].get("session_id")
                if session_id:
                    verify_upload(session_id)
    except Exception as e:
        print(f"⚠ Could not verify upload: {e}")
    
    print("\n✓ Upload test completed successfully!")
    print(f"\nView API docs at: {API_BASE_URL}/docs")
    print(f"View data at: {API_BASE_URL}/api/v1/telemetry/sessions")


if __name__ == "__main__":
    main()

