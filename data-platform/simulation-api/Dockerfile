# Racing Line Simulation API Dockerfile (Docker compatible)
# Same as Containerfile but named Dockerfile for Docker compatibility
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libfreetype6-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY simulation-api/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
# Copy the simulation API code
COPY simulation-api/ /app/simulation-api/
# Copy the telemetry-api module that simulation-api depends on
COPY telemetry-api/ /app/telemetry_api/
# Copy data-structure for schema validation if needed
COPY data-structure/ /app/data-structure/

# Set environment variables
ENV PYTHONPATH=/app
ENV MPLBACKEND=Agg
ENV API_PORT=8002

# Database connection environment variables (can be overridden)
ENV DB_HOST=localhost
ENV DB_PORT=5432
ENV DB_NAME=telemetry
ENV DB_USER=telemetry_user
ENV DB_PASSWORD=telemetry_password

# Expose port
EXPOSE 8002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8002/health', timeout=5)" || exit 1

# Run the API
WORKDIR /app/simulation-api
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8002"]
