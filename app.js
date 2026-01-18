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
  