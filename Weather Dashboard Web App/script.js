/**
 * Aether Weather Dashboard — script.js
 * Real-time weather via OpenWeatherMap API
 * Features: search, geolocation, 5-day forecast, hourly strip,
 *           unit toggle (°C/°F), dark/light mode, recent history,
 *           dynamic background, animated icons, error handling.
 *
 * ⚠️  Replace YOUR_API_KEY_HERE with your OpenWeatherMap API key:
 *     https://home.openweathermap.org/api_keys
 */

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────
const API_KEY = 'fa24a60ce8d541d99da42338262204';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const MAX_RECENT = 6;

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
let state = {
  unit:         'metric',   // 'metric' | 'imperial'
  theme:        'dark',
  lastCity:     null,
  lastCoords:   null,       // { lat, lon }
  weatherClass: '',
};

// ─────────────────────────────────────────────
//  DOM REFS
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const searchInput    = $('search-input');
const searchBtn      = $('search-btn');
const geoBtn         = $('geo-btn');
const themeBtn       = $('theme-btn');
const unitToggle     = $('unit-toggle');
const loader         = $('loader');
const errorState     = $('error-state');
const errorTitle     = $('error-title');
const errorMsg       = $('error-msg');
const retryBtn       = $('retry-btn');
const welcomeState   = $('welcome-state');
const dashboard      = $('dashboard');
const recentDropdown = $('recent-dropdown');

// Current weather
const cityName      = $('city-name');
const countryName   = $('country-name');
const localTime     = $('local-time');
const mainIcon      = $('main-icon');
const tempValue     = $('temp-value');
const tempUnit      = $('temp-unit');
const conditionText = $('condition-text');
const feelsLike     = $('feels-like');
const humidity      = $('humidity');
const windSpeed     = $('wind-speed');
const pressureEl    = $('pressure');
const visibility    = $('visibility');
const sunriseEl     = $('sunrise');
const sunsetEl      = $('sunset');
const uvValue       = $('uv-value');
const uvFill        = $('uv-fill');
const cloudCover    = $('cloud-cover');
const cloudFill     = $('cloud-fill');
const dewPoint      = $('dew-point');
const forecastGrid  = $('forecast-grid');
const hourlyStrip   = $('hourly-strip');

// ─────────────────────────────────────────────
//  WEATHER ICON MAPPING  (emoji-based, animated via CSS)
// ─────────────────────────────────────────────
const ICONS = {
  '01d': '☀️', '01n': '🌙',
  '02d': '⛅', '02n': '☁️',
  '03d': '☁️', '03n': '☁️',
  '04d': '☁️', '04n': '☁️',
  '09d': '🌧️', '09n': '🌧️',
  '10d': '🌦️', '10n': '🌧️',
  '11d': '⛈️', '11n': '⛈️',
  '13d': '❄️', '13n': '❄️',
  '50d': '🌫️', '50n': '🌫️',
};

function getIcon(code) {
  return ICONS[code] || '🌡️';
}

// Map OWM condition groups → CSS weather class (for bg effect)
function getWeatherClass(id) {
  if (id >= 200 && id < 300) return 'weather-thunderstorm';
  if (id >= 300 && id < 600) return 'weather-rain';
  if (id >= 600 && id < 700) return 'weather-snow';
  if (id >= 700 && id < 800) return 'weather-clouds';
  if (id === 800)             return 'weather-clear';
  return 'weather-clouds';
}

// ─────────────────────────────────────────────
//  CANVAS BACKGROUND (animated aurora blobs)
// ─────────────────────────────────────────────
(function initCanvas() {
  const canvas = $('bg-canvas');
  const ctx    = canvas.getContext('2d');
  let W, H;

  const blobs = [
    { x: 0.2, y: 0.3, r: 0.35, hue: 230, speed: 0.0006 },
    { x: 0.7, y: 0.6, r: 0.30, hue: 280, speed: 0.0008 },
    { x: 0.5, y: 0.1, r: 0.25, hue: 190, speed: 0.0005 },
  ];
  let t = 0;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function draw() {
    ctx.clearRect(0, 0, W, H);
    t += 1;

    blobs.forEach((b, i) => {
      const cx = (b.x + Math.sin(t * b.speed + i) * 0.15) * W;
      const cy = (b.y + Math.cos(t * b.speed * 1.3 + i) * 0.10) * H;
      const rad = b.r * Math.min(W, H);
      const alpha = document.documentElement.dataset.theme === 'light' ? 0.06 : 0.13;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, `hsla(${b.hue}, 80%, 60%, ${alpha})`);
      g.addColorStop(1, `hsla(${b.hue}, 80%, 60%, 0)`);

      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
})();

// ─────────────────────────────────────────────
//  THEME
// ─────────────────────────────────────────────
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('aether_theme', theme);
}

themeBtn.addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// Restore saved theme
applyTheme(localStorage.getItem('aether_theme') || 'dark');

// ─────────────────────────────────────────────
//  UNIT TOGGLE
// ─────────────────────────────────────────────
function setUnit(unit) {
  state.unit = unit;
  // Update active visual
  document.querySelectorAll('.unit-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.unit === unit);
  });
  localStorage.setItem('aether_unit', unit);

  // Re-fetch if we have a city or coords loaded
  if (state.lastCity)   fetchByCity(state.lastCity);
  else if (state.lastCoords) fetchByCoords(state.lastCoords.lat, state.lastCoords.lon);
}

