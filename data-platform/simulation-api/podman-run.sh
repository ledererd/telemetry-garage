#!/bin/bash
# Script to run the Racing Line Simulation API using Podman

set -e

# Default values
IMAGE_NAME="telemetry-garage-simulation-api"
CONTAINER_NAME="telemetry-garage-simulation-api"
PORT=8002
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-telemetry}"
DB_USER="${DB_USER:-telemetry_user}"
DB_PASSWORD="${DB_PASSWORD:-telemetry_password}"

# For Podman, use host.containers.internal to access host services
# Or use the host's IP address
if [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
    # Use host.containers.internal for Podman (works on macOS/Linux)
    DB_HOST_CONTAINER="host.containers.internal"
else
    DB_HOST_CONTAINER=$DB_HOST
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Get the parent directory (data-platform)
PLATFORM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building Racing Line Simulation API container...${NC}"
echo "Build context: $PLATFORM_DIR"
cd "$PLATFORM_DIR"

# Build the container image
podman build -f simulation-api/Containerfile -t "$IMAGE_NAME" . || {
    echo -e "${RED}Failed to build container image${NC}"
    exit 1
}

echo -e "${GREEN}Container image built successfully${NC}"

# Stop and remove existing container if it exists
if podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    podman stop "$CONTAINER_NAME" 2>/dev/null || true
    echo -e "${YELLOW}Removing existing container...${NC}"
    podman rm "$CONTAINER_NAME" 2>/dev/null || true
fi

echo -e "${GREEN}Starting Racing Line Simulation API container...${NC}"
echo "  DB_HOST (from container): $DB_HOST_CONTAINER"

# Run the container
podman run -d \
    --name "$CONTAINER_NAME" \
    -p "${PORT}:8002" \
    -e DB_HOST="$DB_HOST_CONTAINER" \
    -e DB_PORT="$DB_PORT" \
    -e DB_NAME="$DB_NAME" \
    -e DB_USER="$DB_USER" \
    -e DB_PASSWORD="$DB_PASSWORD" \
    "$IMAGE_NAME" || {
    echo -e "${RED}Failed to start container${NC}"
    exit 1
}

echo -e "${GREEN}Container started successfully!${NC}"
echo -e "${GREEN}API is available at: http://localhost:${PORT}${NC}"
echo -e "${GREEN}Health check: http://localhost:${PORT}/health${NC}"
echo ""
echo -e "${YELLOW}To view logs:${NC} podman logs -f $CONTAINER_NAME"
echo -e "${YELLOW}To stop:${NC} podman stop $CONTAINER_NAME"
echo -e "${YELLOW}To remove:${NC} podman rm $CONTAINER_NAME"
