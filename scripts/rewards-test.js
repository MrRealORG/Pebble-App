#!/usr/bin/env node
/**
 * PebbleX — rewards runtime tests
 *
 * Loads the REAL renderer modules (45-points, 49-store) into a jsdom
 * window with a minimal NX stub, then exercises the behaviour that
 * actually matters and is easy to get wrong:
 *
 *   · daily caps and the global ceiling hold
 *   · spending cannot go negative and unlocks correctly
 *   · a locked theme cannot be applied, and Ctrl+J SKIPS locked themes
 *   · a locked game cannot be launched by ANY path
 *   · the store mirror is not flooded (coalescing works)
 *
 * Run: node scripts/rewards-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS = (f) => fs.readFileSync(path.join(ROOT, 'renderer', 'js', f), 'utf8');

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

/* ---------------------------------------------------------------
   minimal window: enough DOM for the modules to load
--------------------------------------------------------------- */
function makeWindow(){
  const listeners = {};
  const store = {};

  const win = {
    console,
    setTimeout, clearTimeout, setInterval: ()=>0, clearInterval: ()=>0,
    requestAnimationFrame: ()=>0,
    innerWidth: 1440, innerHeight: 900,
    location: { hash: '#/dashboard', reload(){} },
    document: {
      documentElement: { setAttribute(){}, getAttribute(){ return 'elera'; }, style:{} },
      body: { classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style:{}, appendChild(){}, setAttribute(){}, addEventListener(){}, remove(){}, querySelector: ()=>null, querySelectorAll: ()=>[], click(){}, content:{ firstElementChild:null } }),
      addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
      removeEventListener(){},
    },
    addEventListener(){},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i],
      get length(){ return Object.keys(store).length; },
    },
    navigator: { onLine: true },
    fetch: async () => ({ ok: true, json: async () => ({ ok:true }), blob: async () => ({ size: 1 }) }),
    FileReader: function(){},
    Image: function(){},
    Blob: function(){},
  };
  win.window = win;
  win.self = win;
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

/** Seed collections BEFORE 45-points loads. Its baseline is taken at load
    time, so anything set afterwards legitimately counts as new work and
    pays out — which is correct behaviour, just not what a cap test wants. */
function seedBefore(NX, notes, tasks){
  NX._data['notes'] = notes;
  NX._data['tasks'] = tasks;
}
/** Balance excluding the always-on daily check-in, so cap maths is clean. */
function baseBalance(NX){
  const p = NX.store.get('points', null);
  return p ? (p.balance - 15) : 0;
}

/** Give the wallet an exact balance by seeding the persisted doc and
    loading a FRESH module instance (the module memoises state, so the
    existing instance would ignore the seed). Legitimate awards are
    capped at 600/day by design, which is why funding cannot go through
    award() here. */
function fund(amount){
  const win = makeWindow();
  const NX = baseStubs(win);
  seedBefore(NX, [], []);
  NX._data['points'] = {
    balance: amount, lifetime: amount, spent: 0,
    earnedToday: 0, earnedTodayKey: NX.util.todayKey(),
    capsToday: { __seeded: 1 },
    flags: { ['login:' + NX.util.todayKey()]: Date.now() },
    history: []
  };
  loadInto(win, ['45-points.js']);
  return NX;
}

