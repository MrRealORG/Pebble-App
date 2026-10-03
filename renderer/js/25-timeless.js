/* ============================================================
   Pebble 3.2 — 25-timeless.js
   Timeless: SYSTEM-WIDE app & site time tracking.
   - every real app on your PC (Explorer, Edge, Chrome, Firefox,
     Brave, IDEs, terminals...) via the native foreground watcher
   - browser sites auto-detected (native URL guess + extension)
   - REAL app icons extracted from the exe (native) + favicons
   - auto-categorization with 100+ built-in rules, re-classable
   - live "connected to your browser" status
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const CATS = {
  prod:  { l:'Productive',  cls:'cat-prod',  pill:'green' },
  neut:  { l:'Neutral',     cls:'cat-neut',  pill:'yellow' },
  distr: { l:'Distraction', cls:'cat-distr', pill:'red' }
};
let currentFilter = 'all', currentKind = 'all', currentDay = 0;   // 0=today, 1=yesterday
let appSearchQuery = '';

/* ---------------- real icon engine ---------------- */
const _iconCache = new Map();      // key -> html (<img>) or null

/* Site icons.
   The old source was Google's /s2/favicons endpoint, which has been
   deprecated and shut down — every request 404s, so sites showed the letter
   fallback and it looked like icons were "not detected". Try each source in
   order and walk to the next on failure: the site's own /favicon.ico is the
   most truthful and needs no third party, then DuckDuckGo's icon service as a
   backstop for sites that ship no favicon. */
const _favCache = new Map();
function faviconSources(host){
  const h = String(host || '').replace(/^www\./i, '');
  if(!h || h.indexOf('.') < 0) return [];
  return [
    'https://' + h + '/favicon.ico',
    'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(h) + '.ico',
    'https://icons.duckduckgo.com/ip3/' + encodeURIComponent(h) + '.png'
  ];
}
function faviconHTML(host){
  const key = String(host || '').toLowerCase();
  const letter = U.esc(String(host || '?').replace(/^www\./i, '').slice(0,1).toUpperCase());
  if(_favCache.has(key)) return _favCache.get(key);
  const sources = faviconSources(host);
  if(!sources.length){
    const html = `<span class="ar-ic" style="background:var(--surface-3);color:var(--ink-2)">${letter}</span>`;
    _favCache.set(key, html);
    return html;
  }
  /* walk the chain; each error swaps in the next source, and the last one
     falls back to the letter avatar so a cell is never left empty */
  const chain = sources.map((src, i) =>
    'this.onerror=null;' +
    (i + 1 < sources.length
      ? "this.onerror=function(){this.src='" + sources[i+1] + "'}"
      : "this.onerror=function(){var p=this.parentNode;p.textContent='" + letter + "'}")
  ).join(';') + ';';
  const html = `<img class="ar-img" loading="lazy" referrerpolicy="no-referrer" src="${sources[0]}" alt="" onerror="${chain.replace(/"/g, '&quot;')}">`;
  _favCache.set(key, html);
  return html;
}

function iconHTML(key, rec){
  if(rec.isSite){ return `<span class="ar-ic" style="background:var(--surface-3);color:var(--ink-2)">${faviconHTML(key)}</span>`; }
  if(_iconCache.has(key)) return _iconCache.get(key) || '';
  const placeholder = `<span class="ar-ic" style="background:${U.colorFor(rec.name)}">${U.initials(rec.name)}</span>`;
  _iconCache.set(key, null);      // in-flight marker
  (async ()=>{
    try{
      const r = await NX.native.appIcon(rec.exe || rec.path || '', rec.name || '');
      const el = q(`.app-row[data-k="${CSS.escape(key)}"] .ar-ic`);
      if(r && r.ok && r.url){
        const html = `<span class="ar-ic real"><img class="ar-img" src="${r.url}" alt=""></span>`;
        _iconCache.set(key, html);
        if(el) el.outerHTML = html;
      } else {
        _iconCache.set(key, placeholder);
      }
    }catch(e){ _iconCache.delete(key); }
  })();
  return placeholder;
}

/* Browser titles are noisy and unstable: Discord titles carry the channel and
   an unread count ("(1684) Discord | speaker - ... "), so every poll produced
   a NEW key and the Apps list filled up with dozens of near-duplicate Discord
   rows. Collapse a raw title to a stable host + a clean label. */
