#!/bin/bash

#curl -X POST "http://localhost:8000/api/v1/tracks/upload" \
#  -F "file=@data-platform/telemetry-api/sample-track.csv" \
#  -F "track_name=Sample Test Track" \
#  -F "anchor_latitude=-35.276395" \
#  -F "anchor_longitude=149.13" \
#  -F "anchor_x_m=0.0" \
#  -F "anchor_y_m=0.0" \
#  -F "anchor_heading=0.0"

curl -X POST "http://localhost:8000/api/v1/tracks/upload" \
  -F "file=@Melbourne.csv" \
  -F "track_name=Melbourne" \
  -F "anchor_latitude=-37.850036" \
  -F "anchor_longitude=144.968977" \
  -F "anchor_x_m=0.0" \
  -F "anchor_y_m=0.0" \
  -F "anchor_heading=0.0"


