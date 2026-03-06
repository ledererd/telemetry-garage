#!/bin/bash
# Script to set up PostgreSQL container for Racing Telemetry API

set -e

DB_NAME="telemetry"
DB_USER="telemetry_user"
DB_PASSWORD="telemetry_password"
CONTAINER_NAME="telemetry-garage-db"
PORT=5432

echo "=========================================="
echo "Setting up PostgreSQL for Telemetry Garage"
echo "=========================================="
echo ""

# Check if container already exists
if podman ps -a --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Container ${CONTAINER_NAME} already exists."
    read -p "Do you want to remove it and create a new one? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Stopping and removing existing container..."
        podman stop $CONTAINER_NAME 2>/dev/null || true
        podman rm $CONTAINER_NAME 2>/dev/null || true
    else
        echo "Using existing container."
        podman start $CONTAINER_NAME 2>/dev/null || true
        exit 0
    fi
fi

echo "Creating PostgreSQL container..."
podman run -d \
    --name $CONTAINER_NAME \
    -e POSTGRES_DB=$DB_NAME \
    -e POSTGRES_USER=$DB_USER \
    -e POSTGRES_PASSWORD=$DB_PASSWORD \
    -p ${PORT}:5432 \
    --restart unless-stopped \
    docker.io/library/postgres:16-alpine

echo ""
echo "Waiting for PostgreSQL to be ready..."
sleep 5

# Wait for PostgreSQL to be ready
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if podman exec $CONTAINER_NAME pg_isready -U $DB_USER -d $DB_NAME > /dev/null 2>&1; then
        echo "✓ PostgreSQL is ready!"
        break
    fi
    attempt=$((attempt + 1))
    echo "  Waiting... ($attempt/$max_attempts)"
    sleep 1
done

if [ $attempt -eq $max_attempts ]; then
    echo "✗ PostgreSQL failed to start"
    exit 1
fi

echo ""
echo "=========================================="
echo "✓ PostgreSQL container is running!"
echo "=========================================="
echo ""
echo "Container: $CONTAINER_NAME"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Port: $PORT"
echo ""
echo "Connection string:"
echo "  postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${PORT}/${DB_NAME}"
echo ""
echo "Environment variables for API:"
echo "  DB_TYPE=postgresql"
echo "  DB_HOST=localhost"
echo "  DB_PORT=$PORT"
echo "  DB_NAME=$DB_NAME"
echo "  DB_USER=$DB_USER"
echo "  DB_PASSWORD=$DB_PASSWORD"
echo ""
echo "To view logs: podman logs -f $CONTAINER_NAME"
echo "To stop: podman stop $CONTAINER_NAME"
echo "To remove: podman rm $CONTAINER_NAME"

