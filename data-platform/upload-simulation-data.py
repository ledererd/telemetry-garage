#!/usr/bin/env python3
"""
Upload simulation data from lap-simulation-full.json to the API.

This script reads the simulation data file and uploads each entry to the API
with a 100ms delay between each sample, creating a new race session.
"""

import json
import requests
import time
from datetime import datetime, timezone
from pathlib import Path
import sys

# API base URL
BASE_URL = "http://localhost:8000"

# Path to simulation data file
SIMULATION_DATA_PATH = Path(__file__).parent / "data-structure" / "lap-simulation-full.json"

# Delay between uploads (in seconds)
UPLOAD_DELAY = 0.1  # 100ms


def generate_session_id():
    """Generate a new session ID based on current timestamp."""
    now = datetime.now(timezone.utc)
    return f"simulation_{now.strftime('%Y%m%d_%H%M%S')}"


def check_api_health():
    """Check if the API is running and accessible."""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        if response.status_code == 200:
            print("✓ API is running and accessible")
            return True
        else:
            print(f"✗ API returned status code: {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print(f"✗ Cannot connect to API at {BASE_URL}")
        print("  Make sure the API is running.")
        return False
    except Exception as e:
        print(f"✗ Error checking API health: {e}")
        return False


def upload_telemetry_record(record, session_id):
    """Upload a single telemetry record to the API."""
    try:
        response = requests.post(
            f"{BASE_URL}/api/v1/telemetry/upload",
            json=record,
            timeout=10
        )
        
        if response.status_code == 200:
            return True, None
        else:
            error_msg = response.text
            try:
                error_json = response.json()
                error_msg = error_json.get("detail", error_msg)
            except:
                pass
            return False, error_msg
    except requests.exceptions.RequestException as e:
        return False, str(e)


def main():
    """Main function to upload simulation data."""
    print("=" * 70)
    print("Racing Telemetry API - Simulation Data Uploader")
    print("=" * 70)
    print()
    
    # Check if API is running
    if not check_api_health():
        sys.exit(1)
    
    # Check if simulation data file exists
    if not SIMULATION_DATA_PATH.exists():
        print(f"✗ Simulation data file not found: {SIMULATION_DATA_PATH}")
        sys.exit(1)
    
    print(f"✓ Found simulation data file: {SIMULATION_DATA_PATH}")
    
    # Load simulation data
    print("Loading simulation data...")
    try:
        with open(SIMULATION_DATA_PATH, 'r') as f:
            records = json.load(f)
    except json.JSONDecodeError as e:
        print(f"✗ Error parsing JSON file: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"✗ Error reading file: {e}")
        sys.exit(1)
    
    total_records = len(records)
    print(f"✓ Loaded {total_records} records")
    
    # Generate new session ID
    session_id = generate_session_id()
    print(f"✓ Generated new session ID: {session_id}")
    print()
    
    # Update all records with new session ID
    print("Preparing records for upload...")
    for record in records:
        record["session_id"] = session_id
    print("✓ Records prepared")
    print()
    
    # Upload records
    print(f"Uploading {total_records} records with {UPLOAD_DELAY*1000:.0f}ms delay between each...")
    print("-" * 70)
    
    successful = 0
    failed = 0
    start_time = time.time()
    
    for i, record in enumerate(records, 1):
        success, error = upload_telemetry_record(record, session_id)
        
        if success:
            successful += 1
            # Show progress every 10 records or on last record
            if i % 10 == 0 or i == total_records:
                elapsed = time.time() - start_time
                rate = i / elapsed if elapsed > 0 else 0
                remaining = total_records - i
                eta = remaining / rate if rate > 0 else 0
                print(f"Progress: {i}/{total_records} ({i*100/total_records:.1f}%) | "
                      f"Success: {successful} | Failed: {failed} | "
                      f"Rate: {rate:.1f} rec/s | ETA: {eta:.1f}s", end='\r')
        else:
            failed += 1
            print(f"\n✗ Failed to upload record {i}: {error}")
            # Continue uploading even if one fails
        
        # Delay before next upload (except for the last record)
        if i < total_records:
            time.sleep(UPLOAD_DELAY)
    
    # Final summary
    elapsed_time = time.time() - start_time
    print()  # New line after progress
    print("-" * 70)
    print("Upload Summary:")
    print(f"  Total records: {total_records}")
    print(f"  Successful: {successful}")
    print(f"  Failed: {failed}")
    print(f"  Session ID: {session_id}")
    print(f"  Total time: {elapsed_time:.2f} seconds")
    print(f"  Average rate: {total_records/elapsed_time:.2f} records/second")
    print()
    
    if failed > 0:
        print(f"⚠ Warning: {failed} records failed to upload")
        sys.exit(1)
    else:
        print("✓ All records uploaded successfully!")
        print(f"  View the session in the web application or via:")
        print(f"  GET {BASE_URL}/api/v1/telemetry/sessions/{session_id}/summary")
        print("=" * 70)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠ Upload interrupted by user")
        sys.exit(1)

