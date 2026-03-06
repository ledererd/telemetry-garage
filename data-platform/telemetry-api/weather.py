"""
Weather API integration for track locations.
Uses OpenWeatherMap API (free tier available).
"""

import os
import requests
from typing import Optional, Dict, Any


class WeatherService:
    """Service for fetching weather data."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("OPENWEATHER_API_KEY")
        self.base_url = "https://api.openweathermap.org/data/2.5/weather"
    
    def get_weather(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """
        Get current weather for GPS coordinates.
        
        Returns:
            {
                "temperature": float,  # Celsius
                "wind_direction": float,   # Degrees (0-360)
                "wind_speed": float,        # m/s
                "description": str,         # Weather description
                "humidity": int,            # Percentage
                "pressure": float           # hPa
            }
        """
        if not self.api_key:
            # Return mock data if no API key
            return {
                "temperature": 20.0,
                "wind_direction": 180.0,
                "wind_speed": 5.0,
                "description": "Clear sky",
                "humidity": 65,
                "pressure": 1013.25,
                "available": False,
                "error": "OpenWeatherMap API key not configured"
            }
        
        try:
            params = {
                "lat": latitude,
                "lon": longitude,
                "appid": self.api_key,
                "units": "metric"
            }
            
            response = requests.get(self.base_url, params=params, timeout=5)
            response.raise_for_status()
            
            data = response.json()
            
            return {
                "temperature": data["main"]["temp"],
                "wind_direction": data.get("wind", {}).get("deg", 0),
                "wind_speed": data.get("wind", {}).get("speed", 0),
                "description": data["weather"][0]["description"].title(),
                "humidity": data["main"]["humidity"],
                "pressure": data["main"]["pressure"],
                "available": True
            }
        except requests.exceptions.RequestException as e:
            return {
                "temperature": None,
                "wind_direction": None,
                "wind_speed": None,
                "description": "Weather data unavailable",
                "humidity": None,
                "pressure": None,
                "available": False,
                "error": str(e)
            }


# Global instance
weather_service = WeatherService()