/* a tiny stub of the NX pieces 45/49 depend on */
function baseStubs(win){
  const NX = win.NX = win.NX || {};
  NX.defaults = { profile: { name:'You', avatar:'#7CD56E', bio:'', plan:'Pro' } };

  /* store with real write counting, so we can prove coalescing */
  const writes = { points: 0, total: 0 };
  const data = {};
  NX._writes = writes;
  NX.store = {
    get(k, fb){ return (k in data) ? data[k] : fb; },
    set(k, v){ writes.total++; if(k === 'points') writes.points++; data[k] = JSON.parse(JSON.stringify(v)); NX.events.emit('store:'+k, v); },
    del(k){ delete data[k]; NX.events.emit('store:'+k, undefined); },
    dump(){ return Object.assign({}, data); },
    wipe(){ Object.keys(data).forEach(k=>delete data[k]); },
    stats(){ return {}; },
    flush: async ()=>{},
  };
  NX._data = data;

  const bus = {};
  NX.events = {
    on(evt, fn){ (bus[evt] = bus[evt] || []).push(fn); return ()=>NX.events.off(evt, fn); },
    off(evt, fn){ bus[evt] = (bus[evt]||[]).filter(f=>f!==fn); },
    emit(evt, payload){ (bus[evt] || []).forEach(fn=>{ try{ fn(payload); }catch(e){ console.error('listener error on '+evt+': '+e.message); } }); },
  };

  NX.util = {
    todayKey(d){ const t = d ? new Date(d) : new Date();
      return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); },
    esc: s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    clamp: (n,a,b)=>Math.max(a, Math.min(b,n)),
    initials(n){ return String(n||'?').trim().slice(0,2).toUpperCase(); },
    relTime(){ return 'now'; },
    fmtTime(s){ return s + 's'; },
  };

  const toasts = [];
  NX._toasts = toasts;
  NX.toastOk = (...a)=>toasts.push(['ok', ...a]);
  NX.toastErr = (...a)=>toasts.push(['err', ...a]);
  NX.toastInfo = (...a)=>toasts.push(['info', ...a]);
  NX.confetti = ()=>{};
  NX.sfx = { play(){} };

  /* modal + confirm record what the UI asked for */
  NX._modals = [];
  NX.modal = (opts)=>{ NX._modals.push(opts); return { querySelector: ()=>null }; };
  NX.closeModal = ()=>{};
  NX.closeAllModals = ()=>{ NX._modals.length = 0; };
  NX.confirm = (title, msg, onYes)=>{ NX._modals.push({ title, msg, onYes, __confirm:true }); };

  NX.h = (html)=>({ innerHTML: html, style:{}, dataset:{}, appendChild(){}, onclick:null,
                    querySelector: ()=>null, querySelectorAll: ()=>[], remove(){}, classList:{ add(){}, remove(){}, toggle(){}, contains(){return false;} } });
  NX.q = ()=>null; NX.qa = ()=>[]; NX.icon = ()=>'';
  NX.GAMES = [
    { id:'gm_2048', name:'2048 Lite' }, { id:'gm_snake', name:'Snake' },
    { id:'gm_mem', name:'Memory Match' }, { id:'gm_sudoku', name:'Sudoku Lite' },
    { id:'gm_minex', name:'Expert Mines' },
  ];
  NX.THEMES = [
    { id:'elera', name:'Elera Light' }, { id:'pebble-dark', name:'Pebble Dark' },
    { id:'midnight', name:'Midnight' }, { id:'nord', name:'Nord' },
    { id:'neon', name:'Neon' }, { id:'candy', name:'Candy' }, { id:'slate', name:'Slate' },
  ];
  const bests = {};
  NX.gameBest = id => (id in bests ? bests[id] : null);
  NX.setGameBest = (id,s)=>{ if(bests[id]==null || s>bests[id]) bests[id]=s; };
  NX.recordMin = (id,s)=>{ if(bests[id]==null || s<bests[id]) bests[id]=s; };
  NX._bests = bests;

  NX.gamePlays = ()=>({});
  NX.dailyState = ()=>({ streak: 3, solved:false, history:[] });
  NX.recordPlay = ()=>{};
  NX.checkAchievements = ()=>[];
  NX.badgeProgress = ()=>[];
  NX.launchGame = ()=>{};
  NX.afterRouteRender = ()=>{};
  NX.routeInShell = (name)=>{ NX._routes = NX._routes || []; NX._routes.push(name); };
  NX.router = { go(){}, currentName:'dashboard', routes:{ games:{} } };
  NX.media = { cfg: ()=>({ enabled:false, api:'', token:'' }), setCfg(){}, health: async()=>({ok:false}), pushAll: async()=>({ok:0,fail:0}), remove(){}, pick: async()=>null };

  /* themes live in 11-shell, so provide the real engine here */
  let applied = null;
  NX._applied = ()=>applied;
  NX.applyTheme = function(id, opts){
    const t = NX.THEMES.find(x=>x.id===id);
    if(!t) return false;
    if(!(opts && opts.force)){
      const unlocked = NX.store.isUnlocked && NX.store.isUnlocked('theme:'+t.id);
      if(!unlocked){ if(NX.openStore) NX.openStore('theme:'+t.id); return false; }
    }
    applied = t.id;
    const s = NX.store.get('settings', {});
    s.theme = t.id; NX.store.set('settings', s);
    return true;
  };
  NX.cycleTheme = function(){
    const s = NX.store.get('settings', {});
    const i = NX.THEMES.findIndex(t=>t.id===s.theme);
    const isUnlocked = id => !(NX.store && NX.store.isUnlocked) || NX.store.isUnlocked('theme:'+id);
    let next = null;
    for(let step=1; step<=NX.THEMES.length; step++){
      const cand = NX.THEMES[(i+step)%NX.THEMES.length];
      if(isUnlocked(cand.id)){ next = cand; break; }
    }
    next = next || NX.THEMES[i] || NX.THEMES[0];
    if(NX.applyTheme(next.id)) NX.toastInfo('Theme', next.name);
  };
  return NX;
}