unitToggle.addEventListener('click', () => {
  setUnit(state.unit === 'metric' ? 'imperial' : 'metric');
});
unitToggle.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') setUnit(state.unit === 'metric' ? 'imperial' : 'metric');
});

// Restore saved unit
const savedUnit = localStorage.getItem('aether_unit') || 'metric';
setUnit(savedUnit);

// ─────────────────────────────────────────────
//  RECENT SEARCHES
// ─────────────────────────────────────────────
function getRecent() {
  try { return JSON.parse(localStorage.getItem('aether_recent') || '[]'); }
  catch { return []; }
}
function saveRecent(city) {
  let list = getRecent().filter(c => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);
  list = list.slice(0, MAX_RECENT);
  localStorage.setItem('aether_recent', JSON.stringify(list));
}
function renderRecentDropdown() {
  const list = getRecent();
  if (!list.length) { recentDropdown.classList.remove('visible'); return; }
  recentDropdown.innerHTML = list.map(city =>
    `<div class="recent-item" data-city="${city}">
       <span class="ri-icon">⏱</span> ${city}
     </div>`
  ).join('');
  recentDropdown.classList.add('visible');
}

searchInput.addEventListener('focus', renderRecentDropdown);
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrapper')) {
    recentDropdown.classList.remove('visible');
  }
});
recentDropdown.addEventListener('click', e => {
  const item = e.target.closest('.recent-item');
  if (item) {
    searchInput.value = item.dataset.city;
    recentDropdown.classList.remove('visible');
    fetchByCity(item.dataset.city);
  }
});

// ─────────────────────────────────────────────
//  UI STATE HELPERS
// ─────────────────────────────────────────────
function showLoader() {
  loader.classList.remove('hidden');
  errorState.hidden = true;
  dashboard.hidden = true;
  welcomeState.style.display = 'none';
}
function showError(title, msg) {
  loader.classList.add('hidden');
  errorState.hidden = false;
  dashboard.hidden = true;
  errorTitle.textContent = title;
  errorMsg.textContent   = msg;
}
function showDashboard() {
  loader.classList.add('hidden');
  errorState.hidden = true;
  dashboard.hidden = false;
  welcomeState.style.display = 'none';
}
function hideWelcome() {
  welcomeState.style.display = 'none';
}

