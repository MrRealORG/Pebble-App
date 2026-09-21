#!/usr/bin/env node
/**
 * Screenshot harness — serves the built web app over HTTP, drives headless
 * Chromium via the DevTools protocol, and captures every major view.
 *
 *   node scripts/screenshots.js [outDir]
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'dist', 'web');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs', 'screenshots'));
const HTTP_PORT = 8123;
const CDP_PORT = 9333;
const W = 1600, H = 1000;

fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  ['01-dashboard-dark',     '#/dashboard',                'dark',     1500],
  ['02-dashboard-light',    '#/dashboard',                'light',    1000],
  ['03-notes-editor',       null,                         'dark',     1700, 'note'],
  ['04-notes-database',     null,                         'dark',     1500, 'notedb'],
  ['05-tasks-kanban',       '#/tasks?view=kanban',        'dark',     1500],
  ['06-tasks-smart',        '#/tasks?view=smart',         'dark',     1400],
  ['07-calendar-month',     '#/calendar',                 'dark',     1500, 'calmonth'],
  ['08-calendar-week',      '#/calendar',                 'dark',     1500, 'calweek'],
  ['09-chat',               '#/chat',                     'dark',     1800],
  ['10-habits',             '#/habits',                   'dark',     1500],
  ['11-habits-heatmap',     '#/habits?view=heatmap',      'dark',     1400],
  ['12-wiki-graph',         '#/wiki?view=graph',          'dark',     3000],
  ['13-wiki-reader',        '#/wiki?view=page',           'dark',     1600],
  ['14-ai-assistant',       '#/ai',                       'dark',     3200, 'aiask'],
  ['15-ai-insights',        '#/ai?tab=insights',          'dark',     2200],
  ['16-goals',              '#/goals',                    'dark',     1500],
  ['17-journal',            '#/journal',                  'dark',     1500],
  ['18-finance',            '#/finance',                  'dark',     1600],
  ['19-focus-timer',        '#/pomodoro',                 'dark',     1400],
  ['20-search',             '#/search?q=launch',          'dark',     1700],
  ['21-palette',            '#/dashboard',                'dark',     1300, 'palette'],
  ['22-inbox',              '#/inbox',                    'dark',     1300],
  ['23-time-tracking',      '#/time',                     'dark',     1400],
  ['24-contacts',           '#/contacts',                 'dark',     1400],
  ['25-bookmarks',          '#/bookmarks',                'dark',     1400],
  ['26-reminders',          '#/reminders',                'dark',     1400],
  ['27-wiki-index',         '#/wiki?view=index',          'dark',     1400],
  ['28-settings-appearance','#/settings?tab=appearance',  'dark',     1500],
  ['29-settings-ai',        '#/settings?tab=ai',          'dark',     1500],
  ['30-notes-sepia',        null,                         'sepia',    1500, 'note'],
  ['31-dashboard-midnight', '#/dashboard',                'midnight', 1300],
  ['32-tasks-table',        '#/tasks?view=table',         'dark',     1400],
  ['33-dynamic-island',     '#/dashboard',                'dark',     1600, 'island'],
  ['34-copilot',            '#/dashboard',                'dark',     2600, 'copilot'],
  ['35-game-center',        '#/game',                     'dark',     1600],
  ['36-shop',               '#/game?tab=shop',            'dark',     1600],
  ['37-achievements',       '#/game?tab=achievements',    'dark',     1600],
  ['38-prompts',            '#/prompts',                  'dark',     1500],
  ['39-skills',             '#/skills',                   'dark',     1500],
  ['40-settings-modules',   '#/settings?tab=modules',     'dark',     1500],
  ['41-theme-studio',       '#/settings?tab=customize',   'dark',     1600],
  ['42-simple-mode',        '#/dashboard',                'dark',     1500, 'simple'],
  ['43-onboarding',         '#/dashboard',                'dark',     1400, 'onb'],
  ['44-splash',             '#/dashboard',                'dark',     700,  'splash'],
  ['45-theme-sunset',       '#/dashboard',                'dark',     1400, 'shopsunset'],
  ['46-home-easy',          '#/home',                     'dark',     1500, 'easyon'],
  ['47-skill-wallet',       '#/skills',                   'dark',     1500],
  ['48-matrix',             '#/tasks?view=matrix',        'dark',     1400],
  ['50-wall-nothing',       '#/home',                     'dark',     1600, 'th_nothing'],
  ['51-wall-bubblegum',     '#/home',                     'dark',     1600, 'th_bubblegum'],
  ['52-wall-wexa',          '#/home',                     'dark',     1600, 'th_wexa'],
  ['53-pomodoro-seg',       '#/pomodoro',                 'dark',     1400, 'th_nothing2']
];

const ACTIONS = {
  note: `(function(){
      var n = NX.store.notes.all().find(function(x){ return /Product Launch/.test(x.title); }) || NX.store.notes.all()[0];
      NX.localStore.set('nexadesk.notesView','doc');
      NX.localStore.set('nexadesk.notesExpanded', NX.store.notes.all().map(function(x){ return x.id; }));
      location.hash = '#/notes/' + n.id;
      NX.router.render();
    })();`,
  notedb: `(function(){ NX.localStore.set('nexadesk.notesView','db'); location.hash='#/notes'; NX.router.render(); })();`,
  calmonth: `(function(){ NX.localStore.set('nexadesk.calMode','month'); location.hash='#/calendar'; NX.router.render(); })();`,
  calweek: `(function(){ NX.localStore.set('nexadesk.calMode','week'); location.hash='#/calendar'; NX.router.render(); })();`,
  aiask: `(function(){
      location.hash = '#/ai'; NX.router.render();
      setTimeout(function(){
        var ta = document.getElementById('aiInput'); if (!ta) return;
        ta.value = 'What should I focus on today?';
        ta.dispatchEvent(new Event('input'));
        var box = ta.closest('.composer-box');
        var btns = box ? box.querySelectorAll('.composer-tools .icon-btn') : [];
        if (btns.length) btns[btns.length - 1].click();
      }, 300);
    })();`,
  palette: `(function(){ NX.shell.openPalette('laun'); })();`,
  island: `(function(){ NX.shellV2.buildIsland(); var i=document.getElementById('island'); if(i){ i.click(); } })();`,
  copilot: `(function(){ NX.copilot.setOpen(true); setTimeout(function(){ NX.copilot.send('What should I focus on right now?'); }, 300); })();`,
  simple: `(function(){ NX.shellV2.toggleSimple(true); })();`,
  onb: `(function(){ NX.shellV2.onboarding(function(){}); })();`,
  splash: `(function(){ NX.shellV2.splash(); })();`,
  shopsunset: `(function(){ var g=NX.game.G(); var it=NX.game.SHOP.find(function(s){return s.id==='theme_sunset'}); if(it && !g.owned.includes(it.id)){ g.owned.push(it.id); } g.equipped.theme='theme_sunset'; NX.game.applyCosmetics(); })();`,
  easyon: `(function(){ NX.easy.set(true); location.hash='#/home'; NX.router.render(); })();`,
  th_nothing: `(function(){ NX.store.setSetting('theme','nothing'); NX.easy.set(true); location.hash='#/home'; NX.router.render(); })();`,
  th_bubblegum: `(function(){ NX.store.setSetting('theme','bubblegum'); location.hash='#/home'; NX.router.render(); })();`,
  th_wexa: `(function(){ NX.store.setSetting('theme','wexa'); location.hash='#/home'; NX.router.render(); })();`,
  th_nothing2: `(function(){ NX.store.setSetting('theme','nothing'); location.hash='#/pomodoro'; NX.router.render(); })();`
};

/* ---------------- static server ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
function startServer() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const f = path.join(WEB, p);
      if (!f.startsWith(WEB) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end('404'); }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(HTTP_PORT, '127.0.0.1', () => res(srv));
  });
}

/* ---------------- CDP ---------------- */
const getJSON = u => new Promise((res, rej) => {
  http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
});
async function waitForDebugger() {
  for (let i = 0; i < 80; i++) {
    try { const l = await getJSON(`http://127.0.0.1:${CDP_PORT}/json/list`); const p = l.find(t => t.type === 'page'); if (p) return p; } catch (e) {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Chromium DevTools endpoint never appeared');
}

(async function main() {
  const srv = await startServer();
  const url = `http://127.0.0.1:${HTTP_PORT}/index.html`;
  console.log(`\n  serving  ${url}`);

  const chrome = spawn('chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--mute-audio',
    `--window-size=${W},${H}`, `--remote-debugging-port=${CDP_PORT}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  try {
    const page = await waitForDebugger();
    const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 500 * 1024 * 1024 });
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

    let id = 0;
    const pending = new Map();
    const errors = [];
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id); pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push(((d.exception && d.exception.description) || d.text).split('\n')[0]);
      }
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
    });
    const cdp = (method, params) => new Promise((res, rej) => {
      const i = ++id; pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
      setTimeout(() => { if (pending.has(i)) { pending.delete(i); rej(new Error('TIMEOUT ' + method)); } }, 30000);
    });

    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Log.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: false });
    await cdp('Page.navigate', { url });
    await new Promise(r => setTimeout(r, 5000));

    const q = async expr => { const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.value; };
    const boot = await q('JSON.stringify({nx: typeof window.NX, notes: window.NX?NX.store.notes.count():-1, mods: window.NX?NX.router.all().length:-1, appHidden: (document.getElementById("app")||{}).hidden})');
    // pre-complete onboarding so it does not cover every view
    await q(`NX.store.setSetting('onboarded', true); NX.localStore.set('nexadesk.welcomed', true); var _o=document.getElementById('onboarding'); if(_o) _o.remove(); if(window.NX.easy) NX.easy.set(false); true`);
    console.log('  boot     ' + boot + '\n');
    if (!boot || /"nx":"undefined"/.test(boot)) throw new Error('app did not boot in Chromium');

    let n = 0, okCount = 0;
    for (const [name, hash, theme, wait, action] of VIEWS) {
      n++;
      const label = `${String(n).padStart(2, '0')}/${VIEWS.length} ${name}`;
      try {
        await q(`NX.store.setSetting('theme','${theme}'); true`);
        if (hash) await q(`location.hash='${hash}'; NX.router.render(); true`);
        await q(`window.__SHOT='${name}'; true`);
        if (action && ACTIONS[action]) await cdp('Runtime.evaluate', { expression: ACTIONS[action] });
        await new Promise(r => setTimeout(r, wait));
        await q(`(function(){ var v=document.getElementById('view'); if(v) v.scrollTop=0;
                 document.querySelectorAll('.fade-in,.pop-in').forEach(function(e){ e.style.animation='none'; });
                 var b=document.getElementById('boot'); if(b) b.remove();
                 var t=document.getElementById('toasts'); if(t) t.innerHTML='';
                 var mm=document.getElementById('modalRoot'); if(mm){ mm.hidden=true; mm.innerHTML=''; }
                 var p=document.getElementById('palette'); if(p) p.hidden=true;
                 document.querySelectorAll('.confetti-piece,.levelup-toast,.xp-fly').forEach(function(e){ e.remove(); });
                 var o=document.getElementById('onboarding'); if(o && window.__SHOT !== '43-onboarding') o.remove();
                 var isl=document.getElementById('island');
                 if(isl && isl.classList.contains('expanded') && window.__SHOT !== '33-dynamic-island') isl.click();
                 if(!/45-theme-sunset|50-wall|51-wall|52-wall|53-pomodoro/.test(window.__SHOT||'')){ NX.store.setSetting('theme','dark'); var gg=NX.game.G(); gg.equipped.theme='theme_default'; NX.game.applyCosmetics(); }
                 return true; })()`);
        await new Promise(r => setTimeout(r, 300));
        const shot = await cdp('Page.captureScreenshot', { format: 'png' });
        const buf = Buffer.from(shot.data, 'base64');
        if (buf.length < 4000) throw new Error('suspiciously small image (' + buf.length + ' bytes)');
        fs.writeFileSync(path.join(OUT, name + '.png'), buf);
        okCount++;
        console.log(`  ✓ ${label.padEnd(34)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB`);
      } catch (e) {
        console.log(`  ✗ ${label.padEnd(34)} ${String(e.message).slice(0, 80)}`);
      }
    }

    // desktop widget island (frameless pill)
    try {
      await cdp('Page.navigate', { url: url + '?widget=1' });
      await new Promise(r => setTimeout(r, 4000));
      await q(`(function(){ var i=document.getElementById('island'); if(i) i.click(); return true; })()`);
      await new Promise(r => setTimeout(r, 700));
      const wshot = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, '49-widget-island.png'), Buffer.from(wshot.data, 'base64'));
      okCount++;
      console.log('  ✓ 49/49 49-widget-island                (widget mode)');
    } catch (e) { console.log('  ✗ widget shot: ' + e.message.slice(0, 60)); }

    ws.close();
    console.log(`\n  ${okCount} screenshots -> ${OUT.replace(ROOT, '.')}`);
    const uniq = Array.from(new Set(errors));
    if (uniq.length) {
      console.log(`\n  ⚠ ${errors.length} JS/console error(s) captured in the browser:`);
      uniq.slice(0, 10).forEach(e => console.log('    ' + String(e).slice(0, 190)));
    } else {
      console.log('  ✓ zero JS errors across all 32 views in a real browser');
    }
    console.log('');
    process.exitCode = okCount === VIEWS.length ? 0 : 1;
  } catch (e) {
    console.error('\n  HARNESS ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    chrome.kill('SIGKILL');
    srv.close();
  }
})();
