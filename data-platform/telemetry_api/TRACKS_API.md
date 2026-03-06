# Tracks API Documentation

## Endpoints

### Create Track
`POST /api/v1/tracks`

Creates a new track with JSON data.

**Request Body:**
```json
{
  "track_id": "phillip_island",
  "name": "Phillip Island Grand Prix Circuit",
  "anchor": {
    "latitude": -38.5075,
    "longitude": 145.2300,
    "x_m": 0.0,
    "y_m": 0.0,
    "heading": 0.0
  },
  "points": [
    {
      "x_m": 0.0,
      "y_m": 0.0,
      "w_tr_right_m": 12.0,
      "w_tr_left_m": 12.0
    }
  ]
}
```

### Upload Track from CSV
`POST /api/v1/tracks/upload`

Uploads a track from a CSV file.

**Request (multipart/form-data):**
- `file` (file): CSV file
- `track_name` (string, required): Track name
- `track_id` (string, optional): Track ID (auto-generated if not provided)
- `anchor_latitude` (float, required): GPS latitude of anchor point
- `anchor_longitude` (float, required): GPS longitude of anchor point
- `anchor_x_m` (float, default: 0.0): X coordinate at anchor point
- `anchor_y_m` (float, default: 0.0): Y coordinate at anchor point
- `anchor_heading` (float, default: 0.0): Heading/rotation in degrees

**CSV Format:**
```csv
# x_m,y_m,w_tr_right_m,w_tr_left_m
0.0,0.0,12.0,12.0
100.0,0.0,12.0,12.0
200.0,50.0,12.0,12.0
```

- First line starting with `#` is treated as header/comment
- Each subsequent line contains: x_m, y_m, w_tr_right_m, w_tr_left_m
- All values are in meters
- At least 2 points required

### List Tracks
`GET /api/v1/tracks`

Returns list of all tracks.

### Get Track
`GET /api/v1/tracks/{track_id}`

Returns track details.

### Update Track
`PUT /api/v1/tracks/{track_id}`

Updates track (partial update supported).

### Delete Track
`DELETE /api/v1/tracks/{track_id}`

Deletes a track.

### Get Track Weather
`GET /api/v1/tracks/{track_id}/weather`

Returns current weather for track location.

## Track Data Structure

### Track Point
- `x_m`: X coordinate in meters (6 decimal precision)
- `y_m`: Y coordinate in meters (6 decimal precision)
- `w_tr_right_m`: Track width to the right of centerline (meters)
- `w_tr_left_m`: Track width to the left of centerline (meters)

### GPS Anchor
- `latitude`: GPS latitude (-90 to 90)
- `longitude`: GPS longitude (-180 to 180)
- `x_m`: X coordinate in meters at this anchor point
- `y_m`: Y coordinate in meters at this anchor point
- `heading`: Rotation/heading of track coordinate system (0-360 degrees)

The anchor point allows mapping track coordinates (in meters) to GPS coordinates for visualization on maps.

