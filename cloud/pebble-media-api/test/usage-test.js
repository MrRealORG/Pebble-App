/* Tests for the Worker's usage handlers (cloud/pebble-media-api/src/usage.js).
 *
 * These exist because the renderer tests cannot see server-side code. A
 * sanitising regex was once written as /[\\u0000-\\u001f\\u007f]/g, where the
 * doubled backslashes made the class match digits and UPPERCASE letters, so
 * "github.com" was stored as "githb.com" and "Other" as "ther". Every normal
 * app name has to survive clean() untouched.
 */
import { handleUsageFlush, handleUsageDay, handleUsageSummary,
         handleUsageBans, handleUsageBansWrite, USAGE_LIMITS } from '../src/usage.js';

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if(cond){ pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function eq(name, a, b){ ok(name, JSON.stringify(a) === JSON.stringify(b), { got:a, want:b }); }

/* ---- a fake D1 that records the SQL and args it is handed ---- */
function fakeD1(){
  const log = { batch:[], run:[] };
  return {
    log,
    prepare(sql){
      let args = [];
      const stmt = {
        bind(...a){ args = a; return stmt; },
        _sql: sql,
        _args(){ return args; },
        async run(){ log.run.push({ sql, args }); return { success:true }; },
        async all(){ log.run.push({ sql, args, all:true }); return { results:[] }; },
        async first(){ return null; }
      };
      return stmt;
    },
    async batch(stmts){
      log.batch.push(stmts.map(s => ({ sql:s._sql, args:s._args() })));
      return stmts.map(() => ({ success:true }));
    }
  };
}

function req(body, method='POST'){
  return {
    method,
    async json(){ if(body === undefined) throw new Error('no body'); return body; }
  };
}
const url = (q='') => new URL('https://x.test/usage/day' + q);

function jsonFn(){
  return (r, body, status=200) => ({ req:r, body, status });
}

(async function(){
  console.log('\nusage.js (worker handlers)');

  /* ================= sanitising ================= */
  console.log('\n  sanitising');
  {
    /* the regression that shipped: real names must survive clean() intact */
    const names = ['github.com','Other','work','code','chrome.exe','Visual Studio Code',
                   'netflix.com','Slack','YouTube','İstanbul','北京','emoji 🎬 studio',
                   'a'.repeat(200), 'C:\\Program Files\\App.exe'];
    let damaged = [];
    for(const n of names){
      const d1 = fakeD1();
      await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
        rows:[{ key:n, name:n, category:'Other', seconds:5 }] }), { pebble_usage:d1 }, jsonFn());
      const stored = d1.log.batch[0] ? d1.log.batch[0][0].args[3] : null;
      if(stored !== n.toLowerCase().slice(0,120)) damaged.push({ n, stored });
    }
    ok('every real app/site name is stored verbatim', damaged.length === 0, damaged);

    /* the key is lowercased for matching, but app_name keeps its case */
    const d1 = fakeD1();
    await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'GitHub.COM', name:'GitHub', category:'code', seconds:5 }] }),
      { pebble_usage:d1 }, jsonFn());
    eq('key is lowercased for matching', d1.log.batch[0][0].args[3], 'github.com');
    eq('app_name keeps its display case', d1.log.batch[0][0].args[4], 'GitHub');

    /* real control characters are still stripped */
    const d2 = fakeD1();
    await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'a\u0000b\u001fc\u007fd', name:'x', category:'c', seconds:5 }] }),
      { pebble_usage:d2 }, jsonFn());
    eq('control characters are stripped from keys', d2.log.batch[0][0].args[3], 'abcd');

    /* long keys are truncated, not rejected */
    const d3 = fakeD1();
    await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'k'.repeat(500), name:'n', category:'c', seconds:5 }] }),
      { pebble_usage:d3 }, jsonFn());
    eq('an over-long key is truncated to 120', d3.log.batch[0][0].args[3].length, 120);
  }

  /* ================= clamping ================= */
  console.log('\n  clamping');
  {
    const d1 = fakeD1();
    await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'a', name:'a', category:'c', seconds:999999 }] }), { pebble_usage:d1 }, jsonFn());
    eq('seconds are clamped to 86400', d1.log.batch[0][0].args[8], USAGE_LIMITS.MAX_SECONDS_APP);

    const d2 = fakeD1();
    await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'a', name:'a', category:'c', seconds:-50 }] }), { pebble_usage:d2 }, jsonFn());
    eq('negative seconds are dropped entirely', d2.log.batch.length, 0);

    const d3 = fakeD1();
    await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'a', name:'a', category:'c', seconds:'abc' }] }), { pebble_usage:d3 }, jsonFn());
    eq('non-numeric seconds are dropped', d3.log.batch.length, 0);

    /* a bogus colour must not reach SQL as-is */
    const d4 = fakeD1();
    await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'a', name:'a', category:'c', color:"red'); DROP TABLE usage_daily;--", seconds:5 }] }),
      { pebble_usage:d4 }, jsonFn());
    eq('an invalid colour falls back to the default', d4.log.batch[0][0].args[6], '#7eaf6a');

    /* row cap */
    const many = Array.from({ length:500 }, (_,i) => ({ key:'k'+i, name:'n'+i, category:'c', seconds:5 }));
    const d5 = fakeD1();
    const r = await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04', rows:many }),
      { pebble_usage:d5 }, jsonFn());
    eq('a batch is capped at MAX_FLUSH_ROWS', d5.log.batch[0].length, USAGE_LIMITS.MAX_FLUSH_ROWS);
    eq('and the response says so', r.body.written, USAGE_LIMITS.MAX_FLUSH_ROWS);
  }

  /* ================= validation ================= */
  console.log('\n  validation');
  {
    const j = jsonFn();
    let r = await handleUsageFlush(req({ deviceId:'d', rows:[] }), { pebble_usage:fakeD1() }, j);
    eq('ownerId is required', r.status, 400);
    r = await handleUsageFlush(req({ ownerId:'o', rows:[] }), { pebble_usage:fakeD1() }, j);
    eq('deviceId is required', r.status, 400);
    r = await handleUsageFlush(req(undefined), { pebble_usage:fakeD1() }, j);
    eq('an unparseable body is a 400', r.status, 400);
    r = await handleUsageFlush(req({ ownerId:'o', deviceId:'d', rows:[] }), {}, j);
    eq('a missing D1 binding is a 503, not a crash', r.status, 503);
    r = await handleUsageDay(req(undefined,'GET'), {}, url('?owner=o'), j);
    eq('usage/day without D1 is a 503', r.status, 503);
  }

  /* ================= the upsert really is capped in SQL ================= */
  console.log('\n  upsert SQL');
  {
    const d1 = fakeD1();
    await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'a', name:'a', category:'c', seconds:5 }] }), { pebble_usage:d1 }, jsonFn());
    const sql = d1.log.batch[0][0].sql;
    ok('the upsert caps a day at 24h in SQL, not just in JS',
       /MIN\(86400,\s*usage_daily\.seconds\s*\+\s*excluded\.seconds\)/.test(sql), sql);
    ok('it upserts on the four-part primary key',
       /ON CONFLICT\(owner_id, device_id, day, app_key\)/.test(sql));
    ok('the day total is also capped',
       /MIN\(86400,\s*usage_day_totals\.seconds\s*\+\s*excluded\.seconds\)/.test(d1.log.run[0].sql));
    eq('the day total is written with the summed seconds', d1.log.run[0].args[3], 5);
  }

  /* ================= the day total sums the batch ================= */
  {
    const d1 = fakeD1();
    const r = await handleUsageFlush(req({ ownerId:'o', deviceId:'d', day:'2026-10-04',
      rows:[{ key:'a', name:'a', category:'c', seconds:10 },
            { key:'b', name:'b', category:'c', seconds:20 },
            { key:'c', name:'c', category:'c', seconds:30 }] }), { pebble_usage:d1 }, jsonFn());
    eq('the day total is the sum of the batch', d1.log.run[0].args[3], 60);
    eq('three rows written', r.body.written, 3);
    eq('and the response reports the seconds', r.body.seconds, 60);
  }

  /* ================= SQL injection via parameters ================= */
  {
    const d1 = fakeD1();
    await handleUsageFlush(req({ ownerId:"o'; DROP TABLE usage_daily;--", deviceId:'d',
      day:'2026-10-04', rows:[{ key:'a', name:'a', category:'c', seconds:5 }] }),
      { pebble_usage:d1 }, jsonFn());
    const owner = d1.log.batch[0][0].args[0];
    ok('a quote in ownerId cannot break out of the parameter',
       owner === "o'; DROP TABLE usage_daily;--" && owner.length <= 64, owner);
    ok('the SQL itself never interpolates values', !/\$\{/.test(d1.log.batch[0][0].sql));
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();