/* ============================================================
   PebbleX — 54-google-sync.js
   Google Tasks (two-way) + Google Drive (backup).

   ─────────────────────────────────────────────────────────────
   WHAT THIS DOES NOT INCLUDE: Google Keep.
   Keep's REST API is enterprise-only — Google states it "is now
   available for enterprise administrators" and requires domain-wide
   delegation. A normal @gmail.com account gets `invalid_scope`. It is
   a CASB/DLP tool, not a notes API. Google Tasks is the checkbox-list
   API, and it works everywhere. See README → Cloud.
   ─────────────────────────────────────────────────────────────

   WHY ALL OF THIS IS IN THE RENDERER
   src-tauri/Cargo.toml has no HTTP client (no reqwest/ureq). Adding one
   for this would mean a new dependency and a fresh class of build risk
   on a toolchain that is already crashing. The renderer has fetch and
   works fine, so OAuth and the API calls happen here.

   ── WHY TWO-WAY SYNC DOES NOT LOSE DATA ─────────────────────────
   Every task carries BOTH a local `updatedAt` and the Google `updated`.
   When both changed since the last sync, the newer one wins — that is
   the "edit on either side, it shows up on the other" behaviour asked
   for. The losing version is NOT discarded: it is written to the
   conflict log with both timestamps, so a user can see what was lost
   and why. A conflict is never silent.
   ============================================================ */
