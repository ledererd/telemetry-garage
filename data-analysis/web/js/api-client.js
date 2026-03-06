/**
 * API Client for Racing Telemetry API
 * Handles communication with the backend API
 */

const AUTH_TOKEN_KEY = 'racing_data_auth_token';

class APIClient {
    constructor(baseURL = 'http://localhost:8000', simulationBaseURL = 'http://localhost:8002') {
        this.baseURL = baseURL;
        this.simulationBaseURL = simulationBaseURL;
        this.onUnauthorized = null;  // Callback when 401 received
    }

    getToken() {
        return localStorage.getItem(AUTH_TOKEN_KEY);
    }

    setToken(token) {
        if (token) {
            localStorage.setItem(AUTH_TOKEN_KEY, token);
        } else {
            localStorage.removeItem(AUTH_TOKEN_KEY);
        }
    }

    clearToken() {
        this.setToken(null);
    }

    _authHeaders() {
        const token = this.getToken();
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    async _fetch(url, options = {}) {
        const headers = { ...this._authHeaders(), ...options.headers };
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401 && this.onUnauthorized) {
            this.clearToken();
            this.onUnauthorized();
        }
        return response;
    }

    async login(username, password) {
        const response = await fetch(`${this.baseURL}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Login failed');
        }
        const data = await response.json();
        this.setToken(data.access_token);
        return data;
    }

    async register(username, password) {
        const response = await fetch(`${this.baseURL}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Registration failed');
        }
        const data = await response.json();
        this.setToken(data.access_token);
        return data;
    }

    async getMe() {
        const response = await this._fetch(`${this.baseURL}/api/v1/auth/me`);
        if (!response.ok) return null;
        return await response.json();
    }

    async isRegistrationOpen() {
        try {
            const response = await fetch(`${this.baseURL}/api/v1/auth/registration-open`);
            if (!response.ok) return false;
            const data = await response.json();
            return data.registration_open === true;
        } catch (e) {
            return false;
        }
    }

    async createUser(username, password) {
        const response = await this._fetch(`${this.baseURL}/api/v1/auth/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to create user');
        }
        return await response.json();
    }

    async getSessions() {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/telemetry/sessions`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.sessions || [];
        } catch (error) {
            console.error('Error fetching sessions:', error);
            throw error;
        }
    }