const SITE_CANON = [
  [ /discord/i,            'discord.com',   'Discord' ],
  [ /youtube|youtu\.?be/i, 'youtube.com',   'YouTube' ],
  [ /github|github copilot/i, 'github.com', 'GitHub' ],
  [ /facebook|fb/i,       'facebook.com',  'Facebook' ],
  [ /instagram/i,          'instagram.com', 'Instagram' ],
  [ /reddit/i,             'reddit.com',    'Reddit' ],
  [ /twitter|^x\.com|\bx\b/i, 'x.com',      'X' ],
  [ /tiktok/i,             'tiktok.com',    'TikTok' ],
  [ /netflix/i,            'netflix.com',   'Netflix' ],
  [ /twitch/i,             'twitch.tv',     'Twitch' ],
  [ /linkedin/i,           'linkedin.com',  'LinkedIn' ],
  [ /amazon|amzn/i,        'amazon.com',    'Amazon' ],
  [ /stackoverflow/i,      'stackoverflow.com', 'Stack Overflow' ],
  [ /notion/i,             'notion.so',     'Notion' ],
  [ /figma/i,              'figma.com',     'Figma' ],
  [ /wikipedia/i,          'wikipedia.org', 'Wikipedia' ],
  [ /gmail|mail/i,         'mail.google.com', 'Gmail' ],
  [ /outlook/i,            'outlook.live.com', 'Outlook' ],
  [ /spotify/i,            'spotify.com',   'Spotify' ],
  [ /pinterest/i,          'pinterest.com', 'Pinterest' ],
  [ /linkedin|teams|slack/i, null, null ]
];
/* strip a leading unread/channel counter, emoji, pipes and dots */
function cleanTitle(raw){
  return String(raw || '')
    .replace(/^\s*[\(\[]\s*\d{1,6}\s*[\)\]]\s*/g, '')   // (1684)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
    .replace(/[|·•]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function normalizeSite(raw){
  const cleaned = cleanTitle(raw);
  for(const [re, host, label] of SITE_CANON){
    if(re.test(cleaned)) return host ? { key:host, label } : { key:cleaned.toLowerCase(), label:cleaned };
  }
  /* no brand matched: a bare host is already stable, otherwise collapse the
     noisy title down to something readable and lowercase for the key */
  if(/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)) return { key:cleaned.toLowerCase(), label:cleaned };
  const squashed = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return { key: squashed || 'site', label: cleaned.slice(0, 48) || 'Website' };
}

/* ---------------- tracking engine ---------------- */
const tracker = {
  live: { app:'Pebble', cat:'prod', isSite:false, started:Date.now(), url:'', iconKey:'' },
  lastTick: Date.now(),
  nativeOk: false,

  classify(name){
    const rules = NX.store.get('rules', []);
    const n = String(name||'').toLowerCase();
    for(const r of rules){ if(n.includes(r.match.toLowerCase())) return r.cat; }
    return 'neut';
  },

  /* manual re-categorization wins over auto rules (locks survive restarts) */
  catFor(key, name){
    const locks = NX.store.get('catLocks', {});
    return locks[key] || this.classify(name);
  },
  lockCat(key, cat){
    const locks = NX.store.get('catLocks', {});
    locks[key] = cat;
    NX.store.set('catLocks', locks);
  },

  addRule(match, cat){
    const rules = NX.store.get('rules', []);
    const ex = rules.find(r=>r.match.toLowerCase() === match.toLowerCase());
    if(ex) ex.cat = cat; else rules.push({ match, cat });
    NX.store.set('rules', rules);
  },

  currentWindow(){
    return new Promise(resolve=>{
      if(NX.native.available && NX.native.mode === 'tauri'){
        NX.native.activeWindow().then(w=>{
          if(w && w.name) resolve(w);
          else resolve(null);
        }).catch(()=>resolve(null));
      } else resolve(null);
    });
  },

  bump(name, sec, isSite, meta){
    const today = U.todayKey();
    const all = NX.store.get('timeless', {});
    const day = all[today] = all[today] || {};
    let key = String(name).toLowerCase(), label = name;
    if(isSite){
      const n = normalizeSite(name);
      key = n.key; label = n.label;
    }
    const rec = day[key] = day[key] || { name:label, cat:this.catFor(key, label), sec:0, isSite:!!isSite };
    rec.name = label;
    rec.cat = this.catFor(key, label);   // manual locks stick; rules apply live
    rec.sec += sec;
    rec.last = Date.now();
    rec.isSite = !!isSite;
    if(meta && meta.path) rec.exe = meta.path;
    else if(meta && meta.exe) rec.exe = meta.exe;
    const hr = new Date().getHours();
    day.__hours = day.__hours || {};
    day.__hours[hr] = (day.__hours[hr] || 0) + sec;
    NX.store.set('timeless', all);   // sync write keeps totals/live UI exact
  },

  /* Timeless polls the foreground window every 2s. That is fine while the
     user wants it and pure waste when they don't, so disabling the module
     has to actually stop the poll rather than just hide the screen. */
  setEnabled(on){
    if(on){
      if(this._enabled) return;
      this._enabled = true;
      this.lastTick = Date.now();
      this.start();
    } else {
      this._enabled = false;
      if(this._timers){ this._timers.forEach(clearInterval); this._timers = []; }
      this.live = null;
    }
  },

  start(){
    if(!this._enabled) return;
    if(this._timers) this._timers.forEach(clearInterval);
    this._timers = [];
    this._timers.push(setInterval(()=> this.hourlyBeacon(), 30000));
    this._timers.push(setInterval(async ()=>{
      const now = Date.now();
      const dt = Math.min(10, Math.round((now - this.lastTick)/1000));
      this.lastTick = now;
      const w = await this.currentWindow();
      if(w && w.name){
        this.nativeOk = true;
        const lower = String(w.name||'').toLowerCase();
        const rawLower = String(w.rawName||w.exe||'').toLowerCase();
        const isBrowser = ['chrome','msedge','edge','firefox','brave','opera','vivaldi','arc'].some(b=>lower.includes(b) || rawLower.includes(b));
        if(isBrowser && w.url){
          // the site gets the time — the browser itself is just the shell
          const host = String(w.url).replace(/^www\./,'');
          this.live = { app:host, cat:this.classify(host), isSite:true, started:this.live.started, url:w.url, iconKey:host };
          this.bump(host, dt, true, { exe:w.path, exeName:w.exe });
        } else {
          this.live = { app:w.name, cat:this.classify(w.name), isSite:false, started:this.live.started, url:'', iconKey:w.name };
          this.bump(w.name, dt, false, { exe:w.exe, path:w.path });
        }
      } else {
        if(document.hidden) return; // only fallback to Pebble route when actually focused
        const route = NX.router.currentName;
        const label = 'Pebble — ' + (NX.router.routes[route] ? (NX.router.routes[route].title || route) : route);
        this.live = { app: label, cat:'prod', isSite:false, started:this.live.started, url:'', iconKey:'' };
        this.bump(label, dt, false);
      }
      NX.events.emit('timeless:tick');
    }, 2000));
  },

  /* Hourly signal for the points ledger's focus_hour rule.
     45-points.js listens for 'timeless:hourly' but nothing emitted it, so that
     rule never fired. It cannot be driven straight off the 2s poll above:
     NX.store.set() serialises the WHOLE workspace, so emitting there would
     flood the mirror and bring back AppHangB1. Instead fire at most once per
     clock hour, tracked in the store so it survives a reload. */
  hourlyBeacon(){
    const hour = Math.floor(Date.now() / 3600e3);
    let last = 0;
    try{ last = parseInt(NX.store.get('timeless:lastBeaconHour', '0'), 10) || 0; }catch(e){}
    if(last === hour) return;
    NX.store.set('timeless:lastBeaconHour', String(hour));
    NX.events.emit('timeless:hourly');
  }
};
NX.timeless = tracker;

function dayData(offset=0){
  return NX.store.get('timeless', {})[U.todayKey(new Date(Date.now()-offset*86400e3))] || {};
}
/* today totals (independent of the day filter) */
function totals(){
  const d = dayData(0);
  let prod=0, neut=0, distr=0;
  Object.entries(d).forEach(([k,a])=>{
    if(k==='__hours' || !a || !a.sec) return;
    if(a.cat==='prod') prod+=a.sec; else if(a.cat==='distr') distr+=a.sec; else neut+=a.sec;
  });
  return { prod, neut, distr, total:prod+neut+distr };
}
function filteredDayTotals(){
  const d = dayData(currentDay);
  let prod=0, neut=0, distr=0;
  Object.entries(d).forEach(([k,a])=>{
    if(k==='__hours' || !a || !a.sec) return;
    if(a.cat==='prod') prod+=a.sec; else if(a.cat==='distr') distr+=a.sec; else neut+=a.sec;
  });
  return { prod, neut, distr, total:prod+neut+distr };
}
function score(){ const t = totals(); return Math.round(t.prod / Math.max(1, t.prod + t.distr) * 100); }
function streakCount(){
  const all = NX.store.get('timeless', {});
  const set = NX.store.get('settings', {});
  const goalSec = (set.focusGoalMin || 240) * 60;
  let streak = 0;
  const getDayProd = (dKey) => {
    const d = all[dKey] || {};
    let prod = 0;
    Object.entries(d).forEach(([k, a]) => {
      if(k !== '__hours' && a && a.cat === 'prod' && a.sec) prod += a.sec;
    });
    return prod;
  };
  const todayKey = U.todayKey();
  const todayProd = getDayProd(todayKey);
  let checkDay = 1;
  if(todayProd >= Math.min(3600, goalSec * 0.4)){
    streak++;
  }
  while(checkDay < 60){
    const dKey = U.todayKey(new Date(Date.now() - checkDay * 86400e3));
    if(!all[dKey]) break;
    const prod = getDayProd(dKey);
    if(prod >= Math.min(3600, goalSec * 0.4)){
      streak++;
      checkDay++;
    } else {
      break;
    }
  }
  return streak;
}
NX.totals = totals;

/* last 7 days series for the trend graph */
function weekSeries(){
  const out = [];
  for(let i=6;i>=0;i--){
    const d = dayData(i);
    let prod=0, neut=0, distr=0;
    Object.entries(d).forEach(([k,a])=>{
      if(k==='__hours' || !a || !a.sec) return;
      if(a.cat==='prod') prod+=a.sec; else if(a.cat==='distr') distr+=a.sec; else neut+=a.sec;
    });
    out.push({ day:U.todayKey(new Date(Date.now()-i*86400e3)), label:new Date(Date.now()-i*86400e3).toLocaleDateString(undefined,{weekday:'short'}).slice(0,2), prod, neut, distr, total:prod+neut+distr });
  }
  return out;
}

/* ---------------- pomodoro ---------------- */
function focusCfg(){
  const s = NX.store.get('settings', {}) || {};
  const p = NX.store.get('pomo', { len:25, breakLen:5 });
  return {
    len: p.len || 25,
    breakLen: p.breakLen || 5,
    autoStart: !!s.pomoAutoStart,
    dnd: !!s.pomoDnd,
    ambient: !!s.pomoAmbient,
    sound: s.focusSoundMode || 'brown',
    vol: s.focusSoundVol != null ? s.focusSoundVol : 0.32
  };
}
function roundLog(){ const f = NX.store.get('focus', {}) || {}; return Array.isArray(f.rounds) ? f.rounds : []; }
function logRound(entry){
  const f = NX.store.get('focus', {}) || {};
  const rounds = roundLog().concat([entry]);
  f.rounds = rounds.slice(-200);
  NX.store.set('focus', f);
  NX.events.emit('focus:log');
}
function focusStreak(){
  const days = new Set(roundLog().map(r => U.todayKey(r.at)));
  let n = 0;
  for(let i=0;i<400;i++){
    const k = U.todayKey(new Date(Date.now() - i*86400e3));
    if(days.has(k)) n++;
    else if(i > 0) break;
  }
  return n;
}
function focusWeek(){
  const out = [];
  for(let i=6;i>=0;i--){
    const d = new Date(Date.now() - i*86400e3);
    const k = U.todayKey(d);
    const rs = roundLog().filter(r => U.todayKey(r.at) === k);
    out.push({
      day:k, label:d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2),
      rounds: rs.length, sec: rs.reduce((a,r)=> a + (r.sec||0), 0),
      today: i === 0
    });
  }
  return out;
}
NX.focusLog = { rounds: roundLog, streak: focusStreak, week: focusWeek, add: logRound };