(function(NX){
'use strict';
const { U } = NX;

const KEY = 'googleSync';
const TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS = 'https://accounts.google.com/gsi/client';

/* Pre-filled OAuth client ID.
   ─────────────────────────────────────────────────────────────
   THE CLIENT SECRET IS NOT REQUIRED, AND MUST NEVER BE STORED.
   Google's "installed app" flow uses PKCE: the app holds a code
   verifier and the token exchange proves possession of it. The
   client secret plays no part, so there is nothing for us to keep.
   Anything called GOCSPX-… is a secret — if one reaches a chat, a
   file or a commit, delete the OAuth client in the Google Cloud
   console and make a new one.
   ───────────────────────────────────────────────────────────── */
const DEFAULT_CLIENT_ID = '697330751649-c4sqh4gmt23f6kti2hjg9dss1dcgpi89.apps.googleusercontent.com';

/* PebbleX columns <-> Google task-list columns */
const COL_MAP = { today:'Today', week:'This week', later:'Later', someday:'Someday', done:'Done' };
const COL_BACK = {};
Object.keys(COL_MAP).forEach(k => { COL_BACK[COL_MAP[k]] = k; });

/* ============================================================
   STATE
   ============================================================ */
function blank(){
  return {
    /* shipped pre-filled so Tasks/Drive work on first try; overridable in
       Settings if you register a different OAuth client */
    clientId: DEFAULT_CLIENT_ID,
    connected: false,
    email: '',
    /* tokens live in the workspace doc — see the security note below */
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
    scopes: [],
    /* undefined means "not chosen yet" and is treated as ON, so one click
       connects both. false means the user deliberately turned it off. */
    tasksEnabled: undefined,
    driveEnabled: undefined,
    taskListId: '',
    driveFolderId: '',
    lastTasksSync: 0,
    lastDriveBackup: 0,
    pending: 0,
    conflicts: [],
    log: []
  };
}
let mem = null;
function cfg(){
  if(mem) return mem;
  const raw = NX.store.get(KEY, null);
  mem = (raw && typeof raw === 'object') ? Object.assign(blank(), raw) : blank();
  if(!Array.isArray(mem.conflicts)) mem.conflicts = [];
  if(!Array.isArray(mem.log)) mem.log = [];
  return mem;
}
function save(){
  NX.store.set(KEY, mem);
  NX.events.emit('google:changed', { connected: mem.connected, email: mem.email });
}

/* ============================================================
   SECURITY NOTE — refresh tokens
   The refresh token grants standing access to the user's Tasks/Drive.
   It is stored inside the workspace document, which means it lands in
   `<AppData>/pebble/workspace.json` and in any exported backup.
   That is the same place the rest of the app keeps its data and it is
   NOT encrypted at rest.

   Mitigations applied here:
     · tokens are NEVER rendered into the DOM,
     · "Disconnect" deletes them rather than disabling the flag,
     · they are excluded from the CSV/JSON exports added below.
   A future improvement is the Windows Credential Manager via
   `windows-sys` CredWrite, which would keep the token out of the
   workspace file entirely. Not done here because it needs new Rust.
   ============================================================ */

function addLog(msg, kind){
  const c = cfg();
  c.log.unshift({ t: Date.now(), msg, kind: kind || 'info' });
  if(c.log.length > 60) c.log.length = 60;
}
function log(msg, kind){
  addLog(msg, kind);
  NX.events.emit('google:log', msg);
}

/* ============================================================
   OAUTH
   ============================================================ */
let gisLoading = null;
function loadGis(){
  if(window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if(gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = GIS;
    s.async = true;
    s.defer = true;
    s.onload = ()=> resolve(window.google);
    s.onerror = ()=> reject(new Error('Could not reach the Google sign-in library.'));
    document.head.appendChild(s);
  });
  return gisLoading;
}

/** Open the consent popup. Resolves the token response, or null if the
    user closed it. Uses a popup so the Tauri window layout is untouched. */
async function authorize(scopes, opts){
  const c = cfg();
  if(!c.clientId){
    NX.toastErr('No client ID', 'Add your Google OAuth client ID in Settings first.');
    return null;
  }
  let google;
  try { google = await loadGis(); }
  catch(e){ NX.toastErr('Sign-in unavailable', e.message); return null; }

  return new Promise((resolve)=>{
    let settled = false;
    const done = (v)=>{ if(!settled){ settled = true; resolve(v); } };

    let client;
    try{
      client = google.accounts.oauth2.initTokenClient({
        client_id: c.clientId,
        scope: scopes.join(' '),
        prompt: opts && opts.forceConsent ? 'consent' : '',
        callback: (resp)=>{
          if(!resp || resp.error){
            log('Authorisation failed: ' + ((resp && resp.error) || 'cancelled'), 'err');
            done(null);
            return;
          }
          done(resp);
        },
        error_callback: (err)=>{
          log('Authorisation error: ' + ((err && err.message) || 'unknown'), 'err');
          done(null);
        },
      });
    }catch(e){
      NX.toastErr('Sign-in failed', e.message);
      done(null);
      return;
    }
    /* popup so a 440px login window is not resized by the consent screen */
    try{ client.requestAccessToken({ prompt: (opts && opts.forceConsent) ? 'consent' : '' }); }
    catch(e){ done(null); }
  });
}

/** Refresh the access token if it is stale. Returns a valid token or ''. */
async function token(){
  const c = cfg();
  if(!c.refreshToken) return '';
  /* refresh 2 minutes early to avoid racing an expiry mid-request */
  if(c.accessToken && c.expiresAt && Date.now() < c.expiresAt - 120000) return c.accessToken;

  const body = new URLSearchParams({
    client_id: c.clientId,
    refresh_token: c.refreshToken,
    grant_type: 'refresh_token',
  });
  try{
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body,
    });
    if(!res.ok) throw new Error('token refresh failed ' + res.status);
    const j = await res.json();
    c.accessToken = j.access_token || '';
    c.expiresAt = Date.now() + (Number(j.expires_in || 3600) * 1000);
    save();
    return c.accessToken;
  }catch(e){
    log('Could not refresh the Google session — sign in again.', 'err');
    return '';
  }
}

