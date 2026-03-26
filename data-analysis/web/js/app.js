/**
 * Main Application
 * Coordinates all components and handles user interactions
 */

// Metrics configuration
const METRICS_CONFIG = {
    vehicle_dynamics: {
        title: 'Vehicle Dynamics',
        metrics: [
            { key: 'speed', label: 'Speed (km/h)', color: 'rgb(75, 192, 192)', unit: 'km/h' },
            { key: 'yaw', label: 'Yaw Rate (deg/s)', color: 'rgb(255, 99, 132)', unit: 'deg/s' },
            { key: 'roll', label: 'Roll (deg/s)', color: 'rgb(54, 162, 235)', unit: 'deg' },
            { key: 'pitch', label: 'Pitch (deg/s)', color: 'rgb(255, 206, 86)', unit: 'deg' },
            { key: 'lateral_g', label: 'Lateral G', color: 'rgb(153, 102, 255)', unit: 'g' },
            { key: 'longitudinal_g', label: 'Longitudinal G', color: 'rgb(255, 159, 64)', unit: 'g' },
            { key: 'vertical_g', label: 'Vertical G', color: 'rgb(201, 203, 207)', unit: 'g' },
            { key: 'steering_angle', label: 'Steering Angle (deg)', color: 'rgb(255, 99, 255)', unit: 'deg' }
        ]
    },
    powertrain: {
        title: 'Powertrain',
        metrics: [
            { key: 'engine_rpm', label: 'Engine RPM', color: 'rgb(255, 99, 132)', unit: 'rpm' },
            { key: 'throttle_position', label: 'Throttle Position (%)', color: 'rgb(75, 192, 192)', unit: '%' },
            { key: 'braking_force', label: 'Braking Force (%)', color: 'rgb(255, 99, 132)', unit: '%' },
            { key: 'gear', label: 'Gear', color: 'rgb(54, 162, 235)', unit: '' },
            { key: 'engine_temperature', label: 'Engine Temp (°C)', color: 'rgb(255, 206, 86)', unit: '°C' },
            { key: 'oil_pressure', label: 'Oil Pressure', color: 'rgb(153, 102, 255)', unit: 'PSI' },
            { key: 'oil_temperature', label: 'Oil Temp (°C)', color: 'rgb(255, 159, 64)', unit: '°C' },
            { key: 'coolant_temperature', label: 'Coolant Temp (°C)', color: 'rgb(201, 203, 207)', unit: '°C' },
            { key: 'turbo_boost_pressure', label: 'Turbo Boost', color: 'rgb(255, 99, 255)', unit: 'PSI' },
            { key: 'air_intake_temperature', label: 'Intake Temp (°C)', color: 'rgb(50, 205, 50)', unit: '°C' },
            { key: 'fuel_level', label: 'Fuel Level (%)', color: 'rgb(255, 140, 0)', unit: '%' }
        ]
    },
    suspension: {
        title: 'Suspension',
        metrics: [
            { key: 'suspension_front_left', label: 'Front Left (mm)', color: 'rgb(75, 192, 192)', unit: 'mm', dataKey: 'front_left' },
            { key: 'suspension_front_right', label: 'Front Right (mm)', color: 'rgb(255, 99, 132)', unit: 'mm', dataKey: 'front_right' },
            { key: 'suspension_rear_left', label: 'Rear Left (mm)', color: 'rgb(54, 162, 235)', unit: 'mm', dataKey: 'rear_left' },
            { key: 'suspension_rear_right', label: 'Rear Right (mm)', color: 'rgb(255, 206, 86)', unit: 'mm', dataKey: 'rear_right' }
        ]
    },
    wheels: {
        title: 'Wheel Speeds',
        metrics: [
            { key: 'wheels_front_left', label: 'Front Left (km/h)', color: 'rgb(75, 192, 192)', unit: 'km/h', dataKey: 'front_left' },
            { key: 'wheels_front_right', label: 'Front Right (km/h)', color: 'rgb(255, 99, 132)', unit: 'km/h', dataKey: 'front_right' },
            { key: 'wheels_rear_left', label: 'Rear Left (km/h)', color: 'rgb(54, 162, 235)', unit: 'km/h', dataKey: 'rear_left' },
            { key: 'wheels_rear_right', label: 'Rear Right (km/h)', color: 'rgb(255, 206, 86)', unit: 'km/h', dataKey: 'rear_right' }
        ]
    },
    environment: {
        title: 'Environment',
        metrics: [
            { key: 'ambient_temperature', label: 'Ambient Temp (°C)', color: 'rgb(75, 192, 192)', unit: '°C' },
            { key: 'track_surface_temperature', label: 'Track Temp (°C)', color: 'rgb(255, 99, 132)', unit: '°C' },
            { key: 'humidity', label: 'Humidity (%)', color: 'rgb(54, 162, 235)', unit: '%' }
        ]
    }
};

class RacingDataApp {
    constructor() {
        const config = window.__APP_CONFIG__ || {};
        const apiBaseUrl = config.apiBaseUrl || 'http://localhost:8000';
        const simulationBaseUrl = config.simulationBaseUrl || 'http://localhost:8002';
        this.apiClient = new APIClient(apiBaseUrl, simulationBaseUrl);
        this.cacheManager = new CacheManager();
        this.map = null;
        this.charts = {}; // Object to store multiple charts
        this.currentSession = null;
        this.currentLap = null;
        this.currentData = [];
        this.selectedMetrics = new Set(['speed', 'engine_rpm']);
        this.trackPolyline = null;
        this.racingLinePolyline = null;
        this.hoverMarker = null;
        this.startMarker = null;
        this.selectedRacingLineTrack = null;
        this.selectedRacingLineProfile = null;
        this.tracksManager = null;
        this.carProfilesManager = null;
        this.liveScreen = null;
        this.simulationManager = null;
        this.sessionManagementManager = null;
        this.deviceManagementManager = null;
        this.userManagementManager = null;
        this.settingsManager = null;
        
        // GPS offset: number of indices ahead to look for GPS coordinate
        // This compensates for GPS data being behind sensor data
        this.gpsOffset = 0; // Configurable: adjust this value to align GPS with sensor data

        /** @type {Array} laps from getSessionLaps for current session */
        this.sessionLaps = [];
        /** Lap delta vs reference (map coloring + chart) */
        this.lapDeltaResult = null;
        this.deltaChart = null;
        this.trackPolylineDeltaGroup = null;
        /** G–G diagram (lateral vs longitudinal G) */
        this.ggChart = null;
    }

    async init() {
        try {
            // Initialize settings manager early to apply theme
            this.settingsManager = new SettingsManager(this.apiClient);
            
            // Initialize cache
            await this.cacheManager.init();
            console.log('Cache initialized');

            // Check API health
            const isHealthy = await this.apiClient.checkHealth();
            if (!isHealthy) {
                this.updateStatus('API not available', 'error');
            } else {
                this.updateStatus('Connected', 'ready');
            }

            // Setup menu
            this.setupMenu();

            // Setup UI
            this.setupEventListeners();
            this.setupMetricsPanel();
            this.setupMap();
            this.setupChart();
            this.setupDeltaChart();
            this.setupGgChart();

            // Initialize tracks manager
            this.tracksManager = new TracksManager(this.apiClient);
            
            // Initialize car profiles manager
            this.carProfilesManager = new CarProfilesManager(this.apiClient);
            
            // Initialize live screen
            this.liveScreen = new LiveScreen(this.apiClient);
            
            // Initialize simulation manager
            this.simulationManager = new SimulationManager(this.apiClient);
            
            // Initialize session management manager
            this.sessionManagementManager = new SessionManagementManager(this.apiClient);

            // Initialize device management manager
            this.deviceManagementManager = new DeviceManagementManager(this.apiClient);
            this.userManagementManager = new UserManagementManager(this.apiClient);

            // Load home screen stats
            await this.loadHomeStats();

            // Load sessions (only if on race results screen)
            if (document.getElementById('race-results-screen').classList.contains('active')) {
                await this.loadSessions(true); // Force refresh on initial load
            }
        } catch (error) {
            console.error('Initialization error:', error);
            this.updateStatus('Initialization failed', 'error');
        }
    }

