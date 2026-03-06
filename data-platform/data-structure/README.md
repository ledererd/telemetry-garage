# Racing Telemetry Data Structure

This directory contains the data structure definitions for the racing car telemetry system.

## Files

- **telemetry-schema.json** - JSON Schema definition for telemetry data validation
- **telemetry-example.json** - Example telemetry data record
- **database-schema.sql** - SQL schema for time-series database storage

## Data Structure Recommendations

### 1. JSON Structure (API/Transport)

The recommended JSON structure groups related data into logical objects:

- **Root level**: Timestamp, session metadata, lap information
- **location**: GPS and positioning data
- **vehicle_dynamics**: Speed, orientation, G-forces, steering
- **powertrain**: Engine, transmission, fuel system data
- **suspension**: Suspension travel for all four corners
- **wheels**: Wheel speed sensor data
- **environment**: Ambient and track conditions
- **metadata**: Data quality and device information

### 2. Database Storage Options

#### Option A: Time-Series Database (Recommended)
**Best for**: High-frequency data ingestion, time-based queries, real-time analytics

**Recommended platforms**:
- **TimescaleDB** (PostgreSQL extension) - SQL queryability + time-series optimization
- **InfluxDB** - Purpose-built for time-series, excellent compression
- **Amazon Timestream** - Managed AWS service
- **Google Cloud BigQuery** - With time-partitioning

**Advantages**:
- Optimized for time-series queries
- Automatic data compression
- Efficient aggregation over time ranges
- Built-in retention policies

#### Option B: Relational Database
**Best for**: Complex joins, relational queries, structured analysis

**Recommended**: PostgreSQL with proper indexing

**Advantages**:
- Full SQL support
- ACID compliance
- Complex query capabilities
- Well-understood technology

#### Option C: Data Lake (Object Storage)
**Best for**: Long-term storage, batch processing, data archival

**Recommended**: 
- Parquet format on S3/GCS/Azure Blob
- Partitioned by: `session_id/year/month/day/`

**Advantages**:
- Cost-effective for large volumes
- Schema evolution support
- Compatible with analytics tools (Spark, Presto, etc.)

### 3. Data Compression & Storage

For high-frequency telemetry (10-100 Hz sampling):
- **Compression**: Use columnar formats (Parquet) or time-series compression
- **Partitioning**: By session_id and date
- **Retention**: Hot storage (recent sessions), cold storage (archived)

### 4. Data Ingestion Patterns

#### Real-time Streaming
- Use message queue (Kafka, AWS Kinesis, Google Pub/Sub)
- Batch insert to database (every N seconds or N records)
- Consider buffering on device for network resilience

#### Batch Upload
- Compress data on device (gzip)
- Upload in chunks (e.g., per lap or per minute)
- Include checksums for data integrity

### 5. Query Patterns to Optimize For

1. **Time-range queries**: "All data for session X between timestamps"
2. **Lap analysis**: "All data for lap Y in session X"
3. **Aggregations**: "Max speed, avg throttle per lap"
4. **Spatial queries**: "All data points within geographic region"
5. **Comparative analysis**: "Compare lap 5 vs lap 10"

### 6. Data Types & Precision

- **Timestamps**: ISO 8601 with millisecond precision (UTC)
- **GPS coordinates**: Decimal degrees (8 decimal places = ~1mm precision)
- **Temperatures**: Celsius, 1 decimal place
- **Pressures**: Consistent units (PSI or bar), 2 decimal places
- **Angles**: Degrees, 2 decimal places
- **Percentages**: 0-100, 1-2 decimal places
- **Speeds**: km/h, 1 decimal place

### 7. Data Quality Considerations

Include metadata for:
- GPS signal quality
- Sensor health status
- Data validity flags
- Missing data indicators
- Sampling rate verification

### 8. Recommended Architecture

```
[On-Car Device] 
    ↓ (buffered, compressed)
[Message Queue/API Gateway]
    ↓ (batch processing)
[Time-Series Database] (hot storage, recent data)
    ↓ (ETL process)
[Data Warehouse/Lake] (cold storage, analytics)
```

## Implementation Notes

1. **Session Management**: Each racing session should have a unique `session_id`
2. **Lap Tracking**: Use `lap_number` and `lap_time` for lap-based analysis
3. **Sector Tracking**: Optional but recommended for detailed analysis
4. **Data Validation**: Validate against JSON schema before storage
5. **Error Handling**: Handle missing/invalid sensor data gracefully
6. **Backpressure**: Implement rate limiting and buffering for network issues

## Example Usage

See `telemetry-example.json` for a complete example of a telemetry data record.