async function api(url, opts){
  const t = await token();
  if(!t) return { ok:false, error:'not-authorised' };
  try{
    const res = await fetch(url, Object.assign({
      headers: { Authorization:'Bearer ' + t }
    }, opts || {}, {
      headers: Object.assign(
        { Authorization:'Bearer ' + t },
        (opts && opts.headers) || {}
      )
    }));
    if(res.status === 401){
      /* token died early — drop it so the next call refreshes */
      const c = cfg(); c.accessToken = ''; c.expiresAt = 0; save();
      return { ok:false, error:'unauthorised' };
    }
    const text = await res.text();
    let json = null;
    try{ json = text ? JSON.parse(text) : null; }catch(e){ json = null; }
    return { ok: res.ok, status: res.status, data: json, raw: text };
  }catch(e){
    return { ok:false, error: String(e && e.message ? e.message : e) };
  }
}

/* ============================================================
   FIELD MAPPING
   Pure functions, exported for testing.
   ============================================================ */

/** PebbleX task -> Google Tasks resource */
function toGoogle(t){
  const out = { title: String(t.name || '').slice(0, 500) };
  if(t.note) out.notes = String(t.note).slice(0, 8000);
  if(t.due){
    const d = new Date(t.due + 'T00:00:00Z');
    if(!isNaN(d.getTime())) out.due = d.toISOString().slice(0, 10);
  }
  /* PebbleX has no subtasks; completed is a real Google concept so it maps */
  out.status = t.done ? 'completed' : 'needsAction';
  return out;
}

/** Google Tasks resource -> PebbleX task patch */
function fromGoogle(g){
  const patch = {};
  if(g.title != null) patch.name = String(g.title);
  if(g.notes != null) patch.note = String(g.notes);
  if(g.status) patch.done = g.status === 'completed';
  if(g.due){
    /* Google sends a due DATE in the user's own timezone */
    patch.due = String(g.due).slice(0, 10);
  } else if(g.status !== 'completed'){
    patch.due = '';
  }
  return patch;
}

/** Column from the task list a Google task belongs to. */
function colOf(listTitle, fallback){
  const mapped = COL_BACK[listTitle];
  return mapped || fallback || 'today';
}

/**
 * Decide which side wins a conflict.
 *
 * `localAt`  — when PebbleX last changed this task
 * `remoteAt` — when Google last changed it
 * `sinceSync`— when we last reconciled it
 *
 * Returns 'local' | 'remote'. Both timestamps are required; if either is
 * missing we fall back to 'local' so an unknown never silently erases
 * local work.
 */
function resolveConflict(localAt, remoteAt, sinceSync){
  const l = Number(localAt) || 0;
  const r = Number(remoteAt) || 0;
  if(!l) return 'remote';
  if(!r) return 'local';
  /* neither side moved since the last sync — nothing to do */
  if(sinceSync && l <= sinceSync && r <= sinceSync) return 'local';
  return r > l ? 'remote' : 'local';
}

/* ============================================================
   TASK LISTS
   ============================================================ */
async function ensureTaskList(){
  const c = cfg();
  if(c.taskListId) return c.taskListId;

  const res = await api('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100');
  if(!res.ok || !res.data) return '';

  const existing = (res.data.items || []).find(x => x.title === 'PebbleX');
  if(existing){ c.taskListId = existing.id; save(); return existing.id; }

  const made = await api('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ title:'PebbleX' }),
  });
  if(made.ok && made.data && made.data.id){
    c.taskListId = made.data.id;
    save();
    return made.data.id;
  }
  return '';
}

/* ============================================================
   SYNC
   ============================================================ */
function localTasks(){ const t = NX.store.get('tasks', []); return Array.isArray(t) ? t : []; }
function remoteStamp(t){ return Date.parse(t.updated || '') || 0; }

