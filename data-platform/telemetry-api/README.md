# Racing Telemetry API

FastAPI-based REST API for uploading and downloading racing car telemetry data.

## Features

- ✅ Upload single telemetry records
- ✅ Batch upload for multiple records
- ✅ Download telemetry data with filtering
- ✅ Session management
- ✅ Lap analysis
- ✅ JSON Schema validation
- ✅ Automatic API documentation (OpenAPI/Swagger)
- ✅ CORS support

## Installation

```bash
cd data-platform/telemetry-api
pip install -r requirements.txt
```

## Authentication

### Web Application (JWT)

The web app requires user login. API endpoints (except telemetry upload and health) require a valid JWT.

- **First run**: Register the first user at the login screen. Registration is only available when no users exist.
- **Login**: `POST /api/v1/auth/login` with `{username, password}` returns `{access_token, token_type, user}`.
- **Protected requests**: Include `Authorization: Bearer <access_token>` header.
- **Token expiry**: 7 days (configurable via `JWT_EXPIRE_HOURS` in `auth.py`).

Set `JWT_SECRET` in production (default is insecure):

```bash
export JWT_SECRET="your-secure-random-secret"
```

### Device API Keys (Telemetry Upload)

API keys are managed via **Device Management** in the web app. Register devices there to generate keys.

- **No devices registered**: Upload endpoints accept requests without authentication (for initial setup).
- **Devices registered**: Clients must include the key via `X-API-Key` or `Authorization: Bearer <key>` header. The key must match a device registered in the database.

## Running the API

Run from the `data-platform` directory (the `telemetry_api` symlink enables Python imports; the directory is named `telemetry-api` for consistency with `simulation-api`).

### Development Server

```bash
cd data-platform
python -m telemetry_api.main
```

Or using uvicorn directly:

```bash
cd data-platform
uvicorn telemetry_api.main:app --reload --host 0.0.0.0 --port 8000
```

### Production

```bash
cd data-platform
uvicorn telemetry_api.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## API Endpoints

### Health Check

- `GET /` - Basic health check
- `GET /health` - Detailed health status

### Upload Telemetry

- `POST /api/v1/telemetry/upload` - Upload a single telemetry record
- `POST /api/v1/telemetry/upload/batch` - Upload multiple records (up to 10,000)

### Download Telemetry

- `GET /api/v1/telemetry/download` - Download telemetry data with filters
  - Query parameters:
    - `session_id` (optional) - Filter by session
    - `lap_number` (optional) - Filter by lap
    - `start_time` (optional) - Start timestamp (ISO 8601)
    - `end_time` (optional) - End timestamp (ISO 8601)
    - `limit` (default: 1000, max: 10000) - Number of records
    - `offset` (default: 0) - Pagination offset

### Session Management

- `GET /api/v1/telemetry/sessions` - List all sessions
- `GET /api/v1/telemetry/sessions/{session_id}/laps` - Get lap information
- `GET /api/v1/telemetry/sessions/{session_id}/summary` - Get session statistics
- `DELETE /api/v1/telemetry/sessions/{session_id}` - Delete a session

## API Documentation

Once the server is running, access the interactive API documentation at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Example Usage

### Upload Single Record

```bash
curl -X POST "http://localhost:8000/api/v1/telemetry/upload" \
  -H "Content-Type: application/json" \
  -d @telemetry-example.json
```

### Upload Batch

```bash
curl -X POST "http://localhost:8000/api/v1/telemetry/upload/batch" \
  -H "Content-Type: application/json" \
  -d '[{...record1...}, {...record2...}]'
```

### Download by Session

```bash
curl "http://localhost:8000/api/v1/telemetry/download?session_id=session_20240115_race_1&limit=100"
```

### Download by Lap

```bash
curl "http://localhost:8000/api/v1/telemetry/download?session_id=session_20240115_race_1&lap_number=5"
```

### Get Session Summary

```bash
curl "http://localhost:8000/api/v1/telemetry/sessions/session_20240115_race_1/summary"
```

## Database Configuration

By default, the API uses an in-memory database (data is lost on restart). To use a persistent database:

### Environment Variables

```bash
export DB_TYPE=postgresql  # or 'influxdb', 'memory'
export DATABASE_URL=postgresql://user:password@localhost/telemetry
```

### Supported Databases

- **memory** (default) - In-memory storage for development
- **postgresql** - PostgreSQL/TimescaleDB (implementation needed)
- **influxdb** - InfluxDB (implementation needed)

## Data Validation

All telemetry data is validated against the JSON schema defined in `../data-structure/telemetry-schema.json`. Invalid data will be rejected with detailed error messages.

## Error Handling

The API returns standard HTTP status codes:

- `200` - Success
- `400` - Bad Request (validation errors, invalid parameters)
- `404` - Not Found (session doesn't exist)
- `500` - Internal Server Error

Error responses include a JSON body with error details:

```json
{
  "detail": "Error message here"
}
```

## Development

### Project Structure

```
telemetry-api/
├── __init__.py
├── main.py              # FastAPI application and routes
├── models.py            # Pydantic data models
├── database.py          # Database abstraction layer
├── schema_validator.py  # JSON schema validation
├── requirements.txt     # Python dependencies
└── README.md           # This file
```

### Adding Database Backends

To add support for a new database:

1. Create a new repository class in `database.py` (or separate file)
2. Implement the `TelemetryRepository` abstract base class
3. Update the `get_db()` function to return the new repository

Example:

```python
class PostgreSQLRepository(TelemetryRepository):
    def __init__(self, connection_string: str):
        # Initialize database connection
        pass
    
    async def insert_telemetry(self, data: TelemetryData):
        # Implement insert logic
        pass
    
    # ... implement other methods
```

## Testing

Example test using curl:

```bash
# Upload test data
curl -X POST "http://localhost:8000/api/v1/telemetry/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "timestamp": "2024-01-15T14:30:45.123Z",
    "session_id": "test_session",
    "lap_number": 1,
    "location": {"latitude": -35.2809, "longitude": 149.1300},
    "vehicle_dynamics": {
      "speed": 100.0,
      "yaw": 0.0,
      "roll": 0.0,
      "lateral_g": 0.5,
      "longitudinal_g": 0.3,
      "steering_angle": 5.0
    },
    "powertrain": {
      "gear": 3,
      "throttle_position": 50.0,
      "braking_force": 0.0,
      "engine_rpm": 5000,
      "engine_temperature": 90.0,
      "oil_pressure": 60.0,
      "oil_temperature": 100.0,
      "coolant_temperature": 85.0,
      "turbo_boost_pressure": 1.0,
      "air_intake_temperature": 30.0,
      "fuel_level": 75.0
    },
    "suspension": {
      "front_left": 10.0,
      "front_right": 10.0,
      "rear_left": 8.0,
      "rear_right": 8.0
    },
    "wheels": {
      "front_left": 100.0,
      "front_right": 100.0,
      "rear_left": 100.0,
      "rear_right": 100.0
    },
    "environment": {
      "ambient_temperature": 25.0,
      "track_surface_temperature": 35.0,
      "humidity": 60.0
    }
  }'
```

## License

[Add your license here]

