/* ==================================================================
   TIMELESS USAGE — Cloudflare D1

   Stored here rather than in Supabase because it is the one table that
   grows without bound: one row per app per site per day per user. See
   ../schema.sql for the arithmetic — at ~275 bytes a row Supabase's free
   500 MB Postgres holds only ~47,000 user-days, and past 500 MB a
   Supabase free project goes READ-ONLY for everyone.

   The client aggregates per (device, day, app) and posts one batch, so a
   2-second tracking poll costs an upsert per app per flush rather than
   thirty writes a minute.

   Everything is clamped server-side as well, so a buggy or hostile client
   cannot write more than MAX_FLUSH_ROWS per request or more than a single
   day of seconds for any one app.
   ================================================================== */

const MAX_FLUSH_ROWS  = 200;
const MAX_SECONDS_APP = 86400;   /* one app cannot exceed 24h in a day */
const MAX_DAYS_BACK   = 400;

/* control characters, escaped so this file stays plain text */
const CTRL = /[\u0000-\u001f\u007f]/g;

function todayStr(d){
  const t = d || new Date();
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function isDay(s){
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function clean(s, max){
  return String(s == null ? '' : s).replace(CTRL, '').trim().slice(0, max || 120);
}
function clampInt(v, lo, hi, dflt){
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
function colour(c){
  return /^#[0-9A-Fa-f]{6}$/.test(String(c || '')) ? String(c) : '#7eaf6a';
}
function missingD1(env){
  return !env || !env.pebble_usage;
}

/* ------------------------------------------------------------------ *
 *  POST /usage/flush
 *  { ownerId, deviceId, day, rows:[{key,name,category,color,isSite,seconds}] }
 * ------------------------------------------------------------------ */
export async function handleUsageFlush(req, env, json){
  if (missingD1(env)) return json(req, { ok:false, error:'usage database not configured' }, 503);

  let body;
  try { body = await req.json(); }
  catch { return json(req, { ok:false, error:'invalid JSON' }, 400); }

  const owner  = clean(body.ownerId, 64);
  const device = clean(body.deviceId, 64);
  if (!owner || !device) return json(req, { ok:false, error:'ownerId and deviceId are required' }, 400);

  const day  = isDay(body.day) ? body.day : todayStr();
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_FLUSH_ROWS) : [];
  if (!rows.length) return json(req, { ok:true, written:0, day });

  const stmts = [];
  let seconds = 0;

  for (const r of rows){
    const key = clean(r.key || r.name, 120).toLowerCase();
    if (!key) continue;
    const name     = clean(r.name || key, 120);
    const category = clean(r.category || 'Other', 60) || 'Other';
    const sec      = clampInt(r.seconds, 0, MAX_SECONDS_APP, 0);
    if (sec <= 0) continue;
    seconds += sec;

    /* MIN() caps a row at 24h so repeated flushes can never inflate a day */
    stmts.push(
      env.pebble_usage.prepare(
        `INSERT INTO usage_daily
           (owner_id, device_id, day, app_key, app_name, category, color, is_site, seconds)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(owner_id, device_id, day, app_key) DO UPDATE SET
           seconds    = MIN(86400, usage_daily.seconds + excluded.seconds),
           app_name   = excluded.app_name,
           category   = excluded.category,
           color      = excluded.color,
           is_site    = excluded.is_site,
           updated_at = datetime('now')`
      ).bind(owner, device, day, key, name, category, colour(r.color), r.isSite ? 1 : 0, sec)
    );
  }

  if (stmts.length){
    await env.pebble_usage.batch(stmts);
    await env.pebble_usage.prepare(
      `INSERT INTO usage_day_totals (owner_id, device_id, day, seconds)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(owner_id, device_id, day) DO UPDATE SET
         seconds    = MIN(86400, usage_day_totals.seconds + excluded.seconds),
         updated_at = datetime('now')`
    ).bind(owner, device, day, seconds).run();
  }

  return json(req, { ok:true, written:stmts.length, seconds, day });
}

/* ------------------------------------------------------------------ *
 *  GET /usage/day?owner=&device=&day=
 * ------------------------------------------------------------------ */
export async function handleUsageDay(req, env, url, json){
  if (missingD1(env)) return json(req, { ok:false, error:'usage database not configured' }, 503);
  const owner = clean(url.searchParams.get('owner'), 64);
  if (!owner) return json(req, { ok:false, error:'owner required' }, 400);

  const day    = isDay(url.searchParams.get('day')) ? url.searchParams.get('day') : todayStr();
  const device = clean(url.searchParams.get('device'), 64);

  const stmt = device
    ? env.pebble_usage.prepare(
        `SELECT app_key, app_name, category, color, is_site, seconds FROM usage_daily
         WHERE owner_id = ?1 AND device_id = ?2 AND day = ?3 ORDER BY seconds DESC`
      ).bind(owner, device, day)
    : env.pebble_usage.prepare(
        `SELECT app_key, app_name, category, color, is_site, SUM(seconds) AS seconds FROM usage_daily
         WHERE owner_id = ?1 AND day = ?2
         GROUP BY app_key, app_name, category, color, is_site ORDER BY seconds DESC`
      ).bind(owner, day);

  const res = await stmt.all();
  const rows = (res.results || []).map(r => ({
    key: r.app_key, name: r.app_name, category: r.category,
    color: r.color, isSite: !!r.is_site, seconds: r.seconds || 0
  }));

  return json(req, { ok:true, day, rows, total: rows.reduce((a, r) => a + r.seconds, 0) });
}

/* ------------------------------------------------------------------ *
 *  GET /usage/summary?owner=&days=7
 * ------------------------------------------------------------------ */
export async function handleUsageSummary(req, env, url, json){
  if (missingD1(env)) return json(req, { ok:false, error:'usage database not configured' }, 503);
  const owner = clean(url.searchParams.get('owner'), 64);
  if (!owner) return json(req, { ok:false, error:'owner required' }, 400);
  const days = clampInt(url.searchParams.get('days'), 1, MAX_DAYS_BACK, 7);
  const since = '-' + days + ' days';

  const cats = await env.pebble_usage.prepare(
    `SELECT category, SUM(seconds) AS seconds FROM usage_daily
     WHERE owner_id = ?1 AND day >= date('now', ?2)
     GROUP BY category ORDER BY seconds DESC`
  ).bind(owner, since).all();

  const byDay = await env.pebble_usage.prepare(
    `SELECT day, SUM(seconds) AS seconds FROM usage_daily
     WHERE owner_id = ?1 AND day >= date('now', ?2)
     GROUP BY day ORDER BY day`
  ).bind(owner, since).all();

  const apps = await env.pebble_usage.prepare(
    `SELECT app_key, app_name, SUM(seconds) AS seconds FROM usage_daily
     WHERE owner_id = ?1 AND day >= date('now', ?2)
     GROUP BY app_key, app_name ORDER BY seconds DESC LIMIT 25`
  ).bind(owner, since).all();

  return json(req, {
    ok:true,
    categories:(cats.results  || []).map(r => ({ category:r.category, seconds:r.seconds || 0 })),
    days:      (byDay.results || []).map(r => ({ day:r.day, seconds:r.seconds || 0 })),
    apps:      (apps.results  || []).map(r => ({ key:r.app_key, name:r.app_name, seconds:r.seconds || 0 }))
  });
}

/* ------------------------------------------------------------------ *
 *  Bans — read/remove, alongside the usage data they modify
 * ------------------------------------------------------------------ */
export async function handleUsageBans(req, env, url, json){
  if (missingD1(env)) return json(req, { ok:false, error:'usage database not configured' }, 503);
  const owner = clean(url.searchParams.get('owner'), 64);
  if (!owner) return json(req, { ok:false, error:'owner required' }, 400);
  const res = await env.pebble_usage.prepare(
    'SELECT app_key, label FROM usage_bans WHERE owner_id = ?1 ORDER BY created_at DESC'
  ).bind(owner).all();
  return json(req, { ok:true, bans:(res.results || []).map(r => ({ key:r.app_key, label:r.label })) });
}

export async function handleUsageBansWrite(req, env, url, json){
  if (missingD1(env)) return json(req, { ok:false, error:'usage database not configured' }, 503);

  let body = {};
  try { body = await req.json(); } catch { /* allow an empty body */ }

  const owner = clean(body.ownerId || url.searchParams.get('owner'), 64);
  if (!owner) return json(req, { ok:false, error:'ownerId required' }, 400);
  const key = clean(body.key, 120).toLowerCase();
  if (!key) return json(req, { ok:false, error:'key required' }, 400);

  if (req.method === 'DELETE'){
    await env.pebble_usage.prepare('DELETE FROM usage_bans WHERE owner_id = ?1 AND app_key = ?2')
      .bind(owner, key).run();
    return json(req, { ok:true, banned:false, key });
  }

  const label = clean(body.label || key, 120);
  await env.pebble_usage.prepare(
    `INSERT INTO usage_bans (owner_id, app_key, label) VALUES (?1, ?2, ?3)
     ON CONFLICT(owner_id, app_key) DO UPDATE SET label = excluded.label`
  ).bind(owner, key, label).run();
  return json(req, { ok:true, banned:true, key });
}

export const USAGE_LIMITS = { MAX_FLUSH_ROWS, MAX_SECONDS_APP, MAX_DAYS_BACK };