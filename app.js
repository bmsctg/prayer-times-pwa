// ── Prayer Times PWA Engine & Push Notification Manager ──────────────────────

// Production VAPID Public Key for Web Push Subscriptions
const VAPID_PUBLIC_KEY = 'BP1Da-UxqCrFMGH55kSRD1qea2ONl8xQNYcFM9g4zPPIm1VNn41EQM-N5lqqLlBXU-c0H_Mm4vfoUA0qYkqb9OU';
// Cloudflare Worker backend URL (Optional: replace when worker is deployed to CF)
let WORKER_URL = 'https://prayer-times-push.bms.workers.dev';

// DOM Elements
const prayerList = document.getElementById('prayer-times');
const placeSelect = document.getElementById('place-select');
const sourceSelect = document.getElementById('source-select');
const gpsBtn = document.getElementById('gps-btn');
const dateEl = document.getElementById('date-today');
const hijriEl = document.getElementById('hijri-date');
const qiblaTextEl = document.getElementById('qibla-text');
const qiblaDegreesEl = document.getElementById('qibla-degrees');
const compassNeedle = document.getElementById('compass-needle');
const prevDayBtn = document.getElementById('prev-day-btn');
const nextDayBtn = document.getElementById('next-day-btn');
const todayBtn = document.getElementById('today-btn');

const notifyCheck = document.getElementById('notify-check');
const notifyStatus = document.getElementById('notify-status');
const testNotifyBtn = document.getElementById('test-notify-btn');

const themeToggleBtn = document.getElementById('theme-toggle-btn');
const audioToggleBtn = document.getElementById('audio-toggle-btn');
const audioIconOn = document.getElementById('audio-icon-on');
const audioIconOff = document.getElementById('audio-icon-off');

// Application State
let dayOffset = 0;
let ifisCache = null;
let notifyInterval = null;
let bannerInterval = null;
let todayTimings = null;
let notifiedKeys = {};
let isAudioEnabled = localStorage.getItem('prayer-audio') !== 'off';

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

// Expanded Swedish Cities
const PLACES = {
  stockholm: {
    name: 'Stockholm',
    city: 'Stockholm',
    country: 'Sweden',
    lat: 59.3293,
    lon: 18.0686,
    useCoords: false,
    ifisCity: 'Stockholm'
  },
  gothenburg: {
    name: 'Gothenburg',
    city: 'Gothenburg',
    country: 'Sweden',
    lat: 57.7089,
    lon: 11.9746,
    useCoords: false,
    ifisCity: 'Göteborg'
  },
  malmo: {
    name: 'Malmö',
    city: 'Malmö',
    country: 'Sweden',
    lat: 55.6050,
    lon: 13.0038,
    useCoords: true,
    ifisCity: 'Göteborg'
  },
  uppsala: {
    name: 'Uppsala',
    city: 'Uppsala',
    country: 'Sweden',
    lat: 59.8586,
    lon: 17.6389,
    useCoords: true,
    ifisCity: 'Stockholm'
  },
  vasteras: {
    name: 'Västerås',
    city: 'Västerås',
    country: 'Sweden',
    lat: 59.6099,
    lon: 16.5448,
    useCoords: true,
    ifisCity: 'Stockholm'
  },
  orebro: {
    name: 'Örebro',
    city: 'Örebro',
    country: 'Sweden',
    lat: 59.2753,
    lon: 15.2134,
    useCoords: true,
    ifisCity: 'Stockholm'
  },
  linkoping: {
    name: 'Linköping',
    city: 'Linköping',
    country: 'Sweden',
    lat: 58.4108,
    lon: 15.6216,
    useCoords: true,
    ifisCity: 'Stockholm'
  },
  helsingborg: {
    name: 'Helsingborg',
    city: 'Helsingborg',
    country: 'Sweden',
    lat: 56.0465,
    lon: 12.6945,
    useCoords: true,
    ifisCity: 'Göteborg'
  },
  vasterhaninge: {
    name: 'Västerhaninge',
    city: 'Haninge',
    country: 'Sweden',
    lat: 59.1167,
    lon: 18.1000,
    useCoords: true,
    ifisCity: 'Stockholm'
  }
};

