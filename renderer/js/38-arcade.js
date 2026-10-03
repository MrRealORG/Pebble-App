/* ============================================================
   PebbleX v0.1 — 16-arcade.js
   Arcade layer, added on top of 29-games.js:
     · 3 new games     — expert Minesweeper, timed 2048, Wordle
     · daily challenge — one seeded puzzle per day, shared streak
     · achievements    — badges with live progress + unlock toasts
     · stats screen    — playtime, plays, personal bests
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const games = ()=> NX.GAMES || [];

/* ============================================================
   PLAYTIME + PLAYS
   ============================================================ */
function plays(){ const p = NX.store.get('gamePlays', {}); return p && typeof p === 'object' ? p : {}; }
NX.recordPlay = function(id){
  const p = plays();
  p[id] = (p[id] || 0) + 1;
  NX.store.set('gamePlays', p);
  NX.events.emit('arcade:changed');
};
NX.gamePlays = plays;

/* ============================================================
   DAILY CHALLENGE
   One puzzle per day, seeded from the date, so everybody gets the
   same one. Progress and streak live in the workspace.
   ============================================================ */
const DAILY_WORDS = [
  'PEBBLE','FOCUS','CALM','RIVER','STUDIO','GARDEN','MARKET','WINTER','BRIDGE','PLANET',
  'SILENCE','COFFEE','ORBIT','CANDLE','HARVEST','MEADOW','QUARTZ','RIPPLE','SUMMIT','LOTION',
  'BREEZE','CLOUD','DRIFT','EMBER','FABLE','GLINT','HAVEN','LUNAR','MAPLE','NOBLE',
  'ONYX','PRISM','QUEST','SHALE','TULIP','VIGIL','WHEAT','YIELD','ZEBRA','IVORY'
].filter(w => w.length === 5);
function daySeed(){
  const d = new Date();
  return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
}
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function dailyPuzzle(){
  const rnd = mulberry32(daySeed());
  const word = DAILY_WORDS[Math.floor(rnd()*DAILY_WORDS.length)];
  return { word, tries: 6, seed: daySeed(), key: U.todayKey() };
}
NX.dailyPuzzle = dailyPuzzle;
NX.dailyState = function(){
  const d = NX.store.get('dailyChallenge', {}) || {};
  const cur = dailyPuzzle();
  const playedToday = d.lastPlayed === cur.key;
  const solvedToday = d.lastSolved === cur.key;   /* derived, never sticky */
  /* streak counts back from today across the history log */
  const hist = Array.isArray(d.history) ? d.history : [];
  let streak = 0;
  for(let i=0;i<400;i++){
    const key = U.todayKey(new Date(Date.now() - i*86400e3));
    const row = hist.find(h => h.day === key);
    if(!row) break;
    if(!row.solved) break;
    streak++;
  }
  return {
    puzzle: cur,
    playedToday,
    solved: solvedToday,
    tries: playedToday ? (d.tries || 0) : 0,
    streak,
    best: d.best || 0,
    history: hist
  };
};
function recordDaily(solved, tries){
  const d = NX.store.get('dailyChallenge', {}) || {};
  const cur = dailyPuzzle();
  const hist = Array.isArray(d.history) ? d.history : [];
  if(d.lastPlayed !== cur.key){
    /* first attempt today — log it once, then only the outcome changes */
    hist.push({ day:cur.key, solved: !!solved });
    if(hist.length > 200) hist.splice(0, hist.length-200);
  } else {
    const row = hist.find(h => h.day === cur.key);
    if(row) row.solved = row.solved || !!solved;
  }
  d.history = hist;
  d.lastPlayed = cur.key;
  d.tries = tries;
  if(solved){
    d.lastSolved = cur.key;
    const st = NX.dailyState();
    d.best = Math.max(d.best || 0, st.streak);
  } else if(d.lastSolved !== cur.key){
    delete d.lastSolved;
  }
  NX.store.set('dailyChallenge', d);
  NX.events.emit('arcade:changed');
}

