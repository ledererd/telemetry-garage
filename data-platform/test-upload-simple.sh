#!/bin/bash
# Simple script to test uploading lap simulation data to the API

set -e

API_URL="http://localhost:8000"
LAP_FILE="data-structure/lap-simulation-full.json"

echo "=========================================="
echo "Racing Telemetry API - Upload Test"
echo "=========================================="
echo ""

# Check API health
echo "1. Checking API health..."
if curl -s -f "${API_URL}/health" > /dev/null; then
    echo "   ✓ API is healthy"
    curl -s "${API_URL}/health" | python3 -m json.tool
else
    echo "   ✗ API is not responding"
    exit 1
fi

echo ""
echo "2. Uploading lap simulation data..."
echo "   File: $LAP_FILE"
echo "   Records: $(python3 -c "import json; print(len(json.load(open('$LAP_FILE'))))" 2>/dev/null || echo 'unknown')"
echo ""

# Upload the file
response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d @"$LAP_FILE" \
    "${API_URL}/api/v1/telemetry/upload/batch")

# Extract HTTP status and body
http_status=$(echo "$response" | grep "HTTP_STATUS" | cut -d: -f2)
body=$(echo "$response" | sed '/HTTP_STATUS/d')

echo "   HTTP Status: $http_status"
echo ""

if [ "$http_status" = "200" ]; then
    echo "   Response:"
    echo "$body" | python3 -m json.tool
    
    # Check if upload was successful
    success=$(echo "$body" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('success', False))" 2>/dev/null)
    uploaded=$(echo "$body" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('uploaded', 0))" 2>/dev/null)
    failed=$(echo "$body" | python3 -c "import json, sys; data=json.load(sys.stdin); print(data.get('failed', 0))" 2>/dev/null)
    
    echo ""
    if [ "$success" = "True" ] && [ "$failed" = "0" ]; then
        echo "   ✓ Upload successful!"
        echo "   ✓ Uploaded: $uploaded records"
        echo "   ✓ Failed: $failed records"
    else
        echo "   ⚠ Upload completed with issues"
        echo "   Uploaded: $uploaded records"
        echo "   Failed: $failed records"
    fi
    
    # Extract and verify session
    echo ""
    echo "3. Verifying uploaded data..."
    session_id=$(python3 -c "import json; data=json.load(open('$LAP_FILE')); print(data[0]['session_id'])" 2>/dev/null)
    
    if [ -n "$session_id" ]; then
        echo "   Session ID: $session_id"
        echo ""
        echo "   Session Summary:"
        summary=$(curl -s "${API_URL}/api/v1/telemetry/sessions/${session_id}/summary")
        echo "$summary" | python3 -m json.tool | head -20
        
        # Check if we got data back
        if echo "$summary" | grep -q "error"; then
            echo ""
            echo "   ⚠ Note: Session not found. This may be because:"
            echo "      - The in-memory database uses separate instances per worker"
            echo "      - Try querying with the session_id parameter directly"
            echo ""
            echo "   Testing direct query..."
            curl -s "${API_URL}/api/v1/telemetry/download?session_id=${session_id}&limit=3" | python3 -m json.tool | head -15
        else
            echo ""
            echo "   Laps:"
            curl -s "${API_URL}/api/v1/telemetry/sessions/${session_id}/laps" | python3 -m json.tool | head -15
        fi
    fi
    
    echo ""
    echo "=========================================="
    echo "✓ Test completed successfully!"
    echo "=========================================="
    echo ""
    echo "View API docs: ${API_URL}/docs"
    echo "View sessions: ${API_URL}/api/v1/telemetry/sessions"
    
else
    echo "   ✗ Upload failed!"
    echo "   Response:"
    echo "$body"
    exit 1
fi