/* Focused Time — the TimeLens distinction that matters: only time inside a
   focus round you deliberately started. A day can be long and productive and
   still have zero Focused Time, because focus only moves when you say so. */
function focusedSec(offset){
  const k = U.todayKey(new Date(Date.now() - (offset||0)*86400e3));
  return roundLog().filter(r => U.todayKey(r.at) === k).reduce((a,r)=> a + (r.sec||0), 0);
}
function focusedRounds(offset){
  const k = U.todayKey(new Date(Date.now() - (offset||0)*86400e3));
  return roundLog().filter(r => U.todayKey(r.at) === k).length;
}

const pomo = {
  st:null, timer:null, meta:null,
  start(meta){
    const cfg = focusCfg();
    this.st = { mode:'focus', left: cfg.len*60, running:true };
    this.meta = Object.assign({ at:Date.now(), task:'', note:'' }, meta || {});
    clearInterval(this.timer);
    this.timer = setInterval(()=>this.tick(), 1000);
    if(cfg.dnd) NX.dnd && NX.dnd.push('Focus round');
    if(cfg.ambient && NX.focusSound && !NX.focusSound.on){
      NX.focusSound.setMode(cfg.sound);
      NX.focusSound.setVol(cfg.vol);
      NX.focusSound.toggle();
      NX.toastInfo('Ambient on', cfg.sound === 'hum' ? 'Deep hum' : cfg.sound === 'rain' ? 'Rain' : 'Brown noise');
    }
    NX.events.emit('pomo:changed'); NX.sfx.play('ok');
  },
  pause(){ if(this.st){ this.st.running = !this.st.running; NX.events.emit('pomo:changed'); } },
  reset(){ clearInterval(this.timer); this.st = null; NX.events.emit('pomo:changed'); },
  tick(){
    if(!this.st || !this.st.running) return;
    this.st.left--;
    if(this.st.left <= 0){
      const cfg = focusCfg();
      if(this.st.mode === 'focus'){
        const stats = NX.store.get('pomoStats', { done:0 }); stats.done++; NX.store.set('pomoStats', stats);
        logRound(Object.assign({}, this.meta, {
          at: Date.now(), sec: cfg.len*60, cat:'focus',
          task: this.meta && this.meta.task, note: this.meta && this.meta.note
        }));
        NX.native.notify({ title:'🍅 Pomodoro done!', body:'+' + cfg.len + ' focused minutes logged. Take a ' + cfg.breakLen + ' min break.' });
        NX.pushNotif('Pomodoro complete', '+' + cfg.len + ' focused min · ' + cfg.breakLen + ' min break', 'clock');
        NX.confetti(innerWidth/2, 120);
        this.st = { mode:'break', left: cfg.breakLen*60, running:true };
        this.meta = { at:Date.now(), task:'', note:'' };
      } else {
        NX.native.notify({ title:'Break over', body:'Round ' + (NX.store.get('pomoStats',{done:0}).done+1) + ' — back to it.' });
        NX.pushNotif('Break over', 'Round ' + (NX.store.get('pomoStats',{done:0}).done+1) + ' — go!', 'clock');
        if(cfg.autoStart){ this.st = { mode:'focus', left: cfg.len*60, running:true }; this.meta = { at:Date.now(), task:'', note:'' }; }
        else this.st = { mode:'focus', left: cfg.len*60, running:false };
      }
      if(cfg.dnd) NX.dnd && NX.dnd.pop();
      NX.sfx.play('timer');
    }
    NX.events.emit('pomo:changed');
  }
};
NX.pomo = pomo;

/* ---------------- browser link status card ---------------- */
function extStatusHTML(st){
  if(!NX.native.available || NX.native.mode !== 'tauri'){
    return `<span class="ob-dot"></span> Desktop mode only — the extension links when Pebble runs as an app`;
  }
  if(st.connected){
    const ago = st.lastSeen ? U.relTime(st.lastSeen*1000) : 'just now';
    return `<span class="ob-dot"></span> <b>Connected to your browser</b> · ${st.extSessions||0} tab sessions today · last ping ${U.esc(ago)}${st.queued?` · ${st.queued} queued`:''}`;
  }
  return `<span class="ob-dot"></span> <b>Not connected</b> — load the Pebble Timeless extension to stream tab time here`;
}

