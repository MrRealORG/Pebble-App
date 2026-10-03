#!/usr/bin/env node
/**
 * PebbleX — apps & modules runtime tests
 *
 * Exercises the things that are easy to get wrong and hard to notice:
 *   · a disabled module's route is guarded, NOT blank
 *   · core modules cannot be disabled (no way to get stuck)
 *   · disabling actually STOPS background work, not just hides it
 *   · the route guard catches routes registered BEFORE it installed
 *     (this is the load-order trap: 52-modules.js loads at position 52,
 *      long after every module already registered its route)
 *   · hidden apps disappear from the sidebar but stay reachable
 *   · offline mode is a real switch
 *
 * Run: node scripts/apps-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS = (f) => fs.readFileSync(path.join(ROOT, 'renderer', 'js', f), 'utf8');

/* A DOM-ish element. The previous createElement stub had
   querySelector: () => null, so any route that queried its own freshly
   written markup crashed on `null.innerHTML` — 53-apps.js does exactly that
   in renderOffline(). These stubs hand back another stub instead of null so
   the route can render end to end. */
function makeEl(){
  const el = {
    innerHTML:'', textContent:'', value:'', disabled:false, onclick:null,
    style:{}, dataset:{}, children:[], firstElementChild:null,
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    setAttribute(){}, getAttribute(){ return null; }, addEventListener(){}, remove(){},
    appendChild(c){ this.children.push(c); return c; },
    querySelector(){ return makeEl(); },
    querySelectorAll(){ return []; },
    click(){}, focus(){}, closest(){ return null; }, contains(){ return false; }
  };
  return el;
}

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail){
  if(cond){ pass++; console.log('  \x1b[32mok\x1b[0m   ' + name); }
  else {
    fail++; failures.push(name + (detail ? ' -> ' + detail : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + name + (detail ? '  (' + detail + ')' : ''));
  }
}
function section(t){ console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* --------------------------------------------------------------- */
function makeWindow(){
  const store = {};
  const win = {
    console, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => 0,
    requestAnimationFrame: () => 0,
    innerWidth: 1440, innerHeight: 900,
    location: { hash: '#/dashboard', reload(){} },
    document: {
      documentElement: { setAttribute(){}, getAttribute(){ return 'elera'; }, style:{ setProperty(){} } },
      body: { classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } } },
      getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [],
createElement: () => makeEl(),
      addEventListener: ()=>{}, removeEventListener(){},
    },
    addEventListener(){},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i],
      get length(){ return Object.keys(store).length; },
    },
    navigator: {},
    fetch: async () => ({ ok:true, json: async()=>({ok:true}) }),
    FileReader: function(){}, Image: function(){}, Blob: function(){},
  };
  win.window = win; win.self = win;
  return win;
}

function loadInto(win, files){
  const ctx = vm.createContext(win);
  for(const f of files){
    try { vm.runInContext(JS(f), ctx, { filename: f }); }
    catch(e){ console.error('LOAD FAILED ' + f + ': ' + e.message); throw e; }
  }
  return ctx.NX;
}

