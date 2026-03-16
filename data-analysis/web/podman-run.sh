#!/bin/bash
# Script to build and run the Racing Data Analysis Web Application in Podman/Docker

set -e

IMAGE_NAME="telemetry-garage-web"
CONTAINER_NAME="telemetry-garage-web"
PORT=${WEB_PORT:-8080}

# API URLs - where the browser can reach the APIs (default: localhost)
API_BASE_URL=${API_BASE_URL:-http://localhost:8000}
SIMULATION_BASE_URL=${SIMULATION_BASE_URL:-http://localhost:8002}

echo "Building container image..."
podman build -f Dockerfile -t $IMAGE_NAME:latest .

echo "Checking if container already exists..."
if podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping and removing existing container..."
    podman stop $CONTAINER_NAME 2>/dev/null || true
    podman rm $CONTAINER_NAME 2>/dev/null || true
fi

echo "Starting container..."
podman run -d \
    --name $CONTAINER_NAME \
    -p ${PORT}:8080 \
    -e API_BASE_URL="$API_BASE_URL" \
    -e SIMULATION_BASE_URL="$SIMULATION_BASE_URL" \
    --restart unless-stopped \
    $IMAGE_NAME:latest

echo ""
echo "Web application started!"
echo "  URL: http://localhost:${PORT}"
echo ""
echo "Ensure the Racing Telemetry API is running (e.g. cd ../data-platform && ./podman-run.sh)"
echo "  API: $API_BASE_URL"
echo "  Simulation API: $SIMULATION_BASE_URL"
echo ""
echo "To view logs: podman logs -f $CONTAINER_NAME"
echo "To stop: podman stop $CONTAINER_NAME"
echo "To remove: podman rm $CONTAINER_NAME"
