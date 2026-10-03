/* ============================================================
   PebbleX v0.1 — 99-boot.js
   Boot sequence: defaults → backend restore → route decision.

   Window modes (Tauri):
   login   → this is the small LOGIN window: ALWAYS the login
             screen, engines off, closing it quits the app
             (handled natively). Never renders the full app.
   main    → this is the MAIN window: boot straight to
             the dashboard and start every engine immediately.
   widget  → desktop widget window: mini dashboard.
   web     → classic session gate (login route when no session).
   ============================================================ */
(function(NX){
'use strict';

const params = new URLSearchParams(location.search);
const PEBBLE_WIN = window.__PEBBLE_WINDOW__ || '';
const AUTH_WINDOW = params.has('auth') || PEBBLE_WIN === 'login';
const MAIN_WINDOW = params.has('main') || PEBBLE_WIN === 'main';
const WIDGET_WINDOW = params.has('widget') || PEBBLE_WIN === 'widget';

function hideSplash(){
  const s = document.getElementById('nx-splash');
  if(s){
    s.classList.add('fade-out');
    setTimeout(()=>{ try{ s.remove(); }catch(e){} }, 380);
  }
}

/* ============================================================
   Boot failsafe.

   Without this, ANY throw during boot — a script that 404s, a
   backend restore that rejects, a typo in any module — leaves the
   user staring at an infinite splash screen with no message and no
   way forward. That is the worst possible failure mode for a
   packaged desktop app, so boot is wrapped, and a hard timer
   guarantees the splash always comes down.
   ============================================================ */

/* modules that must exist for a healthy boot; a missing one is
   almost always a file that never shipped in the build */
const REQUIRED = ['store','router','ensureDefaults','restoreBackend','renderShell','events','toast','h','q','icon'];

function missingModules(){
  if(!window.NX) return ['window.NX'];
  return REQUIRED.filter(k => window.NX[k] === undefined);
}

let booted = false;

function bootFailed(err){
  booted = true;
  clearTimeout(failsafe);
  hideSplash();

  /* if the app is salvageable, get the user in rather than leaving
     them on a dead screen */
  const canContinue = !!(window.NX && window.NX.router && window.NX.renderShell);
  const missing = missingModules();
  const msg = String((err && (err.stack || err.message)) || err || 'unknown boot failure');

  let box = document.getElementById('nx-boot-error');
  if(!box){
    box = document.createElement('div');
    box.id = 'nx-boot-error';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;'
      + 'justify-content:center;background:rgba(8,10,14,.94);backdrop-filter:blur(8px);'
      + 'font:13px/1.55 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e8ecf4;padding:24px';
    document.body.appendChild(box);
  }
  box.innerHTML =
      '<div style="max-width:680px;width:100%;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.1);'
    + 'border-radius:16px;padding:26px 28px;box-shadow:0 24px 60px rgba(0,0,0,.5)">'
    + '<div style="font-size:15px;font-weight:650;margin-bottom:6px">PebbleX could not finish starting</div>'
    + '<div style="color:#9aa4b8;margin-bottom:16px">'
    + (missing.length
        ? 'These modules did not load: <b style="color:#e8ecf4">' + missing.join(', ') + '</b>'
        : 'The app started but an initialisation step failed.')
    + '</div>'
    + '<pre style="max-height:230px;overflow:auto;margin:0 0 18px;padding:12px 14px;background:rgba(0,0,0,.34);'
    + 'border:1px solid rgba(255,255,255,.07);border-radius:10px;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;'
    + 'color:#ffb4a2;white-space:pre-wrap;word-break:break-word">' + String(msg).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])) + '</pre>'
    + '<div style="display:flex;gap:9px;flex-wrap:wrap">'
    + (canContinue
        ? '<button id="nx-boot-go" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.16);'
          + 'background:rgba(255,255,255,.09);color:#e8ecf4;font:inherit;font-weight:600;cursor:pointer">Continue anyway</button>'
        : '')
    + '<button id="nx-boot-reload" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(255,255,255,.16);'
      + 'background:rgba(255,255,255,.05);color:#e8ecf4;font:inherit;cursor:pointer">Reload</button>'
    + '</div></div>';

  const go = document.getElementById('nx-boot-go');
  if(go) go.onclick = ()=>{ try{ box.remove(); }catch(e){} try{ NX.router.start(); NX.router.go('dashboard'); }catch(e){} };
  const re = document.getElementById('nx-boot-reload');
  if(re) re.onclick = ()=> location.reload();

  try{ console.error('[PebbleX] boot failed', err, '| missing:', missing); }catch(e){}
}

/* hard ceiling: even if boot() never settles (hangs on an await),
   the splash comes down and the reason is surfaced */
const failsafe = setTimeout(()=>{
  if(booted) return;
  bootFailed(new Error('Startup did not complete within 10 seconds.'));
}, 10000);

