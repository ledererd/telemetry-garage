/**
 * Tracks management module
 */

class TracksManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.tracks = [];
        this.selectedTrack = null;
        this.weatherData = null;
    }

    async init() {
        await this.loadTracks();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('add-track-btn').addEventListener('click', () => {
            this.showAddTrackForm();
        });

        document.getElementById('upload-track-btn').addEventListener('click', () => {
            this.showUploadForm();
        });
    }

    async loadTracks() {
        try {
            this.tracks = await this.apiClient.getTracks();
            this.renderTracksList();
        } catch (error) {
            console.error('Error loading tracks:', error);
            this.showError('Failed to load tracks');
        }
    }

    renderTracksList() {
        const list = document.getElementById('tracks-list');
        list.innerHTML = '';

        if (this.tracks.length === 0) {
            list.innerHTML = '<div class="empty-state">No tracks found. Click "Add Track" to create one.</div>';
            return;
        }

        this.tracks.forEach(track => {
            const item = document.createElement('div');
            item.className = 'track-item';
            if (this.selectedTrack && this.selectedTrack.track_id === track.track_id) {
                item.classList.add('active');
            }

            item.innerHTML = `
                <div class="track-item-content">
                    <div class="track-item-name">${track.name}</div>
                    <div class="track-item-id">ID: ${track.track_id}</div>
                </div>
                <div class="track-item-actions">
                    <button class="btn-icon edit-track" data-track-id="${track.track_id}" title="Edit">✏️</button>
                    <button class="btn-icon delete-track" data-track-id="${track.track_id}" title="Delete">🗑️</button>
                </div>
            `;

            item.addEventListener('click', (e) => {
                if (!e.target.closest('.track-item-actions')) {
                    this.selectTrack(track.track_id);
                }
            });

            item.querySelector('.edit-track').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showEditTrackForm(track);
            });

            item.querySelector('.delete-track').addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTrack(track.track_id);
            });

            list.appendChild(item);
        });
    }

    async selectTrack(trackId) {
        const track = this.tracks.find(t => t.track_id === trackId);
        if (!track) return;

        this.selectedTrack = track;
        this.renderTracksList();
        await this.showTrackDetails(track);
    }

    async showTrackDetails(track) {
        const panel = document.getElementById('track-details-panel');
        
        // Load weather data
        await this.loadWeather(track.track_id);

        panel.innerHTML = `
            <div class="track-details">
                <div class="track-details-header">
                    <h2>${track.name}</h2>
                    <div class="track-id-badge">${track.track_id}</div>
                </div>

                <div class="track-details-section">
                    <h3>GPS Anchor</h3>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <label>Latitude:</label>
                            <span>${track.anchor.latitude.toFixed(6)}°</span>
                        </div>
                        <div class="detail-item">
                            <label>Longitude:</label>
                            <span>${track.anchor.longitude.toFixed(6)}°</span>
                        </div>
                        <div class="detail-item">
                            <label>Anchor X:</label>
                            <span>${track.anchor.x_m.toFixed(6)} m</span>
                        </div>
                        <div class="detail-item">
                            <label>Anchor Y:</label>
                            <span>${track.anchor.y_m.toFixed(6)} m</span>
                        </div>
                        <div class="detail-item">
                            <label>Heading:</label>
                            <span>${track.anchor.heading.toFixed(2)}°</span>
                        </div>
                    </div>
                </div>

                <div class="track-details-section">
                    <h3>Track Points</h3>
                    <div class="track-stats">
                        <div class="stat">
                            <span class="stat-value">${track.points.length}</span>
                            <span class="stat-label">Points</span>
                        </div>
                    </div>
                    <div id="track-map" class="track-map"></div>
                </div>

                <div class="track-details-section">
                    <h3>Weather</h3>
                    <div id="weather-info" class="weather-info">
                        ${this.renderWeather()}
                    </div>
                </div>
            </div>
        `;

        // Initialize map
        this.initTrackMap(track);
    }

    async loadWeather(trackId) {
        try {
            this.weatherData = await this.apiClient.getTrackWeather(trackId);
        } catch (error) {
            console.error('Error loading weather:', error);
            this.weatherData = { available: false, error: 'Failed to load weather data' };
        }
    }

    renderWeather() {
        if (!this.weatherData) {
            return '<div class="weather-loading">Loading weather...</div>';
        }

        if (!this.weatherData.available) {
            return `
                <div class="weather-unavailable">
                    <p>Weather data unavailable</p>
                    ${this.weatherData.error ? `<p class="weather-error">${this.weatherData.error}</p>` : ''}
                </div>
            `;
        }

        const windDir = this.getWindDirection(this.weatherData.wind_direction);
        
        return `
            <div class="weather-grid">
                <div class="weather-item">
                    <div class="weather-label">Temperature</div>
                    <div class="weather-value">${this.weatherData.temperature?.toFixed(1) || 'N/A'}°C</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Wind Direction</div>
                    <div class="weather-value">${windDir}</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Wind Speed</div>
                    <div class="weather-value">${this.weatherData.wind_speed?.toFixed(1) || 'N/A'} m/s</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Description</div>
                    <div class="weather-value">${this.weatherData.description || 'N/A'}</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Humidity</div>
                    <div class="weather-value">${this.weatherData.humidity || 'N/A'}%</div>
                </div>
                <div class="weather-item">
                    <div class="weather-label">Pressure</div>
                    <div class="weather-value">${this.weatherData.pressure || 'N/A'} hPa</div>
                </div>
            </div>
        `;
    }

    getWindDirection(degrees) {
        if (degrees === null || degrees === undefined) return 'N/A';
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return `${directions[index]} (${degrees.toFixed(0)}°)`;
    }

    initTrackMap(track) {
        const mapContainer = document.getElementById('track-map');
        if (!mapContainer) return;

        // Convert track points to GPS coordinates
        const gpsPoints = this.convertTrackToGPS(track);
        
        if (gpsPoints.length === 0) {
            mapContainer.innerHTML = '<p>Unable to display track on map</p>';
            return;
        }

        const map = L.map(mapContainer).setView([track.anchor.latitude, track.anchor.longitude], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // Draw centerline
        const centerline = gpsPoints.map(p => [p.lat, p.lng]);
        L.polyline(centerline, { color: '#4a90e2', weight: 3 }).addTo(map);

        // Draw track width (simplified - showing approximate width)
        // For full implementation, would need to calculate left/right edges
        gpsPoints.forEach((point, index) => {
            if (index < gpsPoints.length - 1) {
                const nextPoint = gpsPoints[index + 1];
                const trackPoint = track.points[index];
                const width = (trackPoint.w_tr_left_m + trackPoint.w_tr_right_m) / 2;
                
                // Simplified visualization - draw perpendicular lines
                const bearing = this.calculateBearing(point.lat, point.lng, nextPoint.lat, nextPoint.lng);
                const leftPoint = this.destinationPoint(point.lat, point.lng, bearing - 90, width / 2);
                const rightPoint = this.destinationPoint(point.lat, point.lng, bearing + 90, width / 2);
                
                L.polyline([[leftPoint.lat, leftPoint.lng], [rightPoint.lat, rightPoint.lng]], {
                    color: '#888',
                    weight: 1,
                    opacity: 0.5
                }).addTo(map);
            }
        });

        // Add anchor marker
        L.marker([track.anchor.latitude, track.anchor.longitude], {
            icon: L.divIcon({
                className: 'anchor-marker',
                html: '<div style="background-color: green; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [12, 12]
            })
        }).addTo(map);

        map.fitBounds(centerline, { padding: [20, 20] });
    }

    convertTrackToGPS(track) {
        // Convert track coordinates (meters) to GPS coordinates
        // Using simple translation and rotation based on anchor
        const anchor = track.anchor;
        const gpsPoints = [];

        track.points.forEach(point => {
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
        });

        return gpsPoints;
    }

    calculateBearing(lat1, lng1, lat2, lng2) {
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;
        
        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
        
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    }

    destinationPoint(lat, lng, bearing, distance) {
        const R = 6371000; // Earth radius in meters
        const latRad = lat * Math.PI / 180;
        const bearingRad = bearing * Math.PI / 180;
        
        const newLat = Math.asin(
            Math.sin(latRad) * Math.cos(distance / R) +
            Math.cos(latRad) * Math.sin(distance / R) * Math.cos(bearingRad)
        );
        
        const newLng = lng + Math.atan2(
            Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(latRad),
            Math.cos(distance / R) - Math.sin(latRad) * Math.sin(newLat)
        ) * 180 / Math.PI;
        
        return { lat: newLat * 180 / Math.PI, lng: newLng };
    }

    showAddTrackForm() {
        this.showTrackForm();
    }

    showEditTrackForm(track) {
        this.showTrackForm(track);
    }

    showTrackForm(track = null) {
        const panel = document.getElementById('track-details-panel');
        const isEdit = track !== null;

        panel.innerHTML = `
            <div class="track-form">
                <h2>${isEdit ? 'Edit Track' : 'Add New Track'}</h2>
                <form id="track-form">
                    <div class="form-group">
                        <label for="track-id">Track ID *</label>
                        <input type="text" id="track-id" name="track_id" value="${track?.track_id || ''}" 
                               ${isEdit ? 'readonly' : ''} required>
                        <small>Unique identifier (e.g., phillip_island)</small>
                    </div>

                    <div class="form-group">
                        <label for="track-name">Track Name *</label>
                        <input type="text" id="track-name" name="name" value="${track?.name || ''}" required>
                    </div>

                    <h3>GPS Anchor</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="anchor-lat">Latitude *</label>
                            <input type="number" id="anchor-lat" name="anchor_latitude" 
                                   value="${track?.anchor.latitude || ''}" step="0.000001" required>
                        </div>
                        <div class="form-group">
                            <label for="anchor-lng">Longitude *</label>
                            <input type="number" id="anchor-lng" name="anchor_longitude" 
                                   value="${track?.anchor.longitude || ''}" step="0.000001" required>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="anchor-x">Anchor X (m) *</label>
                            <input type="number" id="anchor-x" name="anchor_x_m" 
                                   value="${track?.anchor.x_m || '0'}" step="0.000001" required>
                        </div>
                        <div class="form-group">
                            <label for="anchor-y">Anchor Y (m) *</label>
                            <input type="number" id="anchor-y" name="anchor_y_m" 
                                   value="${track?.anchor.y_m || '0'}" step="0.000001" required>
                        </div>
                        <div class="form-group">
                            <label for="anchor-heading">Heading (deg) *</label>
                            <input type="number" id="anchor-heading" name="anchor_heading" 
                                   value="${track?.anchor.heading || '0'}" step="0.01" required>
                        </div>
                    </div>

                    <h3>Track Points</h3>
                    <div id="track-points-editor">
                        <div class="points-header">
                            <span>Points: <span id="points-count">${track?.points.length || 0}</span></span>
                            <button type="button" id="add-point-btn" class="btn-secondary">+ Add Point</button>
                        </div>
                        <div id="points-list" class="points-list">
                            ${this.renderPointsEditor(track?.points || [])}
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn-secondary" id="cancel-form-btn">Cancel</button>
                        <button type="submit" class="btn-primary">${isEdit ? 'Update' : 'Create'} Track</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('track-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTrack(track);
        });

        document.getElementById('cancel-form-btn').addEventListener('click', () => {
            if (track) {
                this.showTrackDetails(track);
            } else {
                panel.innerHTML = '<div class="track-details-placeholder"><p>Select a track to view details</p></div>';
            }
        });

        document.getElementById('add-point-btn').addEventListener('click', () => {
            this.addPointEditor();
        });

        // Setup point deletion
        document.querySelectorAll('.delete-point').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.closest('.point-editor').dataset.index);
                this.removePoint(index);
            });
        });
    }

    renderPointsEditor(points) {
        if (points.length === 0) {
            return '<div class="empty-points">No points. Click "Add Point" to add track points.</div>';
        }

        return points.map((point, index) => `
            <div class="point-editor" data-index="${index}">
                <div class="point-header">
                    <span>Point ${index + 1}</span>
                    <button type="button" class="delete-point">×</button>
                </div>
                <div class="point-fields">
                    <input type="number" name="x_m" value="${point.x_m}" step="0.000001" placeholder="X (m)" required>
                    <input type="number" name="y_m" value="${point.y_m}" step="0.000001" placeholder="Y (m)" required>
                    <input type="number" name="w_tr_left_m" value="${point.w_tr_left_m}" step="0.01" placeholder="Width Left (m)" required>
                    <input type="number" name="w_tr_right_m" value="${point.w_tr_right_m}" step="0.01" placeholder="Width Right (m)" required>
                </div>
            </div>
        `).join('');
    }

    addPointEditor() {
        const list = document.getElementById('points-list');
        const index = list.children.length;
        const pointDiv = document.createElement('div');
        pointDiv.className = 'point-editor';
        pointDiv.dataset.index = index;
        pointDiv.innerHTML = `
            <div class="point-header">
                <span>Point ${index + 1}</span>
                <button type="button" class="delete-point">×</button>
            </div>
            <div class="point-fields">
                <input type="number" name="x_m" value="0" step="0.000001" placeholder="X (m)" required>
                <input type="number" name="y_m" value="0" step="0.000001" placeholder="Y (m)" required>
                <input type="number" name="w_tr_left_m" value="12" step="0.01" placeholder="Width Left (m)" required>
                <input type="number" name="w_tr_right_m" value="12" step="0.01" placeholder="Width Right (m)" required>
            </div>
        `;
        pointDiv.querySelector('.delete-point').addEventListener('click', () => {
            this.removePoint(index);
        });
        list.appendChild(pointDiv);
        this.updatePointsCount();
    }

    removePoint(index) {
        const list = document.getElementById('points-list');
        const point = list.querySelector(`[data-index="${index}"]`);
        if (point) {
            point.remove();
            // Re-index remaining points
            Array.from(list.children).forEach((child, i) => {
                child.dataset.index = i;
                child.querySelector('.point-header span').textContent = `Point ${i + 1}`;
            });
            this.updatePointsCount();
        }
    }

    updatePointsCount() {
        const count = document.getElementById('points-list').children.length;
        document.getElementById('points-count').textContent = count;
    }

    async saveTrack(existingTrack) {
        const form = document.getElementById('track-form');
        const formData = new FormData(form);

        const points = [];
        const pointEditors = document.querySelectorAll('.point-editor');
        pointEditors.forEach(editor => {
            const inputs = editor.querySelectorAll('input');
            points.push({
                x_m: parseFloat(inputs[0].value),
                y_m: parseFloat(inputs[1].value),
                w_tr_left_m: parseFloat(inputs[2].value),
                w_tr_right_m: parseFloat(inputs[3].value)
            });
        });

        if (points.length < 2) {
            alert('Track must have at least 2 points');
            return;
        }

        const trackData = {
            track_id: formData.get('track_id'),
            name: formData.get('name'),
            anchor: {
                latitude: parseFloat(formData.get('anchor_latitude')),
                longitude: parseFloat(formData.get('anchor_longitude')),
                x_m: parseFloat(formData.get('anchor_x_m')),
                y_m: parseFloat(formData.get('anchor_y_m')),
                heading: parseFloat(formData.get('anchor_heading'))
            },
            points: points
        };

        try {
            if (existingTrack) {
                // Update
                const updateData = {
                    name: trackData.name,
                    anchor: trackData.anchor,
                    points: trackData.points
                };
                await this.apiClient.updateTrack(trackData.track_id, updateData);
            } else {
                // Create
                await this.apiClient.createTrack(trackData);
            }

            await this.loadTracks();
            await this.selectTrack(trackData.track_id);
        } catch (error) {
            console.error('Error saving track:', error);
            alert('Failed to save track: ' + error.message);
        }
    }

    async deleteTrack(trackId) {
        if (!confirm(`Are you sure you want to delete track "${trackId}"?`)) {
            return;
        }

        try {
            await this.apiClient.deleteTrack(trackId);

            if (this.selectedTrack && this.selectedTrack.track_id === trackId) {
                this.selectedTrack = null;
                document.getElementById('track-details-panel').innerHTML = 
                    '<div class="track-details-placeholder"><p>Select a track to view details</p></div>';
            }

            await this.loadTracks();
        } catch (error) {
            console.error('Error deleting track:', error);
            alert('Failed to delete track: ' + error.message);
        }
    }

    showUploadForm() {
        const panel = document.getElementById('track-details-panel');
        
        panel.innerHTML = `
            <div class="track-form">
                <h2>Upload Track from CSV</h2>
                <form id="upload-track-form" enctype="multipart/form-data">
                    <div class="form-group">
                        <label for="upload-track-name">Track Name *</label>
                        <input type="text" id="upload-track-name" name="track_name" required>
                        <small>Track ID will be auto-generated from name if not specified</small>
                    </div>

                    <div class="form-group">
                        <label for="upload-track-id">Track ID (optional)</label>
                        <input type="text" id="upload-track-id" name="track_id" 
                               pattern="[a-z0-9_]+" title="Only lowercase letters, numbers, and underscores">
                        <small>Leave empty to auto-generate from track name</small>
                    </div>

                    <h3>GPS Anchor</h3>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="upload-anchor-lat">Latitude *</label>
                            <input type="number" id="upload-anchor-lat" name="anchor_latitude" 
                                   step="0.000001" required>
                        </div>
                        <div class="form-group">
                            <label for="upload-anchor-lng">Longitude *</label>
                            <input type="number" id="upload-anchor-lng" name="anchor_longitude" 
                                   step="0.000001" required>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="upload-anchor-x">Anchor X (m)</label>
                            <input type="number" id="upload-anchor-x" name="anchor_x_m" 
                                   value="0" step="0.000001">
                        </div>
                        <div class="form-group">
                            <label for="upload-anchor-y">Anchor Y (m)</label>
                            <input type="number" id="upload-anchor-y" name="anchor_y_m" 
                                   value="0" step="0.000001">
                        </div>
                        <div class="form-group">
                            <label for="upload-anchor-heading">Heading (deg)</label>
                            <input type="number" id="upload-anchor-heading" name="anchor_heading" 
                                   value="0" step="0.01">
                        </div>
                    </div>

                    <h3>CSV File</h3>
                    <div class="form-group">
                        <label for="csv-file">CSV File *</label>
                        <input type="file" id="csv-file" name="file" accept=".csv" required>
                        <small>Format: # x_m,y_m,w_tr_right_m,w_tr_left_m<br>
                        First line starting with # is treated as header/comment</small>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn-secondary" id="cancel-upload-btn">Cancel</button>
                        <button type="submit" class="btn-primary">Upload Track</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('upload-track-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.uploadTrackCSV();
        });

        document.getElementById('cancel-upload-btn').addEventListener('click', () => {
            panel.innerHTML = '<div class="track-details-placeholder"><p>Select a track to view details</p></div>';
        });
    }

    async uploadTrackCSV() {
        const form = document.getElementById('upload-track-form');
        const formData = new FormData(form);

        const trackId = formData.get('track_id') || null;
        const trackName = formData.get('track_name');
        const file = formData.get('file');

        if (!file || file.size === 0) {
            alert('Please select a CSV file');
            return;
        }

        // Validate file extension
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert('Please select a CSV file');
            return;
        }

        // Create FormData for multipart upload
        const uploadData = new FormData();
        uploadData.append('file', file);
        const trackIdValue = formData.get('track_id');
        if (trackIdValue && trackIdValue.trim()) {
            uploadData.append('track_id', trackIdValue.trim());
        }
        uploadData.append('track_name', trackName);
        uploadData.append('anchor_latitude', formData.get('anchor_latitude'));
        uploadData.append('anchor_longitude', formData.get('anchor_longitude'));
        uploadData.append('anchor_x_m', formData.get('anchor_x_m') || '0');
        uploadData.append('anchor_y_m', formData.get('anchor_y_m') || '0');
        uploadData.append('anchor_heading', formData.get('anchor_heading') || '0');

        try {
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Uploading...';

            const track = await this.apiClient.uploadTrackCSV(uploadData);
            
            // Reload tracks and select the new one
            await this.loadTracks();
            await this.selectTrack(track.track_id);
            
            alert(`Track "${track.name}" uploaded successfully!`);
        } catch (error) {
            console.error('Error uploading track:', error);
            alert('Failed to upload track: ' + error.message);
        } finally {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Upload Track';
            }
        }
    }

    showError(message) {
        // Simple error display - could be enhanced
        console.error(message);
    }
}

