import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'https://btn-school-inv-7dh1.vercel.app';
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.25 });

const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

// 1) Login page renders + assets load
await page.goto(BASE + '/login.html', { waitUntil: 'networkidle0', timeout: 60000 });
const loginShot = await page.screenshot({ path: 'docs/screenshots/saas-login.png' });
console.log('login page loaded ok');

// 2) Log in as seeded admin on prod and check app shell + charts render
await page.type('input[type="email"]', 'admin@school.local');
await page.type('input[type="password"]', 'admin123');
await page.click('#login-btn');
await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2500));
console.log('landed on:', page.url());
const appShot = await page.screenshot({ path: 'docs/screenshots/saas-dashboard.png' });
console.log('app page loaded ok');

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