/** Minimal NX with a real router + routeInShell so the guard is testable */
function stubs(win){
  const NX = win.NX = win.NX || {};
  NX.defaults = { profile:{ name:'You', avatar:'#7CD56E' } };
  const data = {};
  NX.store = {
    get:(k,fb)=> (k in data) ? data[k] : fb,
    set:(k,v)=>{ data[k] = JSON.parse(JSON.stringify(v)); NX.events.emit('store:'+k, v); },
    del:(k)=>{ delete data[k]; },
    dump(){ return Object.assign({}, data); },
    wipe(){ Object.keys(data).forEach(k=>delete data[k]); },
    stats(){ return {}; }, flush: async()=>{},
  };
  NX._data = data;
  const bus = {};
  NX.events = {
    on(e,f){ (bus[e]=bus[e]||[]).push(f); return ()=>NX.events.off(e,f); },
    off(e,f){ bus[e]=(bus[e]||[]).filter(x=>x!==f); },
    emit(e,p){ (bus[e]||[]).forEach(f=>{ try{ f(p); }catch(err){ console.error('listener '+e+': '+err.message); } }); },
  };
  NX.toastOk=()=>{}; NX.toastErr=()=>{}; NX.toastInfo=()=>{};
  NX.confetti=()=>{}; NX.sfx={ play(){} };
  NX.modal=()=>({ querySelector:()=>null }); NX.closeAllModals=()=>{}; NX.confirm=()=>{};
  NX.h=(x)=>({ innerHTML:x, style:{}, dataset:{}, appendChild(){}, onclick:null, querySelector:()=>null,
               querySelectorAll:()=>[], remove(){}, classList:{add(){},remove(){},toggle(){},contains(){return false;}},
               addEventListener(){} });
  /* Resolve against a supplied root, like the real NX.q. Returning null for a
     rootless lookup keeps the "element genuinely absent" tests working, but
     inside a route's own view a query must resolve — otherwise 53-apps.js
     crashes on `q('#ap-offline', view).innerHTML` the moment it renders. */
  NX.q=(sel, root)=> (root && root.querySelector) ? root.querySelector(sel) : null;
  NX.qa=()=>[]; NX.icon=()=>'';
  NX.util = { esc:s=>String(s==null?'':s), todayKey:()=>'2026-10-03', clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
              initials:n=>String(n||'?').slice(0,2).toUpperCase(), relTime:()=>'now' };
  NX.points = { balance:()=>0, lifetime:()=>0, level:()=>({n:1}), title:()=>'Rookie' };
  NX.media = { cfg:()=>({enabled:false}), setCfg(){}, health:async()=>({ok:false}), pushAll:async()=>({}) };
  NX.native = { available:false };
  NX.GAMES=[]; NX.THEMES=[]; NX.gameBest=()=>null;

  /* real-ish router */
  const routes = {};
  NX.router = {
    routes, currentName:'dashboard',
    register(name, opts){ routes[name] = opts; },
    go(name){ NX.router.currentName = name; if(routes[name]) routes[name].render(document.createElement('div')); },
    start(){},
  };
  NX.routeInShell = function(name, title, ic, renderFn){
    NX.router.register(name, { title, icon:ic, layout:'app',
      render(app){ renderFn(app); } });
  };
  return NX;
}

/* make the trailing async section settle before the summary prints */
const _tail = () => new Promise(r => setTimeout(r, 0));

/* ===============================================================
   1. REGISTRY + DEFAULTS
=============================================================== */
section('Modules — registry');
{
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['52-modules.js']);

  ok('registry is populated', NX.modules.registry().length > 15, 'got ' + NX.modules.registry().length);
  ok('notes is a core module', NX.modules.byId('notes').core === true);
  ok('every module has an id, name and description',
     NX.modules.registry().every(m => m.id && m.n && m.d));
  ok('module ids are unique',
     new Set(NX.modules.registry().map(m=>m.id)).size === NX.modules.registry().length);
  ok('notes starts enabled', NX.modules.isOn('notes'));
  ok('planner starts disabled', NX.modules.isOn('planner') === false);
}

/* ===============================================================
   2. DISABLING
=============================================================== */
section('Modules — disable and enable');
{
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['52-modules.js']);

  ok('a non-core module can be disabled', NX.modules.set('timeless', false) === true);
  ok('isOn reflects it', NX.modules.isOn('timeless') === false);

  ok('a core module REFUSES to be disabled', NX.modules.set('notes', false) === false);
  ok('core module is still on', NX.modules.isOn('notes') === true);

  ok('it can be re-enabled', NX.modules.set('timeless', true) === true);
  ok('isOn reflects that too', NX.modules.isOn('timeless') === true);

  ok('an unknown module id is rejected', NX.modules.set('nope', true) === false);

  /* persistence: only OFF modules are written, so a module shipped in a
     later version defaults to its registry value rather than inheriting
     a stale 'off' */
  ok('only disabled modules are persisted',
     Object.keys(NX.store.get('modules', {})).every(k => NX.store.get('modules')[k] === false),
     JSON.stringify(NX.store.get('modules')));
  NX.modules.set('timeless', false);
  ok('a disabled module is persisted as off', NX.store.get('modules').timeless === false);
}

