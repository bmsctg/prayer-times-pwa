const prayerList = document.getElementById('prayer-times');
const placeSelect = document.getElementById('place-select');
const sourceSelect = document.getElementById('source-select');
const dateEl = document.getElementById('date-today');
const hijriEl = document.getElementById('hijri-date');
const qiblaEl = document.getElementById('qibla-text');
const prevDayBtn = document.getElementById('prev-day-btn');
const nextDayBtn = document.getElementById('next-day-btn');
const todayBtn = document.getElementById('today-btn');

const notifyCheck = document.getElementById('notify-check');
const notifyStatus = document.getElementById('notify-status');

let dayOffset = 0;
let ifisCache = null;
let notifyInterval = null;
let bannerInterval = null;
let todayTimings = null;
let notifiedKeys = {}; // tracks which prayers have been notified, keyed by "Prayer-YYYY-MM-DD"

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

const PLACES = {
  vasterhaninge: {
    name: 'Västerhaninge',
    city: 'Haninge',
    country: 'Sweden',
    lat: 59.1167,
    lon: 18.10,
    useCoords: true,
    ifisCity: 'Stockholm'
  },
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
  }
};

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

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
  return PLACES[placeSelect.value || 'vasterhaninge'];
}

function getSelectedSource() {
  return sourceSelect.value || 'ifis';
}

function updateQiblaDisplay() {
  const place = getSelectedPlace();
  const bearing = calculateQiblaBearing(place.lat, place.lon);
  qiblaEl.textContent = `Qibla direction: ${bearing.toFixed(1)}° from North`;
}

// Find which prayer is next (only for today)
function getNextPrayerIndex(timings, prayers) {
  if (dayOffset !== 0) return -1;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  for (let i = 0; i < prayers.length; i++) {
    const t = timings[prayers[i]];
    if (!t) continue;
    const [h, m] = t.split(':').map(Number);
    if (h * 60 + m > nowMins) return i;
  }
  return -1;
}

