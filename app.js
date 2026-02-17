const prayerList = document.getElementById('prayer-times');
const placeSelect = document.getElementById('place-select');
const dateEl = document.getElementById('date-today');
const hijriEl = document.getElementById('hijri-date');
const qiblaEl = document.getElementById('qibla-text');
const nextDayBtn = document.getElementById('next-day-btn');
const todayBtn = document.getElementById('today-btn');

let dayOffset = 0; // 0 = today, 1 = tomorrow, ...

function getDateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function toApiDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

const PLACES = {
  vasterhaninge: {
    name: 'Västerhaninge',
    city: 'Haninge',
    country: 'Sweden',
    lat: 59.1167,
    lon: 18.10,
    useCoords: true
  },
  stockholm: {
    name: 'Stockholm',
    city: 'Stockholm',
    country: 'Sweden',
    lat: 59.3293,
    lon: 18.0686,
    useCoords: false
  },
  gothenburg: {
    name: 'Gothenburg',
    city: 'Gothenburg',
    country: 'Sweden',
    lat: 57.7089,
    lon: 11.9746,
    useCoords: false
  }
};

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

function toRad(deg) {
  return deg * Math.PI / 180;
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

function calculateQiblaBearing(lat, lon) {
  const kaabaLat = toRad(KAABA_LAT);
  const kaabaLon = toRad(KAABA_LON);
  const userLat = toRad(lat);
  const userLon = toRad(lon);
  const dLon = kaabaLon - userLon;
  const y = Math.sin(dLon);
  const x =
    Math.cos(userLat) * Math.tan(kaabaLat) -
    Math.sin(userLat) * Math.cos(dLon);
  let bearing = toDeg(Math.atan2(y, x));
  return (bearing + 360) % 360;
}

function getSelectedPlace() {
  const key = placeSelect.value || 'vasterhaninge';
  return PLACES[key];
}

function updateQiblaDisplay() {
  const place = getSelectedPlace();
  const bearing = calculateQiblaBearing(place.lat, place.lon);
  qiblaEl.textContent = `Qibla is ${bearing.toFixed(1)}° from North.`;
}

async function loadHijriDate() {
  const date = getDateForOffset(dayOffset);
  const dateStr = toApiDate(date);

  dateEl.textContent = date.toLocaleDateString('en-SE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  try {
    const res = await fetch(
      `https://api.aladhan.com/v1/gToH?date=${dateStr}`
    );
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
  const dateStr = toApiDate(date);
  const baseParams = `method=15&date=${dateStr}`;
  const url = place.useCoords
    ? `https://api.aladhan.com/v1/timings?latitude=${place.lat}&longitude=${place.lon}&${baseParams}`
    : `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(place.city)}&country=${place.country}&${baseParams}`;

  const response = await fetch(url);
  const data = await response.json();

  const timings = data.data.timings;
  const prayers = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

  prayerList.innerHTML = '';
  prayers.forEach(prayer => {
    const li = document.createElement('li');
    li.textContent = `${prayer}: ${timings[prayer]}`;
    prayerList.appendChild(li);
  });
}

function updateTodayButton() {
  todayBtn.style.display = dayOffset === 0 ? 'none' : 'inline-block';
}

function refreshDayDependent() {
  loadHijriDate();
  loadPrayerTimes();
  updateTodayButton();
}

function init() {
  refreshDayDependent();
  updateQiblaDisplay();

  placeSelect.addEventListener('change', () => {
    loadPrayerTimes();
    updateQiblaDisplay();
  });

  nextDayBtn.addEventListener('click', () => {
    dayOffset += 1;
    refreshDayDependent();
  });

  todayBtn.addEventListener('click', () => {
    dayOffset = 0;
    refreshDayDependent();
  });

  updateTodayButton();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

init();
