# Racing Telemetry API Dockerfile
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY data-platform/telemetry-api/requirements.txt /app/requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY data-platform/telemetry-api/ /app/telemetry_api/
COPY data-platform/data-structure/ /app/data-structure/

# Set environment variables
ENV PYTHONPATH=/app
ENV API_HOST=0.0.0.0
ENV API_PORT=8000
ENV API_WORKERS=4
ENV DB_TYPE=memory

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health', timeout=5)" || exit 1

# Run the API
CMD ["python", "-m", "uvicorn", "telemetry_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]

