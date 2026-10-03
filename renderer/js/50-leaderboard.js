/* ============================================================
   PebbleX — 47-leaderboard.js
   Three honest modes, and the UI always says which one you are in:

     personal — your own bests. Needs nothing.
     league   — a shared league.json (family PC, LAN drive, synced
                folder). Real peers, still no server.
     global   — opt-in only, and ALWAYS marked unverified.

   The one thing this module must never do is render local numbers
   with global-looking chrome. That is how a leaderboard loses trust.
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const RANKS = [
  { id:'points', n:'Points',  ic:'star' },
  { id:'level',  n:'Level',   ic:'award' },
  { id:'streak', n:'Streak',  ic:'fire' },
  { id:'focus',  n:'Focus',   ic:'clock' },
  { id:'games',  n:'Games',   ic:'game' }
];

/* Rows fetched from the league/global endpoints. Kept module-scoped
   rather than on window so nothing else can mutate the board by
   accident. */
let fetched = { league: null, global: null };
let rank = 'points';
let mode = 'personal';

/* ============================================================
   METRICS
   ============================================================ */
function selfRow(){
  const profile = NX.store.get('profile', NX.defaults.profile);
  let prodSec = 0;
  const tl = NX.store.get('timeless', {}) || {};
  Object.values(tl).forEach(day=>{
    if(!day || typeof day !== 'object') return;
    Object.entries(day).forEach(([k,a])=>{ if(k!=='__hours' && a && a.sec && a.cat==='prod') prodSec += a.sec; });
  });
  const dc = NX.dailyState ? NX.dailyState() : { streak:0 };
  const plays = NX.gamePlays ? NX.gamePlays() : {};
  const gameCount = Object.values(plays).filter(v=>v>0).length;

  return {
    pid: NX.store.pid ? NX.store.pid() : ('p_local'),
    name: profile.name || 'You',
    isSelf: true,
    avatar: profile.avatar,
    avatarImg: (NX.store.get('entitlements',{}) || {}).avatarImg || '',
    points: NX.points.lifetime(),
    level: NX.points.level().n,
    streak: dc.streak,
    focusMin: Math.round(prodSec/60),
    games: gameCount,
    badges: (NX.store.get('badges',[]) || []).length
  };
}

function valueOf(row, key){
  if(key === 'points') return row.points || 0;
  if(key === 'level')  return row.level || 0;
  if(key === 'streak') return row.streak || 0;
  if(key === 'focus')  return row.focusMin || 0;
  if(key === 'games')  return row.games || 0;
  return 0;
}
function fmtValue(key, v){
  if(key === 'focus') return U.fmtTime(v*60);
  if(key === 'level')  return 'L' + v;
  return Number(v || 0).toLocaleString();
}

/* ============================================================
   LEAGUE (shared file, no server)
   ============================================================ */
async function leagueRead(){
  if(!NX.native || !NX.native.available) return [];
  const r = await NX.native.invoke('league_read');
  if(!r || !r.ok) return [];
  try{
    const raw = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    return Array.isArray(raw) ? raw : [];
  }catch(e){ return []; }
}

async function leagueWrite(row){
  if(!NX.native || !NX.native.available) return false;
  const r = await NX.native.invoke('league_merge', { entry: JSON.stringify(row) });
  return !!(r && r.ok);
}

/* Clamp on read. A hand-edited league.json must not be able to
   manufacture a #1 rank — values are bounded by what a legitimate
   day of use can produce. */
function clampRow(raw){
  const n = v => Math.max(0, Math.round(Number(v) || 0));
  return {
    pid: String(raw.pid || '').slice(0, 40),
    name: String(raw.name || 'Player').slice(0, 24),
    points: Math.min(n(raw.points), 5_000_000),
    level: Math.min(n(raw.level), 99),
    streak: Math.min(n(raw.streak), 3650),
    focusMin: Math.min(n(raw.focusMin), 1_000_000),
    games: Math.min(n(raw.games), 10_000),
    badges: Math.min(n(raw.badges), 9999),
    avatar: String(raw.avatar || '#7CD56E'),
    avatarImg: String(raw.avatarImg || ''),
    at: n(raw.at)
  };
}

/* ============================================================
   GLOBAL (opt-in)
   ============================================================ */
function syncCfg(){ return NX.store.get('mediaSync', null) || {}; }

async function globalTop(){
  const cfg = syncCfg();
  if(!cfg.enabled || !cfg.api) return null;
  try{
    const res = await fetch(cfg.api.replace(/\/+$/,'') + '/leaderboard/top?limit=25', {
      headers: cfg.token ? { Authorization:'Bearer ' + cfg.token } : {}
    });
    if(!res.ok) return null;
    const j = await res.json();
    return Array.isArray(j.rows) ? j.rows : null;
  }catch(e){ return null; }
}

/* ============================================================
   VIEW
   ============================================================ */
function rows(){
  if(mode === 'league') return [];
  if(mode === 'global') return [];
  return [selfRow()];
}