// Helper Utilities
function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function getDateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function toAladhanDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function toIfisDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateQiblaBearing(lat, lon) {
  const kaabaLat = toRad(KAABA_LAT);
  const kaabaLon = toRad(KAABA_LON);
  const userLat = toRad(lat);
  const userLon = toRad(lon);
  const dLon = kaabaLon - userLon;
  const y = Math.sin(dLon);
  const x = Math.cos(userLat) * Math.tan(kaabaLat) - Math.sin(userLat) * Math.cos(dLon);
  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

function getSelectedPlace() {
  return PLACES[placeSelect.value] || PLACES.stockholm;
}

function getSelectedSource() {
  return sourceSelect.value || 'ifis';
}

function updateQiblaDisplay() {
  const place = getSelectedPlace();
  const bearing = calculateQiblaBearing(place.lat, place.lon);
  const bearingFormatted = `${bearing.toFixed(1)}°`;
  
  if (qiblaDegreesEl) qiblaDegreesEl.textContent = bearingFormatted;
  if (qiblaTextEl) qiblaTextEl.textContent = `Qibla is ${bearingFormatted} from North (${place.name})`;
  if (compassNeedle) compassNeedle.style.transform = `rotate(${bearing.toFixed(1)}deg)`;
}

// Play Notification Chime Sound
function playNotificationSound() {
  if (!isAudioEnabled) return;
  try {
    const audio = new Audio('adhan.wav');
    audio.play().catch(() => {
      playWebAudioChime();
    });
  } catch (_) {
    playWebAudioChime();
  }
}

// Fallback Web Audio API Bell Chime
function playWebAudioChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = [329.63, 493.88, 659.25];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + 2.0);
    });
  } catch (_) {}
}

// API Data Fetching
async function fetchIfis(place, dateStr) {
  if (!ifisCache) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`ifis-data.json?v=${today}`);
      if (res.ok) {
        const data = await res.json();
        const hasData = Object.values(data).some(c => Object.keys(c).length > 0);
        if (hasData) ifisCache = data;
      }
    } catch (_) {
      return null;
    }
  }
  if (!ifisCache) return null;
  const cityData = ifisCache[place.ifisCity];
  if (!cityData) return null;
  return cityData[dateStr] || null;
}

async function fetchAladhan(place, dateStr) {
  const baseParams = `method=3&date=${dateStr}`;
  const url = place.useCoords
    ? `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${place.lat}&longitude=${place.lon}&${baseParams}`
    : `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(place.city)}&country=${place.country}&${baseParams}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.data.timings;
}

async function loadHijriDate() {
  const date = getDateForOffset(dayOffset);
  const dateStr = toAladhanDate(date);

  dateEl.textContent = date.toLocaleDateString('en-SE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  try {
    const res = await fetch(`https://api.aladhan.com/v1/gToH?date=${dateStr}`);
    const data = await res.json();
    if (data.data && data.data.hijri) {
      const h = data.data.hijri;
      hijriEl.textContent = `${h.day} ${h.month.en} ${h.year} AH`;
    } else {
      hijriEl.textContent = '—';
    }
  } catch (e) {
    hijriEl.textContent = '—';
  }
}

function getNextPrayerIndex(timings) {
  if (dayOffset !== 0) return -1;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < PRAYERS.length; i++) {
    const t = timings[PRAYERS[i]];
    if (!t) continue;
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > nowMins) return i;
  }
  return -1;
}

async function loadPrayerTimes() {
  const place = getSelectedPlace();
  const date = getDateForOffset(dayOffset);
  const source = getSelectedSource();

  prayerList.innerHTML = '<li><span class="prayer-name">Loading prayer times…</span></li>';
  if (dayOffset !== 0) clearBanner();

  let timings = null;
  let usedSource = source;

  if (source === 'ifis') {
    timings = await fetchIfis(place, toIfisDate(date));
    if (!timings) usedSource = 'aladhan';
  }

  if (!timings) {
    try {
      timings = await fetchAladhan(place, toAladhanDate(date));
    } catch (e) {
      prayerList.innerHTML = '<li><span class="prayer-name">Failed to load prayer times</span></li>';
      return;
    }
  }

  const nextIdx = getNextPrayerIndex(timings);

  prayerList.innerHTML = '';
  PRAYERS.forEach((prayer, i) => {
    const li = document.createElement('li');
    if (i === nextIdx) li.classList.add('active');
    li.innerHTML = `
      <span class="prayer-name">${prayer}</span>
      <span class="prayer-time">${timings[prayer]}</span>
    `;
    prayerList.appendChild(li);
  });

  if (source === 'ifis' && usedSource === 'aladhan') {
    const notice = document.createElement('li');
    notice.className = 'source-notice';
    notice.innerHTML = '<span>IFIS data unavailable — showing Aladhan (MWL)</span>';
    prayerList.appendChild(notice);
  }

  if (source === 'ifis' && usedSource === 'ifis' && place.useCoords) {
    const notice = document.createElement('li');
    notice.className = 'source-notice';
    notice.innerHTML = `<span>IFIS times are for ${place.ifisCity} — Aladhan recommended for ${place.name}</span>`;
    prayerList.appendChild(notice);
  }

  startNextPrayerBanner(timings);
  if (dayOffset === 0 && notifyCheck.checked) {
    scheduleNotifications(timings);
  }
}

