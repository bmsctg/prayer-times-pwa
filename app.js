const kaabaIcon = L.icon({
  iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Kaaba_icon.svg',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -36]
});


const prayerList = document.getElementById('prayer-times');
const notifyBtn = document.getElementById('notify-btn');


async function loadPrayerTimes() {
  const url =
    'https://api.aladhan.com/v1/timingsByCity?city=Stockholm&country=Sweden&method=15';

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

loadPrayerTimes();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }

  notifyBtn.addEventListener('click', async () => {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      alert('Notifications enabled');
    }
  });

  // ===== QIBLA MODULE =====

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

let qiblaBearing = null;
let smoothedHeading = null;


function getUserLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude
      }),
      err => reject(err),
      { enableHighAccuracy: true }
    );
  });
}

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

let qiblaMap = null;

async function showQiblaOnMap() {
  const text = document.getElementById('qibla-text');

  const location = await getUserLocation();
  const bearing = calculateQiblaBearing(
    location.lat,
    location.lon
  );

  text.innerHTML = `
    Qibla direction:
    <strong>${bearing.toFixed(1)}°</strong> from North
  `;

  // Initialize map once
  if (!qiblaMap) {
    qiblaMap = L.map('qibla-map');
  } else {
    qiblaMap.eachLayer(layer => qiblaMap.removeLayer(layer));
  }

  // Zoom to user
  qiblaMap.setView([location.lat, location.lon], 4);

  // Tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(qiblaMap);

  // User marker
  const userMarker = L.marker([location.lat, location.lon])
    .addTo(qiblaMap)
    .bindPopup('You are here')
    .openPopup();

  // Kaaba marker
  const kaabaMarker = L.marker(
    [KAABA_LAT, KAABA_LON],
    { icon: kaabaIcon }
  )
    .addTo(qiblaMap)
    .bindPopup('Kaaba (Makkah)');
  
  // Qibla line
  const qiblaLine = L.polyline(
    [
      [location.lat, location.lon],
      [KAABA_LAT, KAABA_LON]
    ],
    {
      color: 'green',
      weight: 3,
      dashArray: '6,6'
    }
  ).addTo(qiblaMap);

  qiblaMap.fitBounds(qiblaLine.getBounds(), {
    padding: [30, 30]
  });
}

document
  .getElementById('qibla-map-btn')
  .addEventListener('click', showQiblaOnMap);


  
  