/* ============================================================
   ACHIEVEMENTS
   ============================================================ */
const BADGES = [
  { id:'first_win', ic:'star',     t:'First blood',     d:'Win any game for the first time',        goal:1,    metric:'wins' },
  { id:'ten_wins',  ic:'award',    t:'Warmed up',       d:'Win 10 games',                            goal:10,   metric:'wins' },
  { id:'fifty_wins',ic:'trophy',   t:'Arcade regular',  d:'Win 50 games',                            goal:50,   metric:'wins' },
  { id:'speed_demon',ic:'zap',     t:'Under 200 ms',    d:'Beat the reaction test below 200 ms',     goal:1,    metric:'react200' },
  { id:'typist',    ic:'keyboard', t:'60 WPM club',     d:'Hit 60 WPM in Typing Speed',              goal:60,   metric:'typewpm' },
  { id:'wpm100',    ic:'rocket',   t:'100 WPM club',    d:'Hit 100 WPM in Typing Speed',             goal:100,  metric:'typewpm' },
  { id:'mind',      ic:'brain',    t:'Sudoku solved',   d:'Finish any Sudoku puzzle',                goal:1,    metric:'sudoku' },
  { id:'brainiac',  ic:'brain',    t:'Sudoku veteran',  d:'Finish 10 Sudoku puzzles',                goal:10,   metric:'sudoku' },
  { id:'miner',     ic:'bug',      t:'Bomb squad',      d:'Clear Minesweeper 3 times',              goal:3,    metric:'minewins' },
  { id:'streak3',   ic:'fire',     t:'Three in a row',  d:'3-day daily challenge streak',            goal:3,    metric:'dailyStreak' },
  { id:'streak7',   ic:'fire',     t:'Week of calm',    d:'7-day daily challenge streak',            goal:7,    metric:'dailyStreak' },
  { id:'streak30',  ic:'sun',      t:'Habit formed',    d:'30-day daily challenge streak',           goal:30,   metric:'dailyStreak' },
  { id:'marathon',  ic:'timer',    t:'Marathon',        d:'Log 100 focus rounds',                    goal:100,  metric:'rounds' },
  { id:'deep_work', ic:'gauge',    t:'Deep worker',     d:'Log 10 hours of tracked focus time',      goal:600,  metric:'focusMin' },
  { id:'collector', ic:'layers',   t:'Collector',       d:'Play every game at least once',           goal:games().length, metric:'coverage' },
  { id:'marathoner',ic:'activity', t:'Hour of play',    d:'Spend 60 minutes in the Arcade',          goal:3600, metric:'arcadeSec' }
];
NX.BADGES = BADGES;

function metrics(){
  const p = plays();
  const wins = Object.keys(p).filter(k=>NX.gameBest(k) != null).length;
  const tl = NX.store.get('timeless', {}) || {};
  let focusMin = 0;
  Object.values(tl).forEach(d=>{
    if(!d || typeof d !== 'object') return;
    Object.entries(d).forEach(([k,a])=>{ if(k!=='__hours' && a && a.sec && a.cat==='prod') focusMin += a.sec/60; });
  });
  const dc = NX.dailyState();
  const playedIds = Object.keys(p).filter(k=>p[k] > 0);
  const totalSec = Object.values(NX.store.get('gameTime', {}) || {}).reduce((a,b)=>a+(b||0),0);
  return {
    wins,
    coverage: playedIds.length,
    react200: (NX.gameBest('gm_react') != null && 9999 - NX.gameBest('gm_react') < 200) ? 1 : 0,
    typewpm: NX.gameBest('gm_type') || 0,
    sudoku: (NX.store.get('gameWins', {}) || {}).sudoku || 0,
    minewins: (NX.store.get('gameWins', {}) || {}).gm_mine || 0,
    dailyStreak: dc.streak,
    rounds: NX.focusLog ? NX.focusLog.rounds().length : 0,
    focusMin: Math.round(focusMin),
    arcadeSec: totalSec
  };
}
NX.badgeProgress = function(){
  const m = metrics();
  return BADGES.map(b=>{
    const raw = m[b.metric] || 0;
    const have = Math.min(raw, b.goal);
    const pct = Math.min(100, Math.round(have / b.goal * 100));
    return { ...b, have, pct, unlocked: have >= b.goal, raw };
  });
};

