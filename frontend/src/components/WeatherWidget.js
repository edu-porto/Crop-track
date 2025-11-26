import React, { useState, useEffect } from 'react';
import './WeatherWidget.css';

// Weather code to icon and description mapping
const weatherCodes = {
  0: { icon: '☀️', desc: 'Clear sky' },
  1: { icon: '🌤️', desc: 'Mainly clear' },
  2: { icon: '⛅', desc: 'Partly cloudy' },
  3: { icon: '☁️', desc: 'Overcast' },
  45: { icon: '🌫️', desc: 'Foggy' },
  48: { icon: '🌫️', desc: 'Depositing rime fog' },
  51: { icon: '🌧️', desc: 'Light drizzle' },
  53: { icon: '🌧️', desc: 'Moderate drizzle' },
  55: { icon: '🌧️', desc: 'Dense drizzle' },
  61: { icon: '🌧️', desc: 'Slight rain' },
  63: { icon: '🌧️', desc: 'Moderate rain' },
  65: { icon: '🌧️', desc: 'Heavy rain' },
  71: { icon: '🌨️', desc: 'Slight snow' },
  73: { icon: '🌨️', desc: 'Moderate snow' },
  75: { icon: '❄️', desc: 'Heavy snow' },
  80: { icon: '🌦️', desc: 'Rain showers' },
  81: { icon: '🌦️', desc: 'Moderate showers' },
  82: { icon: '⛈️', desc: 'Violent showers' },
  95: { icon: '⛈️', desc: 'Thunderstorm' },
  96: { icon: '⛈️', desc: 'Thunderstorm with hail' },
  99: { icon: '⛈️', desc: 'Severe thunderstorm' }
};

const getWeatherInfo = (code) => {
  return weatherCodes[code] || { icon: '🌡️', desc: 'Unknown' };
};

const getDayName = (dateStr, index) => {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

function WeatherWidget({ latitude, longitude }) {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchWeather = async () => {
      if (!latitude || !longitude) {
        setError('No location available');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Open-Meteo free API - no API key needed
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=7`
        );

        if (!response.ok) {
          throw new Error('Failed to fetch weather data');
        }

        const data = await response.json();
        setWeather(data);
        setError(null);
      } catch (err) {
        console.error('Weather fetch error:', err);
        setError('Failed to load weather');
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
  }, [latitude, longitude]);

  if (loading) {
    return (
      <div className="weather-widget loading">
        <div className="weather-loading-spinner" />
        <span>Loading weather...</span>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="weather-widget error">
        <span className="weather-error-icon">⚠️</span>
        <span>{error || 'Weather unavailable'}</span>
      </div>
    );
  }

  const current = weather.current;
  const daily = weather.daily;
  const currentWeather = getWeatherInfo(current.weather_code);

  return (
    <div className="weather-widget">
      {/* Current Weather */}
      <div className="weather-current">
        <div className="weather-current-main">
          <span className="weather-icon-large">{currentWeather.icon}</span>
          <div className="weather-temp-main">
            <span className="weather-temp-value">{Math.round(current.temperature_2m)}°</span>
            <span className="weather-temp-unit">C</span>
          </div>
        </div>
        <div className="weather-current-details">
          <span className="weather-description">{currentWeather.desc}</span>
          <div className="weather-stats">
            <div className="weather-stat">
              <span className="stat-icon">💧</span>
              <span>{current.relative_humidity_2m}%</span>
            </div>
            <div className="weather-stat">
              <span className="stat-icon">💨</span>
              <span>{Math.round(current.wind_speed_10m)} km/h</span>
            </div>
          </div>
        </div>
      </div>

      {/* 7-Day Forecast */}
      <div className="weather-forecast">
        <div className="weather-forecast-title">7-Day Forecast</div>
        <div className="weather-forecast-list">
          {daily.time.slice(0, 7).map((date, index) => {
            const dayWeather = getWeatherInfo(daily.weather_code[index]);
            return (
              <div key={date} className={`weather-day ${index === 0 ? 'today' : ''}`}>
                <span className="day-name">{getDayName(date, index)}</span>
                <span className="day-icon">{dayWeather.icon}</span>
                <div className="day-temps">
                  <span className="day-temp-max">{Math.round(daily.temperature_2m_max[index])}°</span>
                  <span className="day-temp-min">{Math.round(daily.temperature_2m_min[index])}°</span>
                </div>
                <div className="day-rain">
                  <span className="rain-icon">💧</span>
                  <span>{daily.precipitation_probability_max[index] || 0}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Attribution */}
      <div className="weather-attribution">
        Data: <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>
      </div>
    </div>
  );
}

export default WeatherWidget;