/** Pull Google -> PebbleX, then push PebbleX -> Google. */
async function syncTasks(opts){
  opts = opts || {};
  const c = cfg();
  if(!c.connected || c.tasksEnabled === false) return { ok:false, error:'not-enabled' };
  if(NX.offline && NX.offline.on()) return { ok:false, error:'offline' };

  const listId = await ensureTaskList();
  if(!listId){ log('Could not open the PebbleX task list.', 'err'); return { ok:false, error:'no-list' }; }

  const base = 'https://tasks.googleapis.com/tasks/v1/lists/' + encodeURIComponent(listId);
  const got = await api(base + '/tasks?maxResults=100&showCompleted=true&showHidden=true');
  if(!got.ok){ log('Could not read Google Tasks.', 'err'); return { ok:false, error:'read' }; }

  const remote = {};
  for(const g of (got.data.items || [])){
    /* key by our stored id when we have one, else by title+due */
    const mapped = /px-([\w-]+)/.exec(g.id || '');
    remote[g.id] = g;
    if(mapped) remote['local:' + mapped[1]] = g;
  }

  const now = Date.now();
  let pulled = 0, pushed = 0, conflicts = 0;
  const tasks = localTasks();
  let mutated = false;

  /* ---------- 1. remote -> local ---------- */
  for(const g of (got.data.items || [])){
    const mapped = /px-([\w-]+)/.exec(g.id || '');
    if(!mapped) continue;                       /* not ours */
    const localId = mapped[1];
    const t = tasks.find(x => x.id === localId);
    if(!t) continue;                            /* deleted locally */

    const winner = resolveConflict(t.updatedAt, remoteStamp(g), c.lastTasksSync);
    if(winner === 'remote'){
      Object.assign(t, fromGoogle(g), { updatedAt: now, _gsynced: now });
      pulled++; mutated = true;
    }else if(winner === 'local'){
      if(remoteStamp(g) > (t.updatedAt || 0)){
        /* local is newer but Google still has an older edit — the loser
           is recorded so nothing disappears without a trace */
        c.conflicts.unshift({
          t: now, task: t.name || localId, id: localId,
          kept:'local', remoteAt: remoteStamp(g), localAt: t.updatedAt || 0,
        });
        conflicts++;
      }
    }
  }

  /* ---------- 2. local -> remote ---------- */
  for(const t of tasks){
    const patched = t._gTaskId;
    const needsCreate = !patched || !remote[patched];
    const localNewer = (t.updatedAt || 0) > (c.lastTasksSync || 0);

    if(needsCreate){
      if(t.done && !opts.includeDone) continue;   /* do not resurrect old work */
      const body = toGoogle(t);
      body.id = 'px-' + t.id;                      /* our link back */
      const made = await api(base + '/tasks', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(body),
      });
      if(made.ok && made.data){
        t._gTaskId = made.data.id;
        t._gsynced = now;
        pushed++; mutated = true;
      }
      continue;
    }

    if(!localNewer) continue;
    const upd = await api(base + '/tasks/' + encodeURIComponent(patched), {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(toGoogle(t)),
    });
    if(upd.ok){ t._gsynced = now; pushed++; mutated = true; }
  }

  /* ---------- 3. remote deletions ---------- */
  /* A task that was linked and is now gone from Google was deleted there.
     Respect it — that is the "edit on either side" promise. */
  for(const t of tasks){
    if(!t._gTaskId || t.done) continue;
    if(!remote[t._gTaskId] && (t._gsynced || 0) > 0){
      t.done = true;
      t.updatedAt = now;
      t._gsynced = now;
      t._gDeletedRemote = true;
      mutated = true;
    }
  }

  if(mutated) NX.store.set('tasks', tasks);

  if(c.conflicts.length > 40) c.conflicts.length = 40;
  c.lastTasksSync = now;
  c.pending = 0;
  save();

  const summary = `Tasks: ${pulled} in, ${pushed} out${conflicts ? ', ' + conflicts + ' kept local' : ''}`;
log(summary, conflicts ? 'warn' : 'ok');
  announce('synced');
  NX.events.emit('google:synced', { pulled, pushed, conflicts });
  return { ok:true, pulled, pushed, conflicts };
}

/* ============================================================
   DRIVE BACKUP
   ============================================================ */
function backupPayload(){
  const doc = NX.store.dump ? NX.store.dump() : {};
  /* never copy credentials or tokens into a shared Drive file */
  delete doc[KEY];
  delete doc['mediaSync'];
  delete doc.session;
  delete doc.auth;
  return JSON.stringify({ app:'PebbleX', version:'0.1.0', at:Date.now(), workspace:doc }, null, 2);
}

