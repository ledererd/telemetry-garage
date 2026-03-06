# Racing Data Analysis Web Application

A web-based application for analyzing racing telemetry data with interactive maps and graphs.

## Features

- **Session & Lap Selection**: Choose from available racing sessions and specific laps
- **Interactive Map**: Visualize the race track using GPS coordinates with OpenStreetMap
- **Distance-Based Graphs**: View telemetry metrics plotted against distance traveled
- **Multiple Metrics**: Select from various metrics including:
  - Vehicle dynamics (speed, G-forces, steering, etc.)
  - Powertrain (RPM, throttle, braking, temperatures, etc.)
  - Suspension travel
  - Wheel speeds
  - Environmental conditions
- **Local Caching**: Data is cached locally using IndexedDB for fast access
- **Zoom & Pan**: Interactive charts with zoom and pan capabilities

## Requirements

- Modern web browser with IndexedDB support
- Racing Telemetry API running (default: http://localhost:8000)

## Setup

1. Ensure the Racing Telemetry API is running:
   ```bash
   cd data-platform
   ./podman-run.sh
   ```

2. Open the application:
   - **Option 1: Run in container (recommended)**
     ```bash
     cd data-analysis/web
     ./podman-run.sh
     ```
     Then open http://localhost:8080 in your browser (or set `WEB_PORT` for a different port)

   - **Option 2: Use a local web server**
     ```bash
     cd data-analysis/web
     python3 -m http.server 8080
     ```
     Then open http://localhost:8080 in your browser

   - **Option 3: Open `index.html` directly in your browser**
     (Note: Some features may not work due to CORS restrictions)

## Usage

1. **Select a Session**: Choose a racing session from the dropdown
2. **Select a Lap**: Choose a specific lap or "All laps" to view all data
3. **Load Data**: Click "Load Data" to fetch and display the telemetry data
4. **View Map**: The race track will be displayed on the map
5. **View Graphs**: Telemetry data will be plotted against distance
6. **Select Metrics**: Check/uncheck metrics in the right panel to show/hide them on the graph

## Architecture

### Components

- **api-client.js**: Handles communication with the Racing Telemetry API
- **cache-manager.js**: Manages local caching using IndexedDB
- **distance-calculator.js**: Calculates cumulative distance from GPS coordinates
- **app.js**: Main application logic and UI coordination

### Technologies

- **Leaflet**: Interactive maps
- **Chart.js**: Data visualization with zoom/pan support
- **IndexedDB**: Local data caching
- **Vanilla JavaScript**: No framework dependencies

## API Configuration

By default, the application connects to `http://localhost:8000` (main API) and `http://localhost:8002` (simulation API).

**When running in container**, set environment variables to override:
```bash
API_BASE_URL=http://your-api-host:8000 SIMULATION_BASE_URL=http://your-sim-host:8002 ./podman-run.sh
```

**When running locally**, edit `js/config.js` to change the URLs.

## Caching

The application caches data locally to:
- Reduce API calls
- Enable offline viewing of previously loaded data
- Improve performance

Cache can be cleared using the "Clear Cache" button.

## Distance Calculation

Distance is calculated using the Haversine formula, which calculates the great-circle distance between GPS coordinates. The cumulative distance is computed by summing the distances between consecutive data points.

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Opera

Requires:
- ES6+ support
- IndexedDB support
- Fetch API support

## Troubleshooting

### API Connection Issues

- Verify the API is running: `curl http://localhost:8000/health`
- Check browser console for CORS errors
- Ensure API allows CORS from your origin

### Map Not Displaying

- Check internet connection (requires OpenStreetMap tiles)
- Verify GPS coordinates are present in the data

### Data Not Loading

- Check browser console for errors
- Verify API is accessible
- Check IndexedDB is enabled in browser settings

### Charts Not Updating

- Ensure at least one metric is selected
- Check that data contains the selected metrics
- Verify distance calculation completed successfully

## Development

### Adding New Metrics

Edit `js/app.js` and add metrics to the `METRICS_CONFIG` object:

```javascript
{
    key: 'metric_name',
    label: 'Display Name',
    color: 'rgb(255, 99, 132)',
    unit: 'unit'
}
```

### Customizing Styles

Edit `styles.css` to customize the appearance.

### Extending Functionality

The application is modular and can be extended:
- Add new visualization types
- Implement data export
- Add comparison features
- Implement lap overlay on map

