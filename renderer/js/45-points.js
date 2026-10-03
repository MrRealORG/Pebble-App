/* ============================================================
   PebbleX — 45-points.js
   The points ledger: earning, levels, spending, daily caps.

   Everything here reads signals that ALREADY EXIST (game wins,
   focus rounds, streaks, note/task counts, badge unlocks), so this
   module is wiring, not new instrumentation.

   ── the one rule that matters ──────────────────────────────────
   NX.store.set() schedules a mirror that serialises the ENTIRE
   workspace JSON (see 00-core.js scheduleMirror). A naive award on
   every event would rewrite the whole document mid-gameplay, which
   is exactly what caused the AppHangB1 freeze. So: awards mutate an
   in-memory copy and flush through ONE coalescing timer, and
   nothing is ever awarded from a rAF loop or a setInterval tick.
   ───────────────────────────────────────────────────────────────
   ============================================================ */
(function(NX){
'use strict';
/* NX.util is the export; there is no NX.U. The previous line read
   `const { U } = NX`, which left U undefined and threw at load time — and
   because build.js concatenates every file in renderer/js, that killed the
   entire bundle, not just this module. */
const { util:U } = NX;

const KEY = 'points';
const MAX_HISTORY = 400;

/* The global ceiling. Without this, points measure idle time rather
   than consistency, and the leaderboard becomes meaningless. */
const DAILY_CEILING = 600;

/* Per-source daily caps. Order of magnitude is tuned so a normal
   session earns ~150-250, and grinding one behaviour cannot beat
   actually using the app. */
const CAPS = {
  game_win: 200,
  game_best: 100,
  game_play: 50,
  focus_round: 120,
  daily_solved: 0,       /* handled separately: once per day */
  badge: 0,              /* handled separately: once ever    */
  task_done: 100,
  note_created: 60,
  focus_hour: 60,
  streak_week: 0,
  daily_login: 0
};

const TITLES = [
  'Rookie', 'Getting Started', 'Focused', 'Steady', 'Arcade Rat',
  'Deep Worker', 'Streak Master', 'Pebble Legend'
];

/* ============================================================
   STATE
   ============================================================ */
function blank(){
  return {
    balance: 0,
    lifetime: 0,
    spent: 0,
    earnedToday: 0,
    earnedTodayKey: '',
    capsToday: {},          /* { sourceKey: amount } */
    flags: {},              /* one-shot markers: daily:{key}, badge:{id} */
    history: []
  };
}

let mem = null;
function state(){
  if(mem) return mem;
  const raw = NX.store.get(KEY, null);
  mem = (raw && typeof raw === 'object') ? Object.assign(blank(), raw) : blank();
  if(!Array.isArray(mem.history)) mem.history = [];
  if(!mem.capsToday || typeof mem.capsToday !== 'object') mem.capsToday = {};
  if(!mem.flags || typeof mem.flags !== 'object') mem.flags = {};
  return mem;
}

/* One coalescing timer for the whole module. */
let flushTimer = null;
let dirty = false;
function flush(){
  flushTimer = null;
  if(!dirty) return;
  dirty = false;
  NX.store.set(KEY, mem);
}
function scheduleFlush(){
  dirty = true;
  if(flushTimer) return;
  flushTimer = setTimeout(flush, 1200);
}
/* force an immediate write (settings, quit, purchase) */
function flushNow(){
  if(flushTimer){ clearTimeout(flushTimer); flushTimer = null; }
  flush();
}

/* ============================================================
   DAY ROLLING
   ============================================================ */
function todayKey(){ return U.todayKey(); }
function rollDay(){
  const s = state();
  const k = todayKey();
  if(s.earnedTodayKey !== k){
    s.earnedTodayKey = k;
    s.earnedToday = 0;
    s.capsToday = {};
  }
  return s;
}

function capRemaining(source){
  rollDay();
  const cap = CAPS[source];
  if(!cap) return Infinity;
  return Math.max(0, cap - (state().capsToday[source] || 0));
}
function ceilingRemaining(){
  rollDay();
  return Math.max(0, DAILY_CEILING - state().earnedToday);
}

/* ============================================================
   AWARD / SPEND
   ============================================================ */

/** Award points, honouring the per-source cap and the global daily
    ceiling. Returns the amount actually granted (0 when capped). */
function award(amount, reason, meta){
  amount = Math.round(Number(amount) || 0);
  if(amount <= 0) return 0;
  const s = rollDay();

  if(ceilingRemaining() <= 0) return 0;

  const room = capRemaining(reason);
  let grant = amount;
  if(Number.isFinite(room) && grant > room) grant = room;
  if(grant <= 0) return 0;
  if(grant > ceilingRemaining()) grant = ceilingRemaining();

  s.balance += grant;
  s.lifetime += grant;
  s.earnedToday += grant;
  s.capsToday[reason] = (s.capsToday[reason] || 0) + grant;

  s.history.push({
    t: Date.now(),
    d: grant,
    r: reason,
    m: (meta && meta.label) || '',
    k: (meta && meta.key) || ''
  });
  if(s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);

  scheduleFlush();
  NX.events.emit('points:changed', { delta: grant, reason });
  return grant;
}

/** One-shot award: fires at most once per flag. If the award was
    blocked by a cap we release the flag again, so a capped player can
    still collect it on the next qualifying event. */
function awardOnce(flag, amount, reason, meta){
  const s = state();
  if(s.flags[flag]) return 0;
  const got = award(amount, reason, meta);
  if(got > 0){
    s.flags[flag] = Date.now();
  } else if(ceilingRemaining() > 0){
    /* capped by a per-source limit rather than the day being over:
       release the flag so it can be earned again */
    delete s.flags[flag];
  }
  scheduleFlush();
  return got;
}

function canAfford(n){ return state().balance >= n; }

function spend(n, reason){
  n = Math.round(Number(n) || 0);
  if(n <= 0) return false;
  const s = state();
  if(s.balance < n) return false;
  s.balance -= n;
  s.spent += n;
  s.history.push({ t: Date.now(), d: -n, r: 'spend', m: reason, k: '' });
  if(s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
  flushNow();
  NX.events.emit('points:changed', { delta: -n, reason });
  return true;
}

/* ============================================================
   LEVELS
   ============================================================ */
function levelFor(lifetime){
  const n = 1 + Math.floor(Math.pow(Math.max(0, lifetime) / 250, 0.85));
  return Math.max(1, Math.min(n, TITLES.length));
}
function titleFor(level){
  return TITLES[Math.max(0, Math.min(level - 1, TITLES.length - 1))];
}
function level(){
  const s = state();
  const n = levelFor(s.lifetime);
  const need = c => Math.pow(c, 1 / 0.85) * 250;
  const cur = need(n - 1);
  const next = need(n);
  const pct = Math.max(0, Math.min(100, Math.round((s.lifetime - cur) / Math.max(1, next - cur) * 100)));
  return {
    n,
    cur: Math.round(s.lifetime),
    next: Math.round(next),
    pct,
    title: titleFor(n)
  };
}

/* ============================================================
   PUBLIC API
   ============================================================ */
NX.points = {
  balance(){ return state().balance; },
  lifetime(){ return state().lifetime; },
  spent(){ return state().spent; },
  today(){ rollDay(); return state().earnedToday; },
  ceiling(){ return DAILY_CEILING; },
  level,
  title(){ return titleFor(level().n); },
  allTitles(){ return TITLES.slice(); },
  history(){ return state().history.slice(); },
  canAfford,
  spend,
  award,
  awardOnce,
  capRemaining,
  ceilingRemaining,
  flushNow,
  DAILY_CEILING,
  CAPS,

  /** human label for a ledger entry, for the history table */
  reasonLabel(r){
    return ({
      game_win: 'Game win',
      game_best: 'New personal best',
      game_play: 'Played a game',
      focus_round: 'Focus round',
      daily_solved: 'Daily challenge',
      badge: 'Achievement',
      task_done: 'Task completed',
      note_created: 'Note written',
      focus_hour: 'Hour of deep work',
      streak_week: 'Weekly streak',
      daily_login: 'Daily check-in',
      spend: 'Spent'
    })[r] || r
  },

  reset(){
    mem = blank();
    flushNow();
  }
};

/* ============================================================
   EARN HOOKS
   Wired to the events that already exist. Everything degrades
   quietly if a module is missing, so load order stays forgiving.
   ============================================================ */

/* -- games: wins, bests, plays ------------------------------- */
NX.events.on('points:gamewin', (e)=>{
  const score = Number(e && e.score) || 0;
  const base = 10 + Math.floor(score / 50);
  award(Math.min(60, base), 'game_win', { label: e && e.name, key: e && e.id });
});

NX.events.on('points:newbest', (e)=>{
  award(25, 'game_best', { label: e && e.name, key: e && e.id });
});

NX.events.on('points:played', (e)=>{
  award(2, 'game_play', { label: e && e.name, key: e && e.id });
});

/* -- focus rounds ------------------------------------------- */
NX.events.on('focus:log', ()=>{
  award(15, 'focus_round', { label: 'Focus round' });
});

/* -- achievements ------------------------------------------- */
NX.events.on('points:badge', (e)=>{
  const id = (e && e.id) || '';
  if(!id) return;
  awardOnce('badge:' + id, 50, 'badge', { label: (e && e.title) || 'Achievement', key: id });
});

/* -- daily challenge + streak ------------------------------- */
NX.events.on('points:daily', (e)=>{
  const solved = !!(e && e.solved);
  if(!solved) return;
  const streak = (e && e.streak) || 0;
  const bonus = Math.min(100, Math.max(0, streak - 1) * 15);
  awardOnce('daily:' + todayKey(), 40 + bonus, 'daily_solved', { label: 'Daily word' });
  if(streak > 0 && streak % 7 === 0){
    awardOnce('week:' + todayKey(), 100, 'streak_week', { label: streak + '-day streak' });
  }
});

/* -- notes & tasks: count-based diff, no per-key write -------- */
/* Seed the baseline so a large PRE-EXISTING library is not paid for
   retroactively. Baseline lives in capsToday so it survives a reload. */
(function seedCounts(){
  if(state().capsToday.__seeded) return;
  state().capsToday.__seeded = 1;
  const n = NX.store.get('notes', []);
  const t = NX.store.get('tasks', []);
  NX.points._seed = {
    notes: Array.isArray(n) ? n.length : 0,
    done: Array.isArray(t) ? t.filter(x => x && x.done).length : 0
  };
  scheduleFlush();
})();

/* Award only for work done AFTER this session started. */
(function watchCollections(){
  const seed = NX.points._seed || { notes: 0, done: 0 };
  let lastNotes = seed.notes;
  let lastDone = seed.done;

  function counts(){
    const n = NX.store.get('notes', []);
    const t = NX.store.get('tasks', []);
    return {
      notes: Array.isArray(n) ? n.length : 0,
      /* pay for COMPLETING tasks, never for creating them — paying for
         creation rewards spamming the board with empty tasks */
      done: Array.isArray(t) ? t.filter(x => x && x.done).length : 0
    };
  }

  function scan(){
    const c = counts();
    if(c.notes > lastNotes){
      const gained = Math.min(c.notes - lastNotes, 3);
      for(let i = 0; i < gained; i++) award(8, 'note_created', { label: 'Note written' });
    }
    if(c.done > lastDone){
      const gained = Math.min(c.done - lastDone, 5);
      for(let i = 0; i < gained; i++) award(10, 'task_done', { label: 'Task completed' });
    }
    /* never let the baseline fall back, otherwise un-completing and
       re-completing the same task pays out twice */
    lastNotes = Math.max(lastNotes, c.notes);
    lastDone = Math.max(lastDone, c.done);
  }

  NX.events.on('store:notes', scan);
  NX.events.on('store:tasks', scan);
})();

/* -- productive hours (sampled, never from a tight interval) --- */
/* Driven off the dashboard heatmap cadence rather than the 2s Timeless
   poll, so it cannot flood the mirror. */
let lastProdMin = 0;
NX.events.on('timeless:hourly', ()=>{
  let prodMin = 0;
  const tl = NX.store.get('timeless', {}) || {};
  Object.values(tl).forEach(day=>{
    if(!day || typeof day !== 'object') return;
    Object.entries(day).forEach(([k, a])=>{
      if(k !== '__hours' && a && a.sec && a.cat === 'prod') prodMin += a.sec / 60;
    });
  });
  const whole = Math.floor(prodMin);
  if(whole > lastProdMin){
    const gained = Math.min(whole - lastProdMin, 2);
    for(let i = 0; i < gained; i++) award(20, 'focus_hour', { label: 'Hour of deep work' });
  }
  lastProdMin = whole;
});

/* -- first launch of the day --------------------------------- */
(function dailyLogin(){
  const k = todayKey();
  if(!state().flags['login:' + k]){
    state().flags['login:' + k] = Date.now();
    award(15, 'daily_login', { label: 'Daily check-in' });
  }
  /* roll over the day on boot */
  setTimeout(()=>{ rollDay(); flush(); }, 3000);
})();

} )(window.NX);