/* a <script> that fails to load fires an error event on the element,
   which does not bubble to window.onerror — catch those explicitly */
window.addEventListener('error', ev=>{
  if(ev && ev.target && ev.target !== window && ev.target.tagName === 'SCRIPT'){
    console.error('[PebbleX] script failed to load:', ev.target.src || ev.target.dataset.src || '(inline)');
  }
}, true);

async function boot(){
  try{
  await start();
  booted = true;
  clearTimeout(failsafe);
  }catch(e){ bootFailed(e); }
}

async function start(){
  NX.ensureDefaults();

  /* theme before first paint */
  const s = NX.store.get('settings', {});
  document.documentElement.setAttribute('data-theme', s.theme || 'elera');
  if(s.compactMode) document.documentElement.style.setProperty('font-size','13px');

  /* restore desktop backend mirror (local storage backend) */
  await NX.restoreBackend();
  NX.ensureDefaults();

  /* router */
  NX.router.start();

  const hash = (location.hash||'').replace(/^#\/?/, '').split('/')[0];

  /* widget window */
  if(WIDGET_WINDOW || hash === 'widget'){
    hideSplash();
    NX.router.go('widget');
    return;
  }

  /* ---------- LOGIN WINDOW: login screen only, nothing else ---------- */
  if(AUTH_WINDOW){
    hideSplash();
    NX.router.go('login');
    console.log('%cPebbleX login window ready', 'color:#7CD56E;font-weight:bold');
    return;
  }

  /* ---------- MAIN WINDOW (native): Rust guarantees the handoff ---------- */
  if(MAIN_WINDOW && NX.native.available && NX.native.mode === 'tauri'){
    hideSplash();
    const sess = NX.store.get('session', null);
    if(!sess || !sess.authed) NX.store.set('session', { authed:true, at:Date.now() });
    NX.router.go(NX.router.routes[hash] ? hash : 'dashboard');
    startEngines();
    return;
  }

  /* ---------- WEB / fallback: classic session gate ---------- */
  hideSplash();
  const authed = NX.login.isAuthed();
  const auth = NX.store.get('auth', null);
  if(hash === 'login' || !authed || (auth && auth.pinHash && !authed)){
    NX.router.go('login');
    return;
  }
  NX.router.go(NX.router.routes[hash] ? hash : 'dashboard');
  startEngines();
}

function startEngines(){
  try{ NX.timeless.start(); }catch(e){ console.error('timeless', e); }
  try{ NX.reminderScheduler.start(); }catch(e){ console.error('reminders', e); }
  /* The widget is NOT auto-opened at boot. It used to be, because
     settings.widgetEnabled defaulted to true — so a desktop widget popped up
     unbidden on every launch, and creating that window during boot is what
     wedged the UI thread. It is now opened deliberately: the taskbar button,
     Shift+W, the action palette, or Settings. */
  try{ NX.extsync.start(); }catch(e){ console.error('extsync', e); }

  /* listen for profile handoff from login window */
  try {
    if(window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === 'function'){
      window.__TAURI__.event.listen('profile-ready', async ()=>{
        try {
          await NX.restoreBackend();
          const p = NX.store.get('profile', NX.defaults.profile);
          NX.events.emit('profile:updated', p);
          NX.router.go('dashboard');
        } catch(e){}
      });
    }
  } catch(e){}

  /* first-run onboarding (or what's-new for upgraders) */
  try{
    if(!NX.store.get('onboarded')) NX.onboarding.start();
    else NX.onboarding.maybeWhatsNew();
  }catch(e){ console.error('onboarding', e); }

  /* cross-tab sync (web mode nicety) */
  window.addEventListener('storage', e=>{
    if(e.key && e.key.startsWith('pebble.')){
      const k = e.key.slice(7);
      NX.events.emit('store:'+k);
    }
  });

  /* save on exit (flush mirror) */
  window.addEventListener('beforeunload', ()=>{
    try{ if(NX.native.available) NX.native.invoke('save_workspace', { data: JSON.stringify(NX.store.dump()) }); }catch(e){}
  });
}

/* JS-side error capture → bug trail (visible in Settings → Reliability) */
window.addEventListener('error', ev=>{
  try{
    const log = NX.store.get('jsErrors', []);
    log.unshift({ msg:String(ev.message||'error'), src:String(ev.filename||'').split('/').pop(), line:ev.lineno||0, ts:Date.now() });
    NX.store.set('jsErrors', log.slice(0, 30));
  }catch(e){}
});
window.addEventListener('unhandledrejection', ev=>{
  try{
    const log = NX.store.get('jsErrors', []);
    log.unshift({ msg:'promise: ' + String(ev.reason||''), src:'', line:0, ts:Date.now() });
    NX.store.set('jsErrors', log.slice(0, 30));
  }catch(e){}
});

console.log('%cPebbleX v0.1 ready', 'color:#7CD56E;font-weight:bold');
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})(window.NX);
