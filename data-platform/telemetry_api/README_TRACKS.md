# Track CSV Upload Format

## CSV File Format

The CSV file should have the following format:

```csv
# x_m,y_m,w_tr_right_m,w_tr_left_m
0.0,0.0,12.0,12.0
100.0,0.0,12.0,12.0
200.0,50.0,12.0,12.0
```

### Format Rules:
1. **Header line**: First line starting with `#` is treated as a comment/header and is ignored
2. **Data lines**: Each subsequent line contains 4 comma-separated values:
   - `x_m`: X coordinate in meters (6 decimal precision)
   - `y_m`: Y coordinate in meters (6 decimal precision)
   - `w_tr_right_m`: Track width to the right of centerline (meters)
   - `w_tr_left_m`: Track width to the left of centerline (meters)
3. **Empty lines**: Are ignored
4. **Minimum points**: At least 2 points are required

### Example CSV File

```csv
# x_m,y_m,w_tr_right_m,w_tr_left_m
0.0,0.0,12.0,12.0
100.0,0.0,12.0,12.0
200.0,50.0,12.0,12.0
300.0,100.0,12.0,12.0
400.0,150.0,12.0,12.0
500.0,200.0,12.0,12.0
```

## API Endpoint

**POST** `/api/v1/tracks/upload`

**Content-Type**: `multipart/form-data`

**Form Fields**:
- `file` (file, required): CSV file
- `track_name` (string, required): Track name
- `track_id` (string, optional): Track ID (auto-generated if not provided)
- `anchor_latitude` (float, required): GPS latitude of anchor point
- `anchor_longitude` (float, required): GPS longitude of anchor point
- `anchor_x_m` (float, default: 0.0): X coordinate at anchor point
- `anchor_y_m` (float, default: 0.0): Y coordinate at anchor point
- `anchor_heading` (float, default: 0.0): Heading/rotation in degrees

**Response**: Track object with generated/assigned track_id

## Track ID Generation

If `track_id` is not provided:
- Generated from `track_name` by:
  - Converting to lowercase
  - Replacing spaces and hyphens with underscores
  - Removing special characters (keeping only alphanumeric and underscores)
- If generated ID already exists, appends `_1`, `_2`, etc. until unique

## Example Usage

### Using curl:

```bash
curl -X POST "http://localhost:8000/api/v1/tracks/upload" \
  -F "file=@track-data.csv" \
  -F "track_name=Phillip Island" \
  -F "anchor_latitude=-38.5075" \
  -F "anchor_longitude=145.2300" \
  -F "anchor_x_m=0.0" \
  -F "anchor_y_m=0.0" \
  -F "anchor_heading=0.0"
```

### Using the Web UI:

1. Navigate to "Tracks" screen
2. Click "📤 Upload CSV" button
3. Fill in track name and GPS anchor information
4. Select CSV file
5. Click "Upload Track"

## Error Handling

The API will return errors for:
- Invalid CSV format
- Missing required columns
- Invalid number formats
- Less than 2 points
- Duplicate track_id (if provided)
- File read errors