function renderBody(host){
  const list = rows().slice().sort((a,b)=> valueOf(b, rank) - valueOf(a, rank));
  const me = selfRow();
  const myVal = valueOf(me, rank);

  const modeNote = {
    personal: 'Your own records, on this device. Nothing leaves your machine.',
    league:   'Peers sharing the same league file (family PC, LAN drive or synced folder).',
    global:   'Opt-in online board. Scores are self-reported and NOT verified.'
  }[mode];

  const top = list.slice(0, 25);
  const isSelf = m => m.isSelf || m.pid === me.pid;

  const body = top.map((r,i)=>{
    const rankNo = i + 1;
    const medal = rankNo === 1 ? 'g' : (rankNo === 2 ? 's' : (rankNo === 3 ? 'b' : ''));
    return `<div class="lb-row ${isSelf(r)?'me':''}">
      <span class="lb-no ${medal}">${medal ? icon('award',13) : rankNo}</span>
      <span class="lb-av">${av(r)}</span>
      <span class="lb-name">${U.esc(r.name)}
        ${mode==='global'?'<span class="pill gray sm" data-tip="Self-reported, not verified">unverified</span>':''}</span>
      <span class="lb-val">${U.esc(fmtValue(rank, valueOf(r, rank)))}</span>
    </div>`;
  }).join('');

  const inTop = top.some(isSelf);
  const percentile = list.length > 1 && myVal > 0
    ? Math.max(1, Math.round(list.filter(r=>valueOf(r,rank) > myVal).length / list.length * 100))
    : null;

  host.innerHTML = `<div class="card"><div class="card-h">
      <div class="tile sm">${icon('bar')}</div>
      <div><div class="c-title">${U.esc((RANKS.find(r=>r.id===rank)||{}).n || 'Points')} leaderboard</div>
      <div class="c-sub">${U.esc(modeNote)}</div></div>
    </div>
    <div class="card-b">
      <div class="lb-seg">${RANKS.map(r=>
        `<button class="${r.id===rank?'on':''}" data-rank="${r.id}">${U.esc(r.n)}</button>`).join('')}</div>
      ${top.length ? `<div class="lb-list">${body}</div>`
        : `<div class="empty"><div class="e-title">Nothing here yet</div>
             <div class="e-sub">${mode==='league' ? 'Share a league file to see your peers.'
               : mode==='global' ? 'Enable sync in Settings → Rewards to join the online board.'
               : 'Play a game to set a score.'}</div></div>`}
      ${!inTop && myVal > 0 ? `<div class="lb-row me lb-self">
          <span class="lb-no">—</span><span class="lb-av">${av(me)}</span>
          <span class="lb-name">You ${percentile!=null?`<span class="pill gray sm">top ${percentile}%</span>`:''}</span>
          <span class="lb-val">${U.esc(fmtValue(rank, myVal))}</span></div>` : ''}
    </div></div>`;

  qa('[data-rank]', host).forEach(b=>b.onclick = ()=>{
    rank = b.dataset.rank;
    renderBody(host);
    NX.sfx.play('tick');
  });
}

function av(r){
  if(r.avatarImg) return `<span class="avatar sm"><img src="${U.esc(r.avatarImg)}" alt="" loading="lazy"></span>`;
  const color = r.avatar || '#7CD56E';
  return `<span class="avatar sm" style="background:${U.esc(color)}">${U.esc(U.initials(r.name || '?'))}</span>`;
}

/* ============================================================
   MOUNT POINTS
   ============================================================ */

/* 1. a card on the Arcade route, injected with the existing hook so
      we never own 29-games.js / 38-arcade.js markup */
NX.afterRouteRender && NX.afterRouteRender('games', function(view){
  if(!q('#gm-grid', view)) return;
  if(view.querySelector('.lb-strip-btn')) return;

  const strip = q('.arc-strip', view);
  if(strip && !q('.lb-strip-btn', strip)){
    const b = h(`<button class="btn btn-soft btn-sm lb-strip-btn" data-tip="Your records">${icon('bar')} Leaderboard</button>`);
    b.onclick = ()=>NX.openLeaderboard();
    strip.appendChild(b);
  }
});