    async getSessionLaps(sessionId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/telemetry/sessions/${sessionId}/laps`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.laps || [];
        } catch (error) {
            console.error('Error fetching laps:', error);
            throw error;
        }
    }

    async getSessionSummary(sessionId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/telemetry/sessions/${sessionId}/summary`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching session summary:', error);
            throw error;
        }
    }

    async getTelemetryData(sessionId, lapNumber = null, limit = 100000) {
        try {
            let url = `${this.baseURL}/api/v1/telemetry/download?session_id=${sessionId}&limit=${limit}`;
            if (lapNumber !== null) {
                url += `&lap_number=${lapNumber}`;
            }
            
            const response = await this._fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data || [];
        } catch (error) {
            console.error('Error fetching telemetry data:', error);
            throw error;
        }
    }

    async checkHealth() {
        try {
            const response = await this._fetch(`${this.baseURL}/health`);
            if (!response.ok) {
                return false;
            }
            const data = await response.json();
            return data.status === 'healthy';
        } catch (error) {
            return false;
        }
    }

    // Track API methods
    async getTracks() {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/tracks`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.tracks || [];
        } catch (error) {
            console.error('Error fetching tracks:', error);
            throw error;
        }
    }

    async createTrack(trackData) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/tracks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trackData)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error creating track:', error);
            throw error;
        }
    }

    async updateTrack(trackId, trackData) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/tracks/${trackId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(trackData)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error updating track:', error);
            throw error;
        }
    }

    async deleteTrack(trackId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/tracks/${trackId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return true;
        } catch (error) {
            console.error('Error deleting track:', error);
            throw error;
        }
    }

    async getTrackWeather(trackId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/tracks/${trackId}/weather`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching track weather:', error);
            throw error;
        }
    }

    async uploadTrackCSV(formData) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/tracks/upload`, {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error uploading track CSV:', error);
            throw error;
        }
    }

    // Car Profile API methods
    async getCarProfiles() {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/car-profiles`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.profiles || [];
        } catch (error) {
            console.error('Error fetching car profiles:', error);
            throw error;
        }
    }

    async getCarProfile(profileId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/car-profiles/${profileId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching car profile:', error);
            throw error;
        }
    }

    async createCarProfile(profileData) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/car-profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error creating car profile:', error);
            throw error;
        }
    }

    async updateCarProfile(profileId, profileData) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/car-profiles/${profileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileData)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            
            // Clear racing line cache for this profile since it was updated
            try {
                await this.clearRacingLineCache(profileId);
            } catch (cacheError) {
                console.warn('Failed to clear racing line cache:', cacheError);
                // Don't fail the update if cache clearing fails
            }
            
            return result;
        } catch (error) {
            console.error('Error updating car profile:', error);
            throw error;
        }
    }
    
    async clearRacingLineCache(profileId = null) {
        try {
            const url = new URL(`${this.simulationBaseURL}/api/v1/simulation/cache/clear`);
            if (profileId) {
                url.searchParams.append('profile_id', profileId);
            }
            
            const response = await this._fetch(url.toString(), {
                method: 'POST'
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error clearing racing line cache:', error);
            throw error;
        }
    }

    async deleteCarProfile(profileId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/car-profiles/${profileId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return true;
        } catch (error) {
            console.error('Error deleting car profile:', error);
            throw error;
        }
    }

    async cloneCarProfile(profileId, newProfileId, newName) {
        try {
            const url = new URL(`${this.baseURL}/api/v1/car-profiles/${profileId}/clone`);
            url.searchParams.append('new_profile_id', newProfileId);
            url.searchParams.append('new_name', newName);
            
            const response = await this._fetch(url.toString(), {
                method: 'POST'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error cloning car profile:', error);
            throw error;
        }
    }

    // Simulation API methods (port 8002)
    async runSimulation(carProfileId, trackId) {
        try {
            // Call the full simulation endpoint which returns lap time and URLs
            const url = new URL(`${this.simulationBaseURL}/api/v1/simulation/full`);
            url.searchParams.append('track_id', trackId);
            url.searchParams.append('profile_id', carProfileId);
            
            const response = await this._fetch(url.toString(), {
                method: 'POST'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            
            // Fetch the plot image
            let plotImage = null;
            if (result.plot_url) {
                try {
                    // Ensure we use the full URL with simulationBaseURL
                    const plotUrl = result.plot_url.startsWith('http') 
                        ? result.plot_url 
                        : `${this.simulationBaseURL}${result.plot_url}`;
                    const plotResponse = await this._fetch(plotUrl);
                    if (plotResponse.ok) {
                        const blob = await plotResponse.blob();
                        // Convert blob to base64
                        plotImage = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result.split(',')[1]);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                    }
                } catch (error) {
                    console.warn('Failed to fetch plot image:', error);
                }
            }
            
            return {
                lap_time: result.lap_time,
                plot_image: plotImage,
                plot_url: result.plot_url ? (result.plot_url.startsWith('http') ? result.plot_url : `${this.simulationBaseURL}${result.plot_url}`) : null,
                csv_url: result.csv_url ? (result.csv_url.startsWith('http') ? result.csv_url : `${this.simulationBaseURL}${result.csv_url}`) : null,
                track_name: result.track_name,
                profile_name: result.profile_name
            };
        } catch (error) {
            console.error('Error running simulation:', error);
            throw error;
        }
    }
    
    // Get racing line plot directly
    async getRacingLinePlot(trackId, profileId) {
        try {
            const url = new URL(`${this.simulationBaseURL}/api/v1/simulation/racing-line`);
            url.searchParams.append('track_id', trackId);
            url.searchParams.append('profile_id', profileId);
            
            const response = await this._fetch(url.toString(), {
                method: 'GET'
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();
            return blob;
        } catch (error) {
            console.error('Error fetching racing line plot:', error);
            throw error;
        }
    }
    
    // Get racing line CSV
    async getRacingLineCSV(trackId, profileId) {
        try {
            const url = new URL(`${this.simulationBaseURL}/api/v1/simulation/racing-line/csv`);
            url.searchParams.append('track_id', trackId);
            url.searchParams.append('profile_id', profileId);
            
            const response = await this._fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.blob();
        } catch (error) {
            console.error('Error fetching racing line CSV:', error);
            throw error;
        }
    }
    
    // Get lap time only
    async getLapTime(trackId, profileId) {
        try {
            const url = new URL(`${this.simulationBaseURL}/api/v1/simulation/lap-time`);
            url.searchParams.append('track_id', trackId);
            url.searchParams.append('profile_id', profileId);
            
            const response = await this._fetch(url.toString());
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching lap time:', error);
            throw error;
        }
    }

    // Session Management API methods
    async renameSession(sessionId, newSessionId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/telemetry/sessions/${encodeURIComponent(sessionId)}/rename?new_session_id=${encodeURIComponent(newSessionId)}`, {
                method: 'PATCH'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error renaming session:', error);
            throw error;
        }
    }

    async exportSession(sessionId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/telemetry/sessions/${encodeURIComponent(sessionId)}/export`);
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error exporting session:', error);
            throw error;
        }
    }

    async importSession(data) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/telemetry/sessions/import`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error importing session:', error);
            throw error;
        }
    }

    async deleteSession(sessionId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/telemetry/sessions/${encodeURIComponent(sessionId)}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error deleting session:', error);
            throw error;
        }
    }

    // Device Management API methods
    async getDevices() {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/devices`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.devices || [];
        } catch (error) {
            console.error('Error fetching devices:', error);
            throw error;
        }
    }

    async registerDevice(deviceId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/devices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: deviceId })
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error registering device:', error);
            throw error;
        }
    }

    async refreshDeviceKey(deviceId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/devices/${encodeURIComponent(deviceId)}/refresh-key`, {
                method: 'POST'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error refreshing device key:', error);
            throw error;
        }
    }

    async deleteDevice(deviceId) {
        try {
            const response = await this._fetch(`${this.baseURL}/api/v1/devices/${encodeURIComponent(deviceId)}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || `HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error deleting device:', error);
            throw error;
        }
    }
}