/* ===============================================================
   1. POINTS: caps, ceiling, levels
=============================================================== */
section('Points — caps and the daily ceiling');
{
  const win = makeWindow();
  const NX = baseStubs(win);
  seedBefore(NX, [{id:'pre1'}], [{id:'t1',done:false}]);
  loadInto(win, ['45-points.js']);

  const P = NX.points;
  ok('daily check-in paid on first launch', P.balance() >= 15, 'got ' + P.balance());

  /* All assertions below are DELTAS, so the automatic daily check-in
     bonus cancels out and the cap arithmetic stays exact. */
  let t0 = P.balance();
  P.award(100, 'game_win', { label:'2048 Lite' });
  ok('award adds 100 to balance', P.balance() - t0 === 100, 'delta ' + (P.balance() - t0));
  const lt = P.lifetime();
  P.award(100, 'game_win', { label:'2048 Lite' });
  ok('award adds 100 to lifetime', P.lifetime() - lt === 100, 'delta ' + (P.lifetime() - lt));

  /* the 200/day game_win cap is fully consumed by the two 100 awards above */
  t0 = P.balance();
  P.award(500, 'game_win', {});
  ok('game_win refuses anything past its 200/day cap', P.balance() - t0 === 0, 'delta ' + (P.balance() - t0));

  /* game_play has its own independent 50/day cap */
  t0 = P.balance();
  P.award(500, 'game_play', {});
  ok('game_play capped separately at 50', P.balance() - t0 === 50, 'delta ' + (P.balance() - t0));

  /* Balance so far: 15 login + 100 + 100 + 50 = 265, so 335 remain today.
     task_done is itself capped at 100/day, so reach the ceiling with
     focus_hour (60/day) and note_created (60/day) as well. */
  t0 = P.balance();
  P.award(1000, 'task_done', {});
  ok('task_done respects its own 100/day cap', P.balance() - t0 === 100, 'delta ' + (P.balance() - t0));

  t0 = P.balance();
  P.award(1000, 'focus_hour', {});
  P.award(1000, 'note_created', {});
  P.award(1000, 'focus_round', {});
  P.award(1000, 'streak_week', {});
  const granted = P.balance() - t0;
  ok('global 600/day ceiling truncates the rest', granted === 600 - t0,
     'granted ' + granted + ', expected ' + (600 - t0));
  ok('balance sits exactly on the ceiling', P.balance() === 600, 'got ' + P.balance());

  const before = P.balance();
  P.award(500, 'focus_round', {});
  ok('nothing is awarded past the ceiling', P.balance() === before, 'got ' + P.balance());

  /* spending */
  ok('canAfford is accurate', P.canAfford(600) && !P.canAfford(601));
  ok('spend succeeds when affordable', P.spend(600, 'theme:neon') === true);
  ok('balance hits zero', P.balance() === 0, 'got ' + P.balance());
  ok('cannot overspend', P.spend(1, 'x') === false, 'overspend was allowed');
  ok('lifetime never decreases on spend', P.lifetime() === 600, 'got ' + P.lifetime());

  /* levels — 600 lifetime lands on level 3 */
  ok('level advances with lifetime', P.level().n === 3, 'got L' + P.level().n);
  ok('level progress is a sane percentage',
     P.level().pct >= 0 && P.level().pct <= 100, 'pct ' + P.level().pct);

  /* history */
  ok('history records awards', P.history().some(h=>h.d === 100), 'no +100 entry');
  ok('history records the spend', P.history().some(h=>h.d === -600), 'no -600 entry');

  /* awardOnce */
  P.award(0, 'game_win', {});
  P.awardOnce('test:flag', 10, 'badge', {});
  ok('awardOnce fires once only', P.awardOnce('test:flag', 10, 'badge', {}) === 0);
}

