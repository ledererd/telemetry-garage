/**
 * Live Screen module
 * Handles WebSocket connection and real-time gauge updates
 */

class LiveScreen {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.ws = null;
        this.gauges = {};
        this.map = null;
        this.trackPolyline = null;
        this.liveMarker = null;
        this.selectedSession = null;
        this.isConnected = false;
        this._updatePending = false;
        this._pendingData = null;
    }

    async init() {
        // Always setup gauges (they will clean up existing ones)
        this.setupGauges();
        
        // Only setup map if it doesn't exist yet
        if (!this.map) {
            this.setupMap();
        }
        
        // Setup event listeners (safe to call multiple times)
        this.setupEventListeners();
        // Always refresh sessions when screen is shown
        await this.loadSessions(true);
        
        // Sync selectedSession from UI (loadSessions resets the select)
        this.selectedSession = document.getElementById('session-select-live')?.value || null;
        
        // WebSocket: connect only when a session is selected; disconnect if none selected
        if (this.selectedSession && !this.isConnected) {
            this.connectWebSocket();
        } else if (!this.selectedSession) {
            this.disconnect();
            this.updateConnectionStatus('Select a session', 'disconnected');
        }
        
        // Ensure map is properly sized after initialization
        setTimeout(() => {
            if (this.map) {
                this.map.invalidateSize();
            }
        }, 100);
    }

    setupGauges() {
        // Clear any existing gauge containers first to prevent duplicates
        const gaugeContainers = [
            'speed-gauge', 'rpm-gauge', 'air-temp-gauge', 'oil-temp-gauge',
            'voltage-gauge', 'throttle-gauge', 'brake-gauge', 'gforce-gauge'
        ];
        
        gaugeContainers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                // Clear all child elements (canvas elements from previous gauge instances)
                container.innerHTML = '';
            }
        });
        
        // Destroy existing gauge instances if they exist
        Object.values(this.gauges).forEach(gauge => {
            if (gauge && typeof gauge.destroy === 'function') {
                try {
                    gauge.destroy();
                } catch (e) {
                    // Ignore errors if destroy doesn't exist or fails
                }
            }
        });
        
        // Clear gauges object
        this.gauges = {};
        
        // Speedometer (0-300 km/h) - Large main gauge
        this.gauges.speed = new RadialGauge({
            renderTo: document.getElementById('speed-gauge'),
            width: 280,
            height: 280,
            minValue: 0,
            maxValue: 300,
            majorTicks: ['0', '50', '100', '150', '200', '250', '300'],
            minorTicks: 5,
            units: 'km/h',
            title: false,
            value: 0,
            colorNumbers: '#e0e0e0',
            colorTitle: '#e0e0e0',
            colorUnits: '#e0e0e0',
            colorValueText: '#4a90e2',
            colorValueTextRect: 'transparent',
            colorPlate: '#2a2a2a',
            colorMajorTicks: '#4a4a4a',
            colorMinorTicks: '#3a3a3a',
            colorNeedle: '#4a90e2',
            colorNeedleEnd: '#4a90e2',
            highlights: [
                { from: 250, to: 300, color: 'rgba(231, 76, 60, 0.3)' }
            ]
        }).draw();

        // Tachometer (0-20000 rpm) - Large main gauge
        this.gauges.rpm = new RadialGauge({
            renderTo: document.getElementById('rpm-gauge'),
            width: 280,
            height: 280,
            minValue: 0,
            maxValue: 20000,
            majorTicks: ['0', '5k', '10k', '15k', '20k'],
            minorTicks: 5,
            units: 'rpm',
            title: false,
            value: 0,
            colorNumbers: '#e0e0e0',
            colorTitle: '#e0e0e0',
            colorUnits: '#e0e0e0',
            colorValueText: '#e74c3c',
            colorValueTextRect: 'transparent',
            colorPlate: '#2a2a2a',
            colorMajorTicks: '#4a4a4a',
            colorMinorTicks: '#3a3a3a',
            colorNeedle: '#e74c3c',
            colorNeedleEnd: '#e74c3c',
            highlights: [
                { from: 18000, to: 20000, color: 'rgba(231, 76, 60, 0.3)' }
            ]
        }).draw();

        // Air Temperature (-20 to 150 °C) - Small secondary gauge
        this.gauges.airTemp = new RadialGauge({
            renderTo: document.getElementById('air-temp-gauge'),
            width: 110,
            height: 110,
            minValue: -20,
            maxValue: 150,
            majorTicks: ['-20', '0', '50', '100', '150'],
            minorTicks: 5,
            units: '°C',
            title: false,
            value: 0,
            colorNumbers: '#e0e0e0',
            colorTitle: '#e0e0e0',
            colorUnits: '#e0e0e0',
            colorValueText: '#f39c12',
            colorValueTextRect: 'transparent',
            colorPlate: '#2a2a2a',
            colorMajorTicks: '#4a4a4a',
            colorMinorTicks: '#3a3a3a',
            colorNeedle: '#f39c12',
            colorNeedleEnd: '#f39c12',
            highlights: [
                { from: 120, to: 150, color: 'rgba(231, 76, 60, 0.3)' }
            ]
        }).draw();

        // Oil Temperature (0-200 °C) - Small secondary gauge
        this.gauges.oilTemp = new RadialGauge({
            renderTo: document.getElementById('oil-temp-gauge'),
            width: 110,
            height: 110,
            minValue: 0,
            maxValue: 200,
            majorTicks: ['0', '50', '100', '150', '200'],
            minorTicks: 5,
            units: '°C',
            title: false,
            value: 0,
            colorNumbers: '#e0e0e0',
            colorTitle: '#e0e0e0',
            colorUnits: '#e0e0e0',
            colorValueText: '#e67e22',
            colorValueTextRect: 'transparent',
            colorPlate: '#2a2a2a',
            colorMajorTicks: '#4a4a4a',
            colorMinorTicks: '#3a3a3a',
            colorNeedle: '#e67e22',
            colorNeedleEnd: '#e67e22',
            highlights: [
                { from: 150, to: 200, color: 'rgba(231, 76, 60, 0.3)' }
            ]
        }).draw();

        // Battery Voltage (0-20 V) - Small secondary gauge
        this.gauges.voltage = new RadialGauge({
            renderTo: document.getElementById('voltage-gauge'),
            width: 110,
            height: 110,
            minValue: 0,
            maxValue: 20,
            majorTicks: ['0', '5', '10', '15', '20'],
            minorTicks: 5,
            units: 'V',
            title: false,
            value: 0,
            colorNumbers: '#e0e0e0',
            colorTitle: '#e0e0e0',
            colorUnits: '#e0e0e0',
            colorValueText: '#2ecc71',
            colorValueTextRect: 'transparent',
            colorPlate: '#2a2a2a',
            colorMajorTicks: '#4a4a4a',
            colorMinorTicks: '#3a3a3a',
            colorNeedle: '#2ecc71',
            colorNeedleEnd: '#2ecc71',
            highlights: [
                { from: 0, to: 10, color: 'rgba(231, 76, 60, 0.3)' },
                { from: 12, to: 20, color: 'rgba(46, 204, 113, 0.3)' }
            ]
        }).draw();

        // Throttle (0-100 %) - Small secondary gauge
        this.gauges.throttle = new RadialGauge({
            renderTo: document.getElementById('throttle-gauge'),
            width: 110,
            height: 110,
            minValue: 0,
            maxValue: 100,
            majorTicks: ['0', '25', '50', '75', '100'],
            minorTicks: 5,
            units: '%',
            title: false,
            value: 0,
            colorNumbers: '#e0e0e0',
            colorTitle: '#e0e0e0',
            colorUnits: '#e0e0e0',
            colorValueText: '#3498db',
            colorValueTextRect: 'transparent',
            colorPlate: '#2a2a2a',
            colorMajorTicks: '#4a4a4a',
            colorMinorTicks: '#3a3a3a',
            colorNeedle: '#3498db',
            colorNeedleEnd: '#3498db',
            highlights: [
                { from: 0, to: 25, color: 'rgba(52, 152, 219, 0.2)' },
                { from: 75, to: 100, color: 'rgba(52, 152, 219, 0.3)' }
            ]
        }).draw();

        // Brake Force (0-100 %) - Small secondary gauge
        this.gauges.brake = new RadialGauge({
            renderTo: document.getElementById('brake-gauge'),
            width: 110,
            height: 110,
            minValue: 0,
            maxValue: 100,
            majorTicks: ['0', '25', '50', '75', '100'],
            minorTicks: 5,
            units: '%',
            title: false,
            value: 0,
            colorNumbers: '#e0e0e0',
            colorTitle: '#e0e0e0',
            colorUnits: '#e0e0e0',
            colorValueText: '#e74c3c',
            colorValueTextRect: 'transparent',
            colorPlate: '#2a2a2a',
            colorMajorTicks: '#4a4a4a',
            colorMinorTicks: '#3a3a3a',
            colorNeedle: '#e74c3c',
            colorNeedleEnd: '#e74c3c',
            highlights: [
                { from: 50, to: 100, color: 'rgba(231, 76, 60, 0.3)' }
            ]
        }).draw();

        // G-Forces (-3 to 3 g) - Small secondary gauge
        this.gauges.gforce = new RadialGauge({
            renderTo: document.getElementById('gforce-gauge'),
            width: 110,
            height: 110,
            minValue: -3,
            maxValue: 3,
            majorTicks: ['-3', '-2', '-1', '0', '1', '2', '3'],
            minorTicks: 5,
            units: 'g',
            title: false,
            value: 0,
            colorNumbers: '#e0e0e0',
            colorTitle: '#e0e0e0',
            colorUnits: '#e0e0e0',
            colorValueText: '#9b59b6',
            colorValueTextRect: 'transparent',
            colorPlate: '#2a2a2a',
            colorMajorTicks: '#4a4a4a',
            colorMinorTicks: '#3a3a3a',
            colorNeedle: '#9b59b6',
            colorNeedleEnd: '#9b59b6',
            highlights: [
                { from: -3, to: -2, color: 'rgba(155, 89, 182, 0.3)' },
                { from: 2, to: 3, color: 'rgba(155, 89, 182, 0.3)' }
            ]
        }).draw();
    }

    setupMap() {
        // Initialize map centered on a default location
        this.map = L.map('live-map').setView([-35.276395, 149.13], 15);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
    }

    async loadSessions(forceRefresh = true) {
        try {
            // Always fetch fresh sessions from API (no caching, always refreshes)
            const sessions = await this.apiClient.getSessions();
            const select = document.getElementById('session-select-live');
            select.innerHTML = '<option value="">Select Session</option>';
            
            // Sort sessions by timestamp (newest first)
            sessions.sort((a, b) => {
                const timeA = new Date(a.start_time || a.created_at || 0);
                const timeB = new Date(b.start_time || b.created_at || 0);
                return timeB - timeA;
            });
            
            sessions.forEach(session => {
                const option = document.createElement('option');
                option.value = session.session_id;
                const date = session.start_time ? new Date(session.start_time).toLocaleString() : session.session_id;
                option.textContent = `${session.session_id} (${date})`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('session-select-live').addEventListener('change', (e) => {
            this.selectedSession = e.target.value || null;
            if (this.selectedSession) {
                // Connect when user selects a session
                if (!this.isConnected) {
                    this.connectWebSocket();
                }
            } else {
                // Disconnect and reset when user clears session
                this.disconnect();
                this.resetGauges();
                if (this.liveMarker && this.map) {
                    this.map.removeLayer(this.liveMarker);
                    this.liveMarker = null;
                }
                this.updateConnectionStatus('Select a session', 'disconnected');
            }
        });
    }

    resetGauges() {
        // Reset all gauges to zero/default values
        Object.values(this.gauges).forEach(gauge => {
            gauge.value = 0;
        });
        document.getElementById('speed-value').textContent = '0 km/h';
        document.getElementById('rpm-value').textContent = '0 rpm';
        document.getElementById('air-temp-value').textContent = '0 °C';
        document.getElementById('oil-temp-value').textContent = '0 °C';
        document.getElementById('voltage-value').textContent = '0 V';
        document.getElementById('throttle-value').textContent = '0 %';
        document.getElementById('brake-value').textContent = '0 %';
        document.getElementById('gforce-value').textContent = '0.0 g';
        document.getElementById('live-gear').textContent = '-';
        document.getElementById('live-lap-time').textContent = '-';
        document.getElementById('live-lap').textContent = '-';
    }

    connectWebSocket() {
        // Extract base URL from API client
        const baseUrl = this.apiClient.baseURL.replace(/^https?:\/\//, '');
        const protocol = this.apiClient.baseURL.startsWith('https') ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${baseUrl}/ws/live`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus('Connected', 'connected');
            console.log('WebSocket connected');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Handle ping messages
                if (data.type === 'ping') {
                    // Optionally send pong back, but not required
                    return;
                }
                
                // Only process data from the selected session (we only connect when session is selected)
                if (data.session_id !== this.selectedSession) {
                    return; // Ignore data from other sessions
                }
                
                if (data.session_id === this.selectedSession) {
                    // Use requestAnimationFrame to throttle updates and prevent jitter
                    if (this._updatePending) {
                        // If an update is already pending, just update the latest data
                        this._pendingData = data;
                    } else {
                        this._updatePending = true;
                        this._pendingData = data;
                        requestAnimationFrame(() => {
                            this.updateGauges(this._pendingData);
                            this.updateMap(this._pendingData);
                            this.updateStats(this._pendingData);
                            this._updatePending = false;
                            this._pendingData = null;
                        });
                    }
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus('Error', 'error');
        };
        
        this.ws.onclose = () => {
            this.isConnected = false;
            this.ws = null;
            this.updateConnectionStatus(
                this.selectedSession ? 'Disconnected' : 'Select a session',
                'disconnected'
            );
            console.log('WebSocket disconnected');
            
            // Only reconnect if user still has a session selected (connection was lost, not user-initiated)
            if (this.selectedSession) {
                setTimeout(() => {
                    if (!this.isConnected && this.selectedSession) {
                        this.connectWebSocket();
                    }
                }, 3000);
            }
        };
    }

    updateConnectionStatus(status, className) {
        const statusEl = document.getElementById('ws-status');
        statusEl.textContent = status;
        statusEl.className = `status-indicator ${className}`;
    }

    updateGauges(data) {
        const vd = data.vehicle_dynamics || {};
        const pt = data.powertrain || {};
        const env = data.environment || {};
        
        // Speed (convert m/s to km/h if needed, or use directly if already in km/h)
        const speed = vd.speed || 0;
        this.gauges.speed.value = speed;
        document.getElementById('speed-value').textContent = `${speed.toFixed(1)} km/h`;
        
        // RPM
        const rpm = pt.engine_rpm || 0;
        this.gauges.rpm.value = rpm;
        document.getElementById('rpm-value').textContent = `${rpm.toLocaleString()} rpm`;
        
        // Air Temperature (use intake temp from powertrain, fallback to ambient)
        const airTemp = pt.air_intake_temperature || env.ambient_temperature || 0;
        this.gauges.airTemp.value = airTemp;
        document.getElementById('air-temp-value').textContent = `${airTemp.toFixed(1)} °C`;
        
        // Oil Temperature
        const oilTemp = pt.oil_temperature || 0;
        this.gauges.oilTemp.value = oilTemp;
        document.getElementById('oil-temp-value').textContent = `${oilTemp.toFixed(1)} °C`;
        
        // Battery Voltage (assuming 12V system, may need adjustment)
        const voltage = 12.0; // This would come from telemetry if available
        this.gauges.voltage.value = voltage;
        document.getElementById('voltage-value').textContent = `${voltage.toFixed(1)} V`;
        
        // Throttle
        const throttle = pt.throttle_position || 0;
        this.gauges.throttle.value = throttle;
        document.getElementById('throttle-value').textContent = `${throttle.toFixed(0)} %`;
        
        // Brake Force
        const brake = pt.braking_force || 0;
        this.gauges.brake.value = brake;
        document.getElementById('brake-value').textContent = `${brake.toFixed(0)} %`;
        
        // G-Forces (combined lateral and longitudinal)
        const lateralG = vd.lateral_g || 0;
        const longitudinalG = vd.longitudinal_g || 0;
        const combinedG = Math.sqrt(lateralG * lateralG + longitudinalG * longitudinalG);
        this.gauges.gforce.value = combinedG;
        document.getElementById('gforce-value').textContent = `${combinedG.toFixed(2)} g`;
    }

    updateMap(data) {
        const location = data.location;
        if (!location || !location.latitude || !location.longitude) {
            return;
        }
        
        const lat = location.latitude;
        const lon = location.longitude;
        
        // Update or create live position marker
        if (this.liveMarker) {
            this.liveMarker.setLatLng([lat, lon]);
        } else {
            this.liveMarker = L.marker([lat, lon], {
                icon: L.divIcon({
                    className: 'live-marker',
                    html: '<div class="live-marker-pulse"></div>',
                    iconSize: [20, 20]
                })
            }).addTo(this.map);
        }
        
        // Center map on vehicle (with some smoothing)
        this.map.setView([lat, lon], this.map.getZoom(), { animate: true, duration: 0.5 });
    }

    updateStats(data) {
        const pt = data.powertrain || {};
        const session = data.session || {};
        
        document.getElementById('live-gear').textContent = pt.gear || '-';
        document.getElementById('live-lap-time').textContent = data.lap_time ? 
            `${data.lap_time.toFixed(2)}s` : '-';
        document.getElementById('live-lap').textContent = data.lap_number || '-';
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