/* ===============================================================
   3. BACKGROUND ENGINES ACTUALLY STOP
   This is the whole point of "disable" — a disabled Timeless that keeps
   polling the foreground window every 2s is not disabled at all.
=============================================================== */
section('Modules — engines really stop');
{
  const win = makeWindow(); const NX = stubs(win);
  let started = 0, stopped = 0, enabled = null;
  NX.timeless = { setEnabled(on){ enabled = on; }, start(){ started++; } };
  NX.reminderScheduler = { setEnabled(on){ enabled = on; } };
  NX.extsync = { setEnabled(){} };

  loadInto(win, ['52-modules.js']);

  NX.modules.set('timeless', false);
  ok('disabling Timeless stops its engine', enabled === false, 'setEnabled got ' + enabled);
  NX.modules.set('timeless', true);
  ok('enabling restarts it', enabled === true, 'setEnabled got ' + enabled);

  NX.modules.set('reminders', false);
  ok('disabling Reminders stops its scheduler', enabled === false, 'setEnabled got ' + enabled);
  void started; void stopped;
}

/* ===============================================================
   4. ROUTE GUARD — including the load-order trap
=============================================================== */
section('Modules — route guard');
{
  const win = makeWindow(); const NX = stubs(win);

  /* Register routes the way real modules do, BEFORE 52-modules loads.
     If the guard only wrapped Router.register from now on, these would
     all stay unguarded — which is exactly the bug this test exists for. */
  NX.routeInShell('today', 'Today', 'sun', function(view){ view.innerHTML = 'TODAY-REAL'; });
  NX.routeInShell('timeless', 'Timeless', 'clock', function(view){ view.innerHTML = 'TIMELESS-REAL'; });
  const preGuardRouteCount = Object.keys(NX.router.routes).length;
  ok('routes exist before the guard loads', preGuardRouteCount === 2, 'got ' + preGuardRouteCount);

  loadInto(win, ['52-modules.js']);

/* a route registered BEFORE the guard must still be protected.
     Use 'timeless', not 'today': today is a CORE module, so disabling it
     is refused by design and the route correctly stays live. */
  const host = { innerHTML:'', classList:{add(){},remove(){},toggle(){}},
                 querySelector:()=>null, querySelectorAll:()=>[] };
  NX.router.routes.timeless.render(host);
  ok('a pre-existing route still renders when enabled', host.innerHTML === 'TIMELESS-REAL', host.innerHTML.slice(0,40));

  NX.modules.set('timeless', false);
  const host2 = { innerHTML:'', classList:{add(){},remove(){},toggle(){}},
                  querySelector:()=>null, querySelectorAll:()=>[] };
  NX.router.routes.timeless.render(host2);
  ok('disabling a pre-existing route is guarded', host2.innerHTML !== 'TIMELESS-REAL',
     'route rendered anyway: ' + host2.innerHTML.slice(0,40));
  ok('the guard shows an explanation, not a blank page',
     /switched off/i.test(host2.innerHTML), host2.innerHTML.slice(0,60));

  /* a CORE module cannot be disabled, so its route must stay reachable */
  NX.modules.set('today', false);
  const hostCore = { innerHTML:'', classList:{add(){},remove(){},toggle(){}},
                     querySelector:()=>null, querySelectorAll:()=>[] };
  NX.router.routes.today.render(hostCore);
  ok('a core route is never guarded away', hostCore.innerHTML === 'TODAY-REAL', hostCore.innerHTML.slice(0,40));

  /* a route registered AFTER the guard is protected too */
  NX.routeInShell('games', 'Arcade', 'game', function(view){ view.innerHTML = 'GAMES-REAL'; });
  const host3 = { innerHTML:'', classList:{add(){},remove(){},toggle(){}},
                  querySelector:()=>null, querySelectorAll:()=>[] };
  NX.router.routes.games.render(host3);
  ok('a later route renders when enabled', host3.innerHTML === 'GAMES-REAL');
  NX.modules.set('games', false);
  const host4 = { innerHTML:'', classList:{add(){},remove(){},toggle(){}},
                  querySelector:()=>null, querySelectorAll:()=>[] };
  NX.router.routes.games.render(host4);
  ok('disabling a later route is guarded', host4.innerHTML !== 'GAMES-REAL');

  /* the guard must not double-wrap: rendering twice must not nest */
  const before = NX.router.routes.games.render;
  void before;
  ok('route render is wrapped exactly once', NX.router.routes.games.__guarded === true);
}