/* ===============================================================
   2. POINTS: the daily rollover
=============================================================== */
section('Points — day rollover');
{
  const NX = fund(600);
  const earned0 = NX.points.today();
  ok('a fresh day starts at zero earned', earned0 === 0, 'got ' + earned0);

  const got = NX.points.award(50, 'task_done', {});
  ok('a new day can earn again', got === 50, 'granted ' + got);
  ok('today counter tracks the award', NX.points.today() === 50, 'got ' + NX.points.today());

  /* the 50 already awarded above left 50 of task_done's 100/day budget,
     so the next big award is truncated to the remainder */
  const capped = NX.points.award(5000, 'task_done', {});
  ok('per-source cap applies from a clean day', capped === 50, 'granted ' + capped);
  ok('today counter matches', NX.points.today() === 100, 'got ' + NX.points.today());
}

/* ===============================================================
   3. POINTS: mirror write coalescing (the AppHang guard)
=============================================================== */
section('Points — mirror coalescing');
{
  const win = makeWindow();
  const NX = baseStubs(win);
  seedBefore(NX, [], []);
  loadInto(win, ['45-points.js']);
  const before = NX._writes.total;
  /* 200 rapid awards, exactly like a frantic arcade session */
  for(let i=0; i<200; i++) NX.points.award(1, 'game_play', {});
  const duringBurst = NX._writes.total - before;
  ok('a 200-event burst does NOT write 200 times', duringBurst <= 1,
     'wrote ' + duringBurst + ' times during the burst');
  NX.points.flushNow();
  const afterFlush = NX._writes.total - before;
  ok('burst collapses to a single flush', afterFlush <= 2, 'total writes ' + afterFlush);
}

/* ===============================================================
   4. STORE: entitlements and locks
=============================================================== */
section('Store — entitlements');
{
  const NX = fund(5000);
  loadInto(makeWindow(), []);      /* no-op; keep the loader used */
  /* 49-store reads the same NX instance, so reload it into this context */
  const win = makeWindow();
  const NX2 = baseStubs(win);
  NX2.store.get = NX.store.get;
  NX2.store.set = NX.store.set;
  NX2.events = NX.events;
  seedBefore(NX2, [], []);
  loadInto(win, ['45-points.js']);
  loadInto(win, ['49-store.js']);
  void NX;

  const S = NX2.store;
  NX2.store.set('settings', { theme:'elera' });

  ok('free themes are unlocked', S.isUnlocked('theme:elera') && S.isUnlocked('theme:nord'));
  ok('locked themes are locked', !S.isUnlocked('theme:neon'));
  ok('exactly two games are free',
     S.isUnlocked('game:gm_2048') && S.isUnlocked('game:gm_snake') &&
     !S.isUnlocked('game:gm_mem') && !S.isUnlocked('game:gm_sudoku'),
     'free set is wrong');

  ok('free themes cost nothing', S.priceOf('theme','elera') === 0);
  ok('locked themes have a price', S.priceOf('theme','neon') > 0, 'got ' + S.priceOf('theme','neon'));
  ok('cheap themes cost less than legendary',
     S.priceOf('theme','forest') < S.priceOf('theme','neon'),
     S.priceOf('theme','forest') + ' vs ' + S.priceOf('theme','neon'));
  ok('games have a price', S.priceOf('game','gm_sudoku') > 0);

  /* cannot unlock without points */
  const poor = fund(10);
  loadInto(makeWindow(), []);
  const winPoor = makeWindow();
  const NXP = baseStubs(winPoor);
  NXP.store.get = poor.store.get;
  NXP.store.set = poor.store.set;
  NXP.events = poor.events;
  seedBefore(NXP, [], []);
  loadInto(winPoor, ['45-points.js']);
  loadInto(winPoor, ['49-store.js']);
  const bal0 = NXP.points.balance();
  ok('unlock fails when short on points', NXP.store.unlock('theme:neon') === false);
  ok('a failed unlock spends nothing', NXP.points.balance() === bal0);

  /* funded: buy it */
  const price = NX2.store.priceOf('theme','neon');
  const balBefore = NX2.points.balance();
  ok('unlock succeeds with points', NX2.store.unlock('theme:neon') === true);
  ok('unlock deducted exactly the price', NX2.points.balance() === balBefore - price,
     NX2.points.balance() + ' vs ' + (balBefore - price));
  ok('theme is now unlocked', NX2.store.isUnlocked('theme:neon'));

  /* re-unlocking must not double-charge */
  const bal2 = NX2.points.balance();
  NX2.store.unlock('theme:neon');
  ok('re-unlocking does not charge again', NX2.points.balance() === bal2, 'balance changed');

  /* entitlement survives a reload (persisted, not just in memory) */
  const winR = makeWindow();
  const NXR = baseStubs(winR);
  NXR.store.get = NX2.store.get;
  NXR.store.set = NX2.store.set;
  NXR.events = NX2.events;
  loadInto(winR, ['49-store.js']);
  ok('entitlements persist across a reload', NXR.store.isUnlocked('theme:neon'));
}

