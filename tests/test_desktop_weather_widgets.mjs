import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildOpenMeteoForecastUrl,
  buildOpenMeteoGeocodingUrl,
  normalizeOpenMeteoWeather,
  weatherCodeLabel
} from '../core/weather.js';

const forecast = new URL(buildOpenMeteoForecastUrl(31.23, 121.47));
assert.equal(forecast.hostname, 'api.open-meteo.com');
assert.equal(forecast.searchParams.get('latitude'), '31.23');
assert.match(forecast.searchParams.get('current'), /relative_humidity_2m/);
assert.equal(forecast.searchParams.get('timezone'), 'auto');

const geocoding = new URL(buildOpenMeteoGeocodingUrl(' 上海 '));
assert.equal(geocoding.hostname, 'geocoding-api.open-meteo.com');
assert.equal(geocoding.searchParams.get('name'), '上海');
assert.equal(weatherCodeLabel(95), '雷雨');

const weather = normalizeOpenMeteoWeather({
  latitude: 31.2, longitude: 121.5, timezone: 'Asia/Shanghai',
  current: { temperature_2m: 26.4, relative_humidity_2m: 72, apparent_temperature: 28.1, is_day: 1, weather_code: 2, wind_speed_10m: 9.3 }
}, { cityName: '上海' });
assert.deepEqual({
  cityName: weather.cityName, temperature: weather.temperature, humidity: weather.humidity,
  apparentTemperature: weather.apparentTemperature, weatherCode: weather.weatherCode,
  windSpeed: weather.windSpeed, isDay: weather.isDay
}, { cityName: '上海', temperature: 26.4, humidity: 72, apparentTemperature: 28.1, weatherCode: 2, windSpeed: 9.3, isDay: true });
assert.equal(normalizeOpenMeteoWeather({ current: {} }), null);

const desktop = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.doesNotMatch(desktop, /wttr\.in/);
assert.doesNotMatch(desktop.match(/const WIDGETS = \[[\s\S]*?\];/)?.[0] || '', /id: 'focus'/);
assert.match(desktop, /updateWeather\(\{ force: true \}\)/);
assert.match(desktop, /openApp\('anniversary'\)/);
assert.match(desktop, /function destroyWidgets\(\)/);

console.log('desktop weather and widget behavior checks passed');
