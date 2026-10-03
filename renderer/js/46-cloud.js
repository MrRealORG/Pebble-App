/* ============================================================
   PebbleX — 45-cloud.js
   Optional cloud layer: Firebase Auth, Realtime Database chat,
   and a Firestore adapter.

   DESIGN RULES (from FEATURES-UPGRADE.md §C1)
   Cloud is an OPT-IN ADD-ON and never a dependency. Everything here
   degrades to a no-op when there is no config, no network, or the SDK
   cannot load. The app must be fully usable offline, and the local PIN
   login stays the default way in.

   Nothing is bundled. The SDK is imported lazily from the CDN the first
   time a cloud feature is actually used, so the offline app stays small
   and a failed import can never break boot.

   Config lives in the local store (and optionally in a gitignored
   cloud/firebase.config.json) — never in source.
   ============================================================ */
(function(NX){
'use strict';

const SDK_BASE = 'https://www.gstatic.com/firebasejs/11.6.0';
const CFG_KEY  = 'cloud:config';
const AUTH_KEY = 'cloud:user';

/* ---------------- config ---------------- */
function blank(){
  return { apiKey:'', authDomain:'', projectId:'', databaseURL:'', storageBucket:'', appId:'' };
}
function readConfig(){
  const stored = NX.store.get(CFG_KEY, null);
  if(stored && typeof stored === 'object') return Object.assign(blank(), stored);
  return blank();
}
function configured(){
  const c = readConfig();
  return !!(c.apiKey && c.projectId && c.databaseURL);
}
function saveConfig(patch){
  const next = Object.assign(readConfig(), patch || {});
  /* normalise here rather than trusting the caller: a trailing slash on the
     database URL is an easy paste mistake and RTDB is picky about it */
  if(next.databaseURL) next.databaseURL = String(next.databaseURL).trim().replace(/\/+$/,'');
  if(next.apiKey) next.apiKey = String(next.apiKey).trim();
  if(next.projectId) next.projectId = String(next.projectId).trim();
  NX.store.set(CFG_KEY, next);
  teardown();                 /* config changed: drop the old app instance */
  return next;
}
function clearConfig(){
  NX.store.set(CFG_KEY, blank());
  teardown();
}

/* ---------------- lazy SDK ---------------- */
let _app = null, _sdk = null, _loading = null, _loadError = null;

async function sdk(){
  if(_sdk) return _sdk;
  if(_loading) return _loading;
  if(!configured()) return null;
  _loading = (async ()=>{
    try{
      /* offline-first: never pay for this until it is genuinely needed */
      if(typeof navigator !== 'undefined' && navigator.onLine === false){
        _loadError = 'offline';
        return null;
      }
      const appMod = await import(/* webpackIgnore: true */ `${SDK_BASE}/firebase-app.js`);
      const authMod = await import(/* webpackIgnore: true */ `${SDK_BASE}/firebase-auth.js`);
      const dbMod = await import(/* webpackIgnore: true */ `${SDK_BASE}/firebase-database.js`);
      _sdk = {
        initializeApp: appMod.initializeApp,
        getApps: appMod.getApps,
        getApp: appMod.getApp,
        auth: () => authMod,
        database: () => dbMod
      };
      return _sdk;
    }catch(e){
      _loadError = String(e && e.message || e);
      _loading = null;
      return null;
    }
  })();
  const r = await _loading;
  _loading = null;
  return r;
}

async function fb(){
  const s = await sdk();
  if(!s) return null;
  try{
    if(!_app){
      const c = readConfig();
      _app = s.getApps().length
        ? s.getApp()
        : s.initializeApp({
            apiKey:c.apiKey,
            authDomain:c.authDomain || (c.projectId + '.firebaseapp.com'),
            projectId:c.projectId,
            databaseURL:c.databaseURL,
            storageBucket:c.storageBucket || (c.projectId + '.appspot.com'),
            appId:c.appId || undefined
          });
    }
    return s;
  }catch(e){
    _loadError = String(e && e.message || e);
    return null;
  }
}

/* Single source of truth for "why can't we". _loadError is set to
   'offline' or the import failure, so the UI can say something useful instead of
   the misleading "cloud is not configured" when the real problem is a network. */
function notReady(){
  if(_loadError === 'offline') return 'You are offline � cloud features need a connection.';
  return _loadError || 'Cloud is not configured (add your Firebase config in Settings ? Cloud).';
}

function teardown(){
  _app = null;
  _sdk = null;
  _loading = null;
  _loadError = null;
}

/* ---------------- auth (optional, alongside the PIN) ---------------- */
const _authSubs = new Set();

const auth = {
  /* true only when a real cloud user is signed in. The PIN session is a
     completely separate thing and keeps working regardless. */
  get user(){ return NX.store.get(AUTH_KEY, null); },
  get signedIn(){ return !!(NX.store.get(AUTH_KEY, null) || {}).uid; },

  async signIn(email, password){
    const s = await fb();
    if(!s) return { ok:false, error: notReady() };
    try{
      const a = s.auth();
      const cred = await a.signInWithEmailAndPassword(email, password);
      const u = cred && cred.user;
      if(!u) return { ok:false, error:'sign-in returned no user' };
      const rec = { uid:u.uid, email:u.email, name:(u.displayName || (email||'').split('@')[0]),
                    photo:u.photoURL || '', at:Date.now() };
      NX.store.set(AUTH_KEY, rec);
      emit();
      return { ok:true, user:rec };
    }catch(e){ return { ok:false, error:authMessage(e) }; }
  },

  async register(email, password, displayName){
    const s = await fb();
    if(!s) return { ok:false, error: notReady() };
    try{
      const a = s.auth();
      const cred = await a.createUserWithEmailAndPassword(email, password);
      if(displayName && cred && cred.user){
        await cred.user.updateProfile({ displayName });
      }
      const u = cred && cred.user;
      const rec = { uid:u.uid, email:u.email, name:displayName || u.displayName || email, photo:'', at:Date.now() };
      NX.store.set(AUTH_KEY, rec);
      emit();
      return { ok:true, user:rec };
    }catch(e){ return { ok:false, error:authMessage(e) }; }
  },

  async signInWithGoogle(){
    const s = await fb();
    if(!s) return { ok:false, error: notReady() };
    try{
      const a = s.auth();
      const p = await a.signInWithPopup(a.getGoogleAuthProvider());
      const u = p && p.user;
      if(!u) return { ok:false, error:'no user returned' };
      const rec = { uid:u.uid, email:u.email, name:u.displayName || u.email, photo:u.photoURL || '', at:Date.now() };
      NX.store.set(AUTH_KEY, rec);
      emit();
      return { ok:true, user:rec };
    }catch(e){ return { ok:false, error:authMessage(e) }; }
  },

  async signOut(){
    const s = await fb();
    NX.store.set(AUTH_KEY, null);
    if(s){ try{ await s.auth().signOut(); }catch(e){} }
    emit();
    return { ok:true };
  },

  onChange(fn){ _authSubs.add(fn); return ()=> _authSubs.delete(fn); }
};

function emit(){ _authSubs.forEach(fn=>{ try{ fn(auth.user); }catch(e){} }); }

function authMessage(e){
  const code = (e && (e.code || e.message)) || 'error';
  const map = {
    'auth/invalid-credential':'Wrong email or password.',
    'auth/invalid-email':'That email address is not valid.',
    'auth/email-already-in-use':'That email already has an account.',
    'auth/weak-password':'Password needs at least 6 characters.',
    'auth/popup-closed-by-user':'Google sign-in was cancelled.',
    'auth/popup-blocked':'Google sign-in was blocked. Allow popups for this app.',
    'auth/network-request-failed':'Network unavailable.'
  };
  return map[code] || String(code);
}

/* ---------------- realtime database: chat ---------------- */
/* Paths
     chats/dms/<uidA>_<uidB>      deterministic, both sides compute the same key
     chats/channels/<code>        rooms joined by invite code
   Message ids are client-generated (push keys) so two clients can post
   concurrently without colliding, and a client only ever writes its own. */

function dmKey(a, b){
  return [a, b].sort().join('_');
}
function dmPath(a, b){ return 'chats/dms/' + dmKey(a, b); }
function channelPath(code){ return 'chats/channels/' + String(code || '').toLowerCase(); }

/* Codes are 6 chars from an unambiguous alphabet — no O/0, I/1, so they
   survive being read aloud or retyped. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode(){
  const bytes = new Uint8Array(6);
  if(window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
  else for(let i=0;i<6;i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for(let i=0;i<6;i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

const chat = {
  makeCode,

  async send(path, text, extra){
    const me = auth.user;
    if(!me) return { ok:false, error:'sign in to use cloud chat' };
    const s = await fb();
    if(!s) return { ok:false, error: notReady() };
    const body = String(text || '').slice(0, 4000);
    if(!body.trim()) return { ok:false, error:'empty message' };
    try{
      const dbMod = s.database();
      const r = dbMod.getDatabase(s.getApp());
      /* push() generates the key client-side, so two clients posting at the
         same moment never collide and neither has to read before writing */
      const child = dbMod.push(dbMod.ref(r, path));
      const rec = Object.assign({
        id: child.key,
        uid: me.uid,
        name: me.name || me.email || 'Someone',
        text: body,
        at: Date.now()
      }, extra || {});
      await dbMod.set(child, rec);
      return { ok:true, id:rec.id };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },

  /* Live subscription. Returns an unsubscribe function; safe to call when
     cloud is off (it just never subscribes). */
  subscribe(path, cb){
    let live = false, off = null, retry = 0;
    const handle = { unsubscribe(){ live = false; if(off){ try{ off(); }catch(e){} off = null; } } };
    (async ()=>{
      const me = auth.user;
      if(!me){ try{ cb([], 'not-signed-in'); }catch(e){} return; }
      const s = await fb();
      if(!s || !live){ try{ cb([], 'unavailable'); }catch(e){} return; }
      try{
        const dbMod = s.database();
        const r = dbMod.getDatabase(s.getApp());
        const q = dbMod.query ? dbMod.query(dbMod.ref(r, path), dbMod.orderByChild('at'), dbMod.limitToLast ? dbMod.limitToLast(200) : undefined)
                              : dbMod.ref(r, path);
        off = dbMod.onValue(q, snap => {
          const val = snap && snap.val ? snap.val() : null;
          const list = [];
          if(val && typeof val === 'object'){
            for(const k of Object.keys(val)){
              if(val[k] && val[k].text) list.push(Object.assign({ id:k }, val[k]));
            }
          }
          list.sort((a,b)=> (a.at||0) - (b.at||0));
          try{ cb(list, 'ok'); }catch(e){}
        }, err => { try{ cb([], 'error: ' + String(err && err.message || err)); }catch(e){} });
      }catch(e){
        try{ cb([], 'error: ' + String(e && e.message || e)); }catch(err){}
      }
    })();
    return handle;
  },

  async history(path){
    const s = await fb();
    if(!s) return { ok:false, error: notReady(), list:[] };
    try{
      const dbMod = s.database();
      const r = dbMod.getDatabase(s.getApp());
      const snap = await dbMod.get(dbMod.ref(r, path));
      const val = snap && snap.val ? snap.val() : null;
      const list = [];
      if(val && typeof val === 'object'){
        for(const k of Object.keys(val)) if(val[k] && val[k].text) list.push(Object.assign({ id:k }, val[k]));
      }
      list.sort((a,b)=> (a.at||0) - (b.at||0));
      return { ok:true, list };
    }catch(e){ return { ok:false, error:String(e && e.message || e), list:[] }; }
  },

  /* ---- channels ---- */
  async createChannel(name){
    const me = auth.user;
    if(!me) return { ok:false, error:'sign in first' };
    const s = await fb();
    if(!s) return { ok:false, error: notReady() };
    const code = makeCode();
    const rec = { name:String(name||'New channel').slice(0,60), code, owner:me.uid,
                  members:{ [me.uid]:true }, createdAt:Date.now() };
    try{
      const dbMod = s.database();
      const r = dbMod.getDatabase(s.getApp());
      await dbMod.set(dbMod.ref(r, 'chat/channels/' + code), rec);
      return { ok:true, code, channel:rec };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },

  async joinChannel(code){
    const me = auth.user;
    if(!me) return { ok:false, error:'sign in first' };
    const s = await fb();
    if(!s) return { ok:false, error: notReady() };
    const clean = String(code || '').trim().toUpperCase();
    try{
      const dbMod = s.database();
      const r = dbMod.getDatabase(s.getApp());
      const snap = await dbMod.get(dbMod.ref(r, 'chat/channels/' + clean));
      const ch = snap && snap.val ? snap.val() : null;
      if(!ch || !ch.code) return { ok:false, error:'No channel with that code.' };
      ch.members = ch.members || {};
      ch.members[me.uid] = true;
      await dbMod.set(dbMod.ref(r, 'chat/channels/' + clean), ch);
      return { ok:true, channel:ch };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },

  async getChannel(code){
    const s = await fb();
    if(!s) return { ok:false, error: notReady() };
    try{
      const dbMod = s.database();
      const r = dbMod.getDatabase(s.getApp());
      const snap = await dbMod.get(dbMod.ref(r, 'chat/channels/' + String(code||'').toUpperCase()));
      const ch = snap && snap.val ? snap.val() : null;
      return ch && ch.code ? { ok:true, channel:ch } : { ok:false, error:'No channel with that code.' };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  }
};

/* ---------------- firestore (adapter — spec pending) ---------------- */
/* The concrete Firestore collections are still being specified, so this is a
   thin, honest adapter rather than a guess at the schema. */
const fs_ = {
  supported(){ return !!configured(); },
  async ready(){ return await fb(); },
  async write(docPath, data){
    const s = await fb();
    if(!s) return { ok:false, error: notReady() };
    try{
      const m = await import(/* webpackIgnore: true */ `${SDK_BASE}/firebase-firestore.js`);
      const db = m.getFirestore(s.getApp());
      await m.setDoc(m.doc(db, docPath), data, { merge:true });
      return { ok:true };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },
  async read(docPath){
    const s = await fb();
    if(!s) return { ok:false, error: notReady(), data:null };
    try{
      const m = await import(/* webpackIgnore: true */ `${SDK_BASE}/firebase-firestore.js`);
      const db = m.getFirestore(s.getApp());
      const snap = await m.getDoc(m.doc(db, docPath));
      return snap.exists() ? { ok:true, data:snap.data() } : { ok:false, data:null };
    }catch(e){ return { ok:false, error:String(e && e.message || e), data:null }; }
  }
};

NX.cloud = {
  readConfig, saveConfig, clearConfig, configured,
  status(){
    return { configured: configured(), signedIn: auth.signedIn, offline: (typeof navigator!=='undefined' && navigator.onLine===false), error:_loadError };
  },
  auth, chat, fs: fs_,
  /* helpers the UI needs */
  dmPath, dmKey, channelPath, makeCode,
  sdkBase: SDK_BASE,
  teardown
};
})(window.NX);