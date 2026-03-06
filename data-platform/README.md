# Racing Telemetry Data Platform

Data platform for storing and serving racing car telemetry data.

## Components

- **API** - FastAPI REST API for uploading and downloading telemetry data
- **Data Structure** - JSON schemas and database schemas for telemetry data
- **PostgreSQL Database** - Persistent storage for telemetry data

## Quick Start

### 1. Set up PostgreSQL

```bash
cd data-platform
./setup-postgres.sh
```

This creates a PostgreSQL container with:
- Database: `telemetry`
- User: `telemetry_user`
- Password: `telemetry_password`
- Port: `5432`

### 2. Start the API

```bash
cd data-platform
./podman-run.sh
```

The script will:
- Build the API container image
- Start the container with PostgreSQL configuration
- Expose the API on port 8000

## Running with Podman

### Manual Setup

```bash
# 1. Set up PostgreSQL
./setup-postgres.sh

# 2. Build the API container
cd ..
podman build -f data-platform/Containerfile -t telemetry-garage-telemetry-api:latest .

# 3. Run the API container
podman run -d \
    --name telemetry-garage-telemetry-api \
    -p 8000:8000 \
    -e API_HOST=0.0.0.0 \
    -e API_PORT=8000 \
    -e API_WORKERS=4 \
    -e DB_TYPE=postgresql \
    -e DB_HOST=host.containers.internal \
    -e DB_PORT=5432 \
    -e DB_NAME=telemetry \
    -e DB_USER=telemetry_user \
    -e DB_PASSWORD=telemetry_password \
    --restart unless-stopped \
    telemetry-garage-telemetry-api:latest
```

### Container Management

```bash
# View API logs
podman logs -f telemetry-garage-telemetry-api

# View PostgreSQL logs
podman logs -f telemetry-garage-db

# Stop containers
podman stop telemetry-garage-telemetry-api telemetry-garage-db

# Start containers
podman start telemetry-garage-telemetry-api telemetry-garage-db

# Remove containers
podman rm telemetry-garage-telemetry-api telemetry-garage-db
```

### Access the API

Once running, the API is available at:
- **API Base**: http://localhost:8000
- **Health Check**: http://localhost:8000/health
- **API Docs (Swagger)**: http://localhost:8000/docs
- **API Docs (ReDoc)**: http://localhost:8000/redoc

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `API_HOST` | `0.0.0.0` | Host to bind to |
| `API_PORT` | `8000` | Port to listen on |
| `API_WORKERS` | `4` | Number of worker processes |
| `DB_TYPE` | `postgresql` | Database type (`memory`, `postgresql`) |
| `DB_HOST` | `host.containers.internal` | Database host (use `host.containers.internal` for Podman) |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | `telemetry` | Database name |
| `DB_USER` | `telemetry_user` | Database user |
| `DB_PASSWORD` | `telemetry_password` | Database password |

### Database Access

Connect to PostgreSQL directly:

```bash
podman exec -it telemetry-garage-db psql -U telemetry_user -d telemetry
```

Or from host:

```bash
psql -h localhost -p 5432 -U telemetry_user -d telemetry
```

## Development

### Local Development

```bash
cd data-platform
pip install -r telemetry-api/requirements.txt

# Set environment variables
export DB_TYPE=postgresql
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=telemetry
export DB_USER=telemetry_user
export DB_PASSWORD=telemetry_password

# Run the API
python -m telemetry_api.main
```

### Building the Container

```bash
# From the anu-racing directory
podman build -f data-platform/Containerfile -t telemetry-garage-telemetry-api:latest .
```

## Testing

See [TESTING.md](TESTING.md) for detailed testing instructions.

Quick test:

```bash
cd data-platform
./test-upload-simple.sh
```

## API Endpoints

See the [API README](telemetry-api/README.md) for detailed endpoint documentation.

## Data Structure

See the [Data Structure README](data-structure/README.md) for schema documentation.

## Database Schema

The PostgreSQL database automatically creates the following tables on first connection:

- `telemetry_data` - Main telemetry records
- `telemetry_sessions` - Session metadata
- `lap_summaries` - Lap-level aggregations

See `data-structure/database-schema.sql` for the full schema.

## Troubleshooting

### API Can't Connect to PostgreSQL

If you see connection errors:
1. Verify PostgreSQL is running: `podman ps | grep telemetry-garage-db`
2. Check PostgreSQL logs: `podman logs telemetry-garage-db`
3. Ensure `DB_HOST` is set to `host.containers.internal` (for Podman)
4. Test connection: `podman exec telemetry-garage-db pg_isready -U telemetry_user`

### Data Not Persisting

PostgreSQL data is stored in the container. To persist across container restarts, use a volume:

```bash
podman run -d \
    --name telemetry-garage-db \
    -v telemetry-db-data:/var/lib/postgresql/data \
    # ... other options
```
