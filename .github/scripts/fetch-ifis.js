const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const CITIES = ['Stockholm', 'Göteborg'];
const PRAYER_MAP = { Fajr: 'Fajr', Shuruk: 'Sunrise', Dhohr: 'Dhuhr', Asr: 'Asr', Magrib: 'Maghrib', Isha: 'Isha' };

function parseHtml(html) {
  const times = {};
  const re = /<li>(\w+)<span[^>]*>(\d{2}:\d{2})<\/span><\/li>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (PRAYER_MAP[m[1]]) times[PRAYER_MAP[m[1]]] = m[2];
  }
  return Object.keys(times).length === 6 ? times : null;
}

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });

  try {
    const page = await browser.newPage();

    console.log('Navigating to IFIS (passing bot check)...');
    await page.goto('https://www.islamiskaforbundet.se/bonetider/', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    console.log('Page title:', await page.title());

    const result = {};
    let debugPrinted = false;

    for (const city of CITIES) {
      result[city] = {};
      for (let i = 0; i <= 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0, 10);

        try {
          // Fetch from inside the browser — uses the verified session
          const html = await page.evaluate(async (city, dateStr) => {
            const body = 'ifis_bonetider_widget_city=' + encodeURIComponent(city + ', SE')
              + '&ifis_bonetider_widget_date=' + dateStr;
            const res = await fetch('/wp-content/plugins/bonetider/Bonetider_Widget.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body,
            });
            return res.text();
          }, city, ds);

          const times = parseHtml(html);
          if (times) {
            result[city][ds] = times;
            console.log(city + ' ' + ds + ': OK');
          } else {
            if (!debugPrinted) {
              debugPrinted = true;
              console.log('DEBUG first failed response:', html.slice(0, 400));
            }
            console.log(city + ' ' + ds + ': FAILED');
          }
        } catch (e) {
          console.log(city + ' ' + ds + ': ERROR ' + e.message);
        }

        await new Promise(r => setTimeout(r, 500));
      }
    }

    const totalDays = Object.values(result).reduce((s, c) => s + Object.keys(c).length, 0);
    if (totalDays === 0) {
      console.error('No data fetched — bot check still blocking or HTML changed');
      process.exit(1);
    }

    const outPath = path.join(__dirname, '../../ifis-data.json');
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log('Done —', totalDays, 'entries written to ifis-data.json');
  } finally {
    await browser.close();
  }
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