// Next Prayer Countdown & Progress Bar
function clearBanner() {
  if (bannerInterval) {
    clearInterval(bannerInterval);
    bannerInterval = null;
  }
  document.getElementById('next-prayer-banner').style.display = 'none';
}

async function startNextPrayerBanner(todayTimings) {
  clearBanner();
  if (dayOffset !== 0) return;

  const banner = document.getElementById('next-prayer-banner');
  const labelEl = document.getElementById('banner-label');
  const nameEl = document.getElementById('banner-prayer-name');
  const atEl = document.getElementById('banner-prayer-at');
  const countdownEl = document.getElementById('banner-countdown');
  const progressBar = document.getElementById('prayer-progress-bar');

  function formatCountdown(diff) {
    const totalSecs = Math.max(0, Math.floor(diff / 1000));
    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hours > 0) return `in ${hours}h ${mins}m ${secs}s`;
    if (mins > 0) return `in ${mins}m ${String(secs).padStart(2, '0')}s`;
    return `in ${secs}s`;
  }

  function findNextFromTimings(timings, baseDate) {
    let next = null;
    let prev = null;
    const now = Date.now();

    for (let i = 0; i < PRAYERS.length; i++) {
      const prayer = PRAYERS[i];
      const t = timings[prayer];
      if (!t) continue;
      const [h, m] = t.split(':').map(Number);
      const target = new Date(baseDate);
      target.setHours(h, m, 0, 0);

      if (target.getTime() > now) {
        if (!next) {
          next = { name: prayer, time: t, target, diff: target - now };
          // Previous prayer is either the one right before or start of day
          if (i > 0 && timings[PRAYERS[i - 1]]) {
            const [ph, pm] = timings[PRAYERS[i - 1]].split(':').map(Number);
            const pTarget = new Date(baseDate);
            pTarget.setHours(ph, pm, 0, 0);
            prev = pTarget;
          } else {
            const pTarget = new Date(baseDate);
            pTarget.setHours(0, 0, 0, 0);
            prev = pTarget;
          }
        }
      }
    }
    return { next, prev };
  }

  function startTicking(next, prevTarget, label) {
    banner.style.display = '';
    labelEl.textContent = label;
    nameEl.textContent = next.name;
    atEl.textContent = `at ${next.time}`;
    countdownEl.textContent = formatCountdown(next.target - Date.now());

    const totalDuration = next.target - (prevTarget ? prevTarget.getTime() : (next.target - 4 * 3600 * 1000));

    function updateProgress() {
      const remaining = next.target - Date.now();
      if (remaining <= 0) {
        startNextPrayerBanner(todayTimings);
        return;
      }
      countdownEl.textContent = formatCountdown(remaining);
      const elapsed = totalDuration - remaining;
      const pct = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
      if (progressBar) progressBar.style.width = `${pct}%`;
    }

    updateProgress();
    bannerInterval = setInterval(updateProgress, 1000);
  }

  const { next: todayNext, prev: prevTarget } = findNextFromTimings(todayTimings, new Date());
  if (todayNext) {
    startTicking(todayNext, prevTarget, 'Next Prayer');
    return;
  }

  // Tomorrow's First Prayer
  const place = getSelectedPlace();
  const source = getSelectedSource();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  let tomorrowTimings = null;
  if (source === 'ifis') tomorrowTimings = await fetchIfis(place, toIfisDate(tomorrow));
  if (!tomorrowTimings) {
    try { tomorrowTimings = await fetchAladhan(place, toAladhanDate(tomorrow)); } catch (_) {}
  }
  if (!tomorrowTimings) return;

  const { next: tomorrowNext } = findNextFromTimings(tomorrowTimings, tomorrow);
  if (tomorrowNext) {
    startTicking(tomorrowNext, null, "Tomorrow's First Prayer");
  }
}

