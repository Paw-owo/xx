const WEATHER_LABELS = new Map([
  [0, '晴朗'], [1, '大致晴朗'], [2, '多云'], [3, '阴天'],
  [45, '有雾'], [48, '雾凇'], [51, '毛毛雨'], [53, '毛毛雨'], [55, '较强毛毛雨'],
  [56, '冻毛毛雨'], [57, '较强冻毛毛雨'], [61, '小雨'], [63, '中雨'], [65, '大雨'],
  [66, '冻雨'], [67, '较强冻雨'], [71, '小雪'], [73, '中雪'], [75, '大雪'],
  [77, '米雪'], [80, '阵雨'], [81, '较强阵雨'], [82, '强阵雨'],
  [85, '阵雪'], [86, '较强阵雪'], [95, '雷雨'], [96, '雷雨伴冰雹'], [99, '强雷雨伴冰雹']
]);

export function weatherCodeLabel(code) {
  return WEATHER_LABELS.get(Number(code)) || '天气状态未知';
}

export function buildOpenMeteoForecastUrl(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    timezone: 'auto'
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function buildOpenMeteoGeocodingUrl(cityName) {
  const params = new URLSearchParams({ name: String(cityName || '').trim(), count: '5', language: 'zh', format: 'json' });
  return `https://geocoding-api.open-meteo.com/v1/search?${params}`;
}

export function normalizeOpenMeteoWeather(data, location = {}) {
  const current = data?.current;
  const required = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'weather_code', 'wind_speed_10m'];
  if (!current || required.some((field) => !Number.isFinite(Number(current[field])))) return null;
  return {
    cityName: String(location.cityName || '').trim(),
    latitude: Number(data.latitude ?? location.latitude), longitude: Number(data.longitude ?? location.longitude),
    timezone: String(data.timezone || location.timezone || ''),
    temperature: Number(current.temperature_2m), humidity: Number(current.relative_humidity_2m),
    apparentTemperature: Number(current.apparent_temperature), weatherCode: Number(current.weather_code),
    windSpeed: Number(current.wind_speed_10m), isDay: Number(current.is_day) === 1,
    updatedAt: Date.now()
  };
}