    setupMenu() {
        const menuToggle = document.getElementById('menu-toggle');
        const menuDropdown = document.getElementById('menu-dropdown');
        const menuItems = document.querySelectorAll('.menu-item');

        // Toggle menu
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            menuToggle.classList.toggle('active');
            menuDropdown.classList.toggle('open');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuToggle.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuToggle.classList.remove('active');
                menuDropdown.classList.remove('open');
            }
        });

        // Handle menu item clicks
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const screenName = item.getAttribute('data-screen');
                this.switchScreen(screenName);
                
                // Update active menu item
                menuItems.forEach(mi => mi.classList.remove('active'));
                item.classList.add('active');
                
                // Close menu
                menuToggle.classList.remove('active');
                menuDropdown.classList.remove('open');
            });
        });

        // Handle home card clicks
        document.querySelectorAll('.home-card').forEach(card => {
            card.addEventListener('click', () => {
                const screenName = card.getAttribute('data-screen');
                if (screenName) {
                    this.switchScreen(screenName);
                    // Update menu
                    menuItems.forEach(mi => {
                        if (mi.getAttribute('data-screen') === screenName) {
                            menuItems.forEach(m => m.classList.remove('active'));
                            mi.classList.add('active');
                        }
                    });
                }
            });
        });
    }

    switchScreen(screenName) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show selected screen
        const targetScreen = document.getElementById(`${screenName}-screen`);
        if (targetScreen) {
            targetScreen.classList.add('active');
        }

        // If switching to race results, ensure map is properly sized and load sessions
        if (screenName === 'race-results') {
            setTimeout(() => {
                if (this.map) {
                    this.map.invalidateSize();
                }
            }, 100);
            // Always refresh sessions when showing race results screen
            this.loadSessions(true);
            // Load tracks and car profiles for racing line overlay
            this.loadRacingLineTracks();
            this.loadRacingLineCarProfiles();
        }

        // If switching to tracks, initialize tracks manager
        if (screenName === 'tracks' && this.tracksManager) {
            this.tracksManager.init();
        }

        // If switching to car profiles, initialize car profiles manager
        if (screenName === 'car-profiles' && this.carProfilesManager) {
            this.carProfilesManager.init();
        }

        // If switching to live screen, initialize live screen
        if (screenName === 'live' && this.liveScreen) {
            setTimeout(() => {
                this.liveScreen.init();
                // Ensure map resizes properly when screen becomes visible
                if (this.liveScreen.map) {
                    setTimeout(() => {
                        this.liveScreen.map.invalidateSize();
                    }, 200);
                }
            }, 100);
        } else if (this.liveScreen) {
            // Disconnect WebSocket when leaving live screen
            this.liveScreen.disconnect();
        }

        // If switching to simulation screen, initialize simulation manager
        if (screenName === 'simulation' && this.simulationManager) {
            this.simulationManager.init();
        }

        // If switching to session management screen, initialize session management manager
        if (screenName === 'session-management' && this.sessionManagementManager) {
            this.sessionManagementManager.init();
        }

        // If switching to devices screen, initialize device management manager
        if (screenName === 'devices' && this.deviceManagementManager) {
            this.deviceManagementManager.init();
        }

        // If switching to users screen, initialize user management manager
        if (screenName === 'users' && this.userManagementManager) {
            this.userManagementManager.init();
        }

        // If switching to settings screen, initialize settings manager
        if (screenName === 'settings' && this.settingsManager) {
            this.settingsManager.init();
        }
    }

    async loadHomeStats() {
        try {
            const sessions = await this.apiClient.getSessions();
            let totalLaps = 0;
            let totalRecords = 0;

            for (const session of sessions) {
                totalRecords += session.total_records || 0;
                try {
                    const laps = await this.apiClient.getSessionLaps(session.session_id);
                    totalLaps += laps.length;
                } catch (error) {
                    console.warn(`Could not load laps for session ${session.session_id}:`, error);
                }
            }

            document.getElementById('total-sessions').textContent = sessions.length;
            document.getElementById('total-laps').textContent = totalLaps;
            document.getElementById('total-records').textContent = totalRecords.toLocaleString();
        } catch (error) {
            console.error('Error loading home stats:', error);
            document.getElementById('total-sessions').textContent = '?';
            document.getElementById('total-laps').textContent = '?';
            document.getElementById('total-records').textContent = '?';
        }
    }

    setupEventListeners() {
        document.getElementById('session-select').addEventListener('change', (e) => {
            this.onSessionChange(e.target.value);
        });

        document.getElementById('lap-select').addEventListener('change', (e) => {
            this.currentLap = e.target.value === '' ? null : parseInt(e.target.value);
            const refGroup = document.getElementById('reference-lap-group');
            const refSelect = document.getElementById('reference-lap-select');
            if (this.currentLap !== null && this.currentSession) {
                if (refGroup) refGroup.style.display = '';
                if (refSelect && !refSelect.value) refSelect.value = 'best';
                this.loadTelemetryData();
            } else {
                if (refGroup) refGroup.style.display = 'none';
                this.clearLapDeltaDisplay();
            }
        });

        const refLapSelect = document.getElementById('reference-lap-select');
        if (refLapSelect) {
            refLapSelect.addEventListener('change', () => {
                if (this.currentLap !== null && this.currentSession) {
                    this.loadTelemetryData();
                }
            });
        }

        document.getElementById('clear-cache-btn').addEventListener('click', () => {
            this.clearCache();
        });

        const racingLineToggle = document.getElementById('racing-line-toggle');
        const racingLineRow = document.getElementById('racing-line-row');
        if (racingLineToggle && racingLineRow) {
            racingLineToggle.addEventListener('click', () => {
                const isHidden = racingLineRow.hasAttribute('hidden');
                if (isHidden) {
                    racingLineRow.removeAttribute('hidden');
                    racingLineToggle.setAttribute('aria-expanded', 'true');
                } else {
                    racingLineRow.setAttribute('hidden', '');
                    racingLineToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // Racing line overlay controls
        document.getElementById('racing-line-track-select').addEventListener('change', (e) => {
            this.selectedRacingLineTrack = e.target.value || null;
            if (this.selectedRacingLineTrack) {
                this.loadRacingLineCarProfiles();
            } else {
                const profileSelect = document.getElementById('racing-line-profile-select');
                profileSelect.innerHTML = '<option value="">Select track first</option>';
                profileSelect.disabled = true;
                this.removeRacingLineOverlay();
            }
        });

        document.getElementById('racing-line-profile-select').addEventListener('change', (e) => {
            this.selectedRacingLineProfile = e.target.value || null;
            if (this.selectedRacingLineTrack && this.selectedRacingLineProfile) {
                this.loadRacingLineOverlay();
            } else {
                this.removeRacingLineOverlay();
            }
        });
    }

    setupMetricsPanel() {
        const metricsList = document.getElementById('metrics-list');
        metricsList.innerHTML = '';

        // Setup Select All/None buttons
        const selectAllBtn = document.getElementById('select-all-metrics');
        const selectNoneBtn = document.getElementById('select-none-metrics');
        
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                this.selectAllMetrics();
            });
        }
        
        if (selectNoneBtn) {
            selectNoneBtn.addEventListener('click', () => {
                this.selectNoneMetrics();
            });
        }

        Object.entries(METRICS_CONFIG).forEach(([category, config]) => {
            const group = document.createElement('div');
            group.className = 'metric-group';

            const title = document.createElement('div');
            title.className = 'metric-group-title';
            title.textContent = config.title;
            group.appendChild(title);

            config.metrics.forEach(metric => {
                const item = document.createElement('div');
                item.className = 'metric-item';
                if (this.selectedMetrics.has(metric.key)) {
                    item.classList.add('active');
                }

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `metric-${metric.key}`;
                checkbox.checked = this.selectedMetrics.has(metric.key);
                checkbox.addEventListener('change', (e) => {
                    this.toggleMetric(metric.key, e.target.checked);
                });

                const label = document.createElement('label');
                label.htmlFor = `metric-${metric.key}`;
                label.textContent = metric.label;

                item.appendChild(checkbox);
                item.appendChild(label);
                group.appendChild(item);
            });

            metricsList.appendChild(group);
        });
    }

    selectAllMetrics() {
        // Get all metric keys from METRICS_CONFIG
        Object.entries(METRICS_CONFIG).forEach(([category, config]) => {
            config.metrics.forEach(metric => {
                this.selectedMetrics.add(metric.key);
                const checkbox = document.getElementById(`metric-${metric.key}`);
                if (checkbox) {
                    checkbox.checked = true;
                }
                const item = checkbox?.closest('.metric-item');
                if (item) {
                    item.classList.add('active');
                }
            });
        });
        this.updateChart();
    }

    selectNoneMetrics() {
        // Clear all selected metrics
        this.selectedMetrics.clear();
        
        // Uncheck all checkboxes
        Object.entries(METRICS_CONFIG).forEach(([category, config]) => {
            config.metrics.forEach(metric => {
                const checkbox = document.getElementById(`metric-${metric.key}`);
                if (checkbox) {
                    checkbox.checked = false;
                }
                const item = checkbox?.closest('.metric-item');
                if (item) {
                    item.classList.remove('active');
                }
            });
        });
        this.updateChart();
    }

    toggleMetric(metricKey, enabled) {
        const item = document.querySelector(`#metric-${metricKey}`).closest('.metric-item');
        if (enabled) {
            this.selectedMetrics.add(metricKey);
            item.classList.add('active');
        } else {
            this.selectedMetrics.delete(metricKey);
            item.classList.remove('active');
        }
        this.updateChart();
    }

    setupMap() {
        this.map = L.map('map').setView([-35.276395, 149.13], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
    }

    setupChart() {
        const self = this; // Store reference for event handlers
        
        // Define chart groups with their metrics
        const chartGroups = {
            'speed': {
                canvasId: 'chart-speed',
                wrapperId: 'chart-wrapper-speed',
                metrics: [
                    { key: 'speed', label: 'Speed (km/h)', color: 'rgb(75, 192, 192)', unit: 'km/h', dataKey: 'speed' },
                    { key: 'wheels_front_left', label: 'Front Left (km/h)', color: 'rgb(255, 99, 132)', unit: 'km/h', dataKey: 'front_left' },
                    { key: 'wheels_front_right', label: 'Front Right (km/h)', color: 'rgb(54, 162, 235)', unit: 'km/h', dataKey: 'front_right' },
                    { key: 'wheels_rear_left', label: 'Rear Left (km/h)', color: 'rgb(255, 206, 86)', unit: 'km/h', dataKey: 'rear_left' },
                    { key: 'wheels_rear_right', label: 'Rear Right (km/h)', color: 'rgb(153, 102, 255)', unit: 'km/h', dataKey: 'rear_right' }
                ],
                yAxisLabel: 'Speed (km/h)'
            },
            'gforces': {
                canvasId: 'chart-gforces',
                wrapperId: 'chart-wrapper-gforces',
                metrics: [
                    { key: 'lateral_g', label: 'Lateral G', color: 'rgb(153, 102, 255)', unit: 'g', dataKey: 'lateral_g' },
                    { key: 'longitudinal_g', label: 'Longitudinal G', color: 'rgb(255, 159, 64)', unit: 'g', dataKey: 'longitudinal_g' },
                    { key: 'vertical_g', label: 'Vertical G', color: 'rgb(201, 203, 207)', unit: 'g', dataKey: 'vertical_g' }
                ],
                yAxisLabel: 'G Force'
            },
            'angles': {
                canvasId: 'chart-angles',
                wrapperId: 'chart-wrapper-angles',
                metrics: [
                    { key: 'yaw', label: 'Yaw Rate (deg/s)', color: 'rgb(255, 99, 132)', unit: 'deg/s', dataKey: 'yaw' },
                    { key: 'roll', label: 'Roll (deg)', color: 'rgb(54, 162, 235)', unit: 'deg', dataKey: 'roll' },
                    { key: 'pitch', label: 'Pitch (deg)', color: 'rgb(255, 206, 86)', unit: 'deg', dataKey: 'pitch' },
                    { key: 'steering_angle', label: 'Steering Angle (deg)', color: 'rgb(255, 99, 255)', unit: 'deg', dataKey: 'steering_angle' }
                ],
                yAxisLabel: 'Angle (deg)'
            },
            'percentages': {
                canvasId: 'chart-percentages',
                wrapperId: 'chart-wrapper-percentages',
                metrics: [
                    { key: 'throttle_position', label: 'Throttle Position (%)', color: 'rgb(75, 192, 192)', unit: '%', dataKey: 'throttle_position' },
                    { key: 'braking_force', label: 'Braking Force (%)', color: 'rgb(255, 99, 132)', unit: '%', dataKey: 'braking_force' },
                    { key: 'fuel_level', label: 'Fuel Level (%)', color: 'rgb(255, 140, 0)', unit: '%', dataKey: 'fuel_level' },
                    { key: 'humidity', label: 'Humidity (%)', color: 'rgb(54, 162, 235)', unit: '%', dataKey: 'humidity' }
                ],
                yAxisLabel: 'Percentage (%)'
            },
            'temperatures': {
                canvasId: 'chart-temperatures',
                wrapperId: 'chart-wrapper-temperatures',
                metrics: [
                    { key: 'engine_temperature', label: 'Engine Temp (°C)', color: 'rgb(255, 206, 86)', unit: '°C', dataKey: 'engine_temperature' },
                    { key: 'oil_temperature', label: 'Oil Temp (°C)', color: 'rgb(255, 159, 64)', unit: '°C', dataKey: 'oil_temperature' },
                    { key: 'coolant_temperature', label: 'Coolant Temp (°C)', color: 'rgb(201, 203, 207)', unit: '°C', dataKey: 'coolant_temperature' },
                    { key: 'air_intake_temperature', label: 'Intake Temp (°C)', color: 'rgb(50, 205, 50)', unit: '°C', dataKey: 'air_intake_temperature' },
                    { key: 'ambient_temperature', label: 'Ambient Temp (°C)', color: 'rgb(75, 192, 192)', unit: '°C', dataKey: 'ambient_temperature' },
                    { key: 'track_surface_temperature', label: 'Track Temp (°C)', color: 'rgb(255, 99, 132)', unit: '°C', dataKey: 'track_surface_temperature' }
                ],
                yAxisLabel: 'Temperature (°C)'
            },
            'rpm': {
                canvasId: 'chart-rpm',
                wrapperId: 'chart-wrapper-rpm',
                metrics: [
                    { key: 'engine_rpm', label: 'Engine RPM', color: 'rgb(255, 99, 132)', unit: 'rpm', dataKey: 'engine_rpm' }
                ],
                yAxisLabel: 'RPM'
            },
            'other': {
                canvasId: 'chart-other',
                wrapperId: 'chart-wrapper-other',
                metrics: [
                    { key: 'gear', label: 'Gear', color: 'rgb(54, 162, 235)', unit: '', dataKey: 'gear' },
                    { key: 'oil_pressure', label: 'Oil Pressure', color: 'rgb(153, 102, 255)', unit: 'PSI', dataKey: 'oil_pressure' },
                    { key: 'turbo_boost_pressure', label: 'Turbo Boost', color: 'rgb(255, 99, 255)', unit: 'PSI', dataKey: 'turbo_boost_pressure' },
                    { key: 'suspension_front_left', label: 'Front Left (mm)', color: 'rgb(75, 192, 192)', unit: 'mm', dataKey: 'front_left' },
                    { key: 'suspension_front_right', label: 'Front Right (mm)', color: 'rgb(255, 99, 132)', unit: 'mm', dataKey: 'front_right' },
                    { key: 'suspension_rear_left', label: 'Rear Left (mm)', color: 'rgb(54, 162, 235)', unit: 'mm', dataKey: 'rear_left' },
                    { key: 'suspension_rear_right', label: 'Rear Right (mm)', color: 'rgb(255, 206, 86)', unit: 'mm', dataKey: 'rear_right' }
                ],
                yAxisLabel: 'Value'
            }
        };
        
        // Create a chart for each group
        Object.keys(chartGroups).forEach(groupKey => {
            const group = chartGroups[groupKey];
            const canvas = document.getElementById(group.canvasId);
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: '#e0e0e0',
                                usePointStyle: true,
                                font: {
                                    size: 11
                                }
                            }
                        },
                        zoom: {
                            zoom: {
                                wheel: {
                                    enabled: true,
                                },
                                pinch: {
                                    enabled: true
                                },
                                mode: 'x',
                            },
                            pan: {
                                enabled: true,
                                mode: 'x',
                            }
                        },
                        tooltip: {
                            enabled: true,
                            mode: 'index',
                            intersect: false
                        }
                    },
                    onHover: (event, activeElements, chart) => {
                            if (activeElements.length > 0) {
                                const dataIndex = activeElements[0]?.index;
                                if (dataIndex == null) return;
                                self.highlightMapPoint(dataIndex);
                                self.highlightSyncedCharts(dataIndex, chart);
                            } else {
                                self.clearMapHighlight();
                                self.clearAllChartHoverHighlights();
                            }
                        },
                        scales: {
                            x: {
                                title: {
                                    display: false,
                                    text: 'Distance (km)',
                                    color: '#e0e0e0',
                                    font: { size: 11 }
                                },
                                ticks: {
                                    color: '#b0b0b0',
                                    font: { size: 10 },
                                    callback: function(value) {
                                        // NOTE: On a category scale, `value` is the tick index.
                                        // Convert index -> label, then format that label.
                                        const label = this.getLabelForValue(value);
                                        const num = Number(label);
                                        return Number.isFinite(num) ? num.toFixed(2) : label;
                                    }
                                },
                                grid: {
                                    color: '#3a3a3a'
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: group.yAxisLabel,
                                    color: '#e0e0e0',
                                    font: { size: 11 }
                                },
                                ticks: {
                                    color: '#b0b0b0',
                                    font: { size: 10 }
                                },
                                grid: {
                                    color: '#3a3a3a'
                                }
                            }
                        }
                    }
                });
            
            // Store last known scale values for this chart
            chart._lastXMin = undefined;
            chart._lastXMax = undefined;
            chart._isSyncing = false; // Flag to prevent recursive syncing
            
            // Add event listeners to detect zoom/pan changes
            let syncTimeout;
            const scheduleSync = () => {
                clearTimeout(syncTimeout);
                syncTimeout = setTimeout(() => {
                    if (!chart._isSyncing) {
                        self.checkAndSyncScales(chart);
                    }
                }, 100); // Debounce to avoid too many syncs
            };
            
            canvas.addEventListener('wheel', scheduleSync);
            canvas.addEventListener('mouseup', scheduleSync); // After pan ends
            canvas.addEventListener('touchend', scheduleSync); // After touch pan/zoom ends
            
            this.charts[groupKey] = {
                chart: chart,
                metrics: group.metrics,
                wrapperId: group.wrapperId
            };
        });
    }

    setupDeltaChart() {
        const canvas = document.getElementById('chart-delta');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const self = this;
        this.deltaChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Δ vs reference (s)',
                        data: [],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.12)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHoverRadius: 4,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: '#e0e0e0', font: { size: 11 } },
                    },
                    tooltip: {
                        enabled: true,
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label(ctx) {
                                const v = ctx.parsed?.y;
                                if (v == null || Number.isNaN(v)) return '';
                                const sign = v > 0 ? '+' : '';
                                return `Δ: ${sign}${v.toFixed(3)} s`;
                            },
                        },
                    },
                    zoom: {
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                        },
                        pan: { enabled: true, mode: 'x' },
                    },
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Distance (km)', color: '#e0e0e0', font: { size: 11 } },
                        ticks: {
                            color: '#b0b0b0',
                            font: { size: 10 },
                            callback(value) {
                                const label = this.getLabelForValue(value);
                                const num = Number(label);
                                return Number.isFinite(num) ? num.toFixed(2) : label;
                            },
                        },
                        grid: { color: '#3a3a3a' },
                    },
                    y: {
                        title: { display: true, text: 'Delta (s) — slower + / faster −', color: '#e0e0e0', font: { size: 11 } },
                        ticks: { color: '#b0b0b0' },
                        grid: { color: '#3a3a3a' },
                    },
                },
                onHover: (event, activeElements) => {
                    if (activeElements.length > 0) {
                        const idx = activeElements[0]?.index;
                        if (idx == null) return;
                        self.highlightMapPoint(idx);
                        self.highlightSyncedCharts(idx, self.deltaChart);
                    } else {
                        self.clearMapHighlight();
                        self.clearAllChartHoverHighlights();
                    }
                },
            },
        });
        this.deltaChart._lastXMin = undefined;
        this.deltaChart._lastXMax = undefined;
        this.deltaChart._isSyncing = false;

        const scheduleDeltaSync = () => {
            setTimeout(() => {
                if (!this.deltaChart._isSyncing) {
                    this.checkAndSyncScales(this.deltaChart);
                }
            }, 100);
        };
        canvas.addEventListener('wheel', scheduleDeltaSync);
        canvas.addEventListener('mouseup', scheduleDeltaSync);
        canvas.addEventListener('touchend', scheduleDeltaSync);
    }

    setupGgChart() {
        const canvas = document.getElementById('chart-gg');
        if (!canvas || typeof GG_DIAGRAM === 'undefined') return;
        const ctx = canvas.getContext('2d');
        this.ggChart = new Chart(ctx, {
            type: 'scatter',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1,
                interaction: { mode: 'nearest', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#e0e0e0',
                            font: { size: 11 },
                            filter: (item) => item.text === 'Telemetry',
                        },
                    },
                    tooltip: {
                        filter: (item) => item.dataset.label === 'Telemetry',
                        callbacks: {
                            label(ctx) {
                                const r = ctx.raw;
                                if (!r || typeof r.x !== 'number' || typeof r.y !== 'number') return '';
                                return `Lateral: ${r.x.toFixed(2)} g · Longitudinal: ${r.y.toFixed(2)} g`;
                            },
                        },
                    },
                    zoom: {
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'xy',
                        },
                        pan: { enabled: true, mode: 'xy' },
                    },
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Lateral G',
                            color: '#e0e0e0',
                            font: { size: 11 },
                        },
                        ticks: { color: '#b0b0b0' },
                        grid: { color: '#3a3a3a' },
                    },
                    y: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Longitudinal G (accel + / brake −)',
                            color: '#e0e0e0',
                            font: { size: 11 },
                        },
                        ticks: { color: '#b0b0b0' },
                        grid: { color: '#3a3a3a' },
                    },
                },
            },
        });
    }

    updateGgChart() {
        const wrapper = document.getElementById('chart-wrapper-gg');
        const sidebar = document.getElementById('gg-sidebar');
        if (!this.ggChart || !wrapper || typeof GG_DIAGRAM === 'undefined') return;

        const hideGg = () => {
            this.ggChart.data.datasets = [];
            this.ggChart.update('none');
            wrapper.style.display = 'none';
            if (sidebar) sidebar.style.display = 'none';
            if (this.map) {
                requestAnimationFrame(() => this.map.invalidateSize());
            }
        };

        if (!this.currentData || this.currentData.length === 0) {
            hideGg();
            return;
        }

        const points = GG_DIAGRAM.extractScatterPoints(this.currentData);
        if (!points || points.length === 0) {
            hideGg();
            return;
        }

        const limit = GG_DIAGRAM.symmetricLimitFromPoints(points);
        const radii = GG_DIAGRAM.REFERENCE_RADII.filter((r) => r <= limit + 0.001);

        const datasets = [];
        radii.forEach((r) => {
            datasets.push({
                type: 'line',
                label: `${r}g`,
                data: GG_DIAGRAM.buildCirclePoints(r),
                pointRadius: 0,
                borderColor: 'rgba(160, 160, 160, 0.3)',
                borderWidth: 1,
                fill: false,
                tension: 0,
                order: 0,
            });
        });

        datasets.push({
            type: 'scatter',
            data: points,
            order: 1,
            showLine: false,
            backgroundColor: 'rgba(74, 144, 226, 0.35)',
            borderColor: 'rgba(74, 144, 226, 0.55)',
            pointRadius: 1,
            pointHoverRadius: 4,
        });

        this.ggChart.data.datasets = datasets;
        if (this.ggChart.options.scales && this.ggChart.options.scales.x) {
            this.ggChart.options.scales.x.min = -limit;
            this.ggChart.options.scales.x.max = limit;
        }
        if (this.ggChart.options.scales && this.ggChart.options.scales.y) {
            this.ggChart.options.scales.y.min = -limit;
            this.ggChart.options.scales.y.max = limit;
        }
        this.ggChart.update('none');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        if (sidebar) sidebar.style.display = 'flex';
        requestAnimationFrame(() => {
            if (this.ggChart) this.ggChart.resize();
            if (this.map) this.map.invalidateSize();
        });
    }

    getBestLapNumber(laps) {
        if (!laps || laps.length === 0) return null;
        let bestNum = null;
        let bestTime = Infinity;
        for (const lap of laps) {
            if (lap.lap_time != null && lap.lap_time > 0 && lap.lap_time < bestTime) {
                bestTime = lap.lap_time;
                bestNum = lap.lap_number;
            }
        }
        if (bestNum !== null) return bestNum;
        return laps[0].lap_number;
    }

    populateReferenceLapDropdown(laps) {
        const refSelect = document.getElementById('reference-lap-select');
        if (!refSelect) return;
        refSelect.innerHTML = '<option value="best">Best lap</option>';
        (laps || []).forEach((lap) => {
            const opt = document.createElement('option');
            opt.value = String(lap.lap_number);
            opt.textContent = `Lap ${lap.lap_number}${lap.lap_time != null ? ` (${lap.lap_time.toFixed(2)}s)` : ''}`;
            refSelect.appendChild(opt);
        });
        refSelect.value = 'best';
        refSelect.disabled = false;
    }

    async fetchLapTelemetryRaw(sessionId, lapNumber) {
        const isCached = await this.cacheManager.isCached(sessionId, lapNumber);
        if (isCached) {
            return this.cacheManager.getCachedTelemetryData(sessionId, lapNumber);
        }
        const data = await this.apiClient.getTelemetryData(sessionId, lapNumber);
        await this.cacheManager.cacheTelemetryData(sessionId, lapNumber, data);
        return data;
    }

    clearLapDeltaDisplay() {
        this.lapDeltaResult = null;
        const deltaWrapper = document.getElementById('chart-wrapper-delta');
        if (deltaWrapper) deltaWrapper.style.display = 'none';
        if (this.deltaChart && this.deltaChart.data.datasets[0]) {
            this.deltaChart.data.labels = [];
            this.deltaChart.data.datasets[0].data = [];
            this.deltaChart.update('none');
        }
        const row = document.getElementById('lap-delta-stats-row');
        if (row) row.style.display = 'none';
        const sd = document.getElementById('stat-lap-delta');
        const sr = document.getElementById('stat-lap-delta-ref');
        if (sd) sd.textContent = '-';
        if (sr) sr.textContent = '';
        if (this.map && this.currentData && this.currentData.length) {
            this.updateMap();
        }
    }

    async updateLapDeltaVisualization() {
        const refGroup = document.getElementById('reference-lap-group');
        const refSelect = document.getElementById('reference-lap-select');
        const deltaWrapper = document.getElementById('chart-wrapper-delta');

        if (!this.currentSession || this.currentLap === null || typeof LapDeltaCalculator === 'undefined') {
            if (refGroup) refGroup.style.display = 'none';
            this.clearLapDeltaDisplay();
            return;
        }

        if (refGroup) refGroup.style.display = '';

        let refChoice = refSelect && refSelect.value ? refSelect.value : 'best';
        if (refChoice === '') refChoice = 'best';

        const refLapNum =
            refChoice === 'best' ? this.getBestLapNumber(this.sessionLaps) : parseInt(refChoice, 10);

        if (refLapNum === null || Number.isNaN(refLapNum)) {
            this.clearLapDeltaDisplay();
            return;
        }

        const refLabel =
            refChoice === 'best' ? `Lap ${refLapNum} (best)` : `Lap ${refLapNum}`;

        try {
            let refData = await this.fetchLapTelemetryRaw(this.currentSession, refLapNum);
            if (!refData || refData.length === 0) {
                this.clearLapDeltaDisplay();
                return;
            }

            const stripDistance = (rec) => {
                const { distance, ...rest } = rec;
                return rest;
            };
            const compareRaw = this.currentData.map(stripDistance);
            const refStripped = refData.map(stripDistance);

            this.lapDeltaResult = LapDeltaCalculator.computeDelta(compareRaw, refStripped);

            if (!this.lapDeltaResult || !this.lapDeltaResult.deltas.length) {
                this.clearLapDeltaDisplay();
                return;
            }

            if (deltaWrapper) deltaWrapper.style.display = 'block';
            if (this.deltaChart && this.deltaChart.data.datasets[0]) {
                this.deltaChart.data.labels = this.lapDeltaResult.distancesKm;
                this.deltaChart.data.datasets[0].data = this.lapDeltaResult.deltas;
                if (this.deltaChart.options.scales && this.deltaChart.options.scales.x) {
                    this.deltaChart.options.scales.x.min = undefined;
                    this.deltaChart.options.scales.x.max = undefined;
                }
                if (this.deltaChart.options.scales && this.deltaChart.options.scales.y) {
                    this.deltaChart.options.scales.y.min = undefined;
                    this.deltaChart.options.scales.y.max = undefined;
                }
                this.deltaChart.update('none');
            }

            const total = this.lapDeltaResult.totalDelta;
            const sign = total > 0 ? '+' : '';
            document.getElementById('stat-lap-delta').textContent = `${sign}${total.toFixed(3)} s`;
            document.getElementById('stat-lap-delta-ref').textContent = `vs ${refLabel}`;
            document.getElementById('lap-delta-stats-row').style.display = '';

            this.updateMap();
        } catch (e) {
            console.error('Lap delta:', e);
            this.clearLapDeltaDisplay();
        }
    }

    checkAndSyncScales(sourceChart) {
        // Get the X-axis scale from the source chart
        const sourceXScale = sourceChart.scales?.x;
        if (!sourceXScale) return;
        
        // Get current scale limits (may be undefined if auto-scaled)
        const sourceMin = sourceXScale.min;
        const sourceMax = sourceXScale.max;
        
        // Check if scale has actually changed
        if (sourceChart._lastXMin === sourceMin && sourceChart._lastXMax === sourceMax) {
            return; // No change, don't sync
        }
        
        // Update stored values
        sourceChart._lastXMin = sourceMin;
        sourceChart._lastXMax = sourceMax;
        
        // Set syncing flag to prevent recursive updates
        sourceChart._isSyncing = true;
        
        // Sync all other charts to match the X-axis scale
        Object.keys(this.charts).forEach(key => {
            const chartGroup = this.charts[key];
            if (chartGroup.chart && chartGroup.chart !== sourceChart) {
                const xScale = chartGroup.chart.scales?.x;
                if (xScale) {
                    // Only update if the scale is actually different
                    if (chartGroup.chart._lastXMin !== sourceMin || chartGroup.chart._lastXMax !== sourceMax) {
                        // Set syncing flag for target chart
                        chartGroup.chart._isSyncing = true;
                        
                        // Update the scale options
                        if (chartGroup.chart.options.scales && chartGroup.chart.options.scales.x) {
                            chartGroup.chart.options.scales.x.min = sourceMin;
                            chartGroup.chart.options.scales.x.max = sourceMax;
                        }
                        // Update stored values to prevent infinite loop
                        chartGroup.chart._lastXMin = sourceMin;
                        chartGroup.chart._lastXMax = sourceMax;
                        // Update the chart without animation to keep it smooth
                        chartGroup.chart.update('none');
                        
                        // Clear syncing flag after update
                        setTimeout(() => {
                            chartGroup.chart._isSyncing = false;
                        }, 50);
                    }
                }
            }
        });

        if (this.deltaChart && this.deltaChart !== sourceChart) {
            const xScale = this.deltaChart.scales?.x;
            if (xScale && (this.deltaChart._lastXMin !== sourceMin || this.deltaChart._lastXMax !== sourceMax)) {
                this.deltaChart._isSyncing = true;
                if (this.deltaChart.options.scales && this.deltaChart.options.scales.x) {
                    this.deltaChart.options.scales.x.min = sourceMin;
                    this.deltaChart.options.scales.x.max = sourceMax;
                }
                this.deltaChart._lastXMin = sourceMin;
                this.deltaChart._lastXMax = sourceMax;
                this.deltaChart.update('none');
                setTimeout(() => {
                    this.deltaChart._isSyncing = false;
                }, 50);
            }
        }
        
        // Clear syncing flag
        setTimeout(() => {
            sourceChart._isSyncing = false;
        }, 50);
    }

    async loadSessions(forceRefresh = false) {
        try {
            // Only update status if on race results screen
            const raceResultsScreen = document.getElementById('race-results-screen');
            if (raceResultsScreen && raceResultsScreen.classList.contains('active')) {
                this.updateStatus('Loading sessions...', 'loading');
            }
            
            let sessions;
            
            if (forceRefresh) {
                // Force refresh from API
                sessions = await this.apiClient.getSessions();
                await this.cacheManager.cacheSessions(sessions);
            } else {
                // Try cache first
                sessions = await this.cacheManager.getCachedSessions();
                
                if (sessions.length === 0) {
                    // Fetch from API if cache is empty
                    sessions = await this.apiClient.getSessions();
                    await this.cacheManager.cacheSessions(sessions);
                }
            }

            const select = document.getElementById('session-select');
            if (select) {
                select.innerHTML = '<option value="">Select a session...</option>';
                
                sessions.forEach(session => {
                    const option = document.createElement('option');
                    option.value = session.session_id;
                    option.textContent = `${session.session_id} (${session.total_records} records)`;
                    select.appendChild(option);
                });
            }

            if (raceResultsScreen && raceResultsScreen.classList.contains('active')) {
                this.updateStatus('Ready', 'ready');
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
            const raceResultsScreen = document.getElementById('race-results-screen');
            if (raceResultsScreen && raceResultsScreen.classList.contains('active')) {
                this.updateStatus('Error loading sessions', 'error');
            }
        }
    }

    async onSessionChange(sessionId) {
        this.currentSession = sessionId;
        const lapSelect = document.getElementById('lap-select');
        
        // Clear current data and charts when session changes
        this.currentData = null;
        this.clearMap();
        this.updateGgChart();

        if (!sessionId) {
            lapSelect.innerHTML = '<option value="">Select a session first</option>';
            lapSelect.disabled = true;
            this.currentLap = null; // Reset lap when session is cleared
            this.sessionLaps = [];
            const refSel = document.getElementById('reference-lap-select');
            if (refSel) {
                refSel.innerHTML = '<option value="">—</option>';
                refSel.disabled = true;
            }
            const refGrp = document.getElementById('reference-lap-group');
            if (refGrp) refGrp.style.display = 'none';
            this.clearLapDeltaDisplay();
            this.updateSessionStats(null);
            // Clear all charts
            Object.keys(this.charts).forEach(key => {
                if (this.charts[key].chart) {
                    this.charts[key].chart.data.labels = [];
                    this.charts[key].chart.data.datasets = [];
                    // Reset scales
                    if (this.charts[key].chart.options.scales) {
                        if (this.charts[key].chart.options.scales.x) {
                            this.charts[key].chart.options.scales.x.min = undefined;
                            this.charts[key].chart.options.scales.x.max = undefined;
                            // Reset stored scale values
                            this.charts[key].chart._lastXMin = undefined;
                            this.charts[key].chart._lastXMax = undefined;
                        }
                        if (this.charts[key].chart.options.scales.y) {
                            this.charts[key].chart.options.scales.y.min = undefined;
                            this.charts[key].chart.options.scales.y.max = undefined;
                        }
                    }
                    this.charts[key].chart.update('none');
                }
                const wrapper = document.getElementById(this.charts[key].wrapperId);
                if (wrapper) wrapper.style.display = 'none';
            });
            if (this.deltaChart) {
                this.deltaChart.data.labels = [];
                this.deltaChart.data.datasets[0].data = [];
                this.deltaChart.update('none');
            }
            const dw = document.getElementById('chart-wrapper-delta');
            if (dw) dw.style.display = 'none';
            return;
        }

        try {
            this.updateStatus('Loading laps...', 'loading');
            const laps = await this.apiClient.getSessionLaps(sessionId);
            this.sessionLaps = laps;
            this.populateReferenceLapDropdown(laps);

            lapSelect.innerHTML = '<option value="">All laps</option>';
            laps.forEach(lap => {
                const option = document.createElement('option');
                option.value = lap.lap_number;
                option.textContent = `Lap ${lap.lap_number}${lap.lap_time ? ` (${lap.lap_time.toFixed(2)}s)` : ''}`;
                lapSelect.appendChild(option);
            });
            
            lapSelect.disabled = false;
            
            // Reset currentLap when session changes (lap select is repopulated)
            this.currentLap = null;
            
            // Load all session data to calculate statistics
            await this.loadSessionStats(sessionId);
            
            this.updateStatus('Ready', 'ready');
        } catch (error) {
            console.error('Error loading laps:', error);
            this.updateStatus('Error loading laps', 'error');
            this.updateSessionStats(null);
        }
    }
    
    async loadSessionStats(sessionId) {
        if (!sessionId) {
            this.updateSessionStats(null);
            return;
        }
        
        try {
            // Load all session data (no lap filter) to calculate statistics
            const allData = await this.apiClient.getTelemetryData(sessionId, null, 100000);
            this.calculateAndUpdateSessionStats(allData);
        } catch (error) {
            console.error('Error loading session stats:', error);
            this.updateSessionStats(null);
        }
    }
    
    calculateAndUpdateSessionStats(data) {
        if (!data || data.length === 0) {
            this.updateSessionStats(null);
            return;
        }
        
        let maxSpeed = { value: -Infinity, lap: null };
        let maxAccel = { value: -Infinity, lap: null }; // Max positive longitudinal_g
        let maxDecel = { value: Infinity, lap: null }; // Most negative longitudinal_g (deceleration)
        let maxGLeft = { value: Infinity, lap: null }; // Most negative lateral_g (left)
        let maxGRight = { value: -Infinity, lap: null }; // Most positive lateral_g (right)
        
        data.forEach((record) => {
            const vd = record.vehicle_dynamics || {};
            const speed = vd.speed || 0;
            const lateralG = vd.lateral_g || 0;
            const longitudinalG = vd.longitudinal_g || 0;
            const lapNumber = record.lap_number;
            
            // Max Speed
            if (speed > maxSpeed.value) {
                maxSpeed.value = speed;
                maxSpeed.lap = lapNumber;
            }
            
            // Max Acceleration (positive longitudinal_g)
            if (longitudinalG > maxAccel.value) {
                maxAccel.value = longitudinalG;
                maxAccel.lap = lapNumber;
            }
            
            // Max Deceleration (negative longitudinal_g, most negative)
            if (longitudinalG < maxDecel.value) {
                maxDecel.value = longitudinalG;
                maxDecel.lap = lapNumber;
            }
            
            // Max G Left (negative lateral_g)
            if (lateralG < maxGLeft.value) {
                maxGLeft.value = lateralG;
                maxGLeft.lap = lapNumber;
            }
            
            // Max G Right (positive lateral_g)
            if (lateralG > maxGRight.value) {
                maxGRight.value = lateralG;
                maxGRight.lap = lapNumber;
            }
        });
        
        // Update the display
        this.updateSessionStats({
            maxSpeed: maxSpeed.value !== -Infinity ? maxSpeed : null,
            maxAccel: maxAccel.value !== -Infinity ? maxAccel : null,
            maxDecel: maxDecel.value !== Infinity ? maxDecel : null,
            maxGLeft: maxGLeft.value !== Infinity ? maxGLeft : null,
            maxGRight: maxGRight.value !== -Infinity ? maxGRight : null
        });
    }
    
    updateSessionStats(stats) {
        const formatSpeed = (value) => value !== null ? `${value.toFixed(1)} km/h` : '-';
        const formatG = (value) => value !== null ? `${value.toFixed(2)}g` : '-';
        const formatLap = (lap) => lap !== null ? `Lap ${lap}` : '';
        
        if (!stats) {
            // Clear all stats
            document.getElementById('stat-max-speed').textContent = '-';
            document.getElementById('stat-max-speed-lap').textContent = '';
            document.getElementById('stat-max-accel').textContent = '-';
            document.getElementById('stat-max-accel-lap').textContent = '';
            document.getElementById('stat-max-decel').textContent = '-';
            document.getElementById('stat-max-decel-lap').textContent = '';
            document.getElementById('stat-max-g-left').textContent = '-';
            document.getElementById('stat-max-g-left-lap').textContent = '';
            document.getElementById('stat-max-g-right').textContent = '-';
            document.getElementById('stat-max-g-right-lap').textContent = '';
            const lapDeltaRow = document.getElementById('lap-delta-stats-row');
            if (lapDeltaRow) lapDeltaRow.style.display = 'none';
            return;
        }
        
        // Update Max Speed
        if (stats.maxSpeed) {
            document.getElementById('stat-max-speed').textContent = formatSpeed(stats.maxSpeed.value);
            document.getElementById('stat-max-speed-lap').textContent = formatLap(stats.maxSpeed.lap);
        } else {
            document.getElementById('stat-max-speed').textContent = '-';
            document.getElementById('stat-max-speed-lap').textContent = '';
        }
        
        // Update Max Acceleration
        if (stats.maxAccel) {
            document.getElementById('stat-max-accel').textContent = formatG(stats.maxAccel.value);
            document.getElementById('stat-max-accel-lap').textContent = formatLap(stats.maxAccel.lap);
        } else {
            document.getElementById('stat-max-accel').textContent = '-';
            document.getElementById('stat-max-accel-lap').textContent = '';
        }
        
        // Update Max Deceleration
        if (stats.maxDecel) {
            document.getElementById('stat-max-decel').textContent = formatG(stats.maxDecel.value);
            document.getElementById('stat-max-decel-lap').textContent = formatLap(stats.maxDecel.lap);
        } else {
            document.getElementById('stat-max-decel').textContent = '-';
            document.getElementById('stat-max-decel-lap').textContent = '';
        }
        
        // Update Max G Left (invert value for display - show as positive)
        if (stats.maxGLeft) {
            // Invert the value for display (negative becomes positive)
            const invertedValue = -stats.maxGLeft.value;
            document.getElementById('stat-max-g-left').textContent = formatG(invertedValue);
            document.getElementById('stat-max-g-left-lap').textContent = formatLap(stats.maxGLeft.lap);
        } else {
            document.getElementById('stat-max-g-left').textContent = '-';
            document.getElementById('stat-max-g-left-lap').textContent = '';
        }
        
        // Update Max G Right
        if (stats.maxGRight) {
            document.getElementById('stat-max-g-right').textContent = formatG(stats.maxGRight.value);
            document.getElementById('stat-max-g-right-lap').textContent = formatLap(stats.maxGRight.lap);
        } else {
            document.getElementById('stat-max-g-right').textContent = '-';
            document.getElementById('stat-max-g-right-lap').textContent = '';
        }
    }

    async loadTelemetryData() {
        if (!this.currentSession) {
            alert('Please select a session first');
            return;
        }

        try {
            this.updateStatus('Loading data...', 'loading');

            // Check cache first
            const cacheKey = `${this.currentSession}_${this.currentLap !== null ? this.currentLap : 'all'}`;
            const isCached = await this.cacheManager.isCached(this.currentSession, this.currentLap);
            
            let data;
            if (isCached) {
                console.log('Loading from cache');
                data = await this.cacheManager.getCachedTelemetryData(this.currentSession, this.currentLap);
            } else {
                console.log('Loading from API');
                data = await this.apiClient.getTelemetryData(this.currentSession, this.currentLap);
                await this.cacheManager.cacheTelemetryData(this.currentSession, this.currentLap, data);
            }

            // Calculate distances
            const dataWithDistance = DistanceCalculator.calculateCumulativeDistance(data);
            this.currentData = dataWithDistance;
            
            console.log(`Loaded ${data.length} records, after distance calculation: ${this.currentData.length} records`);

            this.updateChart();
            if (this.currentLap !== null) {
                await this.updateLapDeltaVisualization();
            } else {
                this.clearLapDeltaDisplay();
            }

            this.updateGgChart();
            this.updateStatus('Data loaded', 'ready');
        } catch (error) {
            console.error('Error loading telemetry data:', error);
            this.updateStatus('Error loading data', 'error');
            alert('Failed to load telemetry data: ' + error.message);
        }
    }

    updateMap() {
        if (!this.currentData || this.currentData.length === 0) {
            return;
        }

        // Remove existing polyline(s)
        if (this.trackPolyline) {
            this.map.removeLayer(this.trackPolyline);
            this.trackPolyline = null;
        }
        if (this.trackPolylineDeltaGroup) {
            this.map.removeLayer(this.trackPolylineDeltaGroup);
            this.trackPolylineDeltaGroup = null;
        }

        const hasDelta =
            this.lapDeltaResult &&
            this.lapDeltaResult.segmentDeltas &&
            this.lapDeltaResult.segmentDeltas.length > 0;

        let deltaSegmentsDrawn = 0;
        if (hasDelta) {
            this.trackPolylineDeltaGroup = L.featureGroup();
            const segs = this.lapDeltaResult.segmentDeltas;
            for (let i = 0; i < this.currentData.length - 1; i++) {
                const a = this.currentData[i];
                const b = this.currentData[i + 1];
                if (
                    !a.location ||
                    !b.location ||
                    a.location.latitude == null ||
                    b.location.latitude == null
                ) {
                    continue;
                }
                const d = segs[i] != null ? segs[i] : 0;
                const color = LapDeltaCalculator.deltaToColor(d);
                L.polyline(
                    [
                        [a.location.latitude, a.location.longitude],
                        [b.location.latitude, b.location.longitude],
                    ],
                    { color, weight: 4, opacity: 0.92 }
                ).addTo(this.trackPolylineDeltaGroup);
                deltaSegmentsDrawn++;
            }
            this.trackPolylineDeltaGroup.addTo(this.map);
            if (deltaSegmentsDrawn > 0) {
                this.map.fitBounds(this.trackPolylineDeltaGroup.getBounds(), { padding: [20, 20] });
            } else {
                this.map.removeLayer(this.trackPolylineDeltaGroup);
                this.trackPolylineDeltaGroup = null;
            }
        }

        if (!hasDelta || deltaSegmentsDrawn === 0) {
            const coordinates = this.currentData
                .filter((record) => record.location && record.location.latitude && record.location.longitude)
                .map((record) => [record.location.latitude, record.location.longitude]);

            if (coordinates.length === 0) {
                return;
            }

            this.trackPolyline = L.polyline(coordinates, {
                color: '#4a90e2',
                weight: 3,
                opacity: 0.8,
            }).addTo(this.map);

            this.map.fitBounds(this.trackPolyline.getBounds(), { padding: [20, 20] });
        }

        if (this.startMarker) {
            this.map.removeLayer(this.startMarker);
            this.startMarker = null;
        }

        const first = this.currentData.find(
            (r) => r.location && r.location.latitude != null && r.location.longitude != null
        );
        if (first) {
            this.startMarker = L.marker([first.location.latitude, first.location.longitude], {
                icon: L.divIcon({
                    className: 'start-marker',
                    html: '<div style="background-color: green; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                    iconSize: [12, 12],
                }),
            }).addTo(this.map);
        }
    }

    highlightMapPoint(dataIndex) {
        if (!this.currentData || dataIndex < 0 || dataIndex >= this.currentData.length) {
            return;
        }

        // Get GPS coordinate from X indices ahead to compensate for GPS delay
        // GPS data is behind sensor data, so we look ahead to find the GPS coordinate
        // that corresponds to where the car actually is based on sensor data
        const targetIndex = dataIndex + this.gpsOffset;
        
        // Clamp to valid range
        const clampedIndex = Math.min(targetIndex, this.currentData.length - 1);
        const record = this.currentData[clampedIndex];
        
        let lat, lng;
        
        if (!record.location || !record.location.latitude || !record.location.longitude) {
            // If the offset record doesn't have GPS, fall back to original index
            const fallbackRecord = this.currentData[dataIndex];
            if (!fallbackRecord.location || !fallbackRecord.location.latitude || !fallbackRecord.location.longitude) {
                return;
            }
            lat = fallbackRecord.location.latitude;
            lng = fallbackRecord.location.longitude;
        } else {
            lat = record.location.latitude;
            lng = record.location.longitude;
        }

        // Remove existing hover marker
        this.clearMapHighlight();

        // Create hover marker
        this.hoverMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'hover-marker',
                html: '<div style="background-color: #ff6b6b; width: 10px; height: 10px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(255, 107, 107, 0.8);"></div>',
                iconSize: [10, 10],
                iconAnchor: [5, 5]
            }),
            zIndexOffset: 1000
        }).addTo(this.map);

        // Pan map to show the point if it's not visible
        const bounds = this.map.getBounds();
        if (!bounds.contains([lat, lng])) {
            this.map.setView([lat, lng], this.map.getZoom(), {
                animate: true,
                duration: 0.3
            });
        }
    }

    clearMapHighlight() {
        if (this.hoverMarker) {
            this.map.removeLayer(this.hoverMarker);
            this.hoverMarker = null;
        }
    }

    /**
     * True if chart has dataset 0 with a point at dataIndex.
     * Lap delta chart often has fewer points than telemetry charts; out-of-range
     * setActiveElements causes Chart.js to throw (e.g. reading .active on undefined).
     */
    _chartHasDataIndex(chart, dataIndex) {
        if (!chart || dataIndex == null || dataIndex < 0) return false;
        const ds0 = chart.data?.datasets?.[0];
        const len = ds0?.data?.length;
        return typeof len === 'number' && dataIndex < len;
    }

    /** Sync hover highlight to other charts (and delta) only where index exists. */
    highlightSyncedCharts(dataIndex, sourceChart) {
        Object.keys(this.charts).forEach((key) => {
            const c = this.charts[key]?.chart;
            if (!c || c === sourceChart || !this._chartHasDataIndex(c, dataIndex)) return;
            c.setActiveElements([{ datasetIndex: 0, index: dataIndex }]);
            c.update('none');
        });
        if (
            this.deltaChart &&
            this.deltaChart !== sourceChart &&
            this._chartHasDataIndex(this.deltaChart, dataIndex)
        ) {
            this.deltaChart.setActiveElements([{ datasetIndex: 0, index: dataIndex }]);
            this.deltaChart.update('none');
        }
    }

    clearAllChartHoverHighlights() {
        Object.keys(this.charts).forEach((key) => {
            const c = this.charts[key]?.chart;
            if (!c) return;
            c.setActiveElements([]);
            c.update('none');
        });
        if (this.deltaChart) {
            this.deltaChart.setActiveElements([]);
            this.deltaChart.update('none');
        }
    }

    updateChart() {
        // Reset hover state so Chart.js plugins do not reference stale element refs after dataset changes
        this.clearAllChartHoverHighlights();

        if (!this.currentData || this.currentData.length === 0) {
            // Clear all charts and hide wrappers
            Object.keys(this.charts).forEach(key => {
                if (this.charts[key].chart) {
                    this.charts[key].chart.data.labels = [];
                    this.charts[key].chart.data.datasets = [];
                    this.charts[key].chart.update('none');
                }
                const wrapper = document.getElementById(this.charts[key].wrapperId);
                if (wrapper) wrapper.style.display = 'none';
            });
            if (this.deltaChart && this.deltaChart.data.datasets[0]) {
                this.deltaChart.data.labels = [];
                this.deltaChart.data.datasets[0].data = [];
                this.deltaChart.update('none');
            }
            const dw = document.getElementById('chart-wrapper-delta');
            if (dw) dw.style.display = 'none';
            this.updateGgChart();
            return;
        }

        // Convert distance to kilometers
        const distances = this.currentData.map(d => DistanceCalculator.metersToKilometers(d.distance || 0));
        
        // Helper function to get value from record
        const getValue = (record, dataKey, category) => {
            if (category === 'vehicle_dynamics') {
                return record.vehicle_dynamics?.[dataKey] ?? null;
            } else if (category === 'powertrain') {
                return record.powertrain?.[dataKey] ?? null;
            } else if (category === 'suspension') {
                return record.suspension?.[dataKey] ?? null;
            } else if (category === 'wheels') {
                return record.wheels?.[dataKey] ?? null;
            } else if (category === 'environment') {
                return record.environment?.[dataKey] ?? null;
            }
            return null;
        };
        
        // Update each chart group
        Object.keys(this.charts).forEach(groupKey => {
            const chartGroup = this.charts[groupKey];
            const datasets = [];
            
            // Find which metrics in this group are selected
            chartGroup.metrics.forEach(metric => {
                if (this.selectedMetrics.has(metric.key)) {
                    const dataKey = metric.dataKey || metric.key;
                    // Determine category from metric key
                    let category = 'vehicle_dynamics';
                    if (metric.key.startsWith('wheels_')) {
                        category = 'wheels';
                    } else if (metric.key.startsWith('suspension_')) {
                        category = 'suspension';
                    } else if (['engine_rpm', 'throttle_position', 'braking_force', 'gear', 'engine_temperature', 
                                'oil_pressure', 'oil_temperature', 'coolant_temperature', 'turbo_boost_pressure', 
                                'air_intake_temperature', 'fuel_level'].includes(metric.key)) {
                        category = 'powertrain';
                    } else if (['ambient_temperature', 'track_surface_temperature', 'humidity'].includes(metric.key)) {
                        category = 'environment';
                    } else if (['speed', 'yaw', 'roll', 'pitch', 'lateral_g', 'longitudinal_g', 'vertical_g', 'steering_angle'].includes(metric.key)) {
                        category = 'vehicle_dynamics';
                    }
                    
                    const values = this.currentData.map(record => getValue(record, dataKey, category));
                    
                    datasets.push({
                        label: metric.label,
                        data: values,
                        borderColor: metric.color,
                        backgroundColor: metric.color + '40',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.1,
                        pointRadius: 0,
                        pointHoverRadius: 4
                    });
                }
            });
            
            // Show/hide chart wrapper based on whether it has selected metrics
            const wrapper = document.getElementById(chartGroup.wrapperId);
            if (datasets.length > 0) {
                if (wrapper) wrapper.style.display = 'block';
                
                // Ensure we have the same number of labels as data points
                if (distances.length !== this.currentData.length) {
                    console.warn(`Distance array length (${distances.length}) doesn't match data length (${this.currentData.length})`);
                }
                
                // Ensure all datasets have the same length
                datasets.forEach((dataset, idx) => {
                    if (dataset.data.length !== this.currentData.length) {
                        console.warn(`Dataset ${idx} (${dataset.label}) has ${dataset.data.length} points, expected ${this.currentData.length}`);
                    }
                });
                
                chartGroup.chart.data.labels = distances;
                chartGroup.chart.data.datasets = datasets;
                
                // Reset scales to fit all data
                if (chartGroup.chart.options.scales) {
                    if (chartGroup.chart.options.scales.x) {
                        chartGroup.chart.options.scales.x.min = undefined;
                        chartGroup.chart.options.scales.x.max = undefined;
                        // Reset stored scale values
                        chartGroup.chart._lastXMin = undefined;
                        chartGroup.chart._lastXMax = undefined;
                        // Reset stored scale values
                        chartGroup.chart._lastXMin = undefined;
                        chartGroup.chart._lastXMax = undefined;
                    }
                    if (chartGroup.chart.options.scales.y) {
                        chartGroup.chart.options.scales.y.min = undefined;
                        chartGroup.chart.options.scales.y.max = undefined;
                    }
                }
                
                // Force chart to update and show all data
                chartGroup.chart.update('none');
                
                // Log chart data for debugging
                console.log(`Chart ${groupKey}: ${distances.length} labels, ${datasets.length} datasets, first dataset has ${datasets[0]?.data.length || 0} points`);
            } else {
                if (wrapper) wrapper.style.display = 'none';
                chartGroup.chart.data.labels = [];
                chartGroup.chart.data.datasets = [];
                chartGroup.chart.update('none');
            }
        });
    }

    clearMap() {
        // Remove all map elements
        if (this.trackPolyline) {
            this.map.removeLayer(this.trackPolyline);
            this.trackPolyline = null;
        }
        if (this.trackPolylineDeltaGroup) {
            this.map.removeLayer(this.trackPolylineDeltaGroup);
            this.trackPolylineDeltaGroup = null;
        }
        if (this.hoverMarker) {
            this.map.removeLayer(this.hoverMarker);
            this.hoverMarker = null;
        }
        if (this.startMarker) {
            this.map.removeLayer(this.startMarker);
            this.startMarker = null;
        }
    }

    async clearCache() {
        //if (confirm('Are you sure you want to clear all cached data?')) {
            try {
                await this.cacheManager.clearCache();
                // Clear map elements
                this.clearMap();
                // Clear current data and reset charts
                this.currentData = [];
                this.currentSession = null;
                this.currentLap = null;
                
                // Reset session dropdown
                const sessionSelect = document.getElementById('session-select');
                sessionSelect.value = '';
                
                // Reset lap dropdown
                const lapSelect = document.getElementById('lap-select');
                lapSelect.innerHTML = '<option value="">Select a session first</option>';
                lapSelect.disabled = true;
                
                Object.keys(this.charts).forEach(key => {
                    if (this.charts[key].chart) {
                        this.charts[key].chart.data.datasets = [];
                        this.charts[key].chart.data.labels = [];
                        // Reset stored scale values
                        this.charts[key].chart._lastXMin = undefined;
                        this.charts[key].chart._lastXMax = undefined;
                        this.charts[key].chart.update('none');
                    }
                    const wrapper = document.getElementById(this.charts[key].wrapperId);
                    if (wrapper) wrapper.style.display = 'none';
                });
                this.sessionLaps = [];
                const refSel = document.getElementById('reference-lap-select');
                if (refSel) {
                    refSel.innerHTML = '<option value="">—</option>';
                    refSel.disabled = true;
                }
                document.getElementById('reference-lap-group').style.display = 'none';
                this.clearLapDeltaDisplay();
                this.updateGgChart();
                this.updateStatus('Cache cleared', 'ready');
                await this.loadSessions(true); // Force refresh after clearing cache
            } catch (error) {
                console.error('Error clearing cache:', error);
                this.updateStatus('Error clearing cache', 'error');
            }
        //}
    }

    updateStatus(message, type = 'ready') {
        const statusIndicator = document.getElementById('status');
        const statusText = statusIndicator.querySelector('.status-text');
        
        statusIndicator.className = `status-indicator ${type}`;
        statusText.textContent = message;
    }

    async loadRacingLineTracks() {
        try {
            const tracks = await this.apiClient.getTracks();
            const select = document.getElementById('racing-line-track-select');
            select.innerHTML = '<option value="">None</option>';
            
            tracks.forEach(track => {
                const option = document.createElement('option');
                option.value = track.track_id;
                option.textContent = track.name;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading tracks for racing line:', error);
        }
    }

    async loadRacingLineCarProfiles() {
        try {
            const profiles = await this.apiClient.getCarProfiles();
            const select = document.getElementById('racing-line-profile-select');
            select.innerHTML = '<option value="">Select Car Profile</option>';
            select.disabled = false;
            
            profiles.forEach(profile => {
                const option = document.createElement('option');
                option.value = profile.profile_id;
                option.textContent = profile.name;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading car profiles for racing line:', error);
        }
    }

    async loadRacingLineOverlay() {
        if (!this.selectedRacingLineTrack || !this.selectedRacingLineProfile) {
            return;
        }

        try {
            // Remove existing overlay
            this.removeRacingLineOverlay();

            // Fetch racing line CSV
            const csvBlob = await this.apiClient.getRacingLineCSV(this.selectedRacingLineTrack, this.selectedRacingLineProfile);
            const csvText = await csvBlob.text();
            
            // Parse CSV
            const lines = csvText.split('\n').filter(line => line.trim() && !line.startsWith('x_m'));
            const racingLinePoints = [];
            
            for (const line of lines) {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const x = parseFloat(parts[0]);
                    const y = parseFloat(parts[1]);
                    if (!isNaN(x) && !isNaN(y)) {
                        racingLinePoints.push({ x_m: x, y_m: y });
                    }
                }
            }

            if (racingLinePoints.length === 0) {
                console.warn('No racing line points found in CSV');
                return;
            }

            // Get track to access anchor
            const tracks = await this.apiClient.getTracks();
            const track = tracks.find(t => t.track_id === this.selectedRacingLineTrack);
            
            if (!track || !track.anchor) {
                console.error('Track not found or missing anchor');
                return;
            }

            // Convert racing line coordinates to GPS
            const gpsPoints = this.convertRacingLineToGPS(racingLinePoints, track.anchor);

            // Add overlay to map
            if (this.map && gpsPoints.length > 0) {
                const coordinates = gpsPoints.map(p => [p.lat, p.lng]);
                this.racingLinePolyline = L.polyline(coordinates, {
                    color: '#ff0000',
                    weight: 4,
                    opacity: 0.8,
                    dashArray: '10, 5'
                }).addTo(this.map);
            }
        } catch (error) {
            console.error('Error loading racing line overlay:', error);
            this.updateStatus('Error loading racing line', 'error');
        }
    }

    convertRacingLineToGPS(racingLinePoints, anchor) {
        // Convert racing line X, Y coordinates to GPS using track anchor
        const gpsPoints = [];

        for (const point of racingLinePoints) {
            // Calculate offset from anchor in meters
            const dx = point.x_m - anchor.x_m;
            const dy = point.y_m - anchor.y_m;

            // Rotate by heading
            const headingRad = (anchor.heading * Math.PI) / 180;
            const rotatedX = dx * Math.cos(headingRad) - dy * Math.sin(headingRad);
            const rotatedY = dx * Math.sin(headingRad) + dy * Math.cos(headingRad);

            // Convert to GPS (simplified - assumes small distances)
            const latOffset = rotatedY / 111320; // meters per degree latitude
            const lngOffset = rotatedX / (111320 * Math.cos(anchor.latitude * Math.PI / 180));

            gpsPoints.push({
                lat: anchor.latitude + latOffset,
                lng: anchor.longitude + lngOffset
            });
        }

        return gpsPoints;
    }

    removeRacingLineOverlay() {
        if (this.racingLinePolyline) {
            this.map.removeLayer(this.racingLinePolyline);
            this.racingLinePolyline = null;
        }
    }
}

// Auth and app bootstrap
function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
}

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
}

