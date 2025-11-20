"""
Utility functions for crop analysis system
"""
import json


def point_in_polygon(lat, lng, polygon_coords):
    """
    Ray casting algorithm to check if a point is inside a polygon.
    
    Args:
        lat: Latitude of the point
        lng: Longitude of the point
        polygon_coords: List of [lat, lng] pairs defining the polygon
        
    Returns:
        True if point is inside polygon, False otherwise
    """
    if not polygon_coords or len(polygon_coords) < 3:
        return False
    
    x, y = lng, lat
    n = len(polygon_coords)
    inside = False
    
    p1x, p1y = polygon_coords[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon_coords[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    
    return inside


def validate_polygon(coordinates):
    """
    Validate that polygon coordinates are valid.
    
    Args:
        coordinates: List of [lat, lng] pairs
        
    Returns:
        (is_valid, error_message)
    """
    if not coordinates:
        return False, "Polygon coordinates cannot be empty"
    
    if len(coordinates) < 3:
        return False, "Polygon must have at least 3 points"
    
    # Check that all coordinates are valid
    for coord in coordinates:
        if not isinstance(coord, list) or len(coord) != 2:
            return False, "Each coordinate must be [lat, lng]"
        
        lat, lng = coord
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            return False, "Latitude and longitude must be numbers"
        
        if not (-90 <= lat <= 90):
            return False, "Latitude must be between -90 and 90"
        
        if not (-180 <= lng <= 180):
            return False, "Longitude must be between -180 and 180"
    
    return True, None


def get_health_color(health_label):
    """
    Get color code for health label.
    
    Args:
        health_label: Health status label
        
    Returns:
        Color name (for CSS/marker icons)
    """
    color_map = {
        'healthy': 'green',
        'mildly_stressed': 'yellow',
        'diseased': 'orange',
        'pest_damage': 'red',
        'nutrient_deficiency': 'purple',
        'unknown': 'gray'
    }
    return color_map.get(health_label, 'gray')


def calculate_field_bounds(polygon_coords):
    """
    Calculate bounding box for a field polygon.
    
    Args:
        polygon_coords: List of [lat, lng] pairs
        
    Returns:
        Dictionary with min_lat, max_lat, min_lng, max_lng
    """
    if not polygon_coords:
        return None
    
    lats = [coord[0] for coord in polygon_coords]
    lngs = [coord[1] for coord in polygon_coords]
    
    return {
        'min_lat': min(lats),
        'max_lat': max(lats),
        'min_lng': min(lngs),
        'max_lng': max(lngs),
        'center_lat': (min(lats) + max(lats)) / 2,
        'center_lng': (min(lngs) + max(lngs)) / 2
    }

