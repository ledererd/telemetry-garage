# Testing the Racing Telemetry API

This guide shows how to test uploading lap simulation data to the API.

## Quick Test

### Using the Test Script (Recommended)

```bash
cd data-platform
./test-upload-simple.sh
```

This script will:
1. Check API health
2. Upload the lap simulation data
3. Verify the upload
4. Show session summary

### Using curl Directly

```bash
# Upload the full lap simulation (874 records)
curl -X POST \
  -H "Content-Type: application/json" \
  -d @data-structure/lap-simulation-full.json \
  http://localhost:8000/api/v1/telemetry/upload/batch

# Or upload the summary version (44 records)
curl -X POST \
  -H "Content-Type: application/json" \
  -d @data-structure/lap-simulation-summary.json \
  http://localhost:8000/api/v1/telemetry/upload/batch
```

### Using Python Script

```bash
# Install requests if needed
pip install requests

# Run the test script
python3 test-upload-lap.py
```

## Verify Upload

### Check All Sessions

```bash
curl http://localhost:8000/api/v1/telemetry/sessions | python3 -m json.tool
```

### Get Session Summary

```bash
curl "http://localhost:8000/api/v1/telemetry/sessions/session_20240115_race_1/summary" | python3 -m json.tool
```

### Download Telemetry Data

```bash
# Get first 10 records
curl "http://localhost:8000/api/v1/telemetry/download?session_id=session_20240115_race_1&limit=10" | python3 -m json.tool

# Get data for a specific lap
curl "http://localhost:8000/api/v1/telemetry/download?session_id=session_20240115_race_1&lap_number=5&limit=10" | python3 -m json.tool
```

### Get Lap Information

```bash
curl "http://localhost:8000/api/v1/telemetry/sessions/session_20240115_race_1/laps" | python3 -m json.tool
```

## Test Files Available

- **lap-simulation-full.json** - Complete lap (874 records, ~87 seconds at 10 Hz)
- **lap-simulation-summary.json** - Summary version (44 records, every 2 seconds)
- **lap-simulation.json** - Key moments (20 records)

## Expected Results

After uploading `lap-simulation-full.json`:
- **Total records**: 874
- **Session ID**: `session_20240115_race_1`
- **Lap number**: 5
- **Lap time**: ~87.3 seconds
- **Sectors**: 0, 1, 2

## Troubleshooting

### API Not Responding

```bash
# Check if container is running
podman ps | grep telemetry-garage-telemetry-api

# Check container logs
podman logs telemetry-garage-telemetry-api

# Restart container
podman restart telemetry-garage-telemetry-api
```

### Upload Fails

- Check file path is correct
- Verify JSON is valid: `python3 -m json.tool lap-simulation-full.json > /dev/null`
- Check API logs: `podman logs telemetry-garage-telemetry-api`

### Session Not Found After Upload

**Important**: The in-memory database uses separate instances per worker process. With 4 workers, data uploaded to one worker may not be visible when querying through another worker.

**Solutions**:
1. **Use a single worker** (for testing):
   ```bash
   podman stop telemetry-garage-telemetry-api
   podman rm telemetry-garage-telemetry-api
   podman run -d \
       --name telemetry-garage-telemetry-api \
       -p 8000:8000 \
       -e API_WORKERS=1 \
       telemetry-garage-telemetry-api:latest
   ```

2. **Query directly with session_id**:
   ```bash
   curl "http://localhost:8000/api/v1/telemetry/download?session_id=session_20240115_race_1&limit=10"
   ```

3. **Use persistent storage** (PostgreSQL, etc.) for production use.

### Data Not Persisting

The in-memory database is lost when the container restarts. For persistent storage, configure a PostgreSQL or other database backend.

## Interactive API Documentation

Visit http://localhost:8000/docs for interactive Swagger UI where you can:
- Test endpoints directly
- View request/response schemas
- Try uploading data through the web interface