function setupLoginHandlers(app) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginError = document.getElementById('login-error');
    const registerError = document.getElementById('register-error');
    const registerSection = document.getElementById('register-section');

    app.apiClient.onUnauthorized = () => {
        showLoginScreen();
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.style.display = 'none';
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        try {
            await app.apiClient.login(username, password);
            showApp();
            await app.init();
            setupLogoutHandler(app);
        } catch (err) {
            loginError.textContent = err.message || 'Login failed';
            loginError.style.display = 'block';
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.style.display = 'none';
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value;
        try {
            await app.apiClient.register(username, password);
            registerSection.style.display = 'none';
            showApp();
            await app.init();
            setupLogoutHandler(app);
        } catch (err) {
            if (err.message && err.message.includes('disabled')) {
                registerSection.style.display = 'none';
                loginError.textContent = 'Registration is closed. Please sign in.';
                loginError.style.display = 'block';
            } else {
                registerError.textContent = err.message || 'Registration failed';
                registerError.style.display = 'block';
            }
        }
    });
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    const app = new RacingDataApp();
    window.racingApp = app;

    // Auth check
    const token = app.apiClient.getToken();
    if (token) {
        try {
            const user = await app.apiClient.getMe();
            if (user) {
                showApp();
                await app.init();
                setupLogoutHandler(app);
                return;
            }
        } catch (e) {
            app.apiClient.clearToken();
        }
    }

    showLoginScreen();
    setupLoginHandlers(app);

    // Show register section only when no users exist yet
    const regOpen = await app.apiClient.isRegistrationOpen();
    const registerSection = document.getElementById('register-section');
    if (registerSection) {
        registerSection.style.display = regOpen ? 'block' : 'none';
    }
});

function setupLogoutHandler(app) {
    const btn = document.getElementById('logout-btn');
    if (!btn) return;
    btn.onclick = (e) => {
        e.preventDefault();
        app.apiClient.clearToken();
        showLoginScreen();
        document.getElementById('login-password').value = '';
        document.getElementById('login-error').style.display = 'none';
    };
}

