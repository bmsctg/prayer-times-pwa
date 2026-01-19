const prayerList = document.getElementById('prayer-times');
const notifyBtn = document.getElementById('notify-btn');

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;


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

  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject('Geolocation not supported');
        return;
      }
  
      navigator.geolocation.getCurrentPosition(
        pos => {
          resolve({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude
          });
        },
        err => reject(err),
        { enableHighAccuracy: true }
      );
    });
  }

  function calculateQiblaDirection(lat, lon) {
    const φ1 = lat * Math.PI / 180;
    const φ2 = KAABA_LAT * Math.PI / 180;
    const Δλ = (KAABA_LON - lon) * Math.PI / 180;
  
    const y = Math.sin(Δλ);
    const x =
      Math.cos(φ1) * Math.tan(φ2) -
      Math.sin(φ1) * Math.cos(Δλ);
  
    let θ = Math.atan2(y, x);
    let bearing = (θ * 180 / Math.PI + 360) % 360;
  
    return bearing;
  }
  
  async function startQiblaCompass() {
    const location = await getUserLocation();
    const qiblaBearing = calculateQiblaDirection(
      location.lat,
      location.lon
    );
  
    document.getElementById('qibla-angle').textContent =
      `Qibla: ${qiblaBearing.toFixed(1)}°`;
  
    // iOS permission
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== 'granted') return;
    }
  
    window.addEventListener('deviceorientation', event => {
      const compassHeading =
        event.webkitCompassHeading ?? (360 - event.alpha);
  
      const rotation = qiblaBearing - compassHeading;
  
      document.getElementById('arrow').style.transform =
        `translate(-50%, -100%) rotate(${rotation}deg)`;
    });
  }

  document.getElementById('qibla-btn')
  .addEventListener('click', startQiblaCompass);

  
  