// ─────────────────────────────────────────────
//  API HELPERS
// ─────────────────────────────────────────────
async function apiFetch(endpoint) {
  const url = `${endpoint}&appid=${API_KEY}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─────────────────────────────────────────────
//  FETCH WEATHER (by city or coords)
// ─────────────────────────────────────────────
async function fetchByCity(city) {
  if (!city.trim()) return;
  state.lastCity   = city.trim();
  state.lastCoords = null;
  showLoader();
  try {
    const [weather, forecast] = await Promise.all([
     apiFetch(`${BASE_URL}/weather?q=Delhi&units=metric`);
    ]);
    renderWeather(weather, forecast);
    saveRecent(weather.name + ', ' + weather.sys.country);
  } catch (err) {
    handleFetchError(err);
  }
}

async function fetchByCoords(lat, lon) {
  state.lastCoords = { lat, lon };
  state.lastCity   = null;
  showLoader();
  try {
    const [weather, forecast] = await Promise.all([
      apiFetch(`${BASE_URL}/weather?q=Delhi&units=metric`);
    ]);
    renderWeather(weather, forecast);
    saveRecent(weather.name + ', ' + weather.sys.country);
  } catch (err) {
    handleFetchError(err);
  }
}

function handleFetchError(err) {
  console.error(err);
  if (!navigator.onLine) {
    showError('No Internet', 'Please check your connection and try again.');
  } else if (err.message.toLowerCase().includes('not found') || err.message.includes('404')) {
    showError('City Not Found', 'Double-check the city name and try again.');
  } else if (err.message.includes('401') || err.message.toLowerCase().includes('invalid api')) {
    showError('Invalid API Key', 'Please add your OpenWeatherMap API key to script.js.');
  } else {
    showError('Weather Unavailable', err.message || 'Something went wrong. Please try again.');
  }
}

// ─────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────
function renderWeather(w, forecast) {
  // --- Weather background class ---
  const wClass = getWeatherClass(w.weather[0].id);
  document.body.className = '';          // clear old
  document.body.classList.add(wClass);
  state.weatherClass = wClass;

  // --- Location & time ---
  cityName.textContent    = w.name;
  countryName.textContent = w.sys.country + ' · ' + getRegionName(w.sys.country);
  localTime.textContent   = formatLocalTime(w.timezone);

  // --- Icon ---
  mainIcon.textContent = getIcon(w.weather[0].icon);

  // --- Temperature ---
  tempValue.textContent = Math.round(w.main.temp);
  tempUnit.textContent  = state.unit === 'metric' ? '°C' : '°F';

  // --- Condition ---
  conditionText.textContent = w.weather[0].description;
  feelsLike.textContent     = `Feels like ${Math.round(w.main.feels_like)}${state.unit === 'metric' ? '°C' : '°F'}`;

  // --- Stats ---
  humidity.textContent    = w.main.humidity + '%';
  windSpeed.textContent   = `${Math.round(w.wind.speed)} ${state.unit === 'metric' ? 'm/s' : 'mph'}`;
  pressureEl.textContent  = w.main.pressure + ' hPa';
  visibility.textContent  = w.visibility ? (w.visibility / 1000).toFixed(1) + ' km' : '—';

  const tz = w.timezone;
  sunriseEl.textContent = formatUnixTime(w.sys.sunrise, tz);
  sunsetEl.textContent  = formatUnixTime(w.sys.sunset, tz);

  // --- Highlights ---
  // UV: OWM free tier doesn't include UV directly in /weather; use clouds as proxy
  // For real UV you'd call /uvi endpoint (requires different params)
  const clouds = w.clouds?.all ?? 0;
  const uvEst  = Math.max(0, Math.round(10 - clouds / 12)).toString();
  uvValue.textContent  = uvEst;
  uvFill.style.width   = `${Math.min(100, parseInt(uvEst) * 10)}%`;

  cloudCover.textContent  = clouds + '%';
  cloudFill.style.width   = clouds + '%';

  // Dew point approximation: Td ≈ T - ((100 - RH)/5)
  const dp = state.unit === 'metric'
    ? Math.round(w.main.temp - ((100 - w.main.humidity) / 5))
    : Math.round(((w.main.temp - 32) * 5/9) - ((100 - w.main.humidity) / 5) * 9/5 + 32);
  dewPoint.textContent = dp + (state.unit === 'metric' ? '°C' : '°F');

  // --- Forecast ---
  renderForecast(forecast, tz);

  // --- Hourly ---
  renderHourly(forecast, tz);

  showDashboard();
}

// ─────────────────────────────────────────────
//  FORECAST (5-day from /forecast 3-hr data)
// ─────────────────────────────────────────────
function renderForecast(forecast, tz) {
  // Group entries by day
  const days = {};
  forecast.list.forEach(item => {
    const d = new Date((item.dt + tz) * 1000);
    const key = d.toISOString().slice(0, 10);
    if (!days[key]) days[key] = [];
    days[key].push(item);
  });

  // Take up to 5 days (skip today if we already have a full set)
  const keys = Object.keys(days).slice(0, 5);

  forecastGrid.innerHTML = '';
  keys.forEach((key, i) => {
    const entries = days[key];
    const temps   = entries.map(e => e.main.temp);
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    // Pick midday entry for icon/desc
    const mid     = entries[Math.floor(entries.length / 2)];
    const icon    = getIcon(mid.weather[0].icon);
    const desc    = mid.weather[0].description;

    const dateObj = new Date((mid.dt + tz) * 1000);
    const dayLabel = i === 0 ? 'Today' : dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

    const card = document.createElement('div');
    card.className = 'forecast-card';
    card.style.animationDelay = `${i * 0.07}s`;
    card.innerHTML = `
      <span class="fc-day">${dayLabel}</span>
      <span class="fc-icon">${icon}</span>
      <span class="fc-max">${Math.round(maxTemp)}°</span>
      <span class="fc-min">${Math.round(minTemp)}°</span>
      <span class="fc-desc">${desc}</span>
    `;
    forecastGrid.appendChild(card);
  });
}

// ─────────────────────────────────────────────
//  HOURLY STRIP (next 8 entries = 24h)
// ─────────────────────────────────────────────
function renderHourly(forecast, tz) {
  hourlyStrip.innerHTML = '';
  const items = forecast.list.slice(0, 8);
  items.forEach((item, i) => {
    const d = new Date((item.dt + tz) * 1000);
    const hour = i === 0 ? 'Now' : d.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: true,
    });

    const el = document.createElement('div');
    el.className = 'hourly-item';
    el.innerHTML = `
      <span class="hi-time">${hour}</span>
      <span class="hi-icon">${getIcon(item.weather[0].icon)}</span>
      <span class="hi-temp">${Math.round(item.main.temp)}°</span>
    `;
    hourlyStrip.appendChild(el);
  });
}

// ─────────────────────────────────────────────
//  TIME HELPERS
// ─────────────────────────────────────────────
function formatLocalTime(tzOffsetSec) {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const local = new Date(utcMs + tzOffsetSec * 1000);
  return local.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
       + ' · ' + local.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatUnixTime(unix, tzOffsetSec) {
  const utcMs = unix * 1000 + tzOffsetSec * 1000;
  const d = new Date(utcMs);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}

// ─────────────────────────────────────────────
//  COUNTRY → REGION NAME (light map)
// ─────────────────────────────────────────────
const COUNTRY_NAMES = {
  US:'United States', GB:'United Kingdom', IN:'India', CN:'China', FR:'France',
  DE:'Germany', JP:'Japan', AU:'Australia', CA:'Canada', BR:'Brazil',
  MX:'Mexico', RU:'Russia', ZA:'South Africa', NG:'Nigeria', EG:'Egypt',
  PK:'Pakistan', BD:'Bangladesh', ID:'Indonesia', TR:'Turkey', SA:'Saudi Arabia',
  IT:'Italy', ES:'Spain', PL:'Poland', UA:'Ukraine', KR:'South Korea',
  AR:'Argentina', TH:'Thailand', MY:'Malaysia', NL:'Netherlands', SE:'Sweden',
};
function getRegionName(code) { return COUNTRY_NAMES[code] || ''; }

// ─────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────
function triggerSearch() {
  const val = searchInput.value.trim();
  if (!val) return;
  recentDropdown.classList.remove('visible');
  fetchByCity(val);
}

searchBtn.addEventListener('click', triggerSearch);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') triggerSearch();
  if (e.key === 'Escape') recentDropdown.classList.remove('visible');
});

// ─────────────────────────────────────────────
//  GEOLOCATION
// ─────────────────────────────────────────────
geoBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Not Supported', 'Your browser does not support geolocation.');
    return;
  }
  showLoader();
  navigator.geolocation.getCurrentPosition(
    pos => fetchByCoords(pos.coords.latitude, pos.coords.longitude),
    err => {
      console.error(err);
      showError('Location Denied', 'Please allow location access or search manually.');
    },
    { timeout: 10000 }
  );
});

// ─────────────────────────────────────────────
//  RETRY
// ─────────────────────────────────────────────
retryBtn.addEventListener('click', () => {
  if (state.lastCity)         fetchByCity(state.lastCity);
  else if (state.lastCoords)  fetchByCoords(state.lastCoords.lat, state.lastCoords.lon);
  else {
    errorState.hidden = true;
    welcomeState.style.display = '';
  }
});

// ─────────────────────────────────────────────
//  AUTO-LOAD: last searched city or geolocation
// ─────────────────────────────────────────────
(function autoLoad() {
  const recent = getRecent();

  if (recent.length) {
    // Parse city name (strip country suffix)
    const cityRaw  = recent[0];
    const cityOnly = cityRaw.split(',')[0].trim();
    fetchByCity(cityOnly);
  } else {
    // Try geolocation silently
    if (navigator.geolocation) {
      showLoader();
      navigator.geolocation.getCurrentPosition(
        pos => fetchByCoords(pos.coords.latitude, pos.coords.longitude),
        () => {
          // Fail silently → show welcome
          loader.classList.add('hidden');
          welcomeState.style.display = '';
        },
        { timeout: 5000 }
      );
    }
    // else welcome state remains visible (default)
  }
})();