"""
Example client for testing the Racing Telemetry API.
"""

import requests
import json
from datetime import datetime, timezone
from pathlib import Path

# API base URL
BASE_URL = "http://localhost:8000"

# Load example data
EXAMPLE_DATA_PATH = Path(__file__).parent.parent / "data-structure" / "telemetry-example.json"


def upload_single_record():
    """Upload a single telemetry record."""
    print("Uploading single telemetry record...")
    
    # Load example data
    with open(EXAMPLE_DATA_PATH, 'r') as f:
        data = json.load(f)
    
    response = requests.post(
        f"{BASE_URL}/api/v1/telemetry/upload",
        json=data
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def upload_batch():
    """Upload multiple telemetry records."""
    print("\nUploading batch of telemetry records...")
    
    # Load example data
    with open(EXAMPLE_DATA_PATH, 'r') as f:
        base_data = json.load(f)
    
    # Create multiple records with different timestamps
    batch = []
    for i in range(5):
        record = base_data.copy()
        # Modify timestamp and lap number
        base_time = datetime.fromisoformat(record["timestamp"].replace('Z', '+00:00'))
        record["timestamp"] = (base_time.replace(second=base_time.second + i)).isoformat().replace('+00:00', 'Z')
        record["lap_time"] = base_data.get("lap_time", 0) + i * 0.5
        batch.append(record)
    
    response = requests.post(
        f"{BASE_URL}/api/v1/telemetry/upload/batch",
        json=batch
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def download_telemetry(session_id=None, lap_number=None):
    """Download telemetry data."""
    print(f"\nDownloading telemetry data...")
    
    params = {}
    if session_id:
        params["session_id"] = session_id
    if lap_number:
        params["lap_number"] = lap_number
    params["limit"] = 10
    
    response = requests.get(
        f"{BASE_URL}/api/v1/telemetry/download",
        params=params
    )
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Records returned: {len(data)}")
    if data:
        print(f"First record timestamp: {data[0].get('timestamp')}")
    return data


def list_sessions():
    """List all sessions."""
    print("\nListing sessions...")
    
    response = requests.get(f"{BASE_URL}/api/v1/telemetry/sessions")
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def get_session_summary(session_id):
    """Get session summary."""
    print(f"\nGetting summary for session: {session_id}")
    
    response = requests.get(
        f"{BASE_URL}/api/v1/telemetry/sessions/{session_id}/summary"
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def get_session_laps(session_id):
    """Get session laps."""
    print(f"\nGetting laps for session: {session_id}")
    
    response = requests.get(
        f"{BASE_URL}/api/v1/telemetry/sessions/{session_id}/laps"
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    return response.json()


def main():
    """Run example client tests."""
    print("=" * 60)
    print("Racing Telemetry API - Example Client")
    print("=" * 60)
    
    # Check if API is running
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        print(f"API is running: {response.status_code == 200}")
    except requests.exceptions.ConnectionError:
        print("ERROR: Cannot connect to API. Make sure it's running on", BASE_URL)
        return
    
    # Upload single record
    upload_result = upload_single_record()
    session_id = upload_result.get("record_id", "").split("_")[0] if upload_result.get("record_id") else None
    
    # Upload batch
    batch_result = upload_batch()
    
    # List sessions
    sessions = list_sessions()
    
    # Get first session ID if available
    if sessions.get("sessions"):
        first_session = sessions["sessions"][0]["session_id"]
        
        # Download telemetry
        download_telemetry(session_id=first_session)
        
        # Get session summary
        get_session_summary(first_session)
        
        # Get session laps
        get_session_laps(first_session)
    
    print("\n" + "=" * 60)
    print("Example client completed!")
    print("=" * 60)


if __name__ == "__main__":
    main()