/* ---------------- module page ---------------- */
NX.routeInShell('timeless', 'Timeless', 'clock', function(view){
  view.innerHTML = `<div class="page" id="tl-page"></div>`;
  renderPage(view);

  const off = NX.events.on('timeless:tick', ()=>{
    const live = q('#tl-live-name', view);
    if(live){
      live.textContent = tracker.live.app;
      const tEl = q('#tl-live-time', view); if(tEl) tEl.textContent = U.fmtClock((Date.now()-tracker.live.started)/1000);
      const pEl = q('#tl-live-pill', view);
      if(pEl){ pEl.className = 'pill ' + CATS[tracker.live.cat].pill; pEl.textContent = CATS[tracker.live.cat].l; }
      /* keep the detection badge honest: it flips to "watching" the moment
         the native watcher actually reads a window */
      const dEl = q('#tl-detect-pill', view);
      if(dEl){
        const native = NX.native.available && NX.native.mode === 'tauri';
        const label = tracker.nativeOk ? 'watching' : (native ? 'starting' : 'web mode');
        dEl.className = 'pill ' + (tracker.nativeOk ? 'green' : 'yellow');
        if(dEl.textContent !== label) dEl.textContent = label;
      }
      const ic = q('#tl-live-ic', view);
      if(ic && tracker.live.iconKey !== ic.dataset.k){
        ic.dataset.k = tracker.live.iconKey;
        ic.outerHTML = tracker.live.isSite
          ? `<span class="ar-ic real" id="tl-live-ic" data-k="${U.esc(tracker.live.iconKey)}" style="background:var(--surface-3)">${faviconHTML(tracker.live.iconKey)}</span>`
          : `<span class="ar-ic real" id="tl-live-ic" data-k="${U.esc(tracker.live.iconKey)}" style="background:${U.colorFor(tracker.live.app)}">${U.initials(tracker.live.app)}</span>`;
        if(!tracker.live.isSite && NX.native.available && NX.native.mode === 'tauri'){
          const day = dayData();
          const meta = day[tracker.live.app.toLowerCase()];
          const target = q('#tl-live-ic', view);
          if(target && meta && (meta.exe || meta.path)){
            NX.native.appIcon(meta.exe || meta.path || '', tracker.live.app).then(r=>{
              const t2 = q('#tl-live-ic', view);
              if(t2 && r && r.ok && r.url) t2.innerHTML = `<img class="ar-img" src="${r.url}" alt="">`;
            }).catch(()=>{});
          }
        }
      }
      const sc = q('#tl-score-num', view);
      if(sc){ sc.textContent = score() + '%'; }
    }
  });
  const offP = NX.events.on('pomo:changed', ()=>renderPomo(view));
  const offE = NX.events.on('ext:connected', ()=>{
    const el = q('#tl-ext-status', view);
    if(el){ el.classList.add('ok'); renderExtStatus(view); }
  });
  const extTimer = setInterval(()=>renderExtStatus(view), 5000);
  view._cleanup = ()=>{ off(); offP(); offE(); clearInterval(extTimer); };
}, function(){ /* onMount */ });

function renderExtStatus(view){
  const el = q('#tl-ext-status', view); if(!el) return;
  const st = NX.extsync ? NX.extsync.status() : { connected:false };
  el.classList.toggle('ok', !!st.connected);
  el.innerHTML = extStatusHTML(st);
}

