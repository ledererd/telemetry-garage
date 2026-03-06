#!/bin/sh
# Generate config.js with API URLs from environment variables at container startup
# This allows the browser to connect to the correct API endpoints
cat > /usr/share/nginx/html/js/config.js << EOF
// Runtime configuration - generated at container startup
window.__APP_CONFIG__ = {
    apiBaseUrl: '${API_BASE_URL:-http://localhost:8000}',
    simulationBaseUrl: '${SIMULATION_BASE_URL:-http://localhost:8002}'
};
EOF

exec nginx -g 'daemon off;'
