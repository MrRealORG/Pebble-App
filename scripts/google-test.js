#!/usr/bin/env node
/**
 * PebbleX — Google sync tests
 *
 * Covers the parts that can silently lose a user's work:
 *   · field mapping in both directions
 *   · conflict resolution (the "edit either side" promise)
 *   · remote deletions are respected, not resurrected
 *   · tokens never reach a backup payload
 *   · disconnect actually deletes the tokens
 *
 * These test pure functions, so no network and no Google account.
 * Run: node scripts/google-test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS = (f) => fs.readFileSync(path.join(ROOT, 'renderer', 'js', f), 'utf8');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  \x1b[32mok\x1b[0m   ' + name); }
  else {
    fail++; failures.push(name + (detail ? ' -> ' + detail : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + name + (detail ? '  (' + detail + ')' : ''));
  }
}
function section(t) { console.log('\n\x1b[1m' + t + '\x1b[0m'); }

/* --------------------------------------------------------------- */
function makeWindow() {
  const store = {};
  const win = {
    console, setTimeout, clearTimeout,
    setInterval: () => 0, clearInterval: () => 0,
    requestAnimationFrame: () => 0,
    innerWidth: 1440, innerHeight: 900,
    location: { hash: '#/dashboard', reload() {} },
    document: {
      documentElement: { setAttribute() {}, getAttribute: () => 'elera', style: {} },
      body: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false } },
      getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {}, remove() {},
        querySelector: () => null, querySelectorAll: () => [], click() {}, content: { firstElementChild: null } }),
      addEventListener: () => {}, removeEventListener() {},
      head: { appendChild() {} },
    },
    addEventListener() {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
      key: i => Object.keys(store)[i],
      get length() { return Object.keys(store).length; },
    },
    navigator: { onLine: true },
    fetch: async () => ({ ok: true, text: async () => '{}', json: async () => ({}) }),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  };
  win.window = win; win.self = win;
  return win;
}

/* The vm sandbox gets a fresh realm whose intrinsics are subtly broken for
   this module (JSON.assign missing). Injecting the host realm's own
   globals is the reliable fix, so NX.store.dump() behaves like it does in
   the browser. */
function loadInto(win, files) {
  const host = { JSON, Object, Array, Math, Date, Promise, String, Number, Boolean, RegExp, Error };
  const ctx = vm.createContext(win, {});
  for (const k of Object.keys(host)) {
    if (win[k] === undefined || win[k] === null) {
      try { Object.defineProperty(win, k, { value: host[k], writable: true, configurable: true }); } catch (e) { /* frozen */ }
    }
  }
  /* force-inject the intrinsics the sandbox gets wrong */
  Object.defineProperty(win, 'JSON', { value: host.JSON, writable: true, configurable: true });
  Object.defineProperty(win, 'URLSearchParams', { value: URLSearchParams, writable: true, configurable: true });
  for (const f of files) {
    try { vm.runInContext(JS(f), ctx, { filename: f }); }
    catch (e) { console.error('LOAD FAILED ' + f + ': ' + e.message); throw e; }
  }
  return ctx.NX;
}

function stubs(win) {
  const NX = win.NX = win.NX || {};
  NX.defaults = { profile: { name: 'You', avatar: '#7CD56E' } };
  const data = {};
  NX.store = {
    get: (k, fb) => (k in data) ? data[k] : fb,
    set: (k, v) => { data[k] = JSON.parse(JSON.stringify(v)); NX.events.emit('store:' + k, v); },
    del: k => { delete data[k]; },
    dump() { return Object.assign({}, data); },
    wipe() { Object.keys(data).forEach(k => delete data[k]); },
    stats() { return {}; }, flush: async () => {},
  };
  NX._data = data;
  const bus = {};
  NX.events = {
    on(e, f) { (bus[e] = bus[e] || []).push(f); return () => NX.events.off(e, f); },
    off(e, f) { bus[e] = (bus[e] || []).filter(x => x !== f); },
    emit(e, p) { (bus[e] || []).forEach(f => { try { f(p); } catch (err) { console.error('listener ' + e + ': ' + err.message); } }); },
  };
  NX.toastOk = () => {}; NX.toastErr = () => {}; NX.toastInfo = () => {};
  NX.confetti = () => {}; NX.sfx = { play() {} };
  NX.modal = () => ({ querySelector: () => null }); NX.closeAllModals = () => {}; NX.confirm = () => {};
  NX.h = x => ({ innerHTML: x }); NX.q = () => null; NX.qa = () => []; NX.icon = () => '';
  NX.util = {
    esc: s => String(s == null ? '' : s),
    todayKey: () => '2026-10-03',
    relTime: () => 'now',
  };
  NX.offline = { on: () => false };
  return NX;
}