function renderPage(view){
  const page = q('#tl-page', view);
  const t = totals(), s = score();
  const ft = filteredDayTotals();
  const set = NX.store.get('settings', {});
  const goalMin = set.focusGoalMin || 240;
  const distLimit = set.distractionLimitMin || 120;
  const streak = streakCount();

  const goalPct = Math.min(100, Math.round((ft.prod/60)/goalMin*100));
  const distPct = Math.min(100, Math.round((ft.distr/60)/distLimit*100));
  const focused = focusedSec(currentDay);
  const focusedN = focusedRounds(currentDay);
  /* detection state, surfaced so a silent watcher is obvious instead of
     looking like "the app does not see anything" */
  const nativeMode = NX.native.available && NX.native.mode === 'tauri';
  const watcher = tracker.nativeOk ? 'watching' : (nativeMode ? 'starting' : 'web mode');

  page.innerHTML = `
  <div class="card stat-strip anim-in">
    <div class="stat"><div class="tile">${icon('target')}</div>
      <div><div class="s-label">Focus score</div><div class="s-num" id="tl-score-num">${s}%</div></div>
      <span class="pill ${s>=70?'green':s>=40?'yellow':'red'}" style="margin-left:auto">${s>=70?'On track':s>=40?'Keep going':'Red flag'}</span></div>
    <div class="stat"><div class="tile">${icon('clock')}</div>
      <div><div class="s-label">Productive${currentDay?' · day':''}</div><div class="s-num">${U.fmtTime(ft.prod)}</div></div></div>
    <div class="stat"><div class="tile">${icon('target')}</div>
      <div><div class="s-label">Focused${currentDay?' · day':''}</div><div class="s-num">${U.fmtTime(focused)}</div>
        <div class="s-sub">${focusedN} ${focusedN===1?'round':'rounds'}</div></div></div>
    <div class="stat"><div class="tile">${icon('eye')}</div>
      <div><div class="s-label">Distraction${currentDay?' · day':''}</div><div class="s-num">${U.fmtTime(ft.distr)}</div></div>
      <span class="delta ${distPct>=100?'down':'up'}" style="margin-left:auto">${distPct}% of limit</span></div>
    <div class="stat"><div class="tile">${icon('fire')}</div>
      <div><div class="s-label">Focus streak</div><div class="s-num">${streak} ${streak===1?'day':'days'}</div></div>
      <span class="tl-streak-chip" style="margin-left:auto">${streak>=3?'🔥 On fire':streak>=1?'⚡ Alive':'🌱 Start'}</span></div>
    <div class="stat"><div class="tile">${icon('activity')}</div>
      <div><div class="s-label">Tracked${currentDay?' · day':' today'}</div><div class="s-num">${U.fmtTime(ft.total)}</div></div></div>
  </div>

  <div class="tl-grid">
    <div class="tl-col">
      <div class="live-session anim-in" style="animation-delay:.04s">
        <span class="ar-ic" id="tl-live-ic" data-k="" style="background:${U.colorFor(tracker.live.app)}">${U.initials(tracker.live.app)}</span>
        <div><div class="ls-name" id="tl-live-name">${U.esc(tracker.live.app)}</div>
          <div class="ls-sub" id="tl-detect">${nativeMode
            ? (tracker.nativeOk
                ? 'Detecting apps &amp; sites — native watcher active'
                : 'Native watcher starting… it needs a moment before the first window is read')
            : 'Web mode: app detection needs the desktop app. Only in-app routes are tracked here.'}</div></div>
        <div style="text-align:right">
          <span class="pill ${tracker.nativeOk?'green':'yellow'}" id="tl-detect-pill">${watcher}</span>
          <span class="pill" id="tl-live-pill">${CATS[tracker.live.cat].l}</span>
          <div class="ls-time" id="tl-live-time">${U.fmtClock((Date.now()-tracker.live.started)/1000)}</div>
        </div>
      </div>

      <div class="card anim-in" style="animation-delay:.08s">
        <div class="card-h"><div class="tile sm">${icon('layers')}</div>
          <div><div class="c-title">Apps &amp; sites</div><div class="c-sub">Real icons · auto-detected · 1-click re-categorize</div></div>
          <div class="spacer"></div>
          <div class="seg" id="tl-day-seg"></div>
          <div id="tl-kind-seg"></div></div>
        <div class="card-b" style="padding-top:8px">
          <div class="tl-toolbar">
            <div class="tl-search-wrap">
              ${icon('search')}
              <input id="tl-app-search" placeholder="Search apps, sites, or categories…" value="${U.esc(appSearchQuery)}">
            </div>
            <button class="btn btn-soft btn-sm" id="tl-export-report" data-tip="Export markdown summary report">${icon('download')} Export report</button>
          </div>
          <div class="todo-filters" id="tl-filters" style="margin-bottom:6px"></div>
          <div class="tl-cat-legend" style="margin-bottom:8px">
            <span class="lg"><i class="cat-prod"></i> Productive</span>
            <span class="lg"><i class="cat-neut"></i> Neutral</span>
            <span class="lg"><i class="cat-distr"></i> Distraction</span>
            <span class="faint tiny" style="margin-left:auto">Click pill to cycle category</span>
          </div>
          <div id="tl-apps"></div>
        </div>
      </div>

      <div class="card anim-in" style="animation-delay:.12s">
        <div class="card-h"><div class="tile sm">${icon('activity')}</div>
          <div><div class="c-title">Last 7 days</div><div class="c-sub">Focus vs distraction trend — hover a bar for details</div></div></div>
        <div class="card-b"><div id="tl-trend"></div></div>
      </div>

      <div class="card anim-in" style="animation-delay:.14s">
        <div class="card-h"><div class="tile sm">${icon('clock')}</div>
          <div><div class="c-title">24-hour visual activity</div><div class="c-sub">Hover any hour column to view exact tracked duration</div></div></div>
        <div class="card-b"><div id="tl-hours"></div></div>
      </div>
    </div>

    <div class="tl-col">
      <div class="card anim-in" style="animation-delay:.06s">
        <div class="card-h"><div class="tile sm">${icon('grid')}</div>
          <div><div class="c-title">Today's balance</div><div class="c-sub">Category split of tracked time</div></div></div>
        <div class="card-b" id="tl-donut" style="display:flex;align-items:center;gap:18px;justify-content:center;padding:14px 10px"></div>
      </div>

      <div class="card anim-in" style="animation-delay:.1s">
        <div class="card-h"><div class="tile sm">${icon('clock')}</div>
          <div><div class="c-title">Pomodoro</div><div class="c-sub" id="pomo-state-sub"></div></div></div>
        <div class="pomo-timer" id="pomo-box"></div>
      </div>

      <div class="card anim-in" style="animation-delay:.15s">
        <div class="card-h"><div class="tile sm">${icon('target')}</div>
          <div><div class="c-title">Goals</div><div class="c-sub">Daily focus & distraction limits</div></div></div>
        <div class="card-b" style="display:flex;flex-direction:column;gap:12px">
          <div><div class="row small bold" style="justify-content:space-between;margin-bottom:5px"><span>Focus goal · ${goalMin} min</span><span class="mono-num">${Math.round(ft.prod/60)} min</span></div>
            <div class="meter"><i style="width:${goalPct}%"></i></div></div>
          <div><div class="row small bold" style="justify-content:space-between;margin-bottom:5px"><span>Distraction limit · ${distLimit} min</span><span class="mono-num">${Math.round(ft.distr/60)} min</span></div>
            <div class="meter"><i style="width:${distPct}%;background:${distPct>=100?'var(--red)':'var(--yellow)'}"></i></div></div>
          <button class="btn btn-soft btn-sm" id="tl-goal-edit">${icon('edit')} Adjust goals</button>
        </div>
      </div>

      <div class="card anim-in" style="animation-delay:.18s">
        <div class="card-h"><div class="tile sm">${icon('filter')}</div>
          <div><div class="c-title">App rules</div><div class="c-sub">Which apps count as what</div></div>
          <div class="spacer"></div><button class="btn btn-soft btn-sm" id="tl-rule-add">+ Rule</button></div>
        <div class="card-b" id="tl-rules" style="padding-top:8px"></div>
      </div>

      <div class="ext-card anim-in ${NX.extsync && NX.extsync.status().connected ? 'ok':''}" style="animation-delay:.22s">
        <div class="ec-ic">${icon('chrome')}</div>
        <div style="min-width:0"><div class="ec-t">Browser link</div>
          <div class="ec-d" id="tl-ext-status"></div>
          <div class="ec-d faint">Install: <code>chrome://extensions</code> → Developer mode → <b>Load unpacked</b> → the <code>extension</code> folder. Sends tab time + lets you add tasks, notes, prompts & messages from your browser.</div>
        </div>
      </div>
    </div>
  </div>`;

  renderExtStatus(view);

  /* day segment: today / yesterday */
  const daySeg = NX.seg([{v:0,l:'Today'},{v:1,l:'Yesterday'}], 0, v=>{
    currentDay = +v;
    renderPage(view);   // full refresh: stats + list + goals reflect the day
  });
  q('#tl-day-seg', page).appendChild(daySeg);

  /* kind segment */
  const seg = NX.seg([{v:'all',l:'All'},{v:'app',l:'Apps'},{v:'site',l:'Sites'}], 'all', v=>{ currentKind = v; renderApps(view); });
  q('#tl-kind-seg', page).appendChild(seg);

  /* search input binding */
  const searchEl = q('#tl-app-search', page);
  if(searchEl){
    searchEl.oninput = (e)=>{
      appSearchQuery = e.target.value.trim();
      renderApps(page);
    };
  }

  /* export report handler */
  const expBtn = q('#tl-export-report', page);
  if(expBtn){
    expBtn.onclick = ()=>{
      const targetDayKey = U.todayKey(new Date(Date.now() - currentDay * 86400e3));
      const ft = filteredDayTotals();
      const d = dayData(currentDay);
      const items = Object.entries(d).filter(([k,a])=>k!=='__hours' && a && a.sec>=2).sort((a,b)=>b[1].sec-a[1].sec);
      const slots = d.__hours || {};

      let md = `# Pebble Timeless Productivity Report\n\n`;
      md += `- **Date:** ${targetDayKey} (${currentDay === 0 ? 'Today' : 'Yesterday'})\n`;
      md += `- **Focus Score:** ${score()}%\n`;
      md += `- **Total Tracked Time:** ${U.fmtTime(ft.total)}\n`;
      md += `- **Productive:** ${U.fmtTime(ft.prod)} (${Math.round(ft.prod/Math.max(1,ft.total)*100)}%)\n`;
      md += `- **Neutral:** ${U.fmtTime(ft.neut)} (${Math.round(ft.neut/Math.max(1,ft.total)*100)}%)\n`;
      md += `- **Distraction:** ${U.fmtTime(ft.distr)} (${Math.round(ft.distr/Math.max(1,ft.total)*100)}%)\n\n`;
      
      md += `## Applications & Sites Breakdown\n\n`;
      md += `| Name | Type | Category | Tracked Time | % Share |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      items.forEach(([k, a])=>{
        const pct = Math.round(a.sec / Math.max(1, ft.total) * 100);
        md += `| ${a.name || k} | ${a.isSite ? 'Site' : 'App'} | ${CATS[a.cat].l} | ${U.fmtTime(a.sec)} | ${pct}% |\n`;
      });

      md += `\n## Hourly Activity Summary\n\n`;
      md += `| Hour | Tracked Time |\n`;
      md += `| :--- | :--- |\n`;
      for(let hh=0; hh<24; hh++){
        if(slots[hh]){
          md += `| ${String(hh).padStart(2,'0')}:00 - ${String(hh).padStart(2,'0')}:59 | ${U.fmtTime(slots[hh])} |\n`;
        }
      }
      md += `\n*Generated by PebbleX Desktop Productivity Suite*\n`;

      const fname = `Pebble-Timeless-Report-${targetDayKey}.md`;
      U.download(fname, md, 'text/markdown');
      NX.toastOk('Report exported', fname);
      NX.sfx.play('pop');
    };
  }

  /* filters (3 nature filters) — counts follow the selected day */
  function renderFilters(){
    const f = q('#tl-filters', page);
    const d = dayData(currentDay);
    const counts = { all:0, prod:0, neut:0, distr:0 };
    Object.entries(d).forEach(([k,a])=>{ if(k==='__hours'||!a||!a.sec) return; counts.all++; counts[a.cat]++; });
    f.innerHTML = [['all','All'],['prod','Productive'],['neut','Neutral'],['distr','Distraction']].map(([v,l])=>
      `<button class="chip ${currentFilter===v?'active':''}" data-f="${v}">${l} <span class="n">${counts[v]}</span></button>`).join('');
    qa('.chip', f).forEach(b=>b.onclick = ()=>{ currentFilter = b.dataset.f; renderFilters(); renderApps(page); });
  }

  function renderApps(view2){
    const host = q('#tl-apps', page); if(!host) return;
    const d = dayData(currentDay);
    let items = Object.entries(d).filter(([k,a])=>k!=='__hours' && a && a.sec>=2)
      .filter(([k,a])=>currentFilter==='all' || a.cat===currentFilter)
      .filter(([k,a])=>currentKind==='all' || (currentKind==='site' ? a.isSite : !a.isSite));

    if(appSearchQuery){
      const qry = appSearchQuery.toLowerCase();
      items = items.filter(([k,a])=> k.includes(qry) || (a.name||'').toLowerCase().includes(qry) || (CATS[a.cat] && CATS[a.cat].l.toLowerCase().includes(qry)));
    }

    items.sort((a,b)=>b[1].sec-a[1].sec);
    const max = Math.max(1, ...items.map(x=>x[1].sec));
    const total = Math.max(1, items.reduce((s,x)=>s+x[1].sec, 0));
    if(!items.length){
      host.innerHTML = `<div class="empty" style="padding:26px"><div class="e-title">${appSearchQuery ? 'No matching apps or sites' : 'No data ' + (currentDay?'for yesterday':'yet')}</div><div class="e-sub">${appSearchQuery ? 'Try clearing your search query' : 'Keep PebbleX open — every app and site you use appears here automatically, with real icons.'}</div></div>`;
      return;
    }
    host.innerHTML = items.map(([k,a])=>`
      <div class="app-row" data-k="${U.esc(k)}">
        ${iconHTML(k, a)}
        <div style="min-width:0;width:150px">
          <div class="ar-name" title="${U.esc(a.name)}">${U.esc(a.name)}</div>
          <div class="ar-cat">${a.isSite?'Site':'App'} · 
            <button class="tl-cat-switch-btn" data-cat-cycle="${U.esc(k)}" data-tip="Click to cycle: Productive ➔ Neutral ➔ Distraction">
              <span class="pill ${CATS[a.cat].pill}" style="height:16px;font-size:9.5px;cursor:pointer">${CATS[a.cat].l}</span>
            </button>
          </div>
        </div>
        <div class="ar-bar meter"><i style="width:${Math.round(a.sec/max*100)}%;background:${a.cat==='prod'?'var(--green)':a.cat==='distr'?'var(--red)':'var(--yellow)'}"></i></div>
        <span class="ar-pct">${Math.round(a.sec/total*100)}%</span>
        <span class="ar-time">${U.fmtTime(a.sec)}</span>
        <div style="display:flex;align-items:center;gap:2px">
          <button class="icon-btn sm" data-re="${U.esc(k)}" data-tip="Re-categorize / link">${icon('dots')}</button>
          <button class="icon-btn sm" data-del-app="${U.esc(k)}" data-tip="Remove from log" style="color:var(--ink-4)">${icon('x')}</button>
        </div>
      </div>`).join('');

    qa('[data-cat-cycle]', host).forEach(b=>{
      b.onclick = (e)=>{
        e.stopPropagation();
        const key = b.dataset.catCycle;
        const a = dayData(currentDay)[key];
        if(!a) return;
        const nextCat = a.cat === 'prod' ? 'neut' : (a.cat === 'neut' ? 'distr' : 'prod');
        setCat(key, nextCat);
      };
    });

    qa('[data-del-app]', host).forEach(b=>{
      b.onclick = (e)=>{
        e.stopPropagation();
        const key = b.dataset.delApp;
        const rec = dayData(currentDay)[key];
        if(!rec) return;
        NX.modal({
          title: 'Remove from history',
          icon: 'trash',
          body: NX.h(`<p>Remove <b>${U.esc(rec.name || key)}</b> (${U.fmtTime(rec.sec)}) from ${currentDay ? 'yesterday\'s' : 'today\'s'} log?</p>`),
          footer: [
            { label: 'Cancel', cls: 'btn-soft' },
            { label: 'Remove', cls: 'btn-red', onClick: () => {
                const all = NX.store.get('timeless', {});
                const targetDayKey = U.todayKey(new Date(Date.now() - currentDay * 86400e3));
                if(all[targetDayKey] && all[targetDayKey][key]){
                  delete all[targetDayKey][key];
                  NX.store.set('timeless', all);
                }
                NX.closeAllModals();
                renderPage(view);
                NX.toastOk('Removed', `Excluded ${rec.name || key} from log.`);
            }}
          ]
        });
      };
    });

    qa('[data-re]', host).forEach(b=>{
      b.onclick = (e)=>{
        const key = b.dataset.re, a = dayData(currentDay)[key];
        NX.menu(e.currentTarget, [
          { label:'Count as Productive', icon:'check', onClick:()=>setCat(key,'prod') },
          { label:'Count as Neutral', icon:'eye', onClick:()=>setCat(key,'neut') },
          { label:'Count as Distraction', icon:'eye', onClick:()=>setCat(key,'distr') },
          '-',
          { label:'Reset to automatic rule', icon:'refresh', onClick:()=>{ const locks = NX.store.get('catLocks',{}); delete locks[key]; NX.store.set('catLocks', locks); bumpReclass(key); renderApps(page); renderFilters(); } },
          { label:'Link to a task…', icon:'todo', onClick:()=>linkToTask(key, a.sec) },
          { label:'Remove from log…', icon:'trash', onClick:()=>{
              const all = NX.store.get('timeless', {});
              const targetDayKey = U.todayKey(new Date(Date.now() - currentDay * 86400e3));
              if(all[targetDayKey] && all[targetDayKey][key]){
                delete all[targetDayKey][key];
                NX.store.set('timeless', all);
              }
              renderPage(view);
              NX.toastOk('Removed', `Excluded ${key} from log.`);
          } }
        ]);
      };
    });
  }
  NX._tlRenderApps = ()=>renderApps(page);

  function bumpReclass(key){
    const all = NX.store.get('timeless', {});
    const d = all[U.todayKey()];
    if(d && d[key]){ d[key].cat = tracker.catFor(key, d[key].name); NX.store.set('timeless', all); }
  }

  function setCat(key, cat){
    tracker.lockCat(key, cat);                       // lock survives restarts & live ticks
    const all = NX.store.get('timeless', {});
    [0,1].forEach(off=>{
      const d = all[U.todayKey(new Date(Date.now()-off*86400e3))];
      if(d && d[key]) d[key].cat = cat;
    });
    NX.store.set('timeless', all);
    renderApps(page); renderFilters();
    NX.sfx.play('pop');
    NX.toastOk('Saved', `“${key}” now counts as ${CATS[cat].l} — every day, not just today.`);
  }

  function linkToTask(key, sec){
    const open = NX.store.get('tasks', []).filter(t=>!t.done);
    if(!open.length){ NX.toastInfo('No open tasks', 'Add a task first, then link time to it.'); return; }
    const body = h(`<div class="field"><label>Link ${U.fmtTime(sec)} of “${U.esc(key)}” to…</label>
      <select class="select">${open.map(t=>`<option value="${t.id}">${U.esc(t.name)}</option>`).join('')}</select></div>`);
    NX.modal({ title:'Link time to task', icon:'clock', body, footer:[
      { label:'Cancel', cls:'btn-soft' },
      { label:'Link', cls:'btn-green', onClick:()=>{
          const sel = q('select', body).value;
          const sess = NX.store.get('sessions', []);
          sess.push({ id:U.uid('se'), date:U.todayKey(), app:key, cat:dayData(currentDay)[key].cat, sec, taskId:sel, ts:Date.now() });
          NX.store.set('sessions', sess);
          NX.closeAllModals(); NX.toastOk('Linked', 'Open Tasks to see linked time');
        } }
    ]});
  }

  function renderRules(){
    const host = q('#tl-rules', page); if(!host) return;
    const rules = NX.store.get('rules', []);
    host.innerHTML = rules.slice(0, 12).map((r,i)=>`
      <div class="rule-row">
        <code class="small bold" style="min-width:110px">${U.esc(r.match)}</code>
        <span class="pill ${CATS[r.cat].pill}">${CATS[r.cat].l}</span>
        <span style="flex:1"></span>
        <button class="icon-btn sm" data-del="${i}" style="color:var(--ink-3)">${icon('trash')}</button>
      </div>`).join('') || '<div class="faint small" style="padding:6px 0">No rules yet — defaults are preloaded.</div>';
    qa('[data-del]', host).forEach(b=>b.onclick = ()=>{
      const rules2 = NX.store.get('rules', []); rules2.splice(+b.dataset.del,1); NX.store.set('rules', rules2); renderRules();
    });
  }

  q('#tl-rule-add', page).onclick = ()=>{
    const body = h(`<div>
      <div class="field" style="margin-bottom:10px">
        <label>Match (app or site name contains…)</label>
        <input class="input" id="nr-match" placeholder="e.g. figma, github, youtube">
        <div id="nr-preview" class="small faint" style="margin-top:6px;min-height:18px"></div>
      </div>
      <div class="field"><label>Counts as</label><select class="select" id="nr-cat">
        <option value="prod">Productive</option><option value="neut">Neutral</option><option value="distr">Distraction</option></select></div>
    </div>`);
    const matchInput = q('#nr-match', body);
    const prevEl = q('#nr-preview', body);
    matchInput.oninput = ()=>{
      const val = matchInput.value.trim().toLowerCase();
      if(!val){ prevEl.textContent = ''; return; }
      const currentApps = Object.keys(dayData(0)).concat(Object.keys(dayData(1)));
      const matches = Array.from(new Set(currentApps)).filter(k => k !== '__hours' && k.includes(val));
      if(matches.length){
        prevEl.innerHTML = `<span style="color:var(--green);font-weight:600">✓ Matches active: ${matches.slice(0, 4).map(m=>U.esc(m)).join(', ')}${matches.length > 4 ? ` (+${matches.length - 4} more)` : ''}</span>`;
      } else {
        prevEl.textContent = 'Will apply automatically once launched.';
      }
    };
    NX.modal({ title:'New rule', icon:'filter', body, footer:[
      { label:'Cancel', cls:'btn-soft' },
      { label:'Save rule', cls:'btn-green', onClick:()=>{
          const m = q('#nr-match', body).value.trim(); if(!m) return;
          tracker.addRule(m, q('#nr-cat', body).value);
          NX.closeAllModals(); renderRules(); NX.toastOk('Rule saved', m);
        } }
    ]});
  };

  q('#tl-goal-edit', page).onclick = ()=>{
    const s2 = NX.store.get('settings', {});
    const body = h(`<div>
      <div class="field" style="margin-bottom:10px"><label>Daily focus goal (minutes)</label><input class="input" id="fg" type="number" min="30" max="900" value="${s2.focusGoalMin||240}"></div>
      <div class="field"><label>Daily distraction limit (minutes)</label><input class="input" id="dg" type="number" min="15" max="600" value="${s2.distractionLimitMin||120}"></div>
    </div>`);
    NX.modal({ title:'Adjust goals', icon:'target', body, footer:[
      { label:'Cancel', cls:'btn-soft' },
      { label:'Save', cls:'btn-green', onClick:()=>{
          s2.focusGoalMin = U.clamp(+q('#fg', body).value||240, 30, 900);
          s2.distractionLimitMin = U.clamp(+q('#dg', body).value||120, 15, 600);
          NX.store.set('settings', s2); NX.closeAllModals(); renderPage(view);
        } }
    ]});
  };

  /* 24-hour visual activity timeline */
  function renderHours(){
    const host = q('#tl-hours', page); if(!host) return;
    const slots = dayData(currentDay).__hours || {};
    const cols = [];
    for(let hh=0; hh<24; hh++){
      cols.push({ h: hh, v: slots[hh] || 0 });
    }
    const max = Math.max(120, ...cols.map(c=>c.v));
    const nowHour = new Date().getHours();
    host.className = 'tl-hours-24';
    host.innerHTML = cols.map(c=>{
      const pct = Math.max(c.v > 0 ? 8 : 3, Math.round(c.v / max * 100));
      const isCurrent = currentDay === 0 && c.h === nowHour;
      const bg = c.v > 0 ? (c.v >= 1800 ? 'var(--green)' : 'linear-gradient(to top, var(--green-soft), var(--green))') : 'var(--surface-3)';
      const timeStr = String(c.h).padStart(2,'0') + ':00';
      const label = (c.h % 4 === 0 || c.h === 23) ? timeStr : '';
      return `<div class="tl-hour-col">
        <div class="tl-hour-bar" data-tip="${timeStr} — ${U.fmtTime(c.v)}${isCurrent ? ' (current hour)' : ''}"
             style="height:${pct}%;background:${bg};opacity:${c.v>0?1:0.35}"></div>
        <div class="tl-hour-label">${label}</div>
      </div>`;
    }).join('');
  }

  /* 7-day stacked trend graph (pure CSS bars, no deps) */
  function renderTrend(){
    const host = q('#tl-trend', page); if(!host) return;
    const series = weekSeries();
    const max = Math.max(300, ...series.map(d=>d.total));
    host.innerHTML = `
      <div style="display:flex;align-items:flex-end;gap:10px;height:150px;padding:4px 2px 0">
        ${series.map(d=>{
          const hP = Math.max(d.total? 3:2, d.total/max*100);
          const pPct = d.total? Math.round(d.prod/d.total*100):0;
          return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">
            <div class="tl-trend-bar" data-tip="${d.label} · ${U.fmtTime(d.total)} tracked · ${pPct}% focus"
              style="width:70%;max-width:44px;height:${hP}%;border-radius:8px 8px 4px 4px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;background:var(--surface-3);min-height:4px">
              <i style="display:block;height:${d.total?Math.round(d.prod/d.total*100):0}%;background:var(--green)"></i>
              <i style="display:block;height:${d.total?Math.round(d.neut/d.total*100):0}%;background:var(--yellow)"></i>
              <i style="display:block;height:${d.total?Math.round(d.distr/d.total*100):0}%;background:var(--red)"></i>
            </div>
            <span class="faint tiny" style="font-weight:600">${U.esc(d.label)}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="tl-cat-legend" style="margin-top:10px;justify-content:center">
        <span class="lg"><i class="cat-prod"></i> Focus</span>
        <span class="lg"><i class="cat-neut"></i> Neutral</span>
        <span class="lg"><i class="cat-distr"></i> Distraction</span>
      </div>`;
  }

  /* category donut for today */
  function renderDonut(){
    const host = q('#tl-donut', page); if(!host) return;
    const t = totals();
    const total = t.total;
    if(!total){
      host.innerHTML = `<div class="faint small">No tracked time yet today — it fills in live as you switch apps.</div>`;
      return;
    }
    const R = 52, C = 2*Math.PI*R;
    const segs = [
      { v:t.prod, color:'var(--green)', l:'Productive' },
      { v:t.neut, color:'var(--yellow)', l:'Neutral' },
      { v:t.distr, color:'var(--red)', l:'Distraction' }
    ];
    let acc = 0;
    const circles = segs.map(s=>{
      const frac = s.v/total;
      const dash = `${(frac*C).toFixed(1)} ${(C-frac*C).toFixed(1)}`;
      const off = (-acc*C).toFixed(1);
      acc += frac;
      return frac > 0 ? `<circle cx="65" cy="65" r="${R}" fill="none" stroke="${s.color}" stroke-width="15" stroke-dasharray="${dash}" stroke-dashoffset="${off}" stroke-linecap="butt" transform="rotate(-90 65 65)"/>` : '';
    }).join('');
    host.innerHTML = `
      <svg width="130" height="130" viewBox="0 0 130 130" style="flex:none">
        <circle cx="65" cy="65" r="${R}" fill="none" stroke="var(--surface-3)" stroke-width="15"/>
        ${circles}
        <text x="65" y="61" text-anchor="middle" style="font-size:20px;font-weight:800;fill:var(--ink)">${Math.round(t.prod/total*100)}%</text>
        <text x="65" y="78" text-anchor="middle" style="font-size:9px;font-weight:600;fill:var(--ink-3)">FOCUS</text>
      </svg>
      <div style="display:flex;flex-direction:column;gap:8px;min-width:120px">
        ${segs.map(s=>`<div class="row small bold" style="gap:8px;margin:0"><i style="width:10px;height:10px;border-radius:3px;background:${s.color};flex:none"></i><span>${s.l}</span><b style="margin-left:auto">${U.fmtTime(s.v)}</b></div>`).join('')}
      </div>`;
  }

  function renderPomo(view2){
    const box = q('#pomo-box', page); if(!box) return;
    const st = pomo.st;
    q('#pomo-state-sub', page).textContent = st ? (st.mode==='focus'?'Deep work round':'Break time') : '25 / 5 classic — press start';
    box.innerHTML = `
      <div class="pomo-clock">${U.fmtClock(st ? st.left : (NX.store.get('pomo',{}).len||25)*60)}</div>
      <div class="pomo-state">${st ? (st.running ? st.mode : 'paused') : 'ready'}</div>
      <div class="row gap-8">
        ${st? `<button class="btn btn-soft" id="pomo-pause">${icon(st.running?'pause':'play')} ${st.running?'Pause':'Resume'}</button>
               <button class="btn btn-soft" id="pomo-reset">Reset</button>`
             : `<button class="btn btn-green" id="pomo-start">${icon('play')} Start focus</button>`}
      </div>
      <div class="faint tiny">${NX.store.get('pomoStats',{done:0}).done} rounds completed all-time</div>`;
    const b1 = q('#pomo-start', box) || q('#pomo-pause', box);
    if(b1) b1.onclick = ()=> st ? pomo.pause() : pomo.start();
    const b2 = q('#pomo-reset', box);
    if(b2) b2.onclick = ()=>pomo.reset();
  }
  NX._tlRenderPomo = ()=>renderPomo(page);

  renderFilters(); renderApps(page); renderTrend(); renderHours(); renderDonut(); renderRules(); renderPomo(page);
}
})(window.NX);
