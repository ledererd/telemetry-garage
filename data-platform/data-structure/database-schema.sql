-- Time-Series Database Schema for Racing Telemetry
-- Recommended for: TimescaleDB (PostgreSQL extension), InfluxDB, or similar

-- Option 1: Relational Time-Series (TimescaleDB/PostgreSQL)
-- This provides SQL queryability with time-series optimization

CREATE TABLE telemetry_data (
    timestamp TIMESTAMPTZ NOT NULL,
    session_id VARCHAR(100) NOT NULL,
    lap_number INTEGER NOT NULL,
    lap_time NUMERIC(10, 3),
    sector INTEGER,
    
    -- Location data
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    altitude NUMERIC(8, 2),
    heading NUMERIC(5, 2),
    gps_satellites INTEGER,
    
    -- Vehicle dynamics
    speed NUMERIC(6, 2),  -- km/h
    yaw NUMERIC(6, 2),    -- degrees
    roll NUMERIC(6, 2),   -- degrees
    pitch NUMERIC(6, 2),  -- degrees
    lateral_g NUMERIC(5, 2),
    longitudinal_g NUMERIC(5, 2),
    vertical_g NUMERIC(5, 2),
    steering_angle NUMERIC(6, 2),  -- degrees
    
    -- Powertrain
    gear INTEGER,
    throttle_position NUMERIC(5, 2),  -- percentage
    braking_force NUMERIC(5, 2),      -- percentage
    engine_rpm INTEGER,
    engine_temperature NUMERIC(5, 2),  -- Celsius
    oil_pressure NUMERIC(6, 2),        -- PSI or bar
    oil_temperature NUMERIC(5, 2),     -- Celsius
    coolant_temperature NUMERIC(5, 2), -- Celsius
    turbo_boost_pressure NUMERIC(5, 2), -- PSI or bar
    air_intake_temperature NUMERIC(5, 2), -- Celsius
    fuel_level NUMERIC(5, 2),         -- percentage
    
    -- Suspension (mm travel)
    suspension_fl NUMERIC(6, 2),
    suspension_fr NUMERIC(6, 2),
    suspension_rl NUMERIC(6, 2),
    suspension_rr NUMERIC(6, 2),
    
    -- Wheel speeds (km/h)
    wheel_speed_fl NUMERIC(6, 2),
    wheel_speed_fr NUMERIC(6, 2),
    wheel_speed_rl NUMERIC(6, 2),
    wheel_speed_rr NUMERIC(6, 2),
    
    -- Environment
    ambient_temperature NUMERIC(5, 2),      -- Celsius
    track_surface_temperature NUMERIC(5, 2), -- Celsius
    humidity NUMERIC(5, 2),                 -- percentage
    
    -- Metadata
    gps_quality VARCHAR(20),
    sampling_rate INTEGER,
    device_id VARCHAR(50),
    
    -- Indexes
    PRIMARY KEY (timestamp, session_id)
);

-- Convert to hypertable for TimescaleDB
-- SELECT create_hypertable('telemetry_data', 'timestamp');

-- Create indexes for common queries
CREATE INDEX idx_telemetry_session_lap ON telemetry_data(session_id, lap_number);
CREATE INDEX idx_telemetry_timestamp ON telemetry_data(timestamp DESC);
CREATE INDEX idx_telemetry_location ON telemetry_data USING GIST (
    ll_to_earth(latitude, longitude)
);  -- For spatial queries if using PostGIS

-- Partitioning by session_id for better performance
-- CREATE INDEX idx_telemetry_session ON telemetry_data(session_id);

-- Alternative: Separate tables for different data categories (normalized approach)
-- This can improve query performance for specific analysis types

CREATE TABLE telemetry_sessions (
    session_id VARCHAR(100) PRIMARY KEY,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    track_name VARCHAR(100),
    driver_name VARCHAR(100),
    vehicle_id VARCHAR(50),
    total_laps INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lap_summaries (
    session_id VARCHAR(100) NOT NULL,
    lap_number INTEGER NOT NULL,
    lap_time NUMERIC(10, 3),
    sector_1_time NUMERIC(10, 3),
    sector_2_time NUMERIC(10, 3),
    sector_3_time NUMERIC(10, 3),
    best_lap BOOLEAN DEFAULT FALSE,
    max_speed NUMERIC(6, 2),
    avg_speed NUMERIC(6, 2),
    max_lateral_g NUMERIC(5, 2),
    max_longitudinal_g NUMERIC(5, 2),
    PRIMARY KEY (session_id, lap_number),
    FOREIGN KEY (session_id) REFERENCES telemetry_sessions(session_id)
);