async function fetchIfis(place, dateStr) {
  if (!ifisCache) {
    try {
      const res = await fetch('ifis-data.json');
      if (res.ok) ifisCache = await res.json();
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

async function loadPrayerTimes() {
  const place = getSelectedPlace();
  const date = getDateForOffset(dayOffset);
  const source = getSelectedSource();
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

  prayerList.innerHTML = '<li><span class="prayer-name">Loading…</span></li>';
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
      prayerList.innerHTML = '<li><span class="prayer-name">Failed to load</span></li>';
      return;
    }
  }

  const nextIdx = getNextPrayerIndex(timings, prayers);

  prayerList.innerHTML = '';
  prayers.forEach((prayer, i) => {
    const li = document.createElement('li');
    if (i === nextIdx) li.classList.add('active');
    li.innerHTML = `<span class="prayer-name">${prayer}</span><span class="prayer-time">${timings[prayer]}</span>`;
    prayerList.appendChild(li);
  });

  if (source === 'ifis' && usedSource === 'aladhan') {
    const notice = document.createElement('li');
    notice.className = 'source-notice';
    notice.innerHTML = '<span>IF unavailable — showing Aladhan (MWL)</span>';
    prayerList.appendChild(notice);
  }

  // Banner always shown for today; notifications if opted in
  startNextPrayerBanner(timings);
  if (dayOffset === 0 && notifyCheck.checked) {
    scheduleNotifications(timings);
  }
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
  const savedSource = localStorage.getItem('prayer-source');
  if (savedSource && (savedSource === 'ifis' || savedSource === 'aladhan')) {
    sourceSelect.value = savedSource;
  }

  refreshDayDependent();
  updateQiblaDisplay();

  placeSelect.addEventListener('change', () => {
    loadPrayerTimes();
    updateQiblaDisplay();
  });

  sourceSelect.addEventListener('change', () => {
    localStorage.setItem('prayer-source', sourceSelect.value);
    loadPrayerTimes();
  });

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

  // Restore notification preference
  if (localStorage.getItem('prayer-notify') === 'on') {
    notifyCheck.checked = true;
    handleNotifyToggle();
  }
  notifyCheck.addEventListener('change', handleNotifyToggle);
}

// --- Next Prayer Banner ---
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

  const banner    = document.getElementById('next-prayer-banner');
  const labelEl   = document.getElementById('banner-label');
  const nameEl    = document.getElementById('banner-prayer-name');
  const atEl      = document.getElementById('banner-prayer-at');
  const countdownEl = document.getElementById('banner-countdown');
  const prayersList = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

  function formatCountdown(diff) {
    const totalSecs = Math.floor(diff / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const mins  = Math.floor((totalSecs % 3600) / 60);
    const secs  = totalSecs % 60;
    if (hours > 0 && mins > 0) return `in ${hours} hr ${mins} min`;
    if (hours > 0)             return `in ${hours} hr`;
    if (mins  > 0)             return `in ${mins} min ${String(secs).padStart(2, '0')} sec`;
    return `in ${secs} sec`;
  }

  function findNextFromTimings(timings, baseDate) {
    let next = null;
    for (const prayer of prayersList) {
      const t = timings[prayer];
      if (!t) continue;
      const [h, m] = t.split(':').map(Number);
      const target = new Date(baseDate);
      target.setHours(h, m, 0, 0);
      const diff = target - Date.now();
      if (diff > 0 && (next === null || diff < next.diff)) {
        next = { name: prayer, time: t, target, diff };
      }
    }
    return next;
  }

  function startTicking(next, label) {
    banner.style.display = '';
    labelEl.textContent  = label;
    nameEl.textContent   = next.name;
    atEl.textContent     = `at ${next.time}`;
    countdownEl.textContent = formatCountdown(next.target - Date.now());

    bannerInterval = setInterval(() => {
      const diff = next.target - Date.now();
      if (diff <= 0) {
        // This prayer just started — restart banner to pick next one
        startNextPrayerBanner(todayTimings);
        return;
      }
      countdownEl.textContent = formatCountdown(diff);
    }, 1000);
  }

  // 1. Try today's timings
  const todayNext = findNextFromTimings(todayTimings, new Date());
  if (todayNext) {
    startTicking(todayNext, 'Next Prayer');
    return;
  }

  // 2. All prayers done for today — fetch tomorrow's and show the first one
  const place  = getSelectedPlace();
  const source = getSelectedSource();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  let tomorrowTimings = null;
  if (source === 'ifis') tomorrowTimings = await fetchIfis(place, toIfisDate(tomorrow));
  if (!tomorrowTimings) {
    try { tomorrowTimings = await fetchAladhan(place, toAladhanDate(tomorrow)); } catch (_) {}
  }
  if (!tomorrowTimings) return;

  const tomorrowNext = findNextFromTimings(tomorrowTimings, tomorrow);
  if (tomorrowNext) {
    startTicking(tomorrowNext, "Tomorrow's First Prayer");
  }
}

// --- Notifications ---
const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

function swTriggersSupported() {
  return 'serviceWorker' in navigator && typeof TimestampTrigger !== 'undefined';
}

// Schedule notifications via Service Worker TimestampTrigger.
// Fires even when the page is closed or backgrounded.
async function scheduleViaSW(timings) {
  try {
    const reg = await navigator.serviceWorker.ready;
    const now = new Date();
    let count = 0;
    for (const prayer of PRAYERS) {
      const t = timings[prayer];
      if (!t) continue;
      const [h, m] = t.split(':').map(Number);
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      if (target <= now) continue;
      // Same tag replaces any previously scheduled notification for this prayer
      await reg.showNotification('Prayer Time', {
        body: `It's time for ${prayer} — ${t}`,
        icon: 'icon-192.png',
        tag: `prayer-${prayer}`,
        showTrigger: new TimestampTrigger(target.getTime()),
        renotify: false
      });
      count++;
    }
    return count;
  } catch (e) {
    return null;
  }
}

// Cancel any SW-scheduled prayer notifications
async function clearSWNotifications() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    for (const prayer of PRAYERS) {
      const notes = await reg.getNotifications({ tag: `prayer-${prayer}` });
      notes.forEach(n => n.close());
    }
  } catch (_) {}
}

// Fallback: poll every 30s when SW triggers aren't available.
// Only reliable while the page is open.
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
      new Notification('Prayer Time', {
        body: `It's time for ${prayer} — ${t}`,
        icon: 'icon-192.png',
        tag: prayer
      });
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

  if (swTriggersSupported()) {
    const count = await scheduleViaSW(timings);
    if (count !== null) {
      notifyStatus.textContent = count > 0
        ? `${count} prayer${count > 1 ? 's' : ''} scheduled — works even when page is closed`
        : 'No upcoming prayers today';
      return;
    }
  }

  // Fallback: polling (page must stay open)
  notifyInterval = setInterval(checkAndNotify, 30000);
  checkAndNotify();
  const upcoming = countUpcoming(timings);
  notifyStatus.textContent = upcoming > 0
    ? `Active — ${upcoming} upcoming prayer${upcoming > 1 ? 's' : ''} (keep page open)`
    : 'No upcoming prayers today';
}

async function enableNotifications() {
  if (!('Notification' in window)) {
    notifyStatus.textContent = 'Notifications not supported in this browser';
    notifyCheck.checked = false;
    return false;
  }

  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }

  if (perm !== 'granted') {
    notifyStatus.textContent = 'Permission denied — enable in browser settings';
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
    // Fetch today's times and schedule
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
    clearSWNotifications();
    todayTimings = null;
    localStorage.setItem('prayer-notify', 'off');
    notifyStatus.textContent = '';
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

init();
