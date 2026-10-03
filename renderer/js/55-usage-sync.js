/* ============================================================
   PebbleX — 55-usage-sync.js
   Ships Timeless app/site usage to Cloudflare D1 (via the pebble-media
   Worker under /usage/*).

   WHY NOT SUPABASE
     usage_daily is the only table that grows without bound: one row per
     app per site per day per user. At ~275 bytes a row, Supabase's free
     500 MB Postgres holds ~1.9M rows = ~47,000 user-days, which is only
     ~47 days at 1,000 daily users — and past 500 MB a free project goes
     read-only for everyone. D1 gives 5 GB and 100k rows written/day.

   WHY THIS FILE IS CAREFUL
     Timeless polls the foreground window every 2 seconds. Writing on every
     poll would mean 1,080 requests per user per hour. So seconds are
     accumulated in memory, summed per app per day, and flushed in ONE batch
     when the buffer is large enough or old enough. Nothing here writes to
     NX.store on a timer — see README's rule about the workspace mirror.
   ============================================================ */
(function(NX){
'use strict';

const FLUSH_AT_ROWS  = 40;    /* flush once this many apps are buffered */
const FLUSH_AFTER_MS = 120000; /* ...or this long, whichever comes first  */

let buffer = new Map();       /* key -> { key, name, category, color, isSite, seconds } */
let carry = new Map();       /* the in-flight rollover buffer, kept out of buffer */
let lastFlush = Date.now();
let inFlight = false;
let day = '';
let owner = '';
let ticker = null;           /* the idle-flush interval, started once */

function todayKey(){
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
/* The Worker endpoint and bearer token come from the same config object the
   R2 adapter uses in 46-supabase.js — one Settings → Cloud section, one
   place to change the Worker URL. */
function endpoint(){
  if(!NX.cloud || !NX.cloud.r2) return '';
  return String(NX.cloud.r2.endpoint || '').replace(/\/+$/,'');
}
function token(){
  return NX.store.get('cloud:r2Token', '') || '';
}
function headers(){
  const h = { 'Content-Type':'application/json' };
  const t = token();
  if(t) h.Authorization = 'Bearer ' + t;
  return h;
}
function ready(){
  return !!(endpoint() && owner);
}

/* Called by Timeless on every tracked app/site. Cheap: a Map write. */
function track(name, category, isSite, seconds, color){
  if(!ready()) return false;
  const d = todayKey();
  if(d !== day){
    /* A day rolled over. The old buffer must go out under the old day key, and
       it cannot be dropped until the server has accepted it — so flush first
       and stash the new day's rows in `carry` until that resolves. */
    const oldDay = day;
    day = d;
    if(buffer.size){
      const stale = buffer;
      buffer = carry;
      carry = new Map();
      flushInto(oldDay, stale);
    }else{
      buffer = new Map();
    }
  }
  const key = String(name || '').toLowerCase().slice(0, 120);
  if(!key) return false;
  const sec = Math.max(0, Math.round(Number(seconds) || 0));
  if(!sec) return false;

  const cur = buffer.get(key);
  if(cur) cur.seconds += sec;
  else buffer.set(key, {
    key, name: String(name).slice(0,120),
    category: String(category || 'Other').slice(0,60),
    color: /^#[0-9A-Fa-f]{6}$/.test(String(color||'')) ? color : '#7eaf6a',
    isSite: !!isSite,
    seconds: sec
  });

  if(buffer.size >= FLUSH_AT_ROWS) flush();
  return true;
}

/* Send a specific buffer as one batch. Only drops rows the server accepted,
   so a partial failure retries instead of silently losing time. */
async function flushInto(useDay, rows0){
  if(!ready() || inFlight) return { ok:false, skipped:true };
  if(!rows0 || !rows0.size) return { ok:true, written:0 };

  /* Array.from, not slice.call — a Map iterator has no .length, so slice on it
   silently returns []. */
const rows = Array.from(rows0.values()).slice(0, 200);
  inFlight = true;
  try{
    const res = await fetch(endpoint() + '/usage/flush', {
      method:'POST',
      headers: headers(),
      body: JSON.stringify({
        ownerId: owner,
        deviceId: NX.cloud && NX.cloud.deviceId ? NX.cloud.deviceId() : 'unknown',
        day: useDay,
        rows
      })
    });
    const j = await res.json().catch(()=>({}));
    if(res.ok && j.ok){
      if(rows0 === buffer){
        const sent = new Set(rows.map(r => r.key));
        for(const k of sent) buffer.delete(k);
      }else{
        rows0.clear();
      }
      lastFlush = Date.now();
      return { ok:true, written:j.written || rows.length };
    }
    return { ok:false, error:j.error || ('HTTP ' + res.status) };
  }catch(e){
    return { ok:false, error:String(e && e.message || e) };
  }finally{
    inFlight = false;
  }
}

function flush(forceDay){
  return flushInto(forceDay || day || todayKey(), buffer);
}

const usage = {
  track,
  flush,
  pending(){ return buffer.size + carry.size; },

  /* Called after sign-in. ownerId comes from Supabase auth. */
  async enable(){
    const u = NX.cloud && NX.cloud.auth ? NX.cloud.auth.user : null;
    if(!u || !u.id) return { ok:false, error:'sign in first' };
    if(!endpoint()) return { ok:false, error:'No Cloudflare endpoint configured (Settings → Cloud).' };
    owner = u.id;
    day = todayKey();
    buffer = new Map();
    carry = new Map();
    lastFlush = Date.now();

    /* One interval for the life of the session. enable() can fire again on a
       token refresh, and each one used to leave another timer running. */
    if(!ticker){
      ticker = setInterval(()=>{
        if(buffer.size && Date.now() - lastFlush >= FLUSH_AFTER_MS) flush();
      }, 30000);
    }
    return { ok:true };
  },

  disable(){
    owner = '';
    buffer = new Map();
    carry = new Map();
    return { ok:true };
  },

  async day(key){
    if(!ready()) return { ok:false, error:'usage sync is off', rows:[], total:0 };
    try{
      const d = key || todayKey();
      const u = await (async ()=>{
        const r = await fetch(endpoint() + '/usage/day?owner=' + encodeURIComponent(owner) + '&day=' + d, { headers: headers() });
        return r.json();
      })();
      return u && u.ok ? u : { ok:false, error:(u && u.error) || 'unavailable', rows:[], total:0 };
    }catch(e){ return { ok:false, error:String(e && e.message || e), rows:[], total:0 }; }
  },

  async summary(days){
    if(!ready()) return { ok:false, error:'usage sync is off' };
    try{
      const r = await fetch(endpoint() + '/usage/summary?owner=' + encodeURIComponent(owner) +
                           '&days=' + (days || 7), { headers: headers() });
      const j = await r.json().catch(()=>({}));
      return j && j.ok ? j : { ok:false, error:j.error || 'unavailable' };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },

  /* ---- bans ---- */
  async bans(){
    if(!ready()) return { ok:false, error:'usage sync is off', bans:[] };
    try{
      const r = await fetch(endpoint() + '/usage/bans?owner=' + encodeURIComponent(owner), { headers: headers() });
      const j = await r.json().catch(()=>({}));
      return j && j.ok ? j : { ok:false, error:j.error || 'unavailable', bans:[] };
    }catch(e){ return { ok:false, error:String(e && e.message || e), bans:[] }; }
  },

  async setBan(key, label, banned){
    if(!ready()) return { ok:false, error:'usage sync is off' };
    try{
      const r = await fetch(endpoint() + '/usage/bans', {
        method: banned === false ? 'DELETE' : 'POST',
        headers: headers(),
        body: JSON.stringify({ ownerId: owner, key, label: label || key })
      });
      const j = await r.json().catch(()=>({}));
      return j && j.ok ? j : { ok:false, error:j.error || 'unavailable' };
    }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
  },

  /* Best-effort on the way out so the last few seconds are not lost. */
  async flushOnExit(){
    if(carry.size) await flushInto(day, carry);
    if(buffer.size) await flush();
  }
};

NX.usageSync = usage;

/* Keep the local store and the cloud in step without hammering either. */
NX.events.on('cloud:signed-in', () => { usage.enable().catch(()=>{}); });
NX.events.on('cloud:signed-out', () => usage.disable());
NX.events.on('timeless:bans-changed', () => {
  const list = NX.store.get('timelessBans', []) || [];
  for(const b of list) usage.setBan(b, b, true).catch(()=>{});
});
window.addEventListener('beforeunload', () => { usage.flushOnExit(); });

})(window.NX);