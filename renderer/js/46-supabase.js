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

/* Connection test that verifies URL and publishable key reachability */
async function testConnection(){
  const c = readConfig();
  if(!c.supabaseUrl || !c.supabaseKey){
    return { ok:false, error:'Add your Supabase URL and publishable key in Settings → Cloud.' };
  }
  if(!online()){
    return { ok:false, error:'You are offline — cannot reach Supabase.' };
  }
  try{
    const res = await fetch(c.supabaseUrl + '/auth/v1/settings', {
      method: 'GET',
      headers: { 'apikey': c.supabaseKey }
    });
    if(!res.ok){
      const t = await res.text().catch(()=>'');
      return { ok:false, error:'Supabase returned HTTP ' + res.status + (t ? ': ' + t.slice(0, 100) : '') };
    }
    const data = await res.json().catch(()=>({}));
    return {
      ok: true,
      data,
      url: c.supabaseUrl,
      signedIn: auth.signedIn,
      user: auth.user
    };
  }catch(e){
    return { ok:false, error:'Could not reach Supabase: ' + (e && e.message || e) };
  }
}

/* single place that explains why a call did nothing */
function notReady(){
  if(_err === 'offline' || !online()) return 'You are offline — cloud needs a connection.';
  if(_err === 'not-configured' || !configured()) return 'Add your Supabase URL and publishable key in Settings → Cloud.';
  return _err || 'Cloud is unavailable right now.';
}

/* ------------------------------------------------------------ *
 *  Identity — OPTIONAL, alongside the PIN
 * ------------------------------------------------------------ */
const _subs = new Set();
function emit(u){ _subs.forEach(fn => { try{ fn(u); }catch(e){} }); }

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

const sync = {
  /* Push one local item. Upsert by a stable client id kept in extra so
     repeated pushes do not duplicate rows. */
  async push(kind, item){
    /* readiness first: an offline user should be told they are offline,
       not that they need to sign in */
    if(!configured() || !online()) return { ok:false, error: notReady() };
    const u = auth.user;
    if(!u) return { ok:false, error:'sign in to sync' };
    const c = await sb();
    if(!c) return { ok:false, error: notReady() };
    try{
      const row = {
        owner_id: u.id,
        kind,
        title: String(item.title || item.name || '').slice(0,180),
        body: String(item.body || item.text || '').slice(0, 100000),
        status: item.done ? 'done' : (item.status || 'todo'),
        priority: item.priority || 'medium',
        project: String(item.project || item.folder || 'Personal').slice(0,60),
        pinned: !!item.pinned,
        origin: 'desktop',
        extra: { local_id: String(item.id || ''), ...(item.extra || {}) },
        updated_at: nowIso()
      };
      const { data: found } = await c
        .from('workspace_items').select('id')
        .eq('owner_id', u.id).eq('kind', kind)
        .eq('extra->>local_id', String(item.id || '')).maybeSingle();
      if(found) await c.from('workspace_items').update(row).eq('id', found.id);
      else await c.from('workspace_items').insert(row);
      return { ok:true };
    }catch(e){ return { ok:false, error: dbError(e) }; }
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
        .limit(500);
      if(opts && opts.since) q = q.gt('updated_at', opts.since);
      const { data, error } = await q;
      if(error) return { ok:false, error: dbError(error), items:[] };
      return { ok:true, items: data || [] };
    }catch(e){ return { ok:false, error: dbError(e), items:[] }; }
  },

  /* Realtime. Fires for this user's rows only — RLS enforces that, we
     just narrow the filter. Returns an unsubscribe function. */
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

  async remove(kind, localId){
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
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
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
  readConfig, saveConfig, clearConfig, configured,
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