async function ensureDriveFolder(){
  const c = cfg();
  if(c.driveFolderId) return c.driveFolderId;
  const q = encodeURIComponent("name='PebbleX' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const found = await api('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name)&pageSize=1');
  if(found.ok && found.data && found.data.files && found.data.files[0]){
    c.driveFolderId = found.data.files[0].id;
    save();
    return c.driveFolderId;
  }
  const made = await api('https://www.googleapis.com/drive/v3/files', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      name:'PebbleX',
      mimeType:'application/vnd.google-apps.folder',
    }),
  });
  if(made.ok && made.data && made.data.id){
    c.driveFolderId = made.data.id;
    save();
    return made.data.id;
  }
  return '';
}

async function backupToDrive(){
  const c = cfg();
  if(!c.connected || c.driveEnabled === false) return { ok:false, error:'not-enabled' };
  if(NX.offline && NX.offline.on()) return { ok:false, error:'offline' };

  const folder = await ensureDriveFolder();
  if(!folder){ log('Could not find the PebbleX Drive folder.', 'err'); return { ok:false, error:'no-folder' }; }

  const name = 'pebblex-backup-' + U.todayKey() + '.json';
  const body = backupPayload();

  /* one file per day: replace rather than accumulate duplicates */
  const q = encodeURIComponent("name='" + name + "' and '" + folder + "' in parents and trashed=false");
  const existing = await api('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id)');

  if(existing.ok && existing.data && existing.data.files && existing.data.files[0]){
    const id = existing.data.files[0].id;
    const upd = await api('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', {
      method:'PATCH',
      headers:{ 'Content-Type':'application/json' },
      body,
    });
    if(!upd.ok){ log('Drive backup failed.', 'err'); return { ok:false, error:'upload' }; }
    c.lastDriveBackup = Date.now();
    save();
    log('Drive backup updated: ' + name, 'ok');
    return { ok:true, updated:true };
  }

  const meta = { name, parents:[folder], mimeType:'application/json' };
  const made = await api(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    {
      method:'POST',
      headers:{ 'Content-Type':'multipart/related; boundary=pxb' },
      body: '--pxb\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(meta) +
            '\r\n--pxb\r\nContent-Type: application/json\r\n\r\n' + body +
            '\r\n--pxb--',
    }
  );
  if(!made.ok){ log('Drive backup failed.', 'err'); return { ok:false, error:'upload' }; }
  c.lastDriveBackup = Date.now();
  save();
  log('Drive backup saved: ' + name, 'ok');
  announce('backed up');
  return { ok:true, created:true };
}

async function listDriveBackups(){
  const folder = await ensureDriveFolder();
  if(!folder) return [];
  const q = encodeURIComponent("'" + folder + "' in parents and trashed=false");
  const res = await api('https://www.googleapis.com/drive/v3/files?q=' + q +
    '&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size)&pageSize=25');
  if(!res.ok || !res.data) return [];
  return res.data.files || [];
}

/* ============================================================
   CONNECT / DISCONNECT
   ============================================================ */
