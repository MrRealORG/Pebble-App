#!/usr/bin/env node
/* Pebble 3.2 walkthrough — serves dist/web, drives headless chromium via CDP,
   logs in, visits every route, captures screenshots, reports console errors. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'dist', 'web');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'shotsX'));
const PORT = 8129, CDP = 9339, W = 1600, H = 1000;
fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0].split('#')[0];
  if (p === '/') p = '/index.html';
  const f = path.join(WEB, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(f));
});

const VIEWS = [
  ['01-login',          null,            900],
  ['02-dashboard',      '#/dashboard',  1600],
  ['03-ai',             '#/ai',         1200],
  ['04-timeless',       '#/timeless',   1200],
  ['05-chat',           '#/chat',       1000],
  ['06-notes',          '#/notes',      1000],
  ['07-tasks',          '#/todo',       1000],
  ['08-reminders',      '#/reminders',  1000],
  ['09-media',          '#/media',      1000],
  ['10-games',          '#/games',      1000],
  ['11-settings',       '#/settings',   1000],
  ['14-prompts',        '#/prompts',    1000],
  ['12-settings-rel',   null,           1100, 'relia'],
  ['13-widget-mode',    '#/widget',      900],
];

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const chrome = spawn('/home/z/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP}`, `--window-size=${W},${H}`, '--hide-scrollbars', 'about:blank'
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { targets = JSON.parse(await getJSON(`http://127.0.0.1:${CDP}/json`)); if (targets.some(t => t.type === 'page')) break; } catch (e) {}
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));

  let id = 0; const pend = new Map();
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJS = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  const errors = [];
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html#/login` });
  await new Promise(r => setTimeout(r, 1400));
  // authenticate like a real login, so boot runs the full main-app path
  await evalJS(`NX.store.set('session', { authed:true, at:Date.now() }); undefined`);
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?fresh=1#/dashboard` });
  await new Promise(r => setTimeout(r, 2200));

  // capture console errors
  // (listen via Log.entryAdded alternative: poll window.__jsErrors)
  for (const [name, hash, wait, action] of VIEWS) {
    if (hash) await evalJS(`location.hash = '${hash.replace('#', '#')}'; undefined`);
    if (action === 'relia') await evalJS(`
      (function(){ /* open settings reliability section */
        var nav = document.querySelector('#set-nav');
        if (nav) { var btns = nav.querySelectorAll('[data-s]'); for (var b of btns) if (b.dataset.s === 'reliability') { b.click(); break; } }
      })(); undefined`);
    if (name === '01-login') { /* already there */ }
    await new Promise(r => setTimeout(r, wait));
    // dismiss onboarding overlay if present (except we want one shot WITH it)
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(shot.result.data, 'base64'));
    if (name === '02-dashboard') {
      // onboarding: shot step 0, then walk all 5 steps with shots
      const hasOb = await evalJS(`!!document.querySelector('.ob-backdrop')`);
      if (hasOb) {
        const s2 = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(OUT, '02b-onboard-1.png'), Buffer.from(s2.result.data, 'base64'));
        for (let st = 2; st <= 5; st++) {
          await evalJS(`(function(){ var ob=document.querySelector('.ob-backdrop'); if(!ob) return; var b=ob.querySelector('#ob-next1')||ob.querySelector('#ob-next2')||ob.querySelector('#ob-next3')||ob.querySelector('#ob-next4')||ob.querySelector('#ob-done'); if(b) b.click(); })(); undefined`);
          await new Promise(r => setTimeout(r, 500));
          const ss = await send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(OUT, '02b-onboard-' + st + '.png'), Buffer.from(ss.result.data, 'base64'));
        }
      }
      await evalJS(`
        (function(){
          var ob = document.querySelector('.ob-backdrop');
          if (ob && ob.querySelector('#ob-done')) ob.querySelector('#ob-done').click();
          var j = document.querySelector('#db-joke-reveal'); if (j) j.click();
        })(); undefined`);
      await new Promise(r => setTimeout(r, 900));
      const s3 = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, '02c-dashboard-live.png'), Buffer.from(s3.result.data, 'base64'));
    }
    const errs = await evalJS(`(window.__jsErrors || []).map(function(e){return e.msg;}).join(' | ')`);
    if (errs) errors.push(name + ': ' + errs);
  }

  // route registry check
  const routes = await evalJS(`Object.keys(NX.router.routes).join(',')`);
  const checks = {
    routes,
    weather_card: await evalJS(`!!document.querySelector('.live-weather') || 'not-on-dash'`),
    onboarded: await evalJS(`NX.store.get('onboarded')`),
    ai_state: await evalJS(`localStorage.getItem('pebble.ai') ? 'stored' : 'none'`),
  };

  console.log('ROUTES:', routes);
  console.log('CHECKS:', JSON.stringify(checks));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  console.log('SHOTS in', OUT);

  ws.close(); chrome.kill('SIGKILL'); server.close(); process.exit(0);
})().catch(e => { console.error('WALKTHROUGH CRASH:', e); process.exit(1); });

function getJSON(url) {
  return new Promise((res, rej) => {
    http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
  });
}
