/**
 * Simulation Screen module
 * Handles lap time simulation UI and API calls
 */

class SimulationManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.carProfiles = [];
        this.tracks = [];
    }

    async init() {
        await this.loadCarProfiles();
        await this.loadTracks();
        this.setupEventListeners();
    }

    async loadCarProfiles() {
        try {
            this.carProfiles = await this.apiClient.getCarProfiles();
            const select = document.getElementById('sim-car-profile-select');
            select.innerHTML = '<option value="">Select Car Profile</option>';
            
            this.carProfiles.forEach(profile => {
                const option = document.createElement('option');
                option.value = profile.profile_id;
                option.textContent = profile.name;
                select.appendChild(option);
            });
            
            this.updateButtons();
        } catch (error) {
            console.error('Error loading car profiles:', error);
        }
    }

    async loadTracks() {
        try {
            this.tracks = await this.apiClient.getTracks();
            const select = document.getElementById('sim-track-select');
            select.innerHTML = '<option value="">Select Track</option>';
            
            this.tracks.forEach(track => {
                const option = document.createElement('option');
                option.value = track.track_id;
                option.textContent = track.name;
                select.appendChild(option);
            });
            
            this.updateButtons();
        } catch (error) {
            console.error('Error loading tracks:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('sim-car-profile-select').addEventListener('change', () => {
            this.updateButtons();
        });
        
        document.getElementById('sim-track-select').addEventListener('change', () => {
            this.updateButtons();
        });
        
        document.getElementById('generate-simulation-btn').addEventListener('click', () => {
            this.runSimulation();
        });
    }

    updateButtons() {
        const carProfile = document.getElementById('sim-car-profile-select').value;
        const track = document.getElementById('sim-track-select').value;
        const generateBtn = document.getElementById('generate-simulation-btn');
        generateBtn.disabled = !(carProfile && track);
    }

    async runSimulation() {
        const carProfileId = document.getElementById('sim-car-profile-select').value;
        const trackId = document.getElementById('sim-track-select').value;
        
        if (!carProfileId || !trackId) {
            return;
        }
        
        const plotContainer = document.getElementById('sim-plot-container');
        const laptimeValue = document.getElementById('sim-laptime-value');
        laptimeValue.textContent = 'Calculating...';
        plotContainer.innerHTML = '<p style="color: #b0b0b0; text-align: center; padding: 2rem;">Generating...</p>';
        document.getElementById('simulation-results').style.display = 'block';
        document.getElementById('simulation-loading').style.display = 'flex';
        document.getElementById('simulation-loading').querySelector('p').textContent = 'Generating racing line and lap time...';
        
        const generateBtn = document.getElementById('generate-simulation-btn');
        generateBtn.disabled = true;
        
        try {
            // Get lap time (computes racing line, returns lap time + speed profile)
            const lapTimeResult = await this.apiClient.getLapTime(trackId, carProfileId);
            laptimeValue.textContent = `${lapTimeResult.lap_time.toFixed(3)}s`;
            if (lapTimeResult.speed_profile) {
                this.plotSpeedProfile(lapTimeResult.speed_profile);
            }
            
            // Get racing line plot (uses cached result from lap time call)
            const blob = await this.apiClient.getRacingLinePlot(trackId, carProfileId);
            const url = window.URL.createObjectURL(blob);
            
            plotContainer.innerHTML = '<img id="sim-plot-image" src="" alt="Racing line plot">';
            const newPlotImg = document.getElementById('sim-plot-image');
            newPlotImg.src = url;
            
            newPlotImg.onload = () => {
                newPlotImg.style.display = 'block';
                this.setupPlotZoomPan(newPlotImg, plotContainer);
            };
            
            document.getElementById('plot-controls').style.display = 'flex';
            document.getElementById('plot-instructions').style.display = 'block';
            
            const plotSection = plotContainer.closest('.simulation-plot-container');
            if (plotSection) {
                const existingDownloadBtn = plotSection.querySelector('.download-csv-btn');
                if (existingDownloadBtn) existingDownloadBtn.remove();
                
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'btn-secondary download-csv-btn';
                downloadBtn.textContent = '📥 Download Racing Line CSV';
                downloadBtn.style.marginTop = '0.5rem';
                downloadBtn.style.marginLeft = 'auto';
                downloadBtn.style.display = 'block';
                downloadBtn.onclick = () => this.downloadRacingLineCSV(carProfileId, trackId);
                
                const instructions = plotSection.querySelector('.plot-instructions');
                if (instructions) {
                    instructions.parentNode.insertBefore(downloadBtn, instructions.nextSibling);
                } else {
                    plotSection.appendChild(downloadBtn);
                }
            }
            
        } catch (error) {
            console.error('Error running simulation:', error);
            laptimeValue.textContent = 'Error';
            plotContainer.innerHTML = '<p style="color: #ff6b6b; text-align: center; padding: 2rem;">Failed: ' + error.message + '</p>';
            alert(`Failed to run simulation: ${error.message}`);
        } finally {
            document.getElementById('simulation-loading').style.display = 'none';
            generateBtn.disabled = false;
            this.updateButtons();
        }
    }
    
    setupPlotZoomPan(img, container) {
        let scale = 1.0;
        let panX = 0;
        let panY = 0;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let startPanX = 0;
        let startPanY = 0;
        let minScale = 0.2;
        let maxScale = 5.0;

        
        const updateTransform = () => {
            img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        };
        
        // Remove any existing event listeners by cloning and replacing
        const zoomInBtn = document.getElementById('zoom-in-btn');
        const zoomOutBtn = document.getElementById('zoom-out-btn');
        const zoomFitBtn = document.getElementById('zoom-fit-btn');
        const zoomResetBtn = document.getElementById('zoom-reset-btn');
        
        // Clear existing handlers
        zoomInBtn.replaceWith(zoomInBtn.cloneNode(true));
        zoomOutBtn.replaceWith(zoomOutBtn.cloneNode(true));
        zoomFitBtn.replaceWith(zoomFitBtn.cloneNode(true));
        zoomResetBtn.replaceWith(zoomResetBtn.cloneNode(true));
        
        // Get fresh references
        const newZoomInBtn = document.getElementById('zoom-in-btn');
        const newZoomOutBtn = document.getElementById('zoom-out-btn');
        const newZoomFitBtn = document.getElementById('zoom-fit-btn');
        const newZoomResetBtn = document.getElementById('zoom-reset-btn');
        
        // Zoom controls
        newZoomInBtn.onclick = () => {
            scale = Math.min(scale * 1.2, maxScale);
            updateTransform();
        };
        
        newZoomOutBtn.onclick = () => {
            scale = Math.max(scale / 1.2, minScale);
            updateTransform();
        };
        
        newZoomFitBtn.onclick = () => {
            // Fit image to container - use offsetWidth/offsetHeight for actual container dimensions
            const containerWidth = container.offsetWidth;
            const containerHeight = container.offsetHeight;
            const padding = 20;
            const scaleX = (containerWidth - padding * 2) / img.naturalWidth;
            const scaleY = (containerHeight - padding * 2) / img.naturalHeight;
            scale = Math.min(scaleX, scaleY, 1.0);
            // Center the image in the container
            // Since transform origin is (0,0), panX and panY position the top-left of the scaled image
            //panX = (containerWidth - img.naturalWidth * scale) / 2;
            //panY = (containerHeight - img.naturalHeight * scale) / 2;
            panX = 0;
            panY = 0;
            updateTransform();
        };
        
        newZoomResetBtn.onclick = () => {
            scale = 1.0;
            panX = 0;
            panY = 0;
            updateTransform();
        };
        
        // Mouse wheel zoom
        const wheelHandler = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            const oldScale = scale;
            scale = Math.max(minScale, Math.min(maxScale, scale * delta));
            
            // Zoom towards mouse position
            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Calculate zoom point in image coordinates
            const imgX = (mouseX - panX) / oldScale;
            const imgY = (mouseY - panY) / oldScale;
            
            // Adjust pan to keep zoom point under mouse
            panX = mouseX - imgX * scale;
            panY = mouseY - imgY * scale;
            
            updateTransform();
        };
        
        container.addEventListener('wheel', wheelHandler, { passive: false });
        
        // Drag to pan
        const mouseDownHandler = (e) => {
            if (e.button === 0) { // Left mouse button
                isDragging = true;
                container.classList.add('dragging');
                startX = e.clientX;
                startY = e.clientY;
                startPanX = panX;
                startPanY = panY;
                e.preventDefault();
            }
        };
        
        const mouseMoveHandler = (e) => {
            if (isDragging) {
                panX = startPanX + (e.clientX - startX);
                panY = startPanY + (e.clientY - startY);
                updateTransform();
                e.preventDefault();
            }
        };
        
        const mouseUpHandler = () => {
            if (isDragging) {
                isDragging = false;
                container.classList.remove('dragging');
            }
        };
        
        container.addEventListener('mousedown', mouseDownHandler);
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
        
        // Store handlers for cleanup if needed
        container._zoomPanHandlers = {
            wheel: wheelHandler,
            mousedown: mouseDownHandler,
            mousemove: mouseMoveHandler,
            mouseup: mouseUpHandler
        };
        
        // Initial fit - use the same logic as "Fit to View" button
        const doInitialFit = () => {
            // Use offsetWidth/offsetHeight for actual container dimensions
            const containerWidth = container.offsetWidth;
            const containerHeight = container.offsetHeight;
            if (containerWidth > 0 && containerHeight > 0 && img.naturalWidth > 0 && img.naturalHeight > 0) {
                const padding = 20;
                const scaleX = (containerWidth - padding * 2) / img.naturalWidth;
                const scaleY = (containerHeight - padding * 2) / img.naturalHeight;
                scale = Math.min(scaleX, scaleY, 1.0);
                // Center the image in the container
                // Since transform origin is (0,0), panX and panY position the top-left of the scaled image
                //panX = (containerWidth - img.naturalWidth * scale) / 2;
                //panY = (containerHeight - img.naturalHeight * scale) / 2;
                panX = 0;
                panY = 0;
                updateTransform();
            } else {
                // Retry if dimensions aren't ready
                requestAnimationFrame(doInitialFit);
            }
        };
        
        // Start initial fit - use requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
            requestAnimationFrame(doInitialFit);
        });
    }
    
    async downloadRacingLineCSV(carProfileId, trackId) {
        try {
            const blob = await this.apiClient.getRacingLineCSV(trackId, carProfileId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `racing_line_${trackId}_${carProfileId}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error downloading CSV:', error);
            alert(`Failed to download CSV: ${error.message}`);
        }
    }
    
    plotSpeedProfile(speedProfile) {
        const canvas = document.getElementById('speed-profile-canvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const distances = speedProfile.distances;
        const speeds = speedProfile.speeds;
        
        if (!distances || !speeds || distances.length === 0 || speeds.length === 0) {
            return;
        }
        
        // Convert speeds from m/s to km/h (multiply by 3.6)
        const speedsKmh = speeds.map(speed => speed * 3.6);
        
        // Get canvas dimensions (use actual rendered size)
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = 200;
        
        const width = canvas.width;
        const height = canvas.height;
        const padding = { top: 20, right: 20, bottom: 30, left: 50 };
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Find min/max values (using km/h)
        const maxDistance = Math.max(...distances);
        const minSpeed = Math.min(...speedsKmh);
        const maxSpeed = Math.max(...speedsKmh);
        const speedRange = maxSpeed - minSpeed;
        
        // Add some padding to the speed range for better visualization
        const speedPadding = speedRange * 0.1;
        const speedMin = Math.max(0, minSpeed - speedPadding);
        const speedMax = maxSpeed + speedPadding;
        const speedRangePadded = speedMax - speedMin;
        
        // Draw grid
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        
        // Horizontal grid lines (speed)
        const numHorizontalLines = 5;
        for (let i = 0; i <= numHorizontalLines; i++) {
            const y = padding.top + (plotHeight / numHorizontalLines) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();
        }
        
        // Vertical grid lines (distance)
        const numVerticalLines = 8;
        for (let i = 0; i <= numVerticalLines; i++) {
            const x = padding.left + (plotWidth / numVerticalLines) * i;
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, height - padding.bottom);
            ctx.stroke();
        }
        
        // Draw axes
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        
        // X-axis (distance)
        ctx.beginPath();
        ctx.moveTo(padding.left, height - padding.bottom);
        ctx.lineTo(width - padding.right, height - padding.bottom);
        ctx.stroke();
        
        // Y-axis (speed)
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.stroke();
        
        // Draw axis labels
        ctx.fillStyle = '#b0b0b0';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // X-axis labels (distance)
        for (let i = 0; i <= numVerticalLines; i++) {
            const x = padding.left + (plotWidth / numVerticalLines) * i;
            const distance = (maxDistance / numVerticalLines) * i;
            ctx.fillText(`${(distance / 1000).toFixed(1)}km`, x, height - padding.bottom + 20);
        }
        
        // Y-axis labels (speed in km/h)
        ctx.textAlign = 'right';
        for (let i = 0; i <= numHorizontalLines; i++) {
            const y = padding.top + (plotHeight / numHorizontalLines) * i;
            const speed = speedMax - (speedRangePadded / numHorizontalLines) * i;
            ctx.fillText(`${speed.toFixed(0)}`, padding.left - 10, y);
        }
        
        // Draw axis titles
        ctx.textAlign = 'center';
        ctx.fillText('Distance (km)', width / 2, height - 5);
        ctx.save();
        ctx.translate(15, height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Speed (km/h)', 0, 0);
        ctx.restore();
        
        // Draw speed profile line
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < distances.length; i++) {
            const x = padding.left + (distances[i] / maxDistance) * plotWidth;
            const y = padding.top + plotHeight - ((speedsKmh[i] - speedMin) / speedRangePadded) * plotHeight;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Fill area under curve
        ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
        ctx.beginPath();
        ctx.moveTo(padding.left, height - padding.bottom);
        
        for (let i = 0; i < distances.length; i++) {
            const x = padding.left + (distances[i] / maxDistance) * plotWidth;
            const y = padding.top + plotHeight - ((speedsKmh[i] - speedMin) / speedRangePadded) * plotHeight;
            ctx.lineTo(x, y);
        }
        
        ctx.lineTo(padding.left + plotWidth, height - padding.bottom);
        ctx.closePath();
        ctx.fill();
    }
}