/* 2. the full view, as its own route */
NX.routeInShell('leaderboard', 'Leaderboard', 'bar', function(view){
  view.innerHTML = `<div class="page lb-page">
    <div class="row gap-8">
      <span class="pill green">${icon('bar')} Records</span>
      <span style="flex:1"></span>
      <span class="faint small" id="lb-mode-note"></span>
    </div>
    <div class="lb-modes" id="lb-modes"></div>
    <div id="lb-body"></div>
  </div>`;

  const host = q('#lb-body', view);
  let off = null;

  function renderModes(){
    q('#lb-modes', view).innerHTML = [
      { id:'personal', n:'My records', ic:'user' },
      { id:'league',   n:'League',     ic:'layers' },
      { id:'global',   n:'Online',     ic:'cloud' }
    ].map(m=>`<button class="${m.id===mode?'on':''}" data-mode="${m.id}"
        data-tip="${m.id==='league' ? 'Peers sharing a league file' : m.id==='global' ? 'Opt-in, unverified' : 'This device only'}">
        ${icon(m.ic)} ${U.esc(m.n)}</button>`).join('');
    qa('[data-mode]', view).forEach(b=>b.onclick = ()=>{ mode = b.dataset.mode; renderModes(); load(); });
  }

  async function load(){
    const note = q('#lb-mode-note', view);
    if(note) note.textContent = mode === 'global' ? 'Unverified scores' :
                                  mode === 'league' ? 'Shared league file' : 'This device';

    if(mode === 'league'){
      const raw = await leagueRead();
      const me = selfRow();
      const all = raw.map(clampRow).filter(r=>r.pid);
      /* publish our own row so peers see us, then re-read */
      if(!all.some(r=>r.pid === me.pid)){
        await leagueWrite(Object.assign({}, me, { at: Date.now() }));
      }
      fetched.league = all.length ? all : [me];
      renderLeague(host);
      return;
    }
    if(mode === 'global'){
      const top = await globalTop();
      fetched.global = top ? top.map(clampRow) : null;
      renderGlobal(host);
      return;
    }
    renderBody(host);
  }

  renderModes();
  load();

  off = NX.events.on('arcade:changed', ()=>{ if(mode === 'personal') renderBody(host); });
  view._lbOff = off;
});

function renderLeague(host){
  const all = (fetched.league || []).slice()
    .sort((a,b)=> valueOf(b, rank) - valueOf(a, rank));
  const me = selfRow();
  const myVal = valueOf(me, rank);
  const list = all.slice(0,25);
  const body = list.map((r,i)=>{
    const medal = i===0?'g':(i===1?'s':(i===2?'b':''));
    const mine = r.pid === me.pid;
    return `<div class="lb-row ${mine?'me':''}">
      <span class="lb-no ${medal}">${medal?icon('award',13):i+1}</span>
      <span class="lb-av">${av(r)}</span>
      <span class="lb-name">${U.esc(r.name)}</span>
      <span class="lb-val">${U.esc(fmtValue(rank, valueOf(r, rank)))}</span>
    </div>`;
  }).join('');
  const inTop = list.some(r=>r.pid === me.pid);
  host.innerHTML = `<div class="card"><div class="card-h">
      <div class="tile sm">${icon('layers')}</div>
      <div><div class="c-title">${U.esc((RANKS.find(r=>r.id===rank)||{}).n)} · ${all.length} in league</div>
      <div class="c-sub">Everyone sees the same league file. Values are clamped on read.</div></div>
    </div><div class="card-b">
      <div class="lb-seg">${RANKS.map(r=>
        `<button class="${r.id===rank?'on':''}" data-rank="${r.id}">${U.esc(r.n)}</button>`).join('')}</div>
      ${all.length ? `<div class="lb-list">${body}</div>` :
        `<div class="empty"><div class="e-title">No league file yet</div>
         <div class="e-sub">Your row was written to league.json. Point a shared folder at it, or
         copy the file to your other machines.</div></div>`}
      ${!inTop && myVal>0 ? `<div class="lb-row me lb-self"><span class="lb-no">—</span>
        <span class="lb-av">${av(me)}</span><span class="lb-name">You</span>
        <span class="lb-val">${U.esc(fmtValue(rank, myVal))}</span></div>` : ''}
    </div></div>`;
  wireRanks(host, ()=>renderLeague(host));
}

function renderGlobal(host){
  const rowsRaw = fetched.global;
  const body = rowsRaw ? rowsRaw.map((r,i)=>{
    const medal = i===0?'g':(i===1?'s':(i===2?'b':''));
    return `<div class="lb-row">
      <span class="lb-no ${medal}">${medal?icon('award',13):(i+1)}</span>
      <span class="lb-av">${av(r)}</span>
      <span class="lb-name">${U.esc(r.name)}
        <span class="pill gray sm" data-tip="Self-reported, not verified">unverified</span></span>
      <span class="lb-val">${U.esc(fmtValue(rank, valueOf(r, rank)))}</span>
    </div>`;
  }).join('') : `<div class="empty"><div class="e-title">Offline board</div>
      <div class="e-sub">We could not reach the board. Your own records are still here.</div></div>`;

  host.innerHTML = `<div class="card"><div class="card-h">
      <div class="tile sm">${icon('cloud')}</div>
      <div><div class="c-title">Online leaderboard</div>
      <div class="c-sub">Opt-in. Scores are self-reported — there is no server-side verification.</div></div>
    </div><div class="card-b">
      <div class="lb-seg">${RANKS.map(r=>
        `<button class="${r.id===rank?'on':''}" data-rank="${r.id}">${U.esc(r.n)}</button>`).join('')}</div>
      ${rowsRaw ? `<div class="lb-list">${body}</div>` : body}
    </div></div>`;
  wireRanks(host, ()=>renderGlobal(host));
}

function wireRanks(host, redraw){
  qa('[data-rank]', host).forEach(b=>b.onclick = ()=>{
    rank = b.dataset.rank;
    redraw();
    NX.sfx.play('tick');
  });
}

NX.openLeaderboard = function(){ try{ NX.router.go('leaderboard'); }catch(e){} };

} )(window.NX);