// ── Web Push & Service Worker Notifications ─────────────────────────────────

function urlBase64ToUint8Array(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return new Uint8Array([...atob(b64)].map(c => c.charCodeAt(0)));
}

async function subscribeToPush(timings) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const now = new Date();
    const prayers = PRAYERS.map(name => {
      const t = timings[name];
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      if (target <= now) return null;
      return { name, time: t, ts: target.getTime() };
    }).filter(Boolean);

    // Try posting to Cloudflare Worker backend if available
    try {
      await fetch(`${WORKER_URL}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, prayers, city: getSelectedPlace().name }),
      });
    } catch (_) {
      // Backend worker offline or unconfigured; Service Worker local notifications are active
    }
  } catch (e) {
    console.log('Local notifications active (push subscription fallback):', e);
  }
}

function clearNotifyTimers() {
  if (notifyInterval) {
    clearInterval(notifyInterval);
    notifyInterval = null;
  }
}

function checkAndNotify() {
  if (!todayTimings || !notifyCheck.checked) return;
  const now = new Date();
  const todayStr = toIfisDate(now);
  const nowH = now.getHours();
  const nowM = now.getMinutes();

  PRAYERS.forEach(prayer => {
    const t = todayTimings[prayer];
    if (!t) return;
    const [h, m] = t.split(':').map(Number);
    const key = `${prayer}-${todayStr}`;

    if (h === nowH && m === nowM && !notifiedKeys[key]) {
      notifiedKeys[key] = true;
      playNotificationSound();
      
      if ('Notification' in window && Notification.permission === 'granted') {
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification('Prayer Time', {
              body: `It's time for ${prayer} (${t})`,
              icon: 'icon-192.png',
              badge: 'icon-192.png',
              tag: `prayer-${prayer}`,
              renotify: true
            });
          });
        } else {
          new Notification('Prayer Time', {
            body: `It's time for ${prayer} (${t})`,
            icon: 'icon-192.png',
            tag: prayer
          });
        }
      }
    }
  });
}

function countUpcoming(timings) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return PRAYERS.filter(p => {
    const t = timings[p];
    if (!t) return false;
    const [h, m] = t.split(':').map(Number);
    return (h * 60 + m) > nowMins;
  }).length;
}

async function scheduleNotifications(timings) {
  todayTimings = timings;
  clearNotifyTimers();

  if (!notifyCheck.checked) return;

  const upcoming = countUpcoming(timings);
  if (upcoming === 0) {
    notifyStatus.textContent = 'No remaining prayers today';
    return;
  }

  subscribeToPush(timings);
  notifyInterval = setInterval(checkAndNotify, 15000);
  checkAndNotify();

  notifyStatus.textContent = `✓ ${upcoming} prayer alert${upcoming > 1 ? 's' : ''} scheduled for today`;
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    notifyStatus.textContent = 'Notifications are not supported in this browser';
    notifyCheck.checked = false;
    return false;
  }

  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }

  if (perm !== 'granted') {
    notifyStatus.textContent = 'Permission denied — please enable in browser settings';
    notifyCheck.checked = false;
    localStorage.setItem('prayer-notify', 'off');
    return false;
  }

  return true;
}

async function handleNotifyToggle() {
  if (notifyCheck.checked) {
    const ok = await enableNotifications();
    if (!ok) return;
    localStorage.setItem('prayer-notify', 'on');

    const place = getSelectedPlace();
    const source = getSelectedSource();
    let timings = null;
    if (source === 'ifis') timings = await fetchIfis(place, toIfisDate(new Date()));
    if (!timings) {
      try { timings = await fetchAladhan(place, toAladhanDate(new Date())); } catch (_) {}
    }
    if (timings) scheduleNotifications(timings);
  } else {
    clearNotifyTimers();
    todayTimings = null;
    localStorage.setItem('prayer-notify', 'off');
    notifyStatus.textContent = 'Prayer alerts disabled';
  }
}