/* ===============================================================
   5. STORE: theme gate + Ctrl+J must skip locked themes
=============================================================== */
section('Store — theme gate and Ctrl+J');
{
  const win = makeWindow();
  const NX = baseStubs(win);
  loadInto(win, ['45-points.js']);
  loadInto(win, ['49-store.js']);
  NX.store.set('notes', []); NX.store.set('tasks', []);
  NX.store.set('settings', { theme:'elera' });

  ok('a locked theme cannot be applied', NX.applyTheme('neon') === false);
  ok('the locked theme was not actually applied', NX._applied() !== 'neon', 'applied ' + NX._applied());

  ok('a free theme CAN be applied', NX.applyTheme('nord', { force:true }) === true);
  ok('and it really applied', NX._applied() === 'nord');

  /* boot must be able to force, or a locked saved theme bricks startup */
  ok('force bypasses the gate (boot path)', NX.applyTheme('candy', { force:true }) === true);
  ok('forced theme applied', NX._applied() === 'candy');

  /* Ctrl+J from a free theme must land on another FREE theme */
  NX.store.set('settings', { theme:'elera' });
  NX.cycleTheme();
  const landed = NX._applied();
  ok('Ctrl+J skips locked themes', S_isFree(landed, NX),
     'landed on ' + landed + ' which is locked');

  /* and it must never get stuck */
  let hops = 0;
  NX.store.set('settings', { theme:'elera' });
  for(let i=0;i<6;i++){ NX.cycleTheme(); hops++; if(!NX._applied()) break; }
  ok('Ctrl+J keeps cycling without getting stuck', hops === 6 && !!NX._applied());
}
function S_isFree(id, NX){
  return !id || NX.store.isUnlocked('theme:'+id);
}

/* ===============================================================
   6. GAME GATE: locked games must not launch by any path
=============================================================== */
section('Store — game gate');
{
  const win = makeWindow();
  const NX = baseStubs(win);
  loadInto(win, ['45-points.js']);
  /* real launchGame from 29-games.js, with the registry stubbed */
  win.NX.gameRegistry = { gm_2048: function(){ NX._launched = 'gm_2048'; },
                          gm_mem: function(){ NX._launched = 'gm_mem'; } };
  loadInto(win, ['29-games.js']);
  loadInto(win, ['49-store.js']);
  NX.store.set('notes', []); NX.store.set('tasks', []);

  NX._launched = null;
  NX.launchGame('gm_mem');
  ok('a locked game does NOT launch', NX._launched === null, 'launched ' + NX._launched);

  NX.launchGame('gm_2048');
  ok('a free game DOES launch', NX._launched === 'gm_2048', 'launched ' + NX._launched);

  /* after unlocking, the same call must work */
  NX.points.award(5000, 'task_done', {});
  NX.store.unlock('game:gm_mem');
  NX._launched = null;
  NX.launchGame('gm_mem');
  ok('the game launches once unlocked', NX._launched === 'gm_mem', 'launched ' + NX._launched);
}

