# Telemetry Garage

<p align="center">
  <img src="telemetry-garage-logo.png" alt="Telemetry Garage logo" width="300">
</p>

An open source telemetry platform for motorsport. Built with Formula SAE in mind, Telemetry Garage works across a broad range of racing—from student formula cars to go karts, club racing, and beyond.

## Goals

Telemetry Garage aims to provide:

- **Accessible telemetry** — Capture, store, and analyze vehicle data without expensive proprietary systems
- **End-to-end workflow** — From on-car capture to cloud storage to web-based analysis
- **Racing line simulation** — Optimize racing lines and estimate lap times using track and car profile data
- **Extensibility** — Open schemas, REST APIs, and modular design for integration and customization

Whether you're running a Formula SAE team, karting at the local track, or building a club racing data pipeline, Telemetry Garage gives you the tools to collect and understand your data.

## Project Components

Telemetry Garage is organized into three main components:

### 1. Data Platform (`data-platform/`)

The backend that stores and serves telemetry data.

- **Telemetry API** — FastAPI REST API for uploading and downloading telemetry records, session management, lap analysis, user authentication, and device API keys
- **Simulation API** — Racing line optimization and lap time calculation based on track geometry and car profiles
- **PostgreSQL** — Persistent storage for telemetry, sessions, tracks, car profiles, and users
- **Data structures** — JSON schemas and database schemas for consistent data validation

The platform supports batch uploads, filtering by session/lap/time, and integration with the on-car capture system and web application.

### 2. Data Capture (`data-capture/`)

On-car software for capturing telemetry from the vehicle.

- **CAN bus** — Read vehicle data from the CAN bus (e.g., PiCAN FD)
- **GPS** — Position and lap detection via NMEA GNSS
- **IMU** — MPU-9250 9-axis sensor for roll, pitch, yaw, and G-forces
- **Local buffering** — SQLite buffer when offline; batch upload when WiFi is available
- **Raspberry Pi** — Designed to run on Raspberry Pi or compatible Linux systems

The capture system runs as a service on the vehicle and uploads data to the Telemetry API when connectivity allows.

### 3. Data Analysis (`data-analysis/`)

Web application for visualizing and analyzing telemetry data.

- **Session & lap management** — Browse sessions, select laps, and manage data
- **Interactive map** — Track visualization with OpenStreetMap
- **Distance-based charts** — Telemetry metrics plotted against distance (speed, G-forces, RPM, temperatures, etc.)
- **Tracks & car profiles** — Define tracks and vehicle profiles for simulation
- **Racing line simulation** — Generate optimal racing lines and lap time estimates
- **Device management** — Register devices and manage API keys for telemetry upload
- **Live view** — Real-time telemetry over WebSocket

The web app connects to the Telemetry API and Simulation API and provides a single interface for analysis and configuration.

## Quick Start

1. **Set up the database and APIs**

   ```bash
   cd data-platform
   ./setup-postgres.sh
   ./podman-run.sh
   ```

2. **Start the web application**

   ```bash
   cd data-analysis/web
   ./podman-run.sh
   ```

3. **Open** [http://localhost:8080](http://localhost:8080) in your browser.

See the README in each component for detailed setup and usage.

## Project Structure

```
telemetry-garage/
├── data-platform/          # Backend APIs and database
│   ├── telemetry-api/     # Main telemetry REST API
│   ├── simulation-api/    # Racing line and lap time simulation
│   └── data-structure/    # Schemas and database definitions
├── data-capture/          # On-car telemetry capture
│   └── on-car/            # Raspberry Pi capture software
└── data-analysis/         # Web application
    └── web/               # Frontend and static assets
```

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.
