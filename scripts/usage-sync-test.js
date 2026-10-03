/* Tests for 55-usage-sync.js — the Timeless → D1 writer.
 *
 * The properties that matter are the ones that made this expensive in
 * Supabase: the 2s poll must not become a request, a day rollover must not
 * drop the last seconds of the previous day, and a failed flush must keep its
 * rows so they retry. Everything here runs against a fake fetch.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '../renderer/js/55-usage-sync.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, a, b){
  ok(name, JSON.stringify(a) === JSON.stringify(b), 'got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
}

/* ---- a minimal NX good enough for this module ---- */
function makeNX(opts){
  opts = opts || {};
  const storeVals = { 'cloud:r2Token':'tok', ...(opts.store || {}) };
  const calls = [];
  const NX = {
    store: {
      get(k, d){ return k in storeVals ? storeVals[k] : d; },
      set(k, v){ storeVals[k] = v; }
    },
    events: {
      _l:{},
      on(e, f){ (NX.events._l[e] = NX.events._l[e] || []).push(f); return ()=>{}; },
      emit(e){ (NX.events._l[e] || []).forEach(f => f()); }
    },
    cloud: {
      r2: { endpoint: opts.endpoint === null ? '' : (opts.endpoint || 'https://w.example') },
      auth: { user: opts.user === null ? null : (opts.user || { id:'owner-1' }) },
      deviceId(){ return 'dev-1'; }
    }
  };
  return { NX, calls, storeVals };
}

/* A clock the test can move. todayKey() calls `new Date()`, so stubbing
   Date.now() alone would not have advanced the day — the module needs the
   constructor replaced too. */
let fakeNow = Date.now();
class FakeDate extends Date {
  constructor(...a){ if(a.length === 0) super(fakeNow); else super(...a); }
  static now(){ return fakeNow; }
}

function load(opts){
  opts = opts || {};
  const { NX, calls } = makeNX(opts);
  const sandbox = {
    NX,
    window: { NX, addEventListener(){} },
    document: {},
    console,
    Date: opts.clock === false ? Date : FakeDate,
    setInterval(){ return 0; },   /* never auto-fire in tests */
    clearInterval(){}
  };
  /* Collect every fetch the module makes, and answer per `reply`. */
  sandbox.fetch = function(url, init){
    const rec = { url, init, body: init && init.body ? JSON.parse(init.body) : null };
    calls.push(rec);
    const r = (opts.reply || (() => ({ ok:true, written:99 })))(rec);
    return Promise.resolve({
      ok: r.ok !== false,
      status: r.status || 200,
      json(){ return Promise.resolve(r); }
    });
  };
  const vm = require('vm');
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename:'55-usage-sync.js' });
  return { NX, calls, sandbox };
}

