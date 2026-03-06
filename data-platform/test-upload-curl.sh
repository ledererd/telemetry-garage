#!/bin/bash
# Simple curl-based test script to upload lap simulation data

API_URL="http://localhost:8000/api/v1/telemetry/upload/batch"
LAP_FILE="data-structure/lap-simulation-full.json"

echo "Testing API health..."
curl -s http://localhost:8000/health | python3 -m json.tool

echo -e "\nUploading lap simulation data..."
echo "File: $LAP_FILE"
echo "Endpoint: $API_URL"
echo ""

# Upload the file
response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d @"$LAP_FILE" \
    "$API_URL")

# Extract HTTP status and body
http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo "HTTP Status: $http_status"
echo ""
echo "Response:"
echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"

if [ "$http_status" = "200" ]; then
    echo -e "\n✓ Upload successful!"
    
    # Extract session ID from the file
    session_id=$(python3 -c "import json, sys; data=json.load(open('$LAP_FILE')); print(data[0]['session_id'] if data else '')" 2>/dev/null)
    
    if [ -n "$session_id" ]; then
        echo -e "\nVerifying session: $session_id"
        curl -s "http://localhost:8000/api/v1/telemetry/sessions/$session_id/summary" | python3 -m json.tool
    fi
else
    echo -e "\n✗ Upload failed!"
    exit 1
fi