/* ===============================================================
   1. FIELD MAPPING
=============================================================== */
section('Google Tasks — field mapping');
let G;
{
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['54-google-sync.js']);
  G = NX.google;

  ok('module loaded', !!G);
  ok('toGoogle is exported', typeof G.toGoogle === 'function');
  ok('fromGoogle is exported', typeof G.fromGoogle === 'function');
  ok('resolveConflict is exported', typeof G.resolveConflict === 'function');

  const g = G.toGoogle({ id: 'tk_1', name: 'Buy milk', note: '2%', due: '2026-10-05', done: false });
  ok('title maps to Google title', g.title === 'Buy milk');
  ok('note maps to notes', g.notes === '2%');
  ok('due maps to an ISO date', g.due === '2026-10-05', g.due);
  ok('open task is needsAction', g.status === 'needsAction');

  const done = G.toGoogle({ name: 'X', done: true });
  ok('completed task maps to completed', done.status === 'completed');

  const noDue = G.toGoogle({ name: 'X', done: false });
  ok('a task with no due date sends none', !('due' in noDue));

  const back = G.fromGoogle({ title: 'From Google', notes: 'hi', status: 'completed', due: '2026-10-09' });
  ok('remote title maps back to name', back.name === 'From Google');
  ok('remote notes map back to note', back.note === 'hi');
  ok('remote completed maps to done=true', back.done === true);
  ok('remote due maps back', back.due === '2026-10-09');

  const cleared = G.fromGoogle({ title: 'T', status: 'needsAction' });
  ok('a remote task with no due clears ours', cleared.due === '', JSON.stringify(cleared));

  ok('title is length-capped for the API', G.toGoogle({ name: 'x'.repeat(2000) }).title.length === 500);

  /* column mapping round-trips */
  ok('today column maps', G.colOf('Today') === 'today');
  ok('this week column maps', G.colOf('This week') === 'week');
  ok('an unknown Google list falls back', G.colOf('Shopping') === 'today');
  ok('a fallback can be supplied', G.colOf('Shopping', 'later') === 'later');
}

/* ===============================================================
   2. CONFLICT RESOLUTION
   This is the promise: edit on either side, it shows up on the other.
=============================================================== */
section('Google Tasks — conflict resolution');
{
  const now = 1_000_000;
  ok('remote newer wins (edited in Google)', G.resolveConflict(now - 5000, now, now - 9000) === 'remote');
  ok('local newer wins (edited in PebbleX)', G.resolveConflict(now, now - 5000, now - 9000) === 'local');
  ok('identical timestamps favour local (never silently overwrite)',
     G.resolveConflict(now, now, now - 9000) === 'local');

  ok('missing local stamp falls back to remote', G.resolveConflict(0, now, 0) === 'remote');
  ok('missing remote stamp keeps local (never erase unprovable remote)',
     G.resolveConflict(now, 0, 0) === 'local');

  ok('neither side changed keeps local', G.resolveConflict(now, now, now) === 'local');
  ok('both changed since sync: newer wins',
     G.resolveConflict(now, now + 1, now - 99999) === 'remote');

  /* the important asymmetric case: we must not lose local work */
  ok('a stale Google edit never beats a fresh local one',
     G.resolveConflict(now, 1, 0) === 'local');
}

