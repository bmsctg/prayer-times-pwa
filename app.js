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

function smoothAngle(newAngle, smoothing = 0.15) {
  if (smoothedHeading === null) return newAngle;

  let diff = ((newAngle - smoothedHeading + 540) % 360) - 180;
  return (smoothedHeading + diff * smoothing + 360) % 360;
}

function getCompassHeading(event) {
  if (event.webkitCompassHeading !== undefined) {
    return event.webkitCompassHeading; // iOS
  }
  if (event.alpha !== null) {
    return 360 - event.alpha; // Android
  }
  return null;
}

async function requestMotionPermission() {
  if (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  ) {
    const res = await DeviceOrientationEvent.requestPermission();
    return res === 'granted';
  }
  return true;
}

async function startQiblaCompass() {
  const arrow = document.querySelector('.needle');
  const text = document.getElementById('qibla-text');

  const location = await getUserLocation();
  qiblaBearing = calculateQiblaBearing(location.lat, location.lon);

  text.textContent = `Qibla: ${qiblaBearing.toFixed(1)}° from North`;

  const motionAllowed = await requestMotionPermission();
  if (!motionAllowed) {
    text.textContent += ' (Compass permission denied)';
    return;
  }

  window.addEventListener('deviceorientation', event => {
    const heading = getCompassHeading(event);
    if (heading === null) return;

    const filtered = smoothAngle(heading);
    smoothedHeading = filtered;

    const rotation = qiblaBearing - filtered;
    arrow.style.transform =
      `translateX(-50%) rotate(${rotation}deg)`;
  });
}

document
  .getElementById('qibla-btn')
  .addEventListener('click', startQiblaCompass);


  
  