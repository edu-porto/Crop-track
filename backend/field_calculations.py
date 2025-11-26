"""
Field calculations module for computing geographic properties of field polygons.

This module provides functions to calculate:
- Area of a polygon (in hectares and square meters)
- Perimeter of a polygon (in meters)
- Center point (centroid) of a polygon
- Bounding box dimensions
"""

import math
from typing import List, Tuple, Dict, Optional


# Earth's radius in meters (WGS84 ellipsoid mean radius)
EARTH_RADIUS = 6371000  # meters


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth using Haversine formula.

    Args:
        lat1: Latitude of first point in degrees
        lon1: Longitude of first point in degrees
        lat2: Latitude of second point in degrees
        lon2: Longitude of second point in degrees

    Returns:
        Distance in meters
    """
    # Convert to radians
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    # Haversine formula
    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return EARTH_RADIUS * c


def calculate_polygon_perimeter(coordinates: List[List[float]]) -> float:
    """
    Calculate the perimeter of a polygon defined by geographic coordinates.

    Args:
        coordinates: List of [latitude, longitude] pairs

    Returns:
        Perimeter in meters
    """
    if not coordinates or len(coordinates) < 3:
        return 0.0

    perimeter = 0.0
    n = len(coordinates)

    for i in range(n):
        lat1, lon1 = coordinates[i]
        lat2, lon2 = coordinates[(i + 1) % n]  # Wrap around to close the polygon
        perimeter += haversine_distance(lat1, lon1, lat2, lon2)

    return perimeter


def calculate_polygon_area(coordinates: List[List[float]]) -> float:
    """
    Calculate the area of a polygon on Earth's surface using the Shoelace formula
    adapted for spherical coordinates (Surveyor's formula).

    This uses an approximation that works well for small to medium-sized areas.
    For very large areas, a more sophisticated geodetic calculation would be needed.

    Args:
        coordinates: List of [latitude, longitude] pairs

    Returns:
        Area in square meters
    """
    if not coordinates or len(coordinates) < 3:
        return 0.0

    n = len(coordinates)

    # Convert coordinates to radians
    coords_rad = [(math.radians(lat), math.radians(lon)) for lat, lon in coordinates]

    # Use spherical excess formula for small polygons
    # This is more accurate than simple planar approximation

    # Calculate centroid latitude for scale factor
    avg_lat = sum(coord[0] for coord in coordinates) / n
    cos_lat = math.cos(math.radians(avg_lat))

    # Apply Shoelace formula with latitude scaling
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        lat1, lon1 = coordinates[i]
        lat2, lon2 = coordinates[j]

        # Convert to local Cartesian approximation (meters)
        x1 = lon1 * cos_lat * (math.pi / 180) * EARTH_RADIUS
        y1 = lat1 * (math.pi / 180) * EARTH_RADIUS
        x2 = lon2 * cos_lat * (math.pi / 180) * EARTH_RADIUS
        y2 = lat2 * (math.pi / 180) * EARTH_RADIUS

        area += x1 * y2 - x2 * y1

    return abs(area) / 2


def calculate_polygon_centroid(coordinates: List[List[float]]) -> Tuple[float, float]:
    """
    Calculate the centroid (geometric center) of a polygon.

    Args:
        coordinates: List of [latitude, longitude] pairs

    Returns:
        Tuple of (latitude, longitude) of the centroid
    """
    if not coordinates:
        return (0.0, 0.0)

    if len(coordinates) < 3:
        # For less than 3 points, return average
        avg_lat = sum(coord[0] for coord in coordinates) / len(coordinates)
        avg_lon = sum(coord[1] for coord in coordinates) / len(coordinates)
        return (avg_lat, avg_lon)

    n = len(coordinates)

    # Use centroid formula for polygons
    signed_area = 0.0
    cx = 0.0
    cy = 0.0

    for i in range(n):
        j = (i + 1) % n
        lat1, lon1 = coordinates[i]
        lat2, lon2 = coordinates[j]

        cross = lat1 * lon2 - lat2 * lon1
        signed_area += cross
        cx += (lat1 + lat2) * cross
        cy += (lon1 + lon2) * cross

    signed_area *= 0.5

    if abs(signed_area) < 1e-10:
        # Degenerate polygon, return simple average
        avg_lat = sum(coord[0] for coord in coordinates) / n
        avg_lon = sum(coord[1] for coord in coordinates) / n
        return (avg_lat, avg_lon)

    cx /= (6.0 * signed_area)
    cy /= (6.0 * signed_area)

    return (cx, cy)


def calculate_bounding_box(coordinates: List[List[float]]) -> Dict[str, float]:
    """
    Calculate the bounding box of a polygon.

    Args:
        coordinates: List of [latitude, longitude] pairs

    Returns:
        Dictionary with min/max lat/lon and dimensions
    """
    if not coordinates:
        return {
            'min_lat': 0, 'max_lat': 0,
            'min_lon': 0, 'max_lon': 0,
            'width_m': 0, 'height_m': 0
        }

    lats = [coord[0] for coord in coordinates]
    lons = [coord[1] for coord in coordinates]

    min_lat, max_lat = min(lats), max(lats)
    min_lon, max_lon = min(lons), max(lons)

    # Calculate dimensions in meters
    width_m = haversine_distance(
        (min_lat + max_lat) / 2, min_lon,
        (min_lat + max_lat) / 2, max_lon
    )
    height_m = haversine_distance(
        min_lat, (min_lon + max_lon) / 2,
        max_lat, (min_lon + max_lon) / 2
    )

    return {
        'min_lat': min_lat,
        'max_lat': max_lat,
        'min_lon': min_lon,
        'max_lon': max_lon,
        'width_m': width_m,
        'height_m': height_m
    }


def calculate_field_metrics(coordinates: List[List[float]]) -> Dict:
    """
    Calculate all field metrics for a given polygon.

    Args:
        coordinates: List of [latitude, longitude] pairs

    Returns:
        Dictionary containing all field metrics:
        - area_sqm: Area in square meters
        - area_hectares: Area in hectares
        - area_acres: Area in acres
        - perimeter_m: Perimeter in meters
        - centroid: Tuple (lat, lon) of center point
        - bounding_box: Bounding box info
    """
    if not coordinates or len(coordinates) < 3:
        return {
            'area_sqm': 0,
            'area_hectares': 0,
            'area_acres': 0,
            'perimeter_m': 0,
            'centroid': {'lat': 0, 'lon': 0},
            'bounding_box': {
                'min_lat': 0, 'max_lat': 0,
                'min_lon': 0, 'max_lon': 0,
                'width_m': 0, 'height_m': 0
            }
        }

    area_sqm = calculate_polygon_area(coordinates)
    perimeter_m = calculate_polygon_perimeter(coordinates)
    centroid = calculate_polygon_centroid(coordinates)
    bbox = calculate_bounding_box(coordinates)

    return {
        'area_sqm': round(area_sqm, 2),
        'area_hectares': round(area_sqm / 10000, 4),  # 1 hectare = 10,000 sqm
        'area_acres': round(area_sqm / 4046.86, 4),   # 1 acre = 4046.86 sqm
        'perimeter_m': round(perimeter_m, 2),
        'centroid': {
            'lat': round(centroid[0], 6),
            'lon': round(centroid[1], 6)
        },
        'bounding_box': {
            'min_lat': round(bbox['min_lat'], 6),
            'max_lat': round(bbox['max_lat'], 6),
            'min_lon': round(bbox['min_lon'], 6),
            'max_lon': round(bbox['max_lon'], 6),
            'width_m': round(bbox['width_m'], 2),
            'height_m': round(bbox['height_m'], 2)
        }
    }


def format_area_display(area_sqm: float) -> str:
    """
    Format area for display, choosing appropriate unit.

    Args:
        area_sqm: Area in square meters

    Returns:
        Formatted string with appropriate unit
    """
    hectares = area_sqm / 10000

    if hectares >= 1:
        return f"{hectares:.2f} ha"
    elif area_sqm >= 1000:
        return f"{area_sqm / 1000:.2f} km²" if area_sqm >= 1000000 else f"{area_sqm:.0f} m²"
    else:
        return f"{area_sqm:.1f} m²"


def format_distance_display(distance_m: float) -> str:
    """
    Format distance for display, choosing appropriate unit.

    Args:
        distance_m: Distance in meters

    Returns:
        Formatted string with appropriate unit
    """
    if distance_m >= 1000:
        return f"{distance_m / 1000:.2f} km"
    else:
        return f"{distance_m:.0f} m"
