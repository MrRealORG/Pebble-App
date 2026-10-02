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

async function boot(){
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
  try{ NX.widget.apply(); }catch(e){}
  try{ NX.extsync.start(); }catch(e){ console.error('extsync', e); }

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
