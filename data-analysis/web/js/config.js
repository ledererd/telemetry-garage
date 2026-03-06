/**
 * Application configuration - API base URLs
 * Default values for local development.
 * When running in Docker, this file is overwritten at container startup with
 * API_BASE_URL and SIMULATION_BASE_URL environment variables.
 */
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {
    apiBaseUrl: 'http://localhost:8000',
    simulationBaseUrl: 'http://localhost:8002'
};
