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
let notifyTimers = [];

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

  // Re-schedule notifications if viewing today
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

// --- Notifications ---
function clearNotifyTimers() {
  notifyTimers.forEach(id => clearTimeout(id));
  notifyTimers = [];
}

function scheduleNotifications(timings) {
  clearNotifyTimers();
  if (!notifyCheck.checked) return;

  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const now = new Date();
  let scheduled = 0;

  prayers.forEach(prayer => {
    const t = timings[prayer];
    if (!t) return;
    const [h, m] = t.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    const delay = target - now;
    if (delay > 0) {
      const id = setTimeout(() => {
        new Notification('Prayer Time', {
          body: `It's time for ${prayer} (${t})`,
          icon: 'icon-192.png',
          tag: prayer
        });
      }, delay);
      notifyTimers.push(id);
      scheduled++;
    }
  });

  notifyStatus.textContent = scheduled > 0
    ? `${scheduled} notification${scheduled > 1 ? 's' : ''} scheduled`
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
    localStorage.setItem('prayer-notify', 'off');
    notifyStatus.textContent = '';
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

init();