/* a daily puzzle today counts as a play */
NX.bumpWin = function(kind){
  const w = NX.store.get('gameWins', {}) || {};
  w[kind] = (w[kind] || 0) + 1;
  NX.store.set('gameWins', w);
  NX.events.emit('arcade:changed');
  NX.checkAchievements();
};
NX.checkAchievements = function(){
  const got = NX.store.get('badges', []) || [];
  let changed = false;
  NX.badgeProgress().forEach(b=>{
    if(b.unlocked && got.indexOf(b.id) === -1){
      got.push(b.id);
      changed = true;
      setTimeout(()=>{
        NX.toastOk('Achievement unlocked', b.t + ' · ' + b.d, { life:6000 });
        NX.confetti(innerWidth/2, 200);
        try{ NX.sfx.play('confetti'); }catch(e){}
      }, 220);
    }
  });
  if(changed) NX.store.set('badges', got);
  return got;
};

/* track arcade time so the Hour-of-play badge can fire */
let arcadeEntered = 0;
NX.events.on('arcade:changed', ()=>{});
function trackArcadeTime(){
  setInterval(()=>{
    if(NX.router.currentName !== 'games') return;
    const t = NX.store.get('gameTime', {}) || {};
    t.total = (t.total || 0) + 5;
    NX.store.set('gameTime', t);
  }, 5000);
}
document.addEventListener('DOMContentLoaded', ()=> setTimeout(trackArcadeTime, 600));

/* ============================================================
   NEW GAMES
   ============================================================ */
function stage(html){
  const host = q('#gm-stage', document);
  if(!host) return null;
  host.innerHTML = `<div class="game-stage anim-in" id="gm-live">${html}</div>`;
  return q('#gm-live', host);
}
function stageEl(){ return q('#gm-live', document); }

