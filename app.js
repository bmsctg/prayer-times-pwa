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

// Live Magnetometer Device Compass State
let currentCompassHeading = null;
let isSensorActive = false;
let lastVibeTime = 0;

const compassDial = document.getElementById('compass-dial');
const alignmentBadge = document.getElementById('alignment-badge');
const compassSensorBtn = document.getElementById('compass-sensor-btn');
const sensorBtnText = document.getElementById('sensor-btn-text');
const compassSensorStatus = document.getElementById('compass-sensor-status');

function getCardinalDirection(angle) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(angle / 45) % 8];
}

function updateQiblaDisplay() {
  const place = getSelectedPlace();
  const bearing = calculateQiblaBearing(place.lat, place.lon);
  const bearingFormatted = `${bearing.toFixed(1)}° ${getCardinalDirection(bearing)}`;

  if (qiblaDegreesEl) qiblaDegreesEl.textContent = bearingFormatted;

  if (isSensorActive && currentCompassHeading !== null) {
    // Relative needle rotation: points toward Mecca as the user rotates the device
    let relativeAngle = (bearing - currentCompassHeading + 360) % 360;
    if (compassNeedle) compassNeedle.style.transform = `rotate(${relativeAngle.toFixed(1)}deg)`;

    // Check alignment threshold (within ±4 degrees)
    const diff = Math.abs(relativeAngle > 180 ? 360 - relativeAngle : relativeAngle);
    const isAligned = diff <= 4;

    if (isAligned) {
      if (compassDial) compassDial.classList.add('aligned');
      if (alignmentBadge) alignmentBadge.style.display = 'block';
      if (qiblaTextEl) qiblaTextEl.textContent = `🎯 PERFECT ALIGNMENT! Facing Mecca (${bearingFormatted})`;
      if (compassSensorStatus) compassSensorStatus.textContent = `Heading: ${currentCompassHeading.toFixed(0)}° • Hold steady`;

      const now = Date.now();
      if (now - lastVibeTime > 2000 && 'vibrate' in navigator) {
        lastVibeTime = now;
        try { navigator.vibrate([40, 60, 40]); } catch (_) {}
      }
    } else {
      if (compassDial) compassDial.classList.remove('aligned');
      if (alignmentBadge) alignmentBadge.style.display = 'none';
      if (qiblaTextEl) qiblaTextEl.textContent = `Target Qibla: ${bearingFormatted} (${place.name})`;
      if (compassSensorStatus) compassSensorStatus.textContent = `Rotate phone to align needle with 🕋 Kaaba (Device Heading: ${currentCompassHeading.toFixed(0)}°)`;
    }
  } else {
    // Static mode relative to North
    if (compassDial) compassDial.classList.remove('aligned');
    if (alignmentBadge) alignmentBadge.style.display = 'none';
    if (qiblaTextEl) qiblaTextEl.textContent = `Qibla direction: ${bearingFormatted} from North (${place.name})`;
    if (compassNeedle) compassNeedle.style.transform = `rotate(${bearing.toFixed(1)}deg)`;
    if (compassSensorStatus) compassSensorStatus.textContent = 'Tap button below to turn your phone into a live real-time compass';
  }
}

// Live Magnetometer Orientation Listener
function handleDeviceOrientation(event) {
  let heading = null;

  // iOS Safari compass heading
  if (typeof event.webkitCompassHeading !== 'undefined' && event.webkitCompassHeading !== null) {
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null && typeof event.alpha !== 'undefined') {
    // Android device orientation absolute
    heading = (360 - event.alpha) % 360;
  }

  if (heading !== null && !isNaN(heading)) {
    currentCompassHeading = heading;
    updateQiblaDisplay();
  }
}

async function toggleLiveCompassSensor() {
  if (isSensorActive) {
    // Turn off
    window.removeEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
    isSensorActive = false;
    currentCompassHeading = null;
    if (compassSensorBtn) compassSensorBtn.classList.remove('active');
    if (sensorBtnText) sensorBtnText.textContent = 'Enable Live Device Compass';
    updateQiblaDisplay();
    return;
  }

  // Request iOS permission if required
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      if (response !== 'granted') {
        alert('Compass permission denied. Please allow motion sensor access in your browser settings.');
        return;
      }
    } catch (err) {
      console.warn('Orientation permission error:', err);
    }
  }

  // Register listeners
  if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
  } else if ('ondeviceorientation' in window) {
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
  } else {
    alert('Device orientation sensors are not supported on this browser/device.');
    return;
  }

  isSensorActive = true;
  if (compassSensorBtn) compassSensorBtn.classList.add('active');
  if (sensorBtnText) sensorBtnText.textContent = 'Disable Live Sensor';
  updateQiblaDisplay();
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