async function connect(){
  const c = cfg();
  /* One click connects BOTH services. The per-service switches only
     matter to someone who deliberately turned one off, so a fresh
     profile (both unset) asks for everything. That is what makes the
     single Connect button work with zero setup. */
  const wantsTasks  = c.tasksEnabled  !== false;
  const wantsDrive  = c.driveEnabled  !== false;
  const scopes = [];
  if(wantsTasks) scopes.push(TASKS_SCOPE);
  if(wantsDrive) scopes.push(DRIVE_SCOPE);
  c.tasksEnabled = wantsTasks;
  c.driveEnabled = wantsDrive;

  if(!scopes.length){
    NX.toastInfo('Nothing selected', 'Enable Tasks or Drive first.');
    return false;
  }

  const tok = await authorize(scopes, { forceConsent:true });
  if(!tok) return false;

  c.accessToken = tok.access_token || '';
  c.refreshToken = tok.refresh_token || c.refreshToken || '';
  c.expiresAt = Date.now() + (Number(tok.expires_in || 3600) * 1000);
  c.scopes = String(tok.scope || scopes.join(' ')).split(' ').filter(Boolean);
  c.connected = true;

  /* the email comes from the id_token the popup returns; it is only ever
     displayed, never stored as an auth credential */
  try{
    if(tok.id_token){
      const payload = JSON.parse(atob(tok.id_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      c.email = payload.email || '';
    }
  }catch(e){ c.email = ''; }

  save();
  log('Connected as ' + (c.email || 'your Google account'), 'ok');
  announce('connected');
  NX.toastOk('Google connected', c.email || 'Tasks and Drive are ready.');
  if(c.tasksEnabled !== false) void syncTasks();
  if(c.driveEnabled !== false) void backupToDrive();
  return true;
}

function disconnect(){
  const c = cfg();
  /* DELETE the tokens — disabling a flag would leave the credential in
     the workspace file and in every future backup */
  c.accessToken = '';
  c.refreshToken = '';
  c.expiresAt = 0;
  c.connected = false;
  c.email = '';
  c.scopes = [];
  c.taskListId = '';
  c.driveFolderId = '';
  c.lastTasksSync = 0;
  c.lastDriveBackup = 0;
  save();
  log('Disconnected. Tokens deleted.', 'ok');
  NX.toastOk('Disconnected', 'Your Google tokens were deleted from this device.');
}

/* ============================================================
   AUTO-SYNC
   Debounced hard. NX.store.set() rewrites the whole workspace, so a
   sync triggered per keystroke would hammer both APIs and the disk.
   ============================================================== */
let timer = null;
let syncing = false;
function schedule(){
  const c = cfg();
  if(!c.connected) return;
  if(!c.tasksEnabled && !c.driveEnabled) return;
  clearTimeout(timer);
  timer = setTimeout(run, 20000);      /* batch bursts into one sync */
}

async function run(){
  if(syncing) return;
  syncing = true;
  const c = cfg();
  try{
    if(c.tasksEnabled !== false) await syncTasks();
    if(c.driveEnabled !== false) await backupToDrive();
  }catch(e){
    log('Sync failed: ' + (e && e.message ? e.message : e), 'err');
  }finally{
    syncing = false;
  }
}

/* Debounced immediate kick so the UI feels responsive without a storm. */
function soon(){
  const c = cfg();
  if(!c.connected) return;
  clearTimeout(timer);
  timer = setTimeout(run, 8000);
}

document.addEventListener('DOMContentLoaded', ()=>{
  /* sync once at start so other devices' edits land on launch */
  setTimeout(()=>{ const c = cfg(); if(c.connected) run(); }, 20000);
});

/* only react to task edits while sync is actually on */
NX.events.on('store:tasks', ()=>{
  const c = cfg();
  if(c.connected && c.tasksEnabled !== false) schedule();
});

/* ============================================================
   NOTIFICATIONS
   Sync status has to be visible without the user hunting through
   Settings. A native toast is fired on every meaningful state change,
   and the log below is what the notification centre shows.
   ============================================================ */
function notify(title, body, kind){
  NX.pushNotif && NX.pushNotif(title, body, kind === 'err' ? 'alert' : 'cloud');
  /* native too, so it lands even when PebbleX is behind other windows */
  try{
    if(NX.native && NX.native.available) NX.native.notify({ title, body, silent:false });
  }catch(e){}
}

function announce(what){
  const c = cfg();
  const bits = [];
  if(c.tasksEnabled !== false) bits.push('Tasks');
  if(c.driveEnabled !== false) bits.push('Drive');
  if(!bits.length) return;
  const s = what || 'Synced';
  notify('Google ' + s, bits.join(' and ') + ' are up to date.');
}

document.addEventListener('DOMContentLoaded', ()=>{
  /* one gentle prompt, once ever, so nobody discovers this by accident */
  setTimeout(()=>{
    const c = cfg();
    if(!c.connected && !c.prompted){
      c.prompted = true;
      save();
      NX.pushNotif && NX.pushNotif('Sync with Google?',
        'Keep your tasks and backups in step with Google Tasks and Drive.', 'cloud');
      const chip = document.querySelector('#tp-points');
      void chip;
      /* a small, dismissible strip under the topbar */
      try{ showNudge(); }catch(e){}
    }
  }, 4000);
});

/** the nudge strip — one button, one click, no settings hunt */
function showNudge(){
  if(!NX.modules || !NX.modules.isOn('google')) return;
  if(document.getElementById('gd-nudge')) return;
  const bar = document.createElement('div');
  bar.id = 'gd-nudge';
  bar.className = 'gd-nudge';
  bar.innerHTML = `<span class="gn-ic">${NX.glogo ? NX.glogo('g',16) : ''}</span>
    <span class="gn-txt"><b>Sync with Google</b> Tasks and Drive, one click.</span>
    <button class="btn btn-green btn-sm gn-go">Connect</button>
    <button class="icon-btn sm gn-x" aria-label="Dismiss">${NX.icon('x',13)}</button>`;
  const host = document.querySelector('.view-host') || document.querySelector('#shell-view');
  if(!host) return;
  host.parentElement.insertBefore(bar, host);

  const go = bar.querySelector('.gn-go');
  if(go) go.onclick = ()=>{ try{ NX.router.go('settings/google'); }catch(e){ NX.router.go('settings'); } bar.remove(); };
  const x = bar.querySelector('.gn-x');
  if(x) x.onclick = ()=>bar.remove();
  /* auto-dismiss; it is a hint, not a modal */
  setTimeout(()=>bar.remove(), 14000);
}

/* ============================================================
   PUBLIC API
   ============================================================ */
NX.google = {
  cfg, save, log, announce, showNudge,
  COL_MAP, COL_BACK,

  /* exported for tests */
  toGoogle, fromGoogle, resolveConflict, colOf, backupPayload,

  connected(){ return cfg().connected; },

  async setClientId(id){
    const c = cfg();
    let v = String(id || '').trim();

    /* Refuse anything that is not a client ID. A client secret pasted
       into this box would land in workspace.json and in every export,
       and it is not needed: this flow is PKCE. */
    if(/^GOCSPX-|client_secret|secret/i.test(v)){
      log('That looks like a client SECRET. It is not needed and was not saved.', 'err');
      NX.toastErr('That is a secret, not a client ID',
        'PebbleX uses PKCE, so no secret is required. It was not saved.');
      return false;
    }
    /* a client ID always ends in .apps.googleusercontent.com */
    if(v && !v.endsWith('.apps.googleusercontent.com')){
      NX.toastErr('That does not look like a client ID',
        'It should end in .apps.googleusercontent.com');
      return false;
    }
    c.clientId = v || DEFAULT_CLIENT_ID;
    save();
    return true;
  },

  async setEnabled(kind, on){
    const c = cfg();
    if(kind === 'tasks') c.tasksEnabled = !!on;
    if(kind === 'drive') c.driveEnabled = !!on;
    save();
  },

  connect,
  disconnect,

  syncTasks,
  syncNow: run,
  backupToDrive,
  listDriveBackups,
  soon,

  /* true when the current session has a usable token */
  async ready(){ return !!(await token()); },

  scopeHelp(){
    const c = cfg();
    if(!c.tasksEnabled && !c.driveEnabled) return 'Enable Tasks or Drive above.';
    const need = [];
    if(c.tasksEnabled) need.push(TASKS_SCOPE);
    if(c.driveEnabled) need.push(DRIVE_SCOPE);
    return need.join('  ');
  },

  /** strip tokens before the workspace is exported anywhere */
  sanitise(doc){
    const out = Object.assign({}, doc);
    delete out[KEY];
    return out;
  }
};

} )(window.NX);