const puppeteer = require('puppeteer');
const https = require('https');
const fs = require('fs');
const path = require('path');

const CITIES = ['Stockholm', 'Göteborg'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function getCookies() {
  console.log('Launching browser to pass bot check...');
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto('https://www.islamiskaforbundet.se/bonetider/', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    const title = await page.title();
    console.log('Page title after challenge:', title);
    const cookies = await page.cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log('Cookies:', cookies.map(c => c.name).join(', ') || '(none)');
    return cookieStr;
  } finally {
    await browser.close();
  }
}

function fetchDay(city, dateStr, cookieStr) {
  return new Promise((resolve, reject) => {
    const body = 'ifis_bonetider_widget_city=' + encodeURIComponent(city + ', SE') + '&ifis_bonetider_widget_date=' + dateStr;
    const req = https.request({
      hostname: 'www.islamiskaforbundet.se',
      path: '/wp-content/plugins/bonetider/Bonetider_Widget.php',
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Cookie': cookieStr,
        'Referer': 'https://www.islamiskaforbundet.se/bonetider/',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function parseHtml(html) {
  const map = { Fajr: 'Fajr', Shuruk: 'Sunrise', Dhohr: 'Dhuhr', Asr: 'Asr', Magrib: 'Maghrib', Isha: 'Isha' };
  const times = {};
  const re = /<li>(\w+)<span[^>]*>(\d{2}:\d{2})<\/span><\/li>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (map[m[1]]) times[map[m[1]]] = m[2];
  }
  return Object.keys(times).length === 6 ? times : null;
}

async function run() {
  const cookieStr = await getCookies();

  const result = {};
  let debugPrinted = false;

  for (const city of CITIES) {
    result[city] = {};
    for (let i = 0; i <= 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      try {
        const html = await fetchDay(city, ds, cookieStr);
        const times = parseHtml(html);
        if (times) {
          result[city][ds] = times;
          console.log(city + ' ' + ds + ': OK');
        } else {
          if (!debugPrinted) {
            debugPrinted = true;
            console.log('DEBUG first failed response:', html.slice(0, 500));
          }
          console.log(city + ' ' + ds + ': FAILED');
        }
      } catch (e) {
        console.log(city + ' ' + ds + ': ERROR ' + e.message);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const totalDays = Object.values(result).reduce((s, c) => s + Object.keys(c).length, 0);
  if (totalDays === 0) {
    console.error('No data fetched — bot check still blocking or HTML changed');
    process.exit(1);
  }

  const outPath = path.join(__dirname, '../../ifis-data.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('Done — wrote', totalDays, 'entries to ifis-data.json');
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
