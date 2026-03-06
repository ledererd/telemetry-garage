#!/bin/bash
# Script to build and run the Telemetry Garage API in Podman

set -e

IMAGE_NAME="telemetry-garage-telemetry-api"
CONTAINER_NAME="telemetry-garage-telemetry-api"
PORT=8000

# Database configuration (defaults to PostgreSQL)
DB_TYPE=${DB_TYPE:-postgresql}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-telemetry}
DB_USER=${DB_USER:-telemetry_user}
DB_PASSWORD=${DB_PASSWORD:-telemetry_password}

echo "Building container image..."
podman build --no-cache -f Containerfile -t $IMAGE_NAME:latest ..

echo "Checking if container already exists..."
if podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping and removing existing container..."
    podman stop $CONTAINER_NAME 2>/dev/null || true
    podman rm $CONTAINER_NAME 2>/dev/null || true
fi

# For Podman, use host.containers.internal to access host services
# Or use the host's IP address
if [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
    # Use host.containers.internal for Podman (works on macOS/Linux)
    DB_HOST_CONTAINER="host.containers.internal"
else
    DB_HOST_CONTAINER=$DB_HOST
fi

echo "Starting container with ${DB_TYPE} database..."
echo "  DB_HOST (from container): $DB_HOST_CONTAINER"
RUN_ARGS=(-d --name $CONTAINER_NAME -p ${PORT}:8000 \
    -e API_HOST=0.0.0.0 \
    -e API_PORT=8000 \
    -e API_WORKERS=4 \
    -e DB_TYPE=$DB_TYPE \
    -e DB_HOST=$DB_HOST_CONTAINER \
    -e DB_PORT=$DB_PORT \
    -e DB_NAME=$DB_NAME \
    -e DB_USER=$DB_USER \
    -e DB_PASSWORD=$DB_PASSWORD \
    --restart unless-stopped)
podman run "${RUN_ARGS[@]}" $IMAGE_NAME:latest

echo "Container started!"
echo "API available at: http://localhost:${PORT}"
echo "API docs at: http://localhost:${PORT}/docs"
echo ""
echo "Database: ${DB_TYPE} at ${DB_HOST}:${DB_PORT}"
echo "API keys: managed via Device Management in the web app"
echo ""
echo "To view logs: podman logs -f $CONTAINER_NAME"
echo "To stop: podman stop $CONTAINER_NAME"
echo "To remove: podman rm $CONTAINER_NAME"

