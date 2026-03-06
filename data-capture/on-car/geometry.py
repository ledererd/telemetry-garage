"""
Geometry utilities for lap crossing detection.
"""

import math


def haversine_distance(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculate distance between two GPS coordinates in meters using Haversine formula."""
    R = 6371000  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def point_to_line_distance(
    point_lat: float,
    point_lon: float,
    line_lat1: float,
    line_lon1: float,
    line_lat2: float,
    line_lon2: float,
) -> float:
    """Calculate shortest distance from a point to a line segment in meters."""
    p_lat = math.radians(point_lat)
    p_lon = math.radians(point_lon)
    l1_lat = math.radians(line_lat1)
    l1_lon = math.radians(line_lon1)
    l2_lat = math.radians(line_lat2)
    l2_lon = math.radians(line_lon2)

    d1 = haversine_distance(point_lat, point_lon, line_lat1, line_lon1)
    d2 = haversine_distance(point_lat, point_lon, line_lat2, line_lon2)

    dx = l2_lon - l1_lon
    dy = l2_lat - l1_lat
    px = p_lon - l1_lon
    py = p_lat - l1_lat

    if abs(dx) < 1e-10 and abs(dy) < 1e-10:
        return d1

    t = max(0, min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
    closest_lat = l1_lat + t * dy
    closest_lon = l1_lon + t * dx
    closest_lat_deg = math.degrees(closest_lat)
    closest_lon_deg = math.degrees(closest_lon)

    return haversine_distance(point_lat, point_lon, closest_lat_deg, closest_lon_deg)


def which_side_of_line(
    point_lat: float,
    point_lon: float,
    line_lat1: float,
    line_lon1: float,
    line_lat2: float,
    line_lon2: float,
) -> int:
    """
    Determine which side of a line a point is on.
    Returns: -1 for left side, 1 for right side, 0 if on the line.
    """
    line_dx = line_lon2 - line_lon1
    line_dy = line_lat2 - line_lat1
    point_dx = point_lon - line_lon1
    point_dy = point_lat - line_lat1
    cross = line_dx * point_dy - line_dy * point_dx

    if abs(cross) < 1e-10:
        return 0
    return 1 if cross > 0 else -1
