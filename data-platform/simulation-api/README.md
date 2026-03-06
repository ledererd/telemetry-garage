# Racing Line Simulation API

A new FastAPI-based simulation service for calculating optimal racing lines and lap times.

## Features

- **Racing Line Optimization**: Calculates the optimal racing line around a track based on vehicle dynamics
- **Lap Time Calculation**: Computes the fastest lap time for a given track and car profile
- **Visualization**: Generates PNG plots of the racing line
- **Driver Training Data**: Exports racing line coordinates as CSV for driver training

## API Endpoints

### Health Check
- `GET /health` - Service health check

### Racing Line Generation
- `POST /api/v1/simulation/racing-line?track_id={track_id}&profile_id={profile_id}` - Generate racing line plot (PNG)
- `GET /api/v1/simulation/racing-line/csv?track_id={track_id}&profile_id={profile_id}` - Get racing line CSV

### Lap Time Calculation
- `GET /api/v1/simulation/lap-time?track_id={track_id}&profile_id={profile_id}` - Calculate fastest lap time

### Full Simulation
- `POST /api/v1/simulation/full?track_id={track_id}&profile_id={profile_id}` - Perform full simulation (racing line + lap time)

## Installation

```bash
cd simulation-api
pip install -r requirements.txt
```

## Running the API

```bash
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --host 0.0.0.0 --port 8002
```

The API will connect to the same PostgreSQL database as the main API to fetch track and car profile data.

## Environment Variables

- `API_PORT` - Port to run the API on (default: 8002)
- `DB_HOST` - PostgreSQL host (default: localhost)
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_NAME` - Database name (default: telemetry)
- `DB_USER` - Database user (default: telemetry_user)
- `DB_PASSWORD` - Database password (default: telemetry_password)

## Containerization

### Using Podman

The easiest way to run the API is using the provided Podman script:

```bash
cd simulation-api
./podman-run.sh
```

This will:
1. Build the container image
2. Start the container on port 8002
3. Configure database connection from environment variables

### Using Docker

Build and run with Docker:

```bash
# From the data-platform directory
docker build -f simulation-api/Dockerfile -t telemetry-garage-simulation-api .
docker run -d \
  --name telemetry-garage-simulation-api \
  -p 8002:8002 \
  -e DB_HOST=your_db_host \
  -e DB_PORT=5432 \
  -e DB_NAME=telemetry \
  -e DB_USER=telemetry_user \
  -e DB_PASSWORD=telemetry_password \
  telemetry-garage-simulation-api
```

### Manual Build

Build from the `data-platform` directory:

```bash
# Using Podman
podman build -f simulation-api/Containerfile -t telemetry-garage-simulation-api .

# Using Docker
docker build -f simulation-api/Dockerfile -t telemetry-garage-simulation-api .
```

The build context must be the `data-platform` directory since the Containerfile/Dockerfile copies files from both `simulation-api/` and `telemetry-api/` directories.

## How It Works

### Racing Line Optimization

The optimizer uses a physics-based approach:

1. **Track Analysis**: Calculates track boundaries and centerline from track points
2. **Curvature Calculation**: Determines curvature at each point along the track
3. **Speed Profile**: Calculates maximum safe speeds based on:
   - Lateral G-force limits (from tire friction coefficients)
   - Vehicle power and torque
   - Aerodynamic drag
4. **Line Optimization**: Uses scipy optimization to find the path that minimizes lap time by:
   - Taking wider lines through corners (late apex)
   - Maximizing speed on straights
   - Balancing acceleration and cornering forces

### Lap Time Calculation

The lap time calculator:

1. Takes the optimized racing line
2. Calculates speed profile considering:
   - Power and torque limits
   - Tire grip limits (friction circle)
   - Aerodynamic drag
   - Rolling resistance
3. Integrates time along the path to get total lap time

## Output Formats

### PNG Plot
The racing line plot shows:
- Track boundaries (left and right)
- Track centerline
- Optimal racing line
- Start/finish marker

### CSV Export
The CSV file contains:
- `x_m`, `y_m`: Racing line coordinates
- `distance_m`: Cumulative distance along the racing line
- `curvature_1_m`: Curvature (1/radius) at each point
- `speed_m_s`: Optimal speed at each point

This data can be used for driver training or further analysis.

## Example Usage

### Get Racing Line Plot
```bash
curl -X POST "http://localhost:8002/api/v1/simulation/racing-line?track_id=melbourne&profile_id=electric_2024" \
  --output racing_line.png
```

### Get Racing Line CSV
```bash
curl "http://localhost:8002/api/v1/simulation/racing-line/csv?track_id=melbourne&profile_id=electric_2024" \
  --output racing_line.csv
```

### Calculate Lap Time
```bash
curl "http://localhost:8002/api/v1/simulation/lap-time?track_id=melbourne&profile_id=electric_2024"
```

### Full Simulation
```bash
curl -X POST "http://localhost:8002/api/v1/simulation/full?track_id=melbourne&profile_id=electric_2024"
```

## Algorithm Details

The racing line optimization uses:

- **L-BFGS-B optimization**: Efficient gradient-based optimization with bounds
- **Friction circle model**: Accounts for combined longitudinal and lateral forces
- **Forward-backward integration**: For speed profile calculation
- **Curvature-based speed limits**: Ensures vehicle stays within grip limits

The algorithm is simplified compared to full vehicle dynamics simulations but provides good results for racing line optimization and lap time estimation.