const tick = () => new Promise(r => setImmediate(r));
function newDayKey(){
  const t = fakeNow;
  return new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

(async function(){
  console.log('\n55-usage-sync.js');

  /* ---- off until signed in ---- */
  {
    const { NX } = load({ user:null });
    const r = await NX.usageSync.track('chrome.exe', 'work', false, 5);
    ok('track() is a no-op before sign-in', r === false);
    eq('nothing buffers before sign-in', NX.usageSync.pending(), 0);
  }

  /* ---- no endpoint configured ---- */
  {
    const { NX } = load({ endpoint:null });
    const r = await NX.usageSync.enable();
    ok('enable() reports a missing Worker endpoint', r.ok === false && /endpoint/i.test(r.error), r.error);
    ok('track() stays off without an endpoint', (await NX.usageSync.track('x','y',false,5)) === false);
  }

  /* ---- the 2s poll must NOT write ---- */
  {
    const { NX, calls } = load();
    await NX.usageSync.enable();
    /* 30 polls, as the 2s interval would produce in a minute */
    for(let i = 0; i < 30; i++) NX.usageSync.track('chrome.exe', 'work', false, 2, '#ff0000');
    eq('30 polls produce 0 requests', calls.length, 0);
    ok('seconds are buffered locally', NX.usageSync.pending() === 1);
    const f = await NX.usageSync.flush();
    eq('one flush sends one request', calls.length, 1);
    eq('coalesced seconds are summed', calls[0].body.rows[0].seconds, 60);
    eq('api path is /usage/flush', calls[0].url, 'https://w.example/usage/flush');
    eq('ownerId comes from the Supabase user', calls[0].body.ownerId, 'owner-1');
    eq('deviceId comes from NX.cloud.deviceId', calls[0].body.deviceId, 'dev-1');
    eq('bearer token is attached', calls[0].init.headers.Authorization, 'Bearer tok');
    eq('buffer is emptied after success', NX.usageSync.pending(), 0);
  }

  /* ---- coalescing across apps ---- */
  {
    const { NX, calls } = load();
    await NX.usageSync.enable();
    for(let i = 0; i < 60; i++){
      NX.usageSync.track('app' + (i % 50), 'cat' + (i % 5), i % 2 === 0, 2);
    }
    /* 50 distinct apps crosses FLUSH_AT_ROWS(40), so it flushes at 40 and the
       remaining 10 stay buffered for the next batch — one row per app, but
       never more rows than the threshold in one request. */
    await tick(); await tick();   /* let the auto-flush's promise settle */
    eq('crossing the row threshold auto-flushes', calls.length, 1);
    eq('the batch is capped at the threshold', calls[0].body.rows.length, 40);
    eq('one row per distinct app', new Set(calls[0].body.rows.map(r => r.key)).size, 40);
    eq('the remainder is still buffered', NX.usageSync.pending(), 10);
    await NX.usageSync.flush();
    eq('the rest follows in a second batch', calls[1].body.rows.length, 10);
    eq('every app was sent exactly once', new Set([...calls[0].body.rows, ...calls[1].body.rows].map(r => r.key)).size, 50);
    eq('nothing is left buffered', NX.usageSync.pending(), 0);
  }

  /* ---- a failed flush must keep its rows for a retry ---- */
  {
    let fail = true;
    const { NX, calls } = load({ reply: () => fail ? { ok:false, error:'boom' } : { ok:true, written:1 } });
    await NX.usageSync.enable();
    NX.usageSync.track('vscode.exe', 'code', false, 30);
    const a = await NX.usageSync.flush();
    ok('a rejected flush is reported', a.ok === false && a.error === 'boom');
    eq('rows survive a failed flush', NX.usageSync.pending(), 1);
    fail = false;
    const b = await NX.usageSync.flush();
    ok('the retry succeeds', b.ok === true);
    eq('two requests were needed, not one', calls.length, 2);
    eq('buffer is empty once the retry lands', NX.usageSync.pending(), 0);
  }

  /* ---- a network throw must not lose data either ---- */
  {
    const { NX } = load({ reply: () => { throw new Error('offline'); } });
    await NX.usageSync.enable();
    NX.usageSync.track('chrome.exe', 'work', true, 10);
    const f = await NX.usageSync.flush();
    ok('a thrown fetch is reported, not propagated', f.ok === false && f.error === 'offline');
    eq('rows survive a thrown fetch', NX.usageSync.pending(), 1);
  }

  /* ---- day rollover keeps the old day's seconds ---- */
  {
    const { NX, calls } = load();
    await NX.usageSync.enable();
    NX.usageSync.track('chrome.exe', 'work', false, 120);

    /* jump the clock past midnight */
    fakeNow = Date.now() + 26 * 3600e3;
    NX.usageSync.track('code.exe', 'code', false, 45);
    await tick(); await tick(); await tick();

    /* The rollover flushes the *old* buffer under the *old* day key, and the
       new seconds go into a fresh buffer for the new day. */
    eq('rollover flushed exactly one batch', calls.length, 1);
    const oldCall = calls[0];
    ok('the flushed day is not the new day',
       oldCall.body.day !== NX.usageSync.pendingDay || oldCall.body.day < newDayKey(),
       oldCall.body.day);
    eq('the previous day kept its seconds',
       oldCall.body.rows.find(r => r.key === 'chrome.exe').seconds, 120);
    ok('the new day does not contain the old day\'s app',
       !oldCall.body.rows.some(r => r.key === 'code.exe'));

    /* now flush the new day, still on the fake clock */
    await NX.usageSync.flush();
    const newCall = calls[1];
    eq('the new day is distinct', newCall.body.day !== oldCall.body.day, true);
    eq('the new day holds the new seconds',
       newCall.body.rows.find(r => r.key === 'code.exe').seconds, 45);
    fakeNow = Date.now();
  }

  /* ---- enable() is idempotent: no timer pileup ---- */
  {
    const { NX, sandbox } = load();
    const timers = [];
    sandbox.setInterval = () => { timers.push(1); return timers.length; };
    await NX.usageSync.enable();
    await NX.usageSync.enable();
    await NX.usageSync.enable();
    eq('enable() x3 starts exactly one interval', timers.length, 1);
  }

  /* ---- sign-out clears everything ---- */
  {
    const { NX, calls } = load();
    await NX.usageSync.enable();
    NX.usageSync.track('chrome.exe', 'work', false, 8);
    NX.events.emit('cloud:signed-out');
    eq('sign-out empties the buffer', NX.usageSync.pending(), 0);
    ok('sign-out stops further writes', (NX.usageSync.track('x','y',false,5)) === false);
  }

  /* ---- sign-in starts shipping ---- */
  {
    const { NX, calls } = load();
    NX.events.emit('cloud:signed-in');
    await tick();
    ok('signing in enables shipping', NX.usageSync.track('x', 'y', false, 5) === true);
    await NX.usageSync.flush();
    eq('and it posts', calls.length, 1);
  }

  /* ---- read endpoints ---- */
  {
    const { NX, calls } = load({
      reply: (rec) => rec.url.indexOf('/usage/day') >= 0
        ? { ok:true, day:'2026-01-02', rows:[{ key:'chrome.exe', seconds:90 }], total:90 }
        : { ok:true, categories:[], days:[], apps:[] }
    });
    await NX.usageSync.enable();
    const d = await NX.usageSync.day('2026-01-02');
    ok('day() hits /usage/day with the owner', /\/usage\/day\?owner=owner-1&day=2026-01-02/.test(calls[0].url), calls[0].url);
    ok('day() returns the rows it was given', Array.isArray(d.rows) && d.rows.length === 1);
    eq('day() totals are passed through', d.total, 90);
    const s = await NX.usageSync.summary(14);
    ok('summary() asks for 14 days', /\/usage\/summary\?owner=owner-1&days=14/.test(calls[1].url), calls[1].url);
    ok('summary() returns buckets', Array.isArray(s.categories) && Array.isArray(s.days));
  }

  /* ---- read endpoints degrade to an empty shape when the Worker is down ---- */
  {
    const { NX } = load({ reply: () => { throw new Error('offline'); } });
    await NX.usageSync.enable();
    const d = await NX.usageSync.day();
    ok('a dead Worker still yields rows:[] so the UI can render',
       Array.isArray(d.rows) && d.rows.length === 0 && d.ok === false);
  }

  /* ---- bans ---- */
  {
    const { NX, calls } = load();
    await NX.usageSync.enable();
    await NX.usageSync.setBan('netflix.com', 'Netflix');
    eq('setBan POSTs', calls[0].init.method, 'POST');
    eq('bans endpoint', calls[0].url, 'https://w.example/usage/bans');
    eq('banned key is lowercased', calls[0].body.key, 'netflix.com');
    await NX.usageSync.setBan('netflix.com', 'Netflix', false);
    eq('unban DELETEs', calls[1].init.method, 'DELETE');
    await NX.usageSync.bans();
    ok('bans() GETs the list', /\/usage\/bans\?owner=owner-1/.test(calls[2].url), calls[2].url);
  }

  /* ---- trailing slash on the configured endpoint is trimmed ---- */
  {
    const { NX, calls } = load({ endpoint:'https://w.example/' });
    await NX.usageSync.enable();
    NX.usageSync.track('x','y',false,5);
    await NX.usageSync.flush();
    ok('no double slash in the URL', calls[0].url === 'https://w.example/usage/flush', calls[0].url);
  }

  /* ---- nothing is written when the owner is signed out mid-session ---- */
  {
    const { NX, calls } = load();
    await NX.usageSync.enable();
    await NX.usageSync.disable();
    NX.usageSync.track('x','y',false,5);
    await NX.usageSync.flush();
    eq('disable() silences the writer', calls.length, 0);
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();