// --- Per-Prayer Notification Preferences Helper ---
function getNotifySelection() {
  const defaults = { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true };
  try {
    const stored = localStorage.getItem('prayer-notify-selection');
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
  } catch (_) {
    return defaults;
  }
}

function saveNotifySelection(selection) {
  try {
    localStorage.setItem('prayer-notify-selection', JSON.stringify(selection));
  } catch (_) {}
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
    const selectedMap = getNotifySelection();
    const prayers = PRAYERS.map(name => {
      if (!selectedMap[name]) return null;
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
  const selectedMap = getNotifySelection();

  PRAYERS.forEach(prayer => {
    if (!selectedMap[prayer]) return;
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
  const selectedMap = getNotifySelection();

  return PRAYERS.filter(p => {
    if (!selectedMap[p]) return false;
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

  notifyStatus.textContent = `✓ ${upcoming} prayer alert${upcoming > 1 ? 's' : ''} active today. (Use 'Add 30-Day Alarms' below for 100% lock-screen alarms on mobile)`;
}

// ── 30-Day Phone System Calendar (.ics) Alarm Generator & Manager ─────────
async function generateIcsCalendarAlarms(clearAll = false) {
  const syncBtn = document.getElementById('sync-calendar-btn');
  const clearBtn = document.getElementById('clear-calendar-btn');
  const calStatus = document.getElementById('cal-status');
  const place = getSelectedPlace();
  const source = getSelectedSource();

  if (calStatus) calStatus.textContent = clearAll ? 'Generating calendar removal request...' : 'Updating 30-day prayer calendar alarms...';
  if (syncBtn) syncBtn.style.opacity = '0.5';
  if (clearBtn) clearBtn.style.opacity = '0.5';

  if (clearAll) {
    const clearedSelection = { Fajr: false, Dhuhr: false, Asr: false, Maghrib: false, Isha: false };
    saveNotifySelection(clearedSelection);
    const chipChecks = document.querySelectorAll('.prayer-select-check');
    chipChecks.forEach(chk => { chk.checked = false; });
  }

  const events = [];
  const today = new Date();
  const selectedMap = clearAll ? {} : getNotifySelection();

  for (let d = 0; d < 30; d++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + d);

    let timings = null;
    if (source === 'ifis') timings = await fetchIfis(place, toIfisDate(targetDate));
    if (!timings) {
      try { timings = await fetchAladhan(place, toAladhanDate(targetDate)); } catch (_) {}
    }

    if (!timings) continue;

    PRAYERS.forEach(prayer => {
      const t = timings[prayer];
      if (!t) return;
      const [h, m] = t.split(':').map(Number);

      const startDate = new Date(targetDate);
      startDate.setHours(h, m, 0, 0);

      const endDate = new Date(startDate);
      endDate.setMinutes(startDate.getMinutes() + 20);

      function formatIcsTime(dt) {
        return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      }

      const uid = `prayer-${prayer.toLowerCase()}-${toIfisDate(targetDate)}@prayertimes.se`;
      const dtStart = formatIcsTime(startDate);
      const dtEnd = formatIcsTime(endDate);

      const isSelected = !clearAll && !!selectedMap[prayer];

      if (isSelected) {
        // Active selected prayer: STATUS:CONFIRMED with VALARM trigger
        events.push([
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${formatIcsTime(new Date())}`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          'STATUS:CONFIRMED',
          'SEQUENCE:2',
          `SUMMARY:🕌 ${prayer} Prayer Time (${t})`,
          `DESCRIPTION:It is time for ${prayer} prayer in ${place.name} (${t}).`,
          'BEGIN:VALARM',
          'TRIGGER:-PT0M',
          'ACTION:DISPLAY',
          `DESCRIPTION:It's time for ${prayer} prayer`,
          'END:VALARM',
          'END:VEVENT'
        ].join('\r\n'));
      } else {
        // Unselected or cleared prayer: STATUS:CANCELLED with SEQUENCE:99 to cancel in phone calendar
        events.push([
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${formatIcsTime(new Date())}`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          'STATUS:CANCELLED',
          'SEQUENCE:99',
          `SUMMARY:🕌 ${prayer} Prayer Time (Cancelled)`,
          'END:VEVENT'
        ].join('\r\n'));
      }
    });
  }

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prayer Times Sweden//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${clearAll ? 'CANCEL' : 'PUBLISH'}`,
    'X-WR-CALNAME:Prayer Times Sweden',
    'X-WR-TIMEZONE:Europe/Stockholm',
    ...events,
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = clearAll ? `Clear-Prayer-Alarms-30Days.ics` : `Update-Prayer-Alarms-${place.name.replace(/\s+/g, '-')}-30Days.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (calStatus) {
    calStatus.textContent = clearAll
      ? `✓ Downloaded calendar cancellation file! Open it to cancel all prayer alarms in your calendar app. All prayer alert toggles have been cleared.`
      : `✓ Updated 30-day prayer alarms! Open the file to apply your new selection to your phone calendar.`;
  }

  if (syncBtn) syncBtn.style.opacity = '1';
  if (clearBtn) clearBtn.style.opacity = '1';
}

// ── 30-Day Mobile-Friendly Prayer Schedule Exporter (.pdf, .txt & .csv) ────
async function download30DaySchedule(fileFormat = 'pdf') {
  const pdfBtn = document.getElementById('download-schedule-pdf-btn');
  const txtBtn = document.getElementById('download-schedule-txt-btn');
  const csvBtn = document.getElementById('download-schedule-csv-btn');
  const statusEl = document.getElementById('download-status');
  const place = getSelectedPlace();
  const sourceKey = getSelectedSource();
  const sourceName = sourceKey === 'ifis' ? 'Islamiska Förbundet (IFIS)' : 'Aladhan (MWL Method)';

  if (statusEl) statusEl.textContent = 'Generating 30-day prayer timetable...';
  if (pdfBtn) pdfBtn.style.opacity = '0.5';
  if (txtBtn) txtBtn.style.opacity = '0.5';
  if (csvBtn) csvBtn.style.opacity = '0.5';

  const rows = [];
  const today = new Date();

  for (let d = 0; d < 30; d++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + d);

    let timings = null;
    if (sourceKey === 'ifis') timings = await fetchIfis(place, toIfisDate(targetDate));
    if (!timings) {
      try { timings = await fetchAladhan(place, toAladhanDate(targetDate)); } catch (_) {}
    }

    if (!timings) continue;

    const dateStr = toIfisDate(targetDate);
    const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'short' });
    const fajr = timings.Fajr || '--:--';
    const dhuhr = timings.Dhuhr || '--:--';
    const asr = timings.Asr || '--:--';
    const maghrib = timings.Maghrib || '--:--';
    const isha = timings.Isha || '--:--';

    rows.push({ date: dateStr, day: dayName, fajr, dhuhr, asr, maghrib, isha });
  }

  const startDateStr = rows.length > 0 ? rows[0].date : toIfisDate(today);
  const endDateStr = rows.length > 0 ? rows[rows.length - 1].date : toIfisDate(today);
  const generatedDateStr = toIfisDate(today);

  if (fileFormat === 'pdf') {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      if (statusEl) statusEl.textContent = 'PDF generator loading... please try again in a moment.';
      if (pdfBtn) pdfBtn.style.opacity = '1';
      if (txtBtn) txtBtn.style.opacity = '1';
      if (csvBtn) csvBtn.style.opacity = '1';
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Emerald Header Banner
    doc.setFillColor(15, 81, 50); // #0f5132
    doc.rect(0, 0, 210, 20, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('30-DAY ISLAMIC PRAYER SCHEDULE', 105, 11, { align: 'center' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('PRAYER TIMES SWEDEN', 105, 16.5, { align: 'center' });

    // Compact Metadata Card Box
    doc.setDrawColor(226, 232, 240); // #e2e8f0
    doc.setFillColor(248, 250, 252); // #f8fafc
    doc.roundedRect(12, 23, 186, 17, 2, 2, 'FD');

    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85); // #334155
    doc.setFont('helvetica', 'bold');
    doc.text('City:', 16, 28.5);
    doc.text('Period:', 110, 28.5);
    doc.text('Calculation Method:', 16, 34.5);
    doc.text('Generated On:', 110, 34.5);

    doc.setFont('helvetica', 'normal');
    doc.text(`${place.name} (${place.country})`, 48, 28.5);
    doc.text(`${startDateStr} to ${endDateStr} (30 Days)`, 138, 28.5);
    doc.text(sourceName, 48, 34.5);
    doc.text(generatedDateStr, 138, 34.5);

    // Timetable AutoTable (Single Page Compact Layout)
    const head = [['Date', 'Day', 'Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']];
    const body = rows.map(r => [r.date, r.day, r.fajr, r.dhuhr, r.asr, r.maghrib, r.isha]);

    doc.autoTable({
      startY: 43,
      head: head,
      body: body,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 81, 50],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 8.5,
        cellPadding: 1.5
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
        halign: 'center',
        cellPadding: 1.2
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: 20 },
        2: { cellWidth: 27 },
        3: { cellWidth: 27 },
        4: { cellWidth: 27 },
        5: { cellWidth: 27 },
        6: { cellWidth: 27 }
      },
      margin: { left: 12, right: 12 }
    });

    // Page Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Generated by Prayer Times Sweden (prayertimes.se)', 14, 287);
      doc.text(`Page ${i} of ${pageCount}`, 196, 287, { align: 'right' });
    }

    doc.save(`Prayer-Schedule-${place.name.replace(/\s+/g, '-')}-30Days.pdf`);
  } else {
    let fileContent = '';
    let mimeType = '';
    let fileName = '';

    if (fileFormat === 'csv') {
      mimeType = 'text/csv;charset=utf-8;';
      fileName = `Prayer-Schedule-${place.name.replace(/\s+/g, '-')}-30Days.csv`;
      const lines = [
        `# City,${place.name} (${place.country})`,
        `# Calculation Method,${sourceName}`,
        `# Generated On,${generatedDateStr}`,
        `# Period,${startDateStr} to ${endDateStr} (30 Days)`,
        'Date,Day,Fajr,Dhuhr,Asr,Maghrib,Isha',
        ...rows.map(r => `${r.date},${r.day},${r.fajr},${r.dhuhr},${r.asr},${r.maghrib},${r.isha}`)
      ];
      fileContent = lines.join('\n');
    } else {
      // TXT format - monospaced mobile-friendly readable document
      mimeType = 'text/plain;charset=utf-8;';
      fileName = `Prayer-Schedule-${place.name.replace(/\s+/g, '-')}-30Days.txt`;

      const divider = '='.repeat(62);
      const subDivider = '-'.repeat(62);

      const header = [
        divider,
        '               30-DAY ISLAMIC PRAYER SCHEDULE',
        divider,
        `City:               ${place.name} (${place.country})`,
        `Calculation Method: ${sourceName}`,
        `Generated On:       ${generatedDateStr}`,
        `Period:             ${startDateStr} to ${endDateStr} (30 Days)`,
        subDivider,
        'Date          Day    Fajr    Dhuhr   Asr     Maghrib Isha',
        subDivider
      ];

      const tableRows = rows.map(r => {
        const datePad = r.date.padEnd(14, ' ');
        const dayPad = r.day.padEnd(7, ' ');
        const fajrPad = r.fajr.padEnd(8, ' ');
        const dhuhrPad = r.dhuhr.padEnd(8, ' ');
        const asrPad = r.asr.padEnd(8, ' ');
        const maghribPad = r.maghrib.padEnd(8, ' ');
        return `${datePad}${dayPad}${fajrPad}${dhuhrPad}${asrPad}${maghribPad}${r.isha}`;
      });

      const footer = [
        subDivider,
        'Generated by Prayer Times Sweden (prayertimes.se)',
        divider
      ];

      fileContent = [...header, ...tableRows, ...footer].join('\n');
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  if (statusEl) {
    statusEl.textContent = `✓ Downloaded 30-day prayer schedule (${fileFormat.toUpperCase()}) for ${place.name}!`;
  }

  if (pdfBtn) pdfBtn.style.opacity = '1';
  if (txtBtn) txtBtn.style.opacity = '1';
  if (csvBtn) csvBtn.style.opacity = '1';
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
  if (compassSensorBtn) compassSensorBtn.addEventListener('click', toggleLiveCompassSensor);
  const syncCalendarBtn = document.getElementById('sync-calendar-btn');
  if (syncCalendarBtn) syncCalendarBtn.addEventListener('click', () => generateIcsCalendarAlarms(false));
  const clearCalendarBtn = document.getElementById('clear-calendar-btn');
  if (clearCalendarBtn) clearCalendarBtn.addEventListener('click', () => generateIcsCalendarAlarms(true));
  const downloadPdfBtn = document.getElementById('download-schedule-pdf-btn');
  if (downloadPdfBtn) downloadPdfBtn.addEventListener('click', () => download30DaySchedule('pdf'));
  const downloadTxtBtn = document.getElementById('download-schedule-txt-btn');
  if (downloadTxtBtn) downloadTxtBtn.addEventListener('click', () => download30DaySchedule('txt'));
  const downloadCsvBtn = document.getElementById('download-schedule-csv-btn');
  if (downloadCsvBtn) downloadCsvBtn.addEventListener('click', () => download30DaySchedule('csv'));

  // Init Per-Prayer Notification Checkboxes
  const initialSelection = getNotifySelection();
  const chipChecks = document.querySelectorAll('.prayer-select-check');
  chipChecks.forEach(chk => {
    const prayerName = chk.dataset.prayer;
    if (prayerName) chk.checked = !!initialSelection[prayerName];
    chk.addEventListener('change', () => {
      const currentSelection = getNotifySelection();
      currentSelection[prayerName] = chk.checked;
      saveNotifySelection(currentSelection);
      if (todayTimings && notifyCheck.checked) {
        scheduleNotifications(todayTimings);
      }
    });
  });
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => {
    console.warn('Service Worker registration failed:', err);
  });
}

init();