// Trigger Test Notification
function triggerTestNotification() {
  playNotificationSound();
  if ('Notification' in window && Notification.permission === 'granted') {
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification('Test Prayer Alert', {
          body: 'Notification service is working perfectly!',
          icon: 'icon-192.png',
          tag: 'test-prayer',
          renotify: true
        });
      });
    } else {
      new Notification('Test Prayer Alert', {
        body: 'Notification service is working perfectly!',
        icon: 'icon-192.png'
      });
    }
    notifyStatus.textContent = '✓ Test notification fired successfully!';
  } else {
    notifyCheck.checked = true;
    handleNotifyToggle();
  }
}

// GPS Location Handler
function handleGpsLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser');
    return;
  }

  gpsBtn.style.opacity = '0.5';
  navigator.geolocation.getCurrentPosition(pos => {
    gpsBtn.style.opacity = '1';
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    // Find nearest city in PLACES
    let nearestKey = 'stockholm';
    let minDist = Infinity;

    Object.keys(PLACES).forEach(key => {
      const p = PLACES[key];
      const d = Math.hypot(p.lat - lat, p.lon - lon);
      if (d < minDist) {
        minDist = d;
        nearestKey = key;
      }
    });

    placeSelect.value = nearestKey;
    loadPrayerTimes();
    updateQiblaDisplay();
  }, () => {
    gpsBtn.style.opacity = '1';
    alert('Unable to retrieve your location');
  });
}

// Theme & Audio Controls
function initThemeAndAudio() {
  const savedTheme = localStorage.getItem('prayer-theme') || 'light';
  document.documentElement.dataset.theme = savedTheme;

  themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('prayer-theme', next);
  });

  function updateAudioIcons() {
    audioIconOn.style.display = isAudioEnabled ? '' : 'none';
    audioIconOff.style.display = isAudioEnabled ? 'none' : '';
  }

  updateAudioIcons();
  audioToggleBtn.addEventListener('click', () => {
    isAudioEnabled = !isAudioEnabled;
    localStorage.setItem('prayer-audio', isAudioEnabled ? 'on' : 'off');
    updateAudioIcons();
    if (isAudioEnabled) playNotificationSound();
  });
}

function updateDayButtons() {
  const isToday = dayOffset === 0;
  todayBtn.disabled = isToday;
  prevDayBtn.disabled = isToday;
}

function refreshDayDependent() {
  loadHijriDate();
  loadPrayerTimes();
  updateDayButtons();
}

function init() {
  initThemeAndAudio();

  const savedSource = localStorage.getItem('prayer-source');
  if (savedSource && (savedSource === 'ifis' || savedSource === 'aladhan')) {
    sourceSelect.value = savedSource;
  }

  const savedPlace = localStorage.getItem('prayer-place');
  if (savedPlace && PLACES[savedPlace]) {
    placeSelect.value = savedPlace;
  }

  refreshDayDependent();
  updateQiblaDisplay();

  placeSelect.addEventListener('change', () => {
    localStorage.setItem('prayer-place', placeSelect.value);
    loadPrayerTimes();
    updateQiblaDisplay();
  });

  sourceSelect.addEventListener('change', () => {
    localStorage.setItem('prayer-source', sourceSelect.value);
    loadPrayerTimes();
  });

  gpsBtn.addEventListener('click', handleGpsLocation);

  prevDayBtn.addEventListener('click', () => {
    if (dayOffset === 0) return;
    dayOffset -= 1;
    refreshDayDependent();
  });

  nextDayBtn.addEventListener('click', () => {
    dayOffset += 1;
    refreshDayDependent();
  });

  todayBtn.addEventListener('click', () => {
    if (dayOffset === 0) return;
    dayOffset = 0;
    refreshDayDependent();
  });

  if (localStorage.getItem('prayer-notify') === 'on') {
    notifyCheck.checked = true;
    handleNotifyToggle();
  } else {
    notifyStatus.textContent = 'Toggle switch to enable prayer alerts';
  }

  notifyCheck.addEventListener('change', handleNotifyToggle);
  testNotifyBtn.addEventListener('click', triggerTestNotification);
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => {
    console.warn('Service Worker registration failed:', err);
  });
}

init();