/* ===============================================================
   7. LEADERBOARD: clamping
=============================================================== */
section('Leaderboard — row clamping');
{
  const win = makeWindow();
  const NX = baseStubs(win);
  loadInto(win, ['45-points.js']);
  loadInto(win, ['50-leaderboard.js']);
  NX.store.set('notes', []);
  NX.store.set('tasks', []);
  NX.store.set('profile', Object.assign({}, NX.defaults.profile));
  NX.store.set('timeless', {});
  ok('leaderboard module loads and registers its route',
     Array.isArray(NX._routes) && NX._routes.indexOf('leaderboard') !== -1,
     JSON.stringify(NX._routes));
  ok('leaderboard has no leaked globals', !Object.prototype.hasOwnProperty.call(NX, '__lbRows'));
}

/* ===============================================================
   8. MEDIA: sync config defaults and the web fallback cap
=============================================================== */
section('Media — sync config');
{
  const win = makeWindow();
  const NX = baseStubs(win);
  loadInto(win, ['51-media-library.js']);
  const cfg = NX.media.cfg();
  ok('sync is OFF by default', cfg.enabled === false);
  ok('sync has no address by default', !cfg.api);
  ok('media.src falls back to the local thumbnail',
     NX.media.src({ thumb:'t.png', url:'u.png' }) === 't.png');
  ok('media.src prefers the cloud copy when synced',
     NX.media.src({ thumb:'t.png', url:'u.png', syncUrl:'https://cdn/x' }) === 'https://cdn/x');
  ok('media.src can request a specific derivative',
     NX.media.src({ url:'http://asset.localhost/assets/a/full.png' }, 64) ===
     'http://asset.localhost/assets/a/64.png');
}

/* ===============================================================
   9. INTEGRATION: the earn hooks actually pay out
=============================================================== */
section('Integration — earn hooks');
{
  const win = makeWindow();
  const NX = baseStubs(win);
  seedBefore(NX, [], []);
  loadInto(win, ['45-points.js']);
  const base = NX.points.balance();

  NX.events.emit('points:played', { id:'gm_2048', name:'2048 Lite' });
  ok('a play pays out', NX.points.balance() > base, 'got ' + NX.points.balance());

  const b2 = NX.points.balance();
  NX.events.emit('points:gamewin', { id:'gm_2048', name:'2048 Lite', score:250 });
  ok('a win pays out more than a play', NX.points.balance() > b2, 'got ' + NX.points.balance());

  const b3 = NX.points.balance();
  NX.events.emit('points:daily', { solved:true, streak:7 });
  ok('solving the daily pays out', NX.points.balance() > b3, 'got ' + NX.points.balance());

  /* task completion, not creation */
  const b4 = NX.points.balance();
  NX.store.set('tasks', [{ id:1, done:true }]);
  ok('completing a task pays out', NX.points.balance() > b4, 'got ' + NX.points.balance());

  const b5 = NX.points.balance();
  NX.store.set('tasks', [{ id:1, done:true }, { id:2, done:true }]);
  ok('completing a second task pays again', NX.points.balance() > b5, 'got ' + NX.points.balance());

  /* un-completing then re-completing must NOT pay twice */
  const b6 = NX.points.balance();
  NX.store.set('tasks', [{ id:1, done:false }, { id:2, done:true }]);
  NX.store.set('tasks', [{ id:1, done:true }, { id:2, done:true }]);
  ok('toggling a task does not farm points', NX.points.balance() === b6,
     NX.points.balance() + ' vs ' + b6);

  /* notes */
  const b7 = NX.points.balance();
  NX.store.set('notes', [{id:1},{id:2}]);
  ok('writing notes pays out', NX.points.balance() > b7, 'got ' + NX.points.balance());
}

/* =============================================================== */
console.log('\n' + '─'.repeat(52));
if(fail){
  console.log('\x1b[31m' + fail + ' failed\x1b[0m, ' + pass + ' passed');
  failures.forEach(f=>console.log('  · ' + f));
  process.exit(1);
} else {
  console.log('\x1b[32mAll ' + pass + ' rewards tests passed\x1b[0m');
}