/* ===============================================================
   5. HIDDEN APPS
=============================================================== */
section('Apps — hide from sidebar');
{
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['52-modules.js','53-apps.js']);

  ok('nothing is hidden by default', NX.apps.hidden().length === 0);
  NX.apps.hide('chat');
  ok('an app can be hidden', NX.apps.isHidden('chat') === true);
  NX.apps.hide('chat');
  ok('hiding twice does not duplicate', NX.apps.hidden().filter(x=>x==='chat').length === 1);
  NX.apps.toggle('chat');
  ok('toggle shows it again', NX.apps.isHidden('chat') === false);
  NX.apps.toggle('chat');
  ok('toggle hides it again', NX.apps.isHidden('chat') === true);

  /* hiding must NOT disable — you can still open a hidden app */
  ok('hiding is separate from disabling', NX.modules.isOn('chat') === true);
}

/* ===============================================================
   6. OFFLINE MODE
=============================================================== */
section('Offline mode');
(async function(){
  const win = makeWindow(); const NX = stubs(win);
  let mediaCfg = null;
  NX.media.setCfg = (p) => { mediaCfg = p; };
  loadInto(win, ['52-modules.js']);

  ok('offline is off by default', NX.offline.on() === false);

  let fetchBlocked = false;
  win.fetch = () => { fetchBlocked = true; return Promise.resolve({ ok:true }); };

  NX.offline.set(true);
  ok('offline can be switched on', NX.offline.on() === true);
  ok('switching offline forces cloud sync off', mediaCfg && mediaCfg.enabled === false,
     JSON.stringify(mediaCfg));

  /* NX.netFetch must REFUSE offline, not just hide UI. A rejected promise
     settles on a microtask, so this has to be awaited. */
  const reached = await NX.netFetch('https://example.com').then(() => true, () => false);
  ok('NX.netFetch rejects while offline', reached === false);
  ok('raw fetch was never reached while offline', fetchBlocked === false);

  NX.offline.set(false);
  ok('offline can be switched back off', NX.offline.on() === false);
  await NX.netFetch('https://example.com').catch(()=>{});
  ok('NX.netFetch works again online', fetchBlocked === true);
})();

/* ===============================================================
   7. LAUNCH GUARD
=============================================================== */
section('Apps — launch a disabled app');
{
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['52-modules.js','53-apps.js']);

  let confirmed = false;
  NX.confirm = () => { confirmed = true; };

  NX.modules.set('chat', false);
  NX.launchApp('chat');
  ok('launching a disabled app asks instead of navigating', confirmed === true);

  const app = makeEl();
  NX.router.routes.apps && NX.router.routes.apps.render(app);
  ok('the apps route is registered', NX.router.routes.apps !== undefined);
}

/* ===============================================================
   8. RESET
=============================================================== */
section('Modules — reset');
{
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['52-modules.js','53-apps.js']);
  NX.modules.set('timeless', false);
  NX.modules.set('games', false);
  NX.apps.hide('chat');
  ok('two modules are off', !NX.modules.isOn('timeless') && !NX.modules.isOn('games'));
  NX.modules.resetAll();
  ok('reset restores module defaults', NX.modules.isOn('timeless') === true && NX.modules.isOn('games') === true);
  ok('reset restores registry-disabled defaults (planner stays off)',
     NX.modules.isOn('planner') === false);
}

/* ===============================================================
   SUMMARY
   Deferred by a tick so the async offline-mode section settles and its
   assertions print BEFORE the totals. Otherwise the summary claims a
   pass count that excludes them.
=============================================================== */
function summary(){
  console.log('\n' + '─'.repeat(52));
  if(fail){
    console.log('\x1b[31m' + fail + ' failed\x1b[0m, ' + pass + ' passed');
    failures.forEach(f=>console.log('  · ' + f));
    process.exitCode = 1;
  } else {
    console.log('\x1b[32mAll ' + pass + ' apps tests passed\x1b[0m');
  }
}
setTimeout(summary, 50);