/* ===============================================================
   3. BACKUP PAYLOAD MUST NOT LEAK CREDENTIALS
=============================================================== */
section('Google Drive — backup payload');
{
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['54-google-sync.js']);
  const Gc = NX.google;

  NX.store.set('googleSync', {
    accessToken: 'ya29.SECRET-ACCESS',
    refreshToken: '1//SECRET-REFRESH',
    email: 'user@example.com',
  });
  NX.store.set('session', { authed: true });
  NX.store.set('auth', { pinHash: 'hPINHASH' });
  NX.store.set('notes', [{ id: 'n1', title: 'Keep me' }]);

  const raw = Gc.backupPayload();
  ok('backup is valid JSON', (() => { try { JSON.parse(raw); return true; } catch { return false; } })());

  ok('access token is NOT in the backup', !raw.includes('SECRET-ACCESS'));
  ok('refresh token is NOT in the backup', !raw.includes('SECRET-REFRESH'));
  ok('pin hash is NOT in the backup', !raw.includes('PINHASH'));
  ok('session is NOT in the backup', !raw.includes('"session"'));
  ok('the Google account email is NOT in the backup', !raw.includes('user@example.com'));

  const parsed = JSON.parse(raw);
  ok('notes ARE in the backup', JSON.stringify(parsed.workspace).includes('Keep me'));
  ok('the payload is tagged with the app name', parsed.app === 'PebbleX');

  /* the workspace-level sanitiser used by exports */
  const doc = { a: 1, googleSync: { refreshToken: 'x' }, session: { authed: true } };
  const clean = Gc.sanitise(doc);
  ok('sanitise strips googleSync', !('googleSync' in clean));
  ok('sanitise keeps other keys', clean.a === 1);
}

/* ===============================================================
   4. DISCONNECT MUST DELETE THE TOKENS
=============================================================== */
section('Google — disconnect');
{
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['54-google-sync.js']);
  const Gc = NX.google;

  const c = Gc.cfg();
  c.connected = true;
  c.email = 'user@example.com';
  c.accessToken = 'ya29.SECRET';
  c.refreshToken = '1//SECRET';
  c.tasksEnabled = true;
  c.driveEnabled = true;
  c.taskListId = 'list-123';
  c.driveFolderId = 'folder-456';
  c.lastTasksSync = Date.now();
  NX.google.save();

  Gc.disconnect();

  const after = NX.store.get('googleSync');
  ok('connected is false', after.connected === false);
  ok('the access token is DELETED', !after.accessToken, JSON.stringify(after.accessToken));
  ok('the refresh token is DELETED', !after.refreshToken, JSON.stringify(after.refreshToken));
  ok('the email is cleared', !after.email);
  ok('the cached task list id is cleared', !after.taskListId);
  ok('the cached folder id is cleared', !after.driveFolderId);

  /* and it must not linger in the workspace at all */
  const dump = JSON.stringify(NX.store.dump());
  ok('no token remains anywhere in the workspace', !dump.includes('SECRET'), 'token survived');
}

/* ===============================================================
   5. SYNC IS A NO-OP WHEN OFF OR OFFLINE
=============================================================== */
section('Google — safety gates');
(async function () {
  const win = makeWindow(); const NX = stubs(win);
  loadInto(win, ['54-google-sync.js']);

  ok('syncTasks refuses when not enabled',
     (await NX.google.syncTasks()).error === 'not-enabled');
  ok('backupToDrive refuses when not enabled',
     (await NX.google.backupToDrive()).error === 'not-enabled');

  /* offline mode must block both */
  NX.offline.on = () => true;
  NX.google.setEnabled('tasks', true);
  NX.google.setEnabled('drive', true);
  const c = NX.google.cfg();
  c.connected = true;
  NX.google.save();
  ok('syncTasks refuses while offline', (await NX.google.syncTasks()).error === 'offline');
  ok('backupToDrive refuses while offline', (await NX.google.backupToDrive()).error === 'offline');
})();

/* =============================================================== */
function summary() {
  console.log('\n' + '─'.repeat(52));
  if (fail) {
    console.log('\x1b[31m' + fail + ' failed\x1b[0m, ' + pass + ' passed');
    failures.forEach(f => console.log('  · ' + f));
    process.exitCode = 1;
  } else {
    console.log('\x1b[32mAll ' + pass + ' google-sync tests passed\x1b[0m');
  }
}
setTimeout(summary, 50);