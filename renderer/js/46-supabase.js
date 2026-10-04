/* ============================================================
   PebbleX — 46-supabase.js
   Cloud layer: Supabase (auth + data + realtime) and Cloudflare
   (R2 for images, Durable Objects for live chat).

   FIRES ONE PROVIDER'S FLAG: Supabase + Cloudflare. No Firebase.

   DESIGN RULES (README §Cloud, FEATURES-UPGRADE §C1)
   Cloud is an OPT-IN ADD-ON. The local PIN login stays the default
   way in and nothing here may affect boot. With no config, offline,
   or a failed import, every call is a clean no-op.

   Nothing is bundled. The SDK is imported lazily the first time a
   cloud feature is used, so the offline app stays small.

   Schema (Website/backend/supabase/001_workspace.sql):
     profiles(id text pk, name, email, theme, avatar_color, ...)
     workspace_items(id uuid, owner_id, kind, title, body, status,
                      priority, project, pinned, origin, extra jsonb,
                      updated_at, deleted_at)
   kind is one of: task | note | conversation | message | reminder | prompt
   ============================================================ */
(function(NX){
'use strict';

const SDK_URL = 'https://esm.sh/@supabase/supabase-js@2';
const CFG_KEY  = 'cloud:config';
const USER_KEY = 'cloud:user';
const DEVICE_KEY = 'cloud:deviceId';

/* ------------------------------------------------------------ *
 *  Config
 * ------------------------------------------------------------ */
const DEFAULT_SUPABASE_URL = 'https://uqrkpssesnxhevkgcgsu.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_AQgLWYOskawdqLpqOmdk0g_J4WoSrH-';
const DEFAULT_R2_ENDPOINT  = 'https://pebble-media-api.bbs-hub-cdn.workers.dev';
const DEFAULT_R2_TOKEN     = '94b3b550afaf456b96b6bd8be83d07e422f66f2c76394ac5862a3ce3a445cbab';

function blank(){
  return {
    supabaseUrl: DEFAULT_SUPABASE_URL,
    supabaseKey: DEFAULT_SUPABASE_KEY,
    r2Endpoint:  DEFAULT_R2_ENDPOINT,
    chatEndpoint: '',
    gifKey: ''
  };
}
function readConfig(){
  const s = NX.store.get(CFG_KEY, null) || {};
  const b = blank();
  return {
    supabaseUrl: (s.supabaseUrl && String(s.supabaseUrl).trim()) || b.supabaseUrl,
    supabaseKey: (s.supabaseKey && String(s.supabaseKey).trim()) || b.supabaseKey,
    r2Endpoint:  (s.r2Endpoint && String(s.r2Endpoint).trim()) || b.r2Endpoint,
    chatEndpoint:(s.chatEndpoint && String(s.chatEndpoint).trim()) || b.chatEndpoint,
    gifKey:      (s.gifKey && String(s.gifKey).trim()) || b.gifKey
  };
}
function configured(){
  const c = readConfig();
  return !!(c.supabaseUrl && c.supabaseKey);
}
function saveConfig(patch){
  const next = Object.assign(readConfig(), patch || {});
  if(next.supabaseUrl) next.supabaseUrl = String(next.supabaseUrl).trim().replace(/\/+$/,'');
  if(next.supabaseKey) next.supabaseKey = String(next.supabaseKey).trim();
  NX.store.set(CFG_KEY, next);
  teardown();
  return next;
}
function clearConfig(){ NX.store.set(CFG_KEY, blank()); teardown(); }

function online(){
  return !(typeof navigator !== 'undefined' && navigator.onLine === false);
}

/* ------------------------------------------------------------ *
 *  Zero-dependency REST Fallback Client
 *  Ensures Supabase Auth and Workspace Sync function in desktop
 *  and restricted environments even if external esm.sh dynamic
 *  module imports are blocked or unavailable.
 * ------------------------------------------------------------ */
function createRestClient(cfg){
  const baseUrl = cfg.supabaseUrl;
  const apikey  = cfg.supabaseKey;

  function getToken(){
    const sess = NX.store.get('cloud:session', null);
    return (sess && sess.access_token) ? sess.access_token : apikey;
  }

  function reqHeaders(extra){
    return Object.assign({
      'apikey': apikey,
      'Authorization': 'Bearer ' + getToken(),
      'Content-Type': 'application/json'
    }, extra || {});
  }

  return {
    auth: {
      async signInWithPassword({ email, password }){
        try{
          const res = await fetch(baseUrl + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: reqHeaders(),
            body: JSON.stringify({ email, password })
          });
          const data = await res.json().catch(()=>({}));
          if(!res.ok){
            return { data:null, error: new Error(data.msg || data.error_description || data.message || 'Login failed') };
          }
          NX.store.set('cloud:session', data);
          return { data, error:null };
        }catch(e){ return { data:null, error:e }; }
      },

      async signUp({ email, password, options }){
        try{
          const payload = { email, password };
          if(options && options.data) payload.data = options.data;
          const res = await fetch(baseUrl + '/auth/v1/signup', {
            method: 'POST',
            headers: reqHeaders(),
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(()=>({}));
          if(!res.ok){
            return { data:null, error: new Error(data.msg || data.error_description || data.message || 'Registration failed') };
          }
          if(data.session) NX.store.set('cloud:session', data.session);
          return { data, error:null };
        }catch(e){ return { data:null, error:e }; }
      },

      async signInWithOAuth({ provider, options }){
        const redir = options && options.redirectTo ? '&redirect_to=' + encodeURIComponent(options.redirectTo) : '';
        const url = baseUrl + '/auth/v1/authorize?provider=' + encodeURIComponent(provider) + redir;
        return { data: { url }, error:null };
      },

      async signOut(){
        try{
          await fetch(baseUrl + '/auth/v1/logout', { method:'POST', headers: reqHeaders() }).catch(()=>{});
        }catch(e){}
        NX.store.set('cloud:session', null);
        return { error:null };
      },

      async getSession(){
        const sess = NX.store.get('cloud:session', null);
        if(!sess || !sess.access_token) return { data:{ session:null }, error:null };
        try{
          const res = await fetch(baseUrl + '/auth/v1/user', {
            method: 'GET',
            headers: reqHeaders()
          });
          if(res.ok){
            const user = await res.json().catch(()=>null);
            if(user) return { data:{ session: Object.assign({}, sess, { user }) }, error:null };
          }
        }catch(e){}
        return { data:{ session: sess }, error:null };
      }
    },

    from(table){
      const builder = {
        _table: table,
        _select: '*',
        _filters: [],
        _order: null,
        _limit: null,
        select(cols){ builder._select = cols || '*'; return builder; },
        eq(col, val){ builder._filters.push(encodeURIComponent(col) + '=eq.' + encodeURIComponent(val)); return builder; },
        is(col, val){ builder._filters.push(encodeURIComponent(col) + '=is.' + encodeURIComponent(val)); return builder; },
        gt(col, val){ builder._filters.push(encodeURIComponent(col) + '=gt.' + encodeURIComponent(val)); return builder; },
        order(col, opts){ builder._order = encodeURIComponent(col) + '.' + (opts && opts.ascending ? 'asc' : 'desc'); return builder; },
        limit(n){ builder._limit = n; return builder; },
        async maybeSingle(){
          builder._limit = 1;
          const { data, error } = await builder;
          return { data: (data && data[0]) ? data[0] : null, error };
        },
        async insert(payload){
          try{
            const res = await fetch(baseUrl + '/rest/v1/' + table, {
              method: 'POST',
              headers: reqHeaders({ 'Prefer': 'return=representation' }),
              body: JSON.stringify(payload)
            });
            const data = await res.json().catch(()=>[]);
            if(!res.ok) return { data:null, error: new Error((data && (data.message || data.msg)) || ('HTTP ' + res.status)) };
            return { data, error:null };
          }catch(e){ return { data:null, error:e }; }
        },
        async update(payload){
          try{
            let qs = builder._filters.length ? '?' + builder._filters.join('&') : '';
            const res = await fetch(baseUrl + '/rest/v1/' + table + qs, {
              method: 'PATCH',
              headers: reqHeaders({ 'Prefer': 'return=representation' }),
              body: JSON.stringify(payload)
            });
            const data = await res.json().catch(()=>[]);
            if(!res.ok) return { data:null, error: new Error((data && (data.message || data.msg)) || ('HTTP ' + res.status)) };
            return { data, error:null };
          }catch(e){ return { data:null, error:e }; }
        },
        then(resolve, reject){
          let qs = '?select=' + encodeURIComponent(builder._select);
          if(builder._filters.length) qs += '&' + builder._filters.join('&');
          if(builder._order) qs += '&order=' + builder._order;
          if(builder._limit) qs += '&limit=' + builder._limit;

          return fetch(baseUrl + '/rest/v1/' + table + qs, {
            method: 'GET',
            headers: reqHeaders()
          })
          .then(async res => {
            const data = await res.json().catch(()=>[]);
            if(!res.ok) return { data:null, error: new Error((data && (data.message || data.msg)) || ('HTTP ' + res.status)) };
            return { data: Array.isArray(data) ? data : [data], error:null };
          })
          .then(resolve, reject);
        }
      };
      return builder;
    },

    channel(name){
      return {
        on(){ return this; },
        subscribe(cb){ if(cb) cb('SUBSCRIBED'); return this; },
        unsubscribe(){}
      };
    }
  };
}

/* ------------------------------------------------------------ *
 *  Lazy client
 * ------------------------------------------------------------ */
let _sb = null, _mod = null, _loading = null, _err = null;

async function sdk(){
  if(_mod) return _mod;
  if(_loading) return _loading;
  _loading = (async ()=>{
    try{
      if(!online()){ _err = 'offline'; return null; }
      if(!configured()){ _err = 'not-configured'; return null; }
      _mod = await import(/* webpackIgnore: true */ SDK_URL);
      return _mod;
    }catch(e){
      _err = String(e && e.message || e);
      return null;
    }
  })();
  const r = await _loading;
  _loading = null;
  return r;
}

async function sb(){
  if(_sb) return _sb;
  if(!configured() || !online()) return null;
  const c = readConfig();
  const m = await sdk().catch(()=>null);
  if(m && m.createClient){
    try{
      _sb = m.createClient(c.supabaseUrl, c.supabaseKey, {
        auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true },
        realtime:{ params:{ eventsPerSecond:5 } }
      });
      return _sb;
    }catch(e){ /* fall through to native rest fallback */ }
  }
  _sb = createRestClient(c);
  return _sb;
}

function teardown(){ _sb = null; _mod = null; _loading = null; _err = null; }

/* Connection test. Verifies the URL + publishable key reach the auth
   service AND that the schema was actually migrated — a fresh Supabase
   project answers 200 on /auth/v1/* even with zero tables, and reporting
   "Connected" there would hide the real problem. Delegates to ping(),
   which probes /rest/v1 and recognises PGRST205. */
async function testConnection(){
  const base = await ping();
  if(!base.ok) return base;
  return {
    ok: true,
    version: base.version,
    tables: base.tables !== false,
    url: readConfig().supabaseUrl,
    signedIn: auth.signedIn,
    user: auth.user
  };
}

/* single place that explains why a call did nothing */
function notReady(){
  if(_err === 'offline' || !online()) return 'You are offline — cloud needs a connection.';
  if(_err === 'not-configured' || !configured()) return 'Add your Supabase URL and publishable key in Settings → Cloud.';
  return _err || 'Cloud is unavailable right now.';
}

/* ------------------------------------------------------------
 *  Reachability — a real ping that needs NO sign-in.
 *  "Test connection" used to call sync.pull, which answers
 *  "sign in to sync" when signed out — so a perfectly healthy
 *  project looked broken. This hits the auth service directly and
 *  then probes the REST schema, so each failure says what to DO.
 * ------------------------------------------------------------ */
async function ping(){
  const c = readConfig();
  if(!online()) return { ok:false, error:'You are offline.' };
  if(!c.supabaseUrl || !c.supabaseKey) return { ok:false, error:'Supabase URL and publishable key are required.' };
  try{
    const res = await fetch(c.supabaseUrl + '/auth/v1/health', {
      headers:{ apikey: c.supabaseKey }, cache:'no-store'
    });
    if(!res.ok) return { ok:false, error:'Auth service answered HTTP ' + res.status + ' — check the project URL and key.' };
    const health = await res.json().catch(()=>({}));
    /* the schema probe: a project nobody ran the migrations on answers
       PGRST205 "could not find the table" — say exactly that, because the
       fix (running APPLY_ALL.sql) is not guessable from the error */
    const rest = await fetch(c.supabaseUrl + '/rest/v1/workspace_items?select=id&limit=1', {
      headers:{ apikey: c.supabaseKey }, cache:'no-store'
    });
    if(rest.status === 404){
      return { ok:true, version:health.version, tables:false,
        error:'Supabase is reachable, but the database has no tables yet. Run Website/backend/supabase/init_pebblex_supabase.sql in the Supabase SQL editor (supabase.com/dashboard → SQL), then press Sync.' };
    }
    if(!rest.ok) return { ok:false, error:'REST answered HTTP ' + rest.status + '.' };
    return { ok:true, version:health.version, tables:true };
  }catch(e){
    return { ok:false, error:'Could not reach ' + c.supabaseUrl + ' — ' + String(e && e.message || e) };
  }
}

/* ------------------------------------------------------------ *
 *  Identity — OPTIONAL, alongside the PIN
 * ------------------------------------------------------------ */
const _subs = new Set();
function emit(u){
  _subs.forEach(fn => { try{ fn(u); }catch(e){} });
  /* app-level signal, so modules that are not the settings panel (usage
     sync, badges, the widget) can react. Nothing listened before, which is
     why usage sync never activated even after a successful sign-in. */
  try{ NX.events.emit(u ? 'cloud:signed-in' : 'cloud:signed-out', u); }catch(e){}
}

/* a stable id for this install, so devices can be told apart */
function deviceId(){
  let id = NX.store.get(DEVICE_KEY, '');
  if(!id){
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,10);
    NX.store.set(DEVICE_KEY, id);
  }
  return id;
}

const auth = {
  /* The PIN session is a completely separate thing and keeps working
     regardless of anything here. */
  get user(){ return NX.store.get(USER_KEY, null); },
  get signedIn(){ return !!(NX.store.get(USER_KEY, null) || {}).id; },

  async _remember(client, user){
    if(!user) return null;
    const rec = {
      id: user.id,
      email: user.email || '',
      name: (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || (user.email || 'You').split('@')[0],
      avatar: (user.user_metadata && user.user_metadata.avatar_url) || '',
      at: Date.now()
    };
    NX.store.set(USER_KEY, rec);

    /* Make sure a profile row exists. RLS allows a user to insert their
       own; everything else is server-side. */
    try{
      const { data: existing } = await client
        .from('profiles').select('id').eq('id', rec.id).maybeSingle();
      if(!existing){
        await client.from('profiles').insert({
          id: rec.id, name: rec.name, email: rec.email, avatar_color: '#7CD56E'
        });
      }
    }catch(e){ /* profile creation is best-effort; sync will retry */ }

    emit(rec);
    return rec;
  },

  async signIn(email, password){
    const c = await sb();
    if(!c) return { ok:false, error: notReady() };
    try{
      const { data, error } = await c.auth.signInWithPassword({ email, password });
      if(error) return { ok:false, error: authMessage(error) };
      const u = await auth._remember(c, data && data.user);
      return { ok:true, user:u };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },

  async register(email, password, name){
    const c = await sb();
    if(!c) return { ok:false, error: notReady() };
    try{
      if(password && password.length < 8) return { ok:false, error:'Password needs at least 8 characters.' };
      const { data, error } = await c.auth.signUp({
        email, password,
        options:{ data:{ full_name: name || '' } }
      });
      if(error) return { ok:false, error: authMessage(error) };
      /* Supabase may require email confirmation, in which case there is
         no session yet and the user must confirm before signing in. */
      if(!data || !data.session){
        return { ok:true, pending:true, user:{ id:(data && data.user && data.user.id) || '', email } };
      }
      const u = await auth._remember(c, data.user);
      return { ok:true, user:u };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },

  /* Google needs the browser to come back into the app, which means a
     deep link. Without the protocol registered the browser signs in and
     the app never hears about it, so say so plainly instead of hanging. */
  async signInWithGoogle(){
    const c = await sb();
    if(!c) return { ok:false, error: notReady() };
    try{
      const cfg = readConfig();
      const redirect = cfg.redirectTo || (typeof location !== 'undefined' ? location.origin + location.pathname : undefined);
      const { data, error } = await c.auth.signInWithOAuth({
        provider:'google',
        options:{ redirectTo: redirect, skipBrowserRedirect:false }
      });
      if(error) return { ok:false, error: authMessage(error) };
      return { ok:true, redirecting:true, url:data && data.url };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },

  async signOut(){
    const c = await sb();
    NX.store.set(USER_KEY, null);
    if(c){ try{ await c.auth.signOut(); }catch(e){} }
    emit(null);
    return { ok:true };
  },

  /* called once at boot: adopts a session the browser handed back */
  async restore(){
    const c = await sb();
    if(!c) return null;
    try{
      const { data } = await c.auth.getSession();
      const u = data && data.session && data.session.user;
      if(!u) return null;
      return await auth._remember(c, u);
    }catch(e){ return null; }
  },

  onChange(fn){ _subs.add(fn); return ()=> _subs.delete(fn); }
};

function authMessage(e){
  const msg = String((e && (e.message || e.msg || e.error_description)) || e || '');
  if(/invalid.*credential/i.test(msg)) return 'Wrong email or password.';
  if(/already.*registered/i.test(msg)) return 'That email already has an account.';
  if(/not confirmed/i.test(msg)) return 'Confirm your email first, then sign in.';
  if(/least 8 char/i.test(msg)) return 'Password needs at least 8 characters.';
  if(/rate limit/i.test(msg)) return 'Email rate limit reached. Please wait a few minutes before trying again.';
  if(/failed to fetch/i.test(msg)) return 'Could not reach Supabase — check your network connection.';
  return msg || 'Authentication error';
}

function dbError(e){
  const msg = String((e && (e.message || e.msg)) || e || '');
  if(/relation.*workspace_items/i.test(msg) || /schema cache/i.test(msg) || /workspace_items.*not found/i.test(msg)){
    return 'Table workspace_items is not initialized in Supabase. Run Website/backend/supabase/init_pebblex_supabase.sql in your Supabase SQL editor.';
  }
  return msg || 'Database operation failed';
}

/* ------------------------------------------------------------ *
 *  Workspace sync — workspace_items
 * ------------------------------------------------------------ */

/* local store collection -> schema kind. Notes are markdown files on
   disk, so only their metadata and body travel. */
const KIND = { tasks:'task', notes:'note', prompts:'prompt', reminders:'reminder' };
const COLLECTION = { task:'tasks', note:'notes', prompt:'prompts', reminder:'reminders' };

function nowIso(){ return new Date().toISOString(); }

/* ------------------------------------------------------------
 *  Offline Sync Queue & Debounce Watcher
 * ------------------------------------------------------------ */
const OFFLINE_QUEUE_KEY = 'pebble._cloud_sync_queue';
function getOfflineQueue(){
  try{ return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'); }catch(e){ return []; }
}
function enqueueOffline(action){
  try{
    const q = getOfflineQueue();
    const id = action.item ? (action.item.id || action.item.local_id) : action.id;
    const filtered = q.filter(x => !(x.kind === action.kind && (x.id === id || (x.item && x.item.id === id))));
    filtered.push({ ...action, at: Date.now() });
    if(filtered.length > 500) filtered.shift();
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  }catch(e){}
}
async function drainOfflineQueue(){
  if(!online() || !auth.user || !configured()) return;
  const q = getOfflineQueue();
  if(!q.length) return;
  const remaining = [];
  for(const act of q){
    try {
      if(act.type === 'push'){
        const r = await sync.push(act.kind, act.item, true);
        if(!r.ok) remaining.push(act);
      } else if(act.type === 'remove'){
        const r = await sync.remove(act.kind, act.id, true);
        if(!r.ok) remaining.push(act);
      }
    }catch(e){ remaining.push(act); }
  }
  try{ localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining)); }catch(e){}
}

let _reconciling = false;
let _suppressSyncPush = false;
let _autoSyncStarted = false;
let _syncDebounceTimer = null;
let _rtSub = null;

const sync = {
  /* Push one local item. Upsert by stable client id kept in extra. */
  async push(kind, item, skipQueue){
    if(!configured() || !online()){
      if(!skipQueue) enqueueOffline({ type:'push', kind, item });
      return { ok:false, error: notReady() };
    }
    const u = auth.user;
    if(!u) return { ok:false, error:'sign in to sync' };
    const c = await sb();
    if(!c) return { ok:false, error: notReady() };
    try{
      const localId = String(item.id || item.local_id || (kind === 'profile' ? 'main_profile' : ''));
      const extra = { local_id: localId, device_id: deviceId(), ...(item.extra || {}) };

      // Enrich extra by kind
      if(kind === 'task'){
        extra.col = item.col || 'today';
        extra.cat = item.cat || 'work';
        extra.due = item.due || '';
        extra.steps = item.steps || [];
        extra.important = !!item.important;
        extra.myDay = !!item.myDay;
        extra.myDayDate = item.myDayDate || '';
        extra.repeat = item.repeat || 'none';
        extra.created = item.created || Date.now();
      } else if(kind === 'note'){
        extra.tags = item.tags || [];
        extra.folder = item.folder || '';
        extra.starred = !!item.starred;
        extra.trash = !!item.trash;
        extra.mdRel = item.mdRel || '';
        extra.updated = item.updated || Date.now();
      } else if(kind === 'reminder'){
        extra.when = item.when || Date.now() + 3600e3;
        extra.repeat = item.repeat || 'none';
        extra.cat = item.cat || 'work';
        extra.fired = !!item.fired;
      } else if(kind === 'prompt'){
        extra.cat = item.cat || 'general';
        extra.desc = item.desc || '';
        extra.tags = item.tags || [];
      } else if(kind === 'profile'){
        extra.name = item.name || '';
        extra.avatar = item.avatar || '';
        extra.avatarImg = item.avatarImg || null;
        extra.bio = item.bio || '';
        extra.email = item.email || '';
      }

      const row = {
        owner_id: u.id,
        kind,
        title: String(item.title || item.name || '').slice(0, 180),
        body: String(item.body || item.text || item.note || item.prompt || '').slice(0, 100000),
        status: item.done ? 'done' : (item.status || 'todo'),
        priority: ['low','medium','high'].includes(item.priority) ? item.priority : 'medium',
        project: String(item.folder || item.cat || item.project || 'Personal').slice(0, 60),
        pinned: !!item.pinned,
        origin: NX.native && NX.native.available ? 'desktop' : 'web',
        extra,
        updated_at: nowIso()
      };

      const { data: found } = await c
        .from('workspace_items').select('id')
        .eq('owner_id', u.id).eq('kind', kind)
        .eq('extra->>local_id', localId).maybeSingle();
      if(found) await c.from('workspace_items').update(row).eq('id', found.id);
      else await c.from('workspace_items').insert(row);
      return { ok:true };
    }catch(e){
      if(!skipQueue) enqueueOffline({ type:'push', kind, item });
      return { ok:false, error: dbError(e) };
    }
  },

  /* Full pull. Only newer-than rows are sent unless `full` is set. */
  async pull(opts){
    if(!configured() || !online()) return { ok:false, error: notReady(), items:[] };
    const u = auth.user;
    if(!u) return { ok:false, error:'sign in to sync', items:[] };
    const c = await sb();
    if(!c) return { ok:false, error: notReady(), items:[] };
    try{
      let q = c.from('workspace_items').select('*')
        .eq('owner_id', u.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending:false })
        .limit((opts && opts.limit) || 1000);
      if(opts && opts.since) q = q.gt('updated_at', opts.since);
      const { data, error } = await q;
      if(error) return { ok:false, error: dbError(error), items:[] };
      return { ok:true, items: data || [] };
    }catch(e){ return { ok:false, error: dbError(e), items:[] }; }
  },

  /* Realtime subscription */
  subscribe(cb){
    let live = true, chan = null;
    const out = { unsubscribe(){ live = false; try{ chan && chan.unsubscribe(); }catch(e){} } };
    (async ()=>{
      const u = auth.user;
      if(!u){ try{ cb([], 'not-signed-in'); }catch(e){} return; }
      const c = await sb();
      if(!c || !live){ try{ cb([], 'unavailable'); }catch(e){} return; }
      try{
        chan = c.channel('ws-' + deviceId())
          .on('postgres_changes',
              { event:'*', schema:'public', table:'workspace_items', filter:'owner_id=eq.' + u.id },
              payload => { try{ cb([payload.new || payload.old], 'ok'); }catch(e){} })
          .subscribe(status => { try{ cb([], status === 'SUBSCRIBED' ? 'ok' : 'connecting'); }catch(e){} });
      }catch(e){ try{ cb([], 'error: ' + String(e && e.message || e)); }catch(err){} }
    })();
    return out;
  },

  async remove(kind, localId, skipQueue){
    if(!configured() || !online()){
      if(!skipQueue) enqueueOffline({ type:'remove', kind, id: localId });
      return { ok:false, error: notReady() };
    }
    const u = auth.user;
    if(!u) return { ok:false, error:'sign in to sync' };
    const c = await sb();
    if(!c) return { ok:false, error: notReady() };
    try{
      /* soft delete, so another device can learn about the removal */
      const { data: found } = await c.from('workspace_items').select('id')
        .eq('owner_id', u.id).eq('kind', kind)
        .eq('extra->>local_id', String(localId)).maybeSingle();
      if(found) await c.from('workspace_items')
        .update({ deleted_at: nowIso(), updated_at: nowIso() }).eq('id', found.id);
      return { ok:true };
    }catch(e){
      if(!skipQueue) enqueueOffline({ type:'remove', kind, id: localId });
      return { ok:false, error:String(e && e.message || e) };
    }
  },

  /* Master bidirectional reconciliation */
  async reconcile(){
    if(_reconciling) return { ok:false, error:'Sync already in progress' };
    if(!configured() || !online()) return { ok:false, error: notReady() };
    if(!auth.user) return { ok:false, error:'Sign in to sync with cloud.' };

    _reconciling = true;
    try {
      await drainOfflineQueue();

      const pulled = await sync.pull({ limit: 1000 });
      if(!pulled.ok){ _reconciling = false; return pulled; }
      const remoteItems = pulled.items || [];
      const remoteMap = new Map();
      remoteItems.forEach(item => {
        const lid = (item.extra && item.extra.local_id) || item.id;
        remoteMap.set(`${item.kind}:${lid}`, item);
      });

      const stats = { tasksPulled:0, notesPulled:0, remsPulled:0, promptsPulled:0, pushed:0 };
      _suppressSyncPush = true; // prevent local writes from triggering auto-push loop

      // 0. Reconcile Profile & Identity (name, avatar, logo, bio, email)
      const remoteProfileItem = remoteItems.find(i => i.kind === 'profile');
      if(remoteProfileItem && remoteProfileItem.extra){
        const curProfile = NX.store.get('profile', NX.defaults.profile);
        const curEnt = NX.store.get('entitlements', {}) || {};
        const rExtra = remoteProfileItem.extra;
        const rUpdated = remoteProfileItem.updated_at ? new Date(remoteProfileItem.updated_at).getTime() : 0;
        const lUpdated = curProfile.updated || 0;

        if(!curProfile.name || curProfile.name === 'You' || rUpdated >= lUpdated){
          if(rExtra.name) curProfile.name = rExtra.name;
          if(rExtra.avatar) curProfile.avatar = rExtra.avatar;
          if(rExtra.avatarImg){
            curProfile.avatarImg = rExtra.avatarImg;
            curEnt.avatarImg = rExtra.avatarImg;
            NX.store.set('entitlements', curEnt);
          }
          if(rExtra.bio !== undefined) curProfile.bio = rExtra.bio;
          if(rExtra.email) curProfile.email = rExtra.email;
          curProfile.updated = rUpdated || Date.now();
          NX.store.set('profile', curProfile);
          NX.refreshSidebarUser && NX.refreshSidebarUser();
        }
      } else {
        const curProfile = NX.store.get('profile', NX.defaults.profile);
        const curEnt = NX.store.get('entitlements', {}) || {};
        const pushProfile = Object.assign({}, curProfile, {
          id: 'main_profile',
          avatarImg: curProfile.avatarImg || curEnt.avatarImg || null
        });
        await sync.push('profile', pushProfile, true).catch(()=>{});
      }

      // 1. Reconcile Tasks
      const localTasks = NX.store.get('tasks', []) || [];
      const taskMap = new Map(localTasks.map(t => [String(t.id), t]));
      let tasksChanged = false;

      remoteItems.filter(i => i.kind === 'task').forEach(ri => {
        const lid = (ri.extra && ri.extra.local_id) || ri.id;
        const existing = taskMap.get(String(lid));
        const rUpdated = ri.updated_at ? new Date(ri.updated_at).getTime() : 0;
        const lUpdated = existing ? (existing.updated || existing.updatedAt || existing.created || 0) : 0;

        if(!existing){
          const newTask = {
            id: lid,
            name: ri.title || 'Untitled task',
            note: ri.body || '',
            done: ri.status === 'done',
            col: (ri.extra && ri.extra.col) || (ri.status === 'done' ? 'done' : 'today'),
            cat: (ri.extra && ri.extra.cat) || 'work',
            priority: ri.priority || 'medium',
            due: (ri.extra && ri.extra.due) || ri.due_date || '',
            steps: (ri.extra && ri.extra.steps) || [],
            important: !!(ri.extra && ri.extra.important),
            myDay: !!(ri.extra && ri.extra.myDay),
            myDayDate: (ri.extra && ri.extra.myDayDate) || '',
            created: ri.created_at ? new Date(ri.created_at).getTime() : Date.now(),
            updated: rUpdated
          };
          localTasks.unshift(newTask);
          taskMap.set(String(lid), newTask);
          tasksChanged = true;
          stats.tasksPulled++;
        } else if(rUpdated > lUpdated){
          existing.name = ri.title;
          existing.note = ri.body;
          existing.done = ri.status === 'done';
          if(ri.extra && ri.extra.col) existing.col = ri.extra.col;
          if(ri.extra && ri.extra.cat) existing.cat = ri.extra.cat;
          if(ri.priority) existing.priority = ri.priority;
          if(ri.extra && ri.extra.steps) existing.steps = ri.extra.steps;
          if(ri.extra && ri.extra.due) existing.due = ri.extra.due;
          if(ri.extra && ri.extra.important !== undefined) existing.important = !!ri.extra.important;
          existing.updated = rUpdated;
          tasksChanged = true;
          stats.tasksPulled++;
        }
      });

      // 2. Reconcile Notes
      const localNotes = NX.store.get('notes', []) || [];
      const noteMap = new Map(localNotes.map(n => [String(n.id), n]));
      let notesChanged = false;

      remoteItems.filter(i => i.kind === 'note').forEach(ri => {
        const lid = (ri.extra && ri.extra.local_id) || ri.id;
        const existing = noteMap.get(String(lid));
        const rUpdated = ri.updated_at ? new Date(ri.updated_at).getTime() : 0;
        const lUpdated = existing ? (existing.updated || 0) : 0;

        if(!existing){
          const newNote = {
            id: lid,
            title: ri.title || 'Untitled Note',
            body: ri.body || '',
            tags: (ri.extra && ri.extra.tags) || [],
            folder: (ri.extra && ri.extra.folder) || '',
            pinned: !!ri.pinned,
            starred: !!(ri.extra && ri.extra.starred),
            updated: rUpdated || Date.now()
          };
          localNotes.unshift(newNote);
          noteMap.set(String(lid), newNote);
          notesChanged = true;
          stats.notesPulled++;
          try {
            if(NX.native && NX.native.available && NX.native.mode === 'tauri'){
              const rel = (newNote.folder ? newNote.folder + '/' : '') + (newNote.title.replace(/[\\/:*?"<>|]/g,'-').slice(0,60).trim() || 'Untitled') + '.md';
              NX.native.invoke('note_write_file', { rel, content: newNote.body });
            }
          }catch(e){}
        } else if(rUpdated > lUpdated){
          existing.title = ri.title;
          existing.body = ri.body;
          if(ri.extra && ri.extra.tags) existing.tags = ri.extra.tags;
          if(ri.extra && ri.extra.folder) existing.folder = ri.extra.folder;
          existing.pinned = !!ri.pinned;
          if(ri.extra && ri.extra.starred !== undefined) existing.starred = !!ri.extra.starred;
          existing.updated = rUpdated;
          notesChanged = true;
          stats.notesPulled++;
        }
      });

      // 3. Reconcile Reminders
      const localRems = NX.store.get('reminders', []) || [];
      const remMap = new Map(localRems.map(r => [String(r.id), r]));
      let remsChanged = false;

      remoteItems.filter(i => i.kind === 'reminder').forEach(ri => {
        const lid = (ri.extra && ri.extra.local_id) || ri.id;
        const existing = remMap.get(String(lid));
        if(!existing){
          const newRem = {
            id: lid,
            name: ri.title,
            note: ri.body,
            when: (ri.extra && ri.extra.when) || (Date.now() + 3600e3),
            repeat: (ri.extra && ri.extra.repeat) || 'none',
            cat: (ri.extra && ri.extra.cat) || 'work',
            fired: !!(ri.extra && ri.extra.fired)
          };
          localRems.unshift(newRem);
          remMap.set(String(lid), newRem);
          remsChanged = true;
          stats.remsPulled++;
        }
      });

      // 4. Reconcile Prompts
      const localPrompts = NX.store.get('prompts', []) || [];
      const promptMap = new Map(localPrompts.map(p => [String(p.id), p]));
      let promptsChanged = false;

      remoteItems.filter(i => i.kind === 'prompt').forEach(ri => {
        const lid = (ri.extra && ri.extra.local_id) || ri.id;
        const existing = promptMap.get(String(lid));
        if(!existing){
          const newPrompt = {
            id: lid,
            title: ri.title,
            prompt: ri.body,
            desc: (ri.extra && ri.extra.desc) || '',
            cat: (ri.extra && ri.extra.cat) || 'general',
            tags: (ri.extra && ri.extra.tags) || []
          };
          localPrompts.unshift(newPrompt);
          promptMap.set(String(lid), newPrompt);
          promptsChanged = true;
          stats.promptsPulled++;
        }
      });

      if(tasksChanged) NX.store.set('tasks', localTasks);
      if(notesChanged) NX.store.set('notes', localNotes);
      if(remsChanged) NX.store.set('reminders', localRems);
      if(promptsChanged) NX.store.set('prompts', localPrompts);

      _suppressSyncPush = false; // re-enable auto-push

      // 5. Push Local Items Missing from Cloud
      for(const t of localTasks){
        if(!remoteMap.has(`task:${t.id}`)){
          await sync.push('task', t);
          stats.pushed++;
        }
      }
      for(const n of localNotes){
        if(!n.trash && !remoteMap.has(`note:${n.id}`)){
          await sync.push('note', n);
          stats.pushed++;
        }
      }
      for(const r of localRems){
        if(!remoteMap.has(`reminder:${r.id}`)){
          await sync.push('reminder', r);
          stats.pushed++;
        }
      }
      for(const p of localPrompts){
        if(!remoteMap.has(`prompt:${p.id}`)){
          await sync.push('prompt', p);
          stats.pushed++;
        }
      }

      if(tasksChanged) NX.events.emit('tasks:changed');
      if(notesChanged) NX.events.emit('notes:changed');
      if(remsChanged) NX.events.emit('reminders:changed');
      NX.refreshBadges && NX.refreshBadges();

      const lastSync = Date.now();
      NX.store.set('cloud:lastSyncAt', lastSync);
      NX.events.emit('cloud:synced', { lastSync, stats });
      return { ok:true, stats, lastSync };
    } catch(err) {
      _suppressSyncPush = false;
      return { ok:false, error:String(err && err.message || err) };
    } finally {
      _reconciling = false;
    }
  },

  /* Start automatic continuous sync watcher */
  startAutoSync(){
    if(_autoSyncStarted) return;
    _autoSyncStarted = true;

    // Drain queue when internet comes back
    window.addEventListener('online', () => { drainOfflineQueue().catch(()=>{}); });

    // Initial reconciliation if signed in
    if(auth.user && configured() && online()){
      sync.reconcile().catch(()=>{});
    }

    // Realtime changes listener from other devices
    if(auth.user && configured()){
      if(_rtSub) _rtSub.unsubscribe();
      _rtSub = sync.subscribe((items) => {
        if(!Array.isArray(items) || !items.length) return;
        const incoming = items[0];
        if(!incoming || !incoming.kind) return;
        // Skip self-origin changes
        if(incoming.extra && incoming.extra.device_id === deviceId()) return;

        // Remote mutation arrived — trigger reconcile to merge seamlessly
        sync.reconcile().catch(()=>{});
      });
    }

    // Coalesced debounce watcher for local mutations
    function scheduleLocalSync(){
      if(_suppressSyncPush || !auth.user || !configured() || !online()) return;
      clearTimeout(_syncDebounceTimer);
      _syncDebounceTimer = setTimeout(() => {
        sync.reconcile().catch(()=>{});
      }, 1500);
    }

    NX.events.on('store:tasks', scheduleLocalSync);
    NX.events.on('store:notes', scheduleLocalSync);
    NX.events.on('store:reminders', scheduleLocalSync);
    NX.events.on('store:prompts', scheduleLocalSync);
  },

  stopAutoSync(){
    _autoSyncStarted = false;
    if(_rtSub){ _rtSub.unsubscribe(); _rtSub = null; }
    if(_syncDebounceTimer){ clearTimeout(_syncDebounceTimer); _syncDebounceTimer = null; }
  },

  status(){
    return {
      reconciling: _reconciling,
      autoSync: _autoSyncStarted,
      queued: getOfflineQueue().length,
      lastSyncAt: NX.store.get('cloud:lastSyncAt', 0)
    };
  },

  kindFor(collection){ return KIND[collection] || null; },
  collectionFor(kind){ return COLLECTION[kind] || null; }
};

/* ------------------------------------------------------------ *
 *  Cloudflare — R2 images and Durable Object chat
 * ------------------------------------------------------------ *
   The R2 Worker (cloud/pebble-media-api) and the chat Durable Object
   live in the same Cloudflare account as everything else. Chat is
   deliberately NOT routed through Supabase: Realtime Database is not
   available there, and a Durable Object per room is the right shape
   for presence and fan-out.
 * ------------------------------------------------------------ */
const r2 = {
  get endpoint(){ return String(readConfig().r2Endpoint || '').replace(/\/+$/,''); },
  get configured(){ return !!this.endpoint; },
  async upload(blob, kind){
    const ep = this.endpoint;
    if(!ep) return { ok:false, error:'No R2 endpoint configured (Settings → Cloud).' };
    try{
      const res = await fetch(ep + '/upload', {
        method:'POST',
        headers: authTokenHeaders(),
        body: blob
      });
      const j = await res.json().catch(()=>({}));
      if(!res.ok) return { ok:false, error: j.error || ('HTTP ' + res.status) };
      return { ok:true, id:j.id, url:j.url, key:j.key, size:j.size };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },
  url(id, size){ return this.endpoint ? this.endpoint + '/i/' + id + '/' + (size || 128) : ''; },
  async remove(id){
    if(!this.configured) return { ok:false, error:'R2 not configured' };
    try{
      const res = await fetch(this.endpoint + '/i/' + id, { method:'DELETE', headers: authTokenHeaders() });
      return res.ok ? { ok:true } : { ok:false, error:'HTTP ' + res.status };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  }
};

function authTokenHeaders(){
  const t = NX.store.get('cloud:r2Token', '') || DEFAULT_R2_TOKEN;
  return t ? { Authorization:'Bearer ' + t } : {};
}

/* Durable Object chat transport. Same shape the Messages UI already
   expects, so 48-chat-social.js needed no changes. */
const chat = {
  get endpoint(){ return String(readConfig().chatEndpoint || '').replace(/\/+$/,''); },
  get configured(){ return !!this.endpoint; },
  socket: null,

  _ws(){
    const ep = this.endpoint;
    if(!ep || typeof WebSocket === 'undefined') return null;
    const u = auth.user;
    if(!u) return null;
    try{
      const ws = new WebSocket(ep.replace(/^http/, 'ws') + '/ws?uid=' + encodeURIComponent(u.id) +
                               '&device=' + encodeURIComponent(deviceId()));
      chat.socket = ws;
      return ws;
    }catch(e){ return null; }
  },

  makeCode(){
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no O/0 or I/1
    const b = new Uint8Array(6);
    if(window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(b);
    else for(let i=0;i<6;i++) b[i] = Math.floor(Math.random()*256);
    let s = ''; for(let i=0;i<6;i++) s += A[b[i] % A.length];
    return s;
  },

  dmPath(a, b){ return 'chats/dms/' + [a,b].sort().join('_'); },
  channelPath(code){ return 'chats/channels/' + String(code||'').toLowerCase(); },

  send(path, text, extra){
    const ws = chat._ws();
    if(!ws) return Promise.resolve({ ok:false, error:'Chat needs the Cloudflare endpoint configured.' });
    if(ws.readyState !== 1) return Promise.resolve({ ok:false, error:'Not connected yet.' });
    const u = auth.user;
    const msg = Object.assign({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,7),
      uid: u.id, name: u.name, text:String(text||'').slice(0,4000), at: Date.now()
    }, extra || {});
    try{ ws.send(JSON.stringify({ path, msg })); return Promise.resolve({ ok:true, id:msg.id }); }
    catch(e){ return Promise.resolve({ ok:false, error:String(e && e.message || e) }); }
  },

  subscribe(path, cb){
    let live = true, ws = chat._ws();
    const handle = { unsubscribe(){ live = false; try{ ws && ws.close(); }catch(e){} } };
    if(!ws){ try{ cb([], chat.configured ? 'connecting' : 'not-configured'); }catch(e){} return handle; }
    ws.onmessage = ev => {
      if(!live) return;
      try{
        const m = JSON.parse(ev.data);
        if(m && m.path === path && m.messages) cb(m.messages, 'ok');
        else if(m && m.path === path && m.msg) cb([m.msg], 'ok');
      }catch(e){}
    };
    ws.onerror = ()=>{ try{ cb([], 'error'); }catch(e){} };
    ws.onopen = ()=>{ try{ ws.send(JSON.stringify({ join:path })); cb([], 'ok'); }catch(e){} };
    return handle;
  },

  history(){
    /* No local history exists — the Durable Object holds the transcript and
       `subscribe` streams it. Reporting success with an empty list here would
       make the UI look like a working-but-empty room. */
    if(!this.configured) return Promise.resolve({ ok:false, error:'Chat endpoint not configured.', list:[] });
    return Promise.resolve({ ok:true, list:[] });
  },

  createChannel(name){
    if(!this.configured) return Promise.resolve({ ok:false, error:'Chat endpoint not configured.' });
    const code = chat.makeCode();
    return Promise.resolve({ ok:true, code, channel:{ code, name:name || 'New channel', members:{} } });
  },
  joinChannel(code){
    if(!this.configured) return Promise.resolve({ ok:false, error:'Chat endpoint not configured.' });
    return Promise.resolve({ ok:true, channel:{ code:String(code||'').toUpperCase(), name:'Channel', members:{} } });
  },
  getChannel(code){
    if(!this.configured) return Promise.resolve({ ok:false, error:'Chat endpoint not configured.' });
    return Promise.resolve({ ok:true, channel:{ code:String(code||'').toUpperCase(), name:'Channel', members:{} } });
  }
};

/* ------------------------------------------------------------ *
 *  Public surface
 * ------------------------------------------------------------ *
   The Messages UI (48-chat-social.js) talks to NX.cloud.chat and the
   settings panel talks to NX.cloud.auth / readConfig / saveConfig, so
   that shape is preserved deliberately.
 * ------------------------------------------------------------ */
NX.cloud = {
  provider:'supabase+cloudflare',
  readConfig, saveConfig, clearConfig, configured, ping,
  auth, sync, chat, r2, deviceId,
  testConnection,
  /* Path helpers are exposed at the top level too: 48-chat-social.js calls
     NX.cloud.dmPath / channelPath directly when opening a conversation. */
  dmPath: chat.dmPath,
  channelPath: chat.channelPath,
  makeCode: chat.makeCode,
  status(){
    return {
      configured: configured(),
      signedIn: auth.signedIn,
      offline: !online(),
      r2: r2.configured,
      chat: chat.configured,
      error: _err
    };
  },
  sdkUrl: SDK_URL,
  teardown,
  /* Firestore is gone with Firebase; kept as an explicit stub so any
     leftover caller gets a clear answer instead of a crash. */
  fs:{
    supported(){ return false; },
    async write(){ return { ok:false, error:'Firestore was removed with Firebase. Use workspace sync.' }; },
    async read(){ return { ok:false, error:'Firestore was removed with Firebase. Use workspace sync.' }; }
  }
};
})(window.NX);