/* ---------- Wordle (daily seeded) ---------- */
function wordle(){
  const P = dailyPuzzle();
  const word = P.word;
  const rows = 6, cols = 5;
  let r = 0, c = 0, grid = Array.from({ length:rows }, ()=>Array(cols).fill(''));
  let over = false;
  const feedback = Array.from({ length:rows }, ()=>Array(cols).fill(''));

  stage(`<div class="row gap-10" style="justify-content:center">
      <h2>Daily Word</h2>
      <span class="pill gray">${icon('sun')} Everyone gets this one</span>
      <span class="pill ${NX.dailyState().solved?'green':'gray'}" id="wd-streak">${NX.dailyState().streak} day streak</span>
    </div>
    <div class="wl-board" id="wl-board"></div>
    <div class="wl-keys" id="wl-keys"></div>
    <div class="row gap-8" style="justify-content:center">
      <span class="faint tiny">Type a word, then Enter</span>
      <button class="btn btn-soft btn-sm" id="wd-restart">Clear</button>
    </div>`);

  const board = q('#wl-board', document);
  const keys = q('#wl-keys', document);
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  function paint(){
    board.innerHTML = grid.map((row,ri)=>`<div class="wl-row">${row.map((ch,ci)=>{
      const f = feedback[ri][ci];
      return `<div class="wl-cell ${f} ${ri===r && ci===c && ch ? 'cur' : ''}">${U.esc(ch)}</div>`;
    }).join('')}</div>`).join('');
    keys.innerHTML = ['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].map(line=>`
      <div class="wl-kline">
        ${line==='ZXCVBNM' ? `<button class="wl-key wide" data-k="ENTER">Enter</button>` : ''}
        ${line.split('').map(L=>`<button class="wl-key" data-k="${L}">${L}</button>`).join('')}
        ${line==='ZXCVBNM' ? `<button class="wl-key wide" data-k="BACK">⌫</button>` : ''}
      </div>`).join('');
    qa('.wl-key', keys).forEach(b=>b.onclick = ()=>press(b.dataset.k));
  }
  function score(guess){
    const res = Array(cols).fill('absent');
    const counts = {};
    for(let i=0;i<cols;i++) if(word[i] === guess[i]) res[i] = 'correct'; else counts[word[i]] = (counts[word[i]]||0)+1;
    for(let i=0;i<cols;i++){
      if(res[i] === 'correct') continue;
      if(counts[guess[i]] > 0){ res[i] = 'present'; counts[guess[i]]--; }
    }
    return res;
  }
  function submit(){
    const guess = grid[r].join('');
    if(guess.length < cols) return NX.sfx.play('err');
    const fb = score(guess);
    feedback[r] = fb;
    const win = guess === word;
    r++;
    c = 0;
    if(win || r >= rows){
      over = true;
      recordDaily(win, r);
      if(win){
        NX.bumpWin('gm_wordle');
        NX.setGameBest('gm_daily', Math.max(NX.gameBest('gm_daily')||0, rowCountFor(win, r)));
        NX.confetti();
      }
      stage(`<h2>${win ? 'Solved in ' + r : 'The word was ' + word}</h2>
        <p class="muted">${NX.dailyState().streak} day streak${NX.dailyState().streak > 1 ? ' — best ' + NX.dailyState().best : ''}</p>
        <button class="btn btn-green" id="wd-again">Back to arcade</button>`);
      q('#wd-again', document).onclick = ()=>NX.router.go('games');
      return;
    }
    NX.sfx.play('tick');
    paint();
  }
  function rowCountFor(win, tries){ return win ? tries : 0; }
  function press(k){
    if(over) return;
    if(k === 'ENTER') return submit();
    if(k === 'BACK'){
      if(c > 0){ grid[r][--c] = ''; }
      NX.sfx.play('tick');
      return paint();
    }
    if(c >= cols) return;
    grid[r][c++] = k;
    NX.sfx.play('tick');
    paint();
  }
  function keyH(e){
    if(over) return;
    const k = (e.key || '').toUpperCase();
    if(k === 'ENTER') press('ENTER');
    else if(e.key === 'Backspace') press('BACK');
    else if(/^[A-Z]$/.test(k)) press(k);
  }
  document.addEventListener('keydown', keyH);
  paint();
  setTimeout(()=>{
    const again = q('#wd-restart', document);
    if(again) again.onclick = ()=>{ document.removeEventListener('keydown', keyH); wordle(); };
  }, 40);
  NX.afterRouteRender('games', ()=> document.removeEventListener('keydown', keyH));
}

/* ---------- timed 2048 ---------- */
function timed2048(){
  let grid = Array(16).fill(0), score = 0, left = 60, timer = null, dead = false, running = false;
  const addTile = ()=>{
    const empty = grid.map((v,i)=>v?-1:i).filter(i=>i>=0);
    if(empty.length) grid[empty[Math.floor(Math.random()*empty.length)]] = Math.random()<0.9?2:4;
  };
  addTile(); addTile();
  stage(`<div class="row gap-10" style="justify-content:center">
      <h2>2048 Rush</h2>
      <span class="pill gray" id="t2-score">0</span>
      <span class="pill ${left<=10?'red':'green'}" id="t2-time">60s</span>
      <button class="btn btn-soft btn-sm" id="g-restart">Restart</button>
    </div>
    <div class="g2048-grid" id="t2-grid"></div>
    <p class="faint small">60 seconds on the clock. Arrow keys.</p>`);
  const colors = {2:'v2',4:'v4',8:'v8',16:'v16',32:'v32',64:'v64',128:'v128',256:'v256',512:'v512',1024:'v1024',2048:'v2048'};
  function draw(){
    q('#t2-score', document).textContent = score;
    q('#t2-time', document).textContent = left + 's';
    q('#t2-grid', document).innerHTML = grid.map(v=>`<div class="g2048-cell ${v?colors[v]||'v2048':''} ${v?'pop':''}">${v||''}</div>`).join('');
  }
  function finish(reason){
    clearInterval(timer); dead = true;
    NX.setGameBest('gm_2048r', score);
    NX.bumpWin('gm_2048r');
    stage(`<h2>${score} points</h2>
      <p class="muted">${reason === 'over' ? 'No moves left.' : 'Time.'}${NX.gameBest('gm_2048r') > score ? ' · best ' + NX.gameBest('gm_2048r') : ' — new best 🎉'}</p>
      <button class="btn btn-green" id="t2-again">Again</button>`);
    q('#t2-again', document).onclick = ()=>timed2048();
  }
  function beginClock(){
    if(running || dead) return;
    running = true;
    timer = setInterval(()=>{
      left--;
      draw();
      if(left <= 0) finish('time');
    }, 1000);
  }
  function slide(dir){
    if(dead) return;
    const before = grid.join();
    for(let line=0; line<4; line++){
      let arr = [];
      for(let i=0;i<4;i++){
        arr.push(dir==='l'||dir==='r'
          ? grid[Math.floor(line/4)*4 + (dir==='l'?i:3-i)]
          : grid[(dir==='u'?i:3-i)*4 + line]);
      }
      arr = arr.filter(v=>v);
      for(let i=0;i<arr.length-1;i++) if(arr[i]===arr[i+1]){ arr[i]*=2; score+=arr[i]; arr.splice(i+1,1); }
      while(arr.length<4) arr.push(0);
      for(let i=0;i<4;i++){
        if(dir==='l'||dir==='r') grid[Math.floor(line/4)*4 + (dir==='l'?i:3-i)] = arr[i];
        else grid[(dir==='u'?i:3-i)*4 + line] = arr[i];
      }
    }
    if(grid.join() !== before){
      addTile();
      NX.sfx.play('tick');
      if(grid.includes(2048)) NX.setGameBest('gm_2048', Math.max(score, 2048));
    }
    draw();
    const full = grid.every(v=>v) && ![0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].some(i=>{
      const r = Math.floor(i/4), c = i%4;
      const n = i+1;
      const r2 = Math.floor(n/4), c2 = n%4;
      if(c2 === c+1 && c<3 && grid[r*4+c2] === grid[i]) return true;
      if(r2 === r+1 && r<3 && grid[r2*4+c] === grid[i]) return true;
      return false;
    });
    if(full && running) finish('over');
  }
  const keyH = e=>{
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
      e.preventDefault();
      beginClock();          /* first key starts the clock, even if nothing merges */
      slide({ArrowLeft:'l',ArrowRight:'r',ArrowUp:'u',ArrowDown:'d'}[e.key]);
    }
  };
  document.addEventListener('keydown', keyH);
  q('#g-restart', document).onclick = ()=>{ clearInterval(timer); document.removeEventListener('keydown', keyH); timed2048(); };
  NX.afterRouteRender('games', ()=>{ clearInterval(timer); document.removeEventListener('keydown', keyH); });
  draw();
}

/* ---------- expert minesweeper ---------- */
function minesExpert(){
  const R = 16, C = 16, MINES = 40;
  const NB = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  let grid = [], over = false, flags = 0, secs = 0, timer = null, opened = 0, armed = false;
  const inb = (r,c)=> r>=0 && r<R && c>=0 && c<C;

  function blank(){
    grid = [];
    for(let r=0;r<R;r++){
      const row = [];
      for(let c=0;c<C;c++) row.push({ m:false, n:0, open:false, flag:false });
      grid.push(row);
    }
  }
  function numbers(){
    for(let r=0;r<R;r++) for(let c=0;c<C;c++){
      let n = 0;
      NB.forEach(([dr,dc])=>{ if(inb(r+dr,c+dc) && grid[r+dr][c+dc].m) n++; });
      grid[r][c].n = n;
    }
  }
  /* mines are only placed once the first cell is known, so that cell
     and its neighbours can never be mines — same courtesy as the
     beginner board */
  function build(safeR, safeC){
    blank();
    const banned = [];
    if(safeR != null){
      banned.push(safeR + ',' + safeC);
      NB.forEach(([dr,dc])=>{ if(inb(safeR+dr, safeC+dc)) banned.push((safeR+dr) + ',' + (safeC+dc)); });
    }
    const isBanned = (r,c)=> banned.indexOf(r + ',' + c) > -1;
    let placed = 0, guard = 0;
    while(placed < MINES && guard++ < MINES * 400){
      const r = Math.floor(Math.random()*R), c = Math.floor(Math.random()*C);
      if(grid[r][c].m || isBanned(r,c)) continue;
      grid[r][c].m = true; placed++;
    }
    numbers();
  }
  function start(){ clearInterval(timer); timer = setInterval(()=>{ secs++; paint(); }, 1000); }
  function reveal(r,c){
    if(!armed){ build(r, c); armed = true; }        /* arm on first reveal */
    const cell = grid[r][c];
    if(cell.open || cell.flag || over) return;
    cell.open = true; opened++;
    if(cell.m){ over = true; clearInterval(timer); NX.sfx.play('err'); NX.bumpWin('gm_minex'); paint();
      const msg = q('#mx-msg', document);
      if(msg) msg.innerHTML = `<b>Boom.</b> ${opened} of ${R*C-MINES} cleared in ${secs}s.`;
      return; }
    if(cell.n === 0) NB.forEach(([dr,dc])=>{ if(inb(r+dr,c+dc) && !grid[r+dr][c+dc].open && !grid[r+dr][c+dc].flag) reveal(r+dr,c+dc); });
    if(opened === R*C - MINES){
      over = true; clearInterval(timer);
      NX.recordMin('gm_minex', secs);
      NX.setGameBest('gm_minex_cleared', 1);
      NX.bumpWin('gm_minex');
      NX.confetti();
      const msg = q('#mx-msg', document);
      if(msg) msg.innerHTML = `<b>Cleared in ${secs}s — new expert best 🎉</b>`;
    }
    NX.sfx.play('pop');
    paint();
  }
  function paint(){
    const host = q('#mx-grid', document);
    if(!host) return;
    host.innerHTML = grid.map((row,r)=>row.map((cell,c)=>{
      let cls = 'mine-cell sm';
      if(cell.open) cls += ' open';
      if(cell.m && cell.open) cls += ' boom';
      let inner = '';
      if(cell.open && cell.m) inner = '✱';
      else if(cell.open && cell.n) inner = cell.n;
      else if(cell.flag) inner = '⚑';
      return `<button class="${cls} ${cell.open && cell.n ? 'n'+cell.n : ''}" data-r="${r}" data-c="${c}">${inner}</button>`;
    }).join('')).join('');
    qa('.mine-cell', host).forEach(b=>{
      b.onclick = ()=>{ if(!over){ if(!grid[+b.dataset.r][+b.dataset.c].open) start(); reveal(+b.dataset.r, +b.dataset.c); paint(); } };
      b.oncontextmenu = e=>{ e.preventDefault(); const cell = grid[+b.dataset.r][+b.dataset.c];
        if(cell.open || over) return; cell.flag = !cell.flag; flags += cell.flag?1:-1; NX.sfx.play('tick'); paint(); };
    });
    const f = q('#mx-flags', document);
    if(f) f.textContent = flags + ' / ' + MINES;
    const t = q('#mx-time', document);
    if(t) t.textContent = secs + 's';
  }
  build();
  armed = false;
  stage(`<div class="row gap-8" style="justify-content:center;flex-wrap:wrap">
      <h2>Expert Mines</h2>
      <span class="pill gray" id="mx-flags">0 / ${MINES}</span>
      <span class="pill gray" id="mx-time">0s</span>
      <span class="pill gray">${NX.gameBest('gm_minex')!=null ? 'Best ' + NX.gameBest('gm_minex') + 's' : R+'×'+C+' · '+MINES+' mines'}</span>
      <button class="btn btn-soft btn-sm" id="g-restart">Restart</button>
    </div>
    <div class="mine-grid expert" id="mx-grid"></div>
    <p class="muted" id="mx-msg">Click to reveal · right-click to flag.</p>`);
  q('#g-restart', document).onclick = ()=>{ clearInterval(timer); minesExpert(); };
  NX.afterRouteRender('games', ()=> clearInterval(timer));
  paint();
}

/* ============================================================
   UI — daily card, achievements, stats
   ============================================================ */
function dailyCard(){
  const st = NX.dailyState();
  return `<div class="card" id="arc-daily">
    <div class="card-h">
      <div class="tile">${icon('sun')}</div>
      <div><div class="c-title">Daily challenge</div>
        <div class="c-sub">${st.puzzle.word ? 'Six tries at ' + st.puzzle.word.length + ' letters' : 'one puzzle a day'}</div></div>
      <div class="spacer"></div>
      ${st.streak ? `<span class="pill ${st.streak>=7?'green':'yellow'}">${icon('fire')} ${st.streak} day streak</span>` : ''}
    </div>
    <div class="card-b">
      ${st.solved
        ? `<div class="arc-done">${icon('check')} Solved today${st.best>1 ? ' · best streak ' + st.best : ''}</div>`
        : `<div class="row gap-8" style="justify-content:center">
             <button class="btn btn-green" id="arc-play">${icon('play')} Play today’s word</button>
           </div>`}
      <div class="arc-days">
        ${st.history.slice(-14).map(d=>`<i class="${d.solved?'ok':''}" data-tip="${U.esc(d.day)}"></i>`).join('')}
      </div>
    </div>
  </div>`;
}

function badgesCard(){
  const prog = NX.badgeProgress();
  const got = prog.filter(b=>b.unlocked).length;
  return `<div class="card" id="arc-badges">
    <div class="card-h">
      <div class="tile">${icon('award')}</div>
      <div><div class="c-title">Achievements</div><div class="c-sub">${got} of ${prog.length} unlocked</div></div>
      <div class="spacer"></div>
      <span class="pill green">${Math.round(got/Math.max(1,prog.length)*100)}%</span>
    </div>
    <div class="card-b">
      <div class="arc-badges">
        ${prog.map(b=>`
          <div class="arc-badge ${b.unlocked?'on':''}" data-tip="${U.esc(b.t + ' — ' + b.d)}">
            <span class="arc-badge-ic">${icon(b.ic)}</span>
            <span class="arc-badge-txt">
              <b class="ellipsis">${U.esc(b.t)}</b>
              <i>${b.unlocked ? 'Unlocked' : b.have + ' / ' + b.goal}</i>
              <span class="meter"><i style="width:${b.pct}%"></i></span>
            </span>
          </div>`).join('')}
      </div>
    </div>
  </div>`;
}

function statsCard(){
  const p = plays();
  const t = NX.store.get('gameTime', {}) || {};
  const totalMin = Math.round((t.total || 0)/60);
  const rows = games().map(g=>({
    g, plays: p[g.id] || 0, best: NX.gameBest(g.id)
  })).sort((a,b)=> b.plays - a.plays);
  const m = metrics();
  return `<div class="card" id="arc-stats">
    <div class="card-h">
      <div class="tile">${icon('bar')}</div>
      <div><div class="c-title">Your arcade</div><div class="c-sub">${totalMin} min played · ${m.wins} games with a best</div></div>
      <div class="spacer"></div>
      <button class="btn btn-soft btn-sm" id="arc-reset" data-tip="Clear play history">Reset</button>
    </div>
    <div class="card-b">
      <div class="arc-stats">
        ${rows.map(r=>`
          <div class="arc-stat">
            <span class="arc-stat-ic" style="background:${r.g.color}">${icon(r.g.icon)}</span>
            <span class="arc-stat-txt"><b class="ellipsis">${U.esc(r.g.name)}</b>
              <i>${r.plays ? r.plays + (r.plays===1?' play':' plays') : 'not played'}</i></span>
            <span class="arc-stat-best">${r.best != null ? 'Best ' + r.best : '—'}</span>
          </div>`).join('')}
      </div>
    </div>
  </div>`;
}

NX.afterRouteRender('games', function(view){
  const grid = q('#gm-grid', view);
  if(!grid) return;
  if(view.querySelector('.arc-strip')) return;      /* idempotent per view */

  const strip = h(`<div class="arc-strip">
    <div class="arc-strip-stat">
      <span class="tile sm">${icon('sun')}</span>
      <span><b class="ellipsis" id="arc-streak">0</b><i>day streak</i></span>
    </div>
    <div class="arc-strip-stat">
      <span class="tile sm">${icon('award')}</span>
      <span><b class="ellipsis" id="arc-badges-n">0/0</b><i>achievements</i></span>
    </div>
    <div class="arc-strip-stat">
      <span class="tile sm">${icon('bar')}</span>
      <span><b class="ellipsis" id="arc-time">0m</b><i>in the arcade</i></span>
    </div>
    <div style="flex:1"></div>
    <button class="btn btn-soft btn-sm" id="arc-more">${icon('dots')} Challenges</button>
  </div>`);
  grid.parentNode.insertBefore(strip, grid);

  const panels = h(`<div class="arc-panels">
    ${dailyCard()}
    <div class="arc-col">
      ${badgesCard()}
      ${statsCard()}
    </div>
  </div>`);
  grid.parentNode.insertBefore(panels, q('#gm-stage', view) || null);

  function syncStrip(){
    const prog = NX.badgeProgress();
    const st = NX.dailyState();
    const t = NX.store.get('gameTime', {}) || {};
    const a = q('#arc-streak', strip); if(a) a.textContent = st.streak;
    const b = q('#arc-badges-n', strip); if(b) b.textContent = prog.filter(x=>x.unlocked).length + '/' + prog.length;
    const c = q('#arc-time', strip); if(c) c.textContent = Math.round((t.total||0)/60) + 'm';
  }
  syncStrip();

  const play = q('#arc-play', panels);
  if(play) play.onclick = ()=>{ NX.launchGame('gm_wordle'); };
  const reset = q('#arc-reset', panels);
  if(reset) reset.onclick = ()=>{
    NX.store.set('gamePlays', {});
    NX.store.set('gameTime', {});
    NX.router.go('games');
    NX.toastInfo('Play history cleared', 'Personal bests are kept');
  };
  const more = q('#arc-more', strip);
  if(more) more.onclick = ()=>{
    const el = q('#arc-badges', panels);
    if(el) el.scrollIntoView({ behavior:'smooth', block:'center' });
  };

  const off = NX.events.on('arcade:changed', syncStrip);
  view._arcadeOff = off;
});

/* ============================================================
   REGISTER
   ============================================================ */
NX.GAMES = (NX.GAMES || []).concat([
  { id:'gm_wordle', name:'Daily Word',  icon:'sun',      color:'#7CD56E', desc:'Six guesses, one word, everyone gets the same one today.' },
  { id:'gm_2048r',  name:'2048 Rush',   icon:'grid',     color:'#E8853D', desc:'Sixty seconds. Merge fast, chase the score.' },
  { id:'gm_minex',  name:'Expert Mines',icon:'bug',      color:'#E25C4A', desc:'16×16 with 40 mines. For people who enjoy pressure.' }
]);
/* 29-games.js owns the registry. If this file is ever loaded before it, an
   unguarded call throws and silently takes the extra games AND every badge in
   this module down with it — which is exactly what happened when index.html
   listed this file above 29-games.js. Degrade to a no-op with a loud warning
   instead of destroying the module. */
if(typeof NX.registerGames === 'function'){
  NX.registerGames({ gm_wordle: wordle, gm_2048r: timed2048, gm_minex: minesExpert });
}else{
  console.error('[PebbleX] 38-arcade.js loaded before 29-games.js — extra games not registered');
}

/* badges react to anything that changes arcade state */
NX.events.on('store:gameBest', ()=> NX.checkAchievements());
NX.events.on('focus:log', ()=> NX.checkAchievements());
})(window.NX);
