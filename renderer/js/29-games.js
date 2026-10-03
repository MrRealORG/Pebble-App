/* ============================================================
   Pebble 3.0 — 29-games.js
   Arcade: 6 fully playable mini games
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let gameCleanup = null;

NX.routeInShell('games', 'Arcade', 'game', function(view){
  if(gameCleanup){ try{ gameCleanup(); }catch(e){} gameCleanup = null; }

  view.innerHTML = `
  <div class="page" id="gm-page">
    <div class="row gap-8"><span class="pill green">${icon('game')} ${NX.GAMES.length} games · zero loading</span>
      <span class="faint small">High scores save to your workspace</span></div>
    <div class="games-grid" id="gm-grid"></div>
    <div id="gm-stage"></div>
  </div>`;

  function renderGrid(){
    const grid = q('#gm-grid', view);
    grid.innerHTML = NX.GAMES.map(g=>{
      const best = NX.gameBest(g.id);
      return `<div class="game-card" data-g="${g.id}">
        <div class="g-ic" style="background:${g.color}">${icon(g.icon)}</div>
        <div class="g-name">${U.esc(g.name)}</div>
        <div class="g-desc">${U.esc(g.desc)}</div>
        <div class="g-best">${best!=null? 'Best: '+best : 'Not played yet'}</div>
      </div>`;
    }).join('');
    qa('[data-g]', grid).forEach(c=>c.onclick = ()=>launch(c.dataset.g));
  }

  function stage(html){
    q('#gm-stage', view).innerHTML = `<div class="game-stage anim-in" id="gm-live">${html}</div>`;
  }

  /* ---------- 2048 ---------- */
  function g2048(){
    let grid = Array(16).fill(0), score = 0;
    const addTile = ()=>{
      const empty = grid.map((v,i)=>v?-1:i).filter(i=>i>=0);
      if(empty.length) grid[empty[Math.floor(Math.random()*empty.length)]] = Math.random()<0.9?2:4;
    };
    addTile(); addTile();
    stage(`<div class="row gap-10"><h2>2048 Lite</h2><span class="pill gray" id="g-score">0</span>
        <span style="flex:1"></span><span class="faint small">Arrow keys / buttons</span></div>
      <div class="g2048-grid" id="g-grid"></div>
      <div class="row gap-8">
        <button class="btn btn-soft btn-sm" data-mv="l">←</button><button class="btn btn-soft btn-sm" data-mv="u">↑</button>
        <button class="btn btn-soft btn-sm" data-mv="d">↓</button><button class="btn btn-soft btn-sm" data-mv="r">→</button>
        <button class="btn btn-soft btn-sm" id="g-restart">Restart</button></div>`);
    const colors = {2:'v2',4:'v4',8:'v8',16:'v16',32:'v32',64:'v64',128:'v128',256:'v256',512:'v512',1024:'v1024',2048:'v2048'};
    function draw(){
      q('#g-score', view).textContent = score;
      q('#g-grid', view).innerHTML = grid.map(v=>`<div class="g2048-cell ${v?colors[v]||'v2048':''} ${v?'pop':''}">${v||''}</div>`).join('');
    }
    function slide(dir){
      const before = grid.join();
      const idx = i => dir==='l'? [Math.floor(i/4)*4, 1, 0] : dir==='r'? [Math.floor(i/4)*4+3, -1, 3] : null;
      const get = (r,c)=> dir==='l'||dir==='r' ? grid[r*4+c] : grid[c*4+r];
      const set = (r,c,v)=>{ if(dir==='l'||dir==='r') grid[r*4+c]=v; else grid[c*4+r]=v; };
      for(let line=0; line<4; line++){
        let arr = [];
        for(let i=0;i<4;i++) arr.push(get(line,i));
        arr = arr.filter(v=>v);
        for(let i=0;i<arr.length-1;i++){
          if(arr[i]===arr[i+1]){ arr[i]*=2; score+=arr[i]; arr.splice(i+1,1); }
        }
        while(arr.length<4) arr.push(0);
        for(let i=0;i<4;i++) set(line,i,arr[i]);
      }
      if(grid.join() !== before){ addTile(); NX.sfx.play('tick'); }
      draw();
      if(grid.includes(2048)){ NX.setGameBest('gm_2048', Math.max(score, 2048)); NX.confetti(); }
    }
    const keyH = e=>{
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();
        slide({ArrowLeft:'l',ArrowRight:'r',ArrowUp:'u',ArrowDown:'d'}[e.key]);
      }
    };
    document.addEventListener('keydown', keyH);
    qa('[data-mv]', view).forEach(b=>b.onclick = ()=>slide(b.dataset.mv));
    q('#g-restart', view).onclick = ()=>g2048();
    draw();
    gameCleanup = ()=>document.removeEventListener('keydown', keyH);
  }

  /* ---------- memory ---------- */
  function memory(){
    const icons = ['🌟','🔥','💎','🎈','🍀','⚡','🎯','🧩'];
    let deck = [...icons, ...icons].sort(()=>Math.random()-0.5);
    let up = [], done = 0, moves = 0, lock = false;
    stage(`<div class="row gap-10"><h2>Memory Match</h2><span class="pill gray" id="m-moves">0 moves</span>
      <span style="flex:1"></span><button class="btn btn-soft btn-sm" id="g-restart">Restart</button></div>
      <div class="mem-grid" id="m-grid">${deck.map((c,i)=>`<div class="mem-card" data-i="${i}"></div>`).join('')}</div>`);
    qa('.mem-card', view).forEach(card=>{
      card.onclick = ()=>{
        if(lock || card.classList.contains('up') || card.classList.contains('done')) return;
        card.classList.add('up'); card.textContent = deck[+card.dataset.i];
        up.push(card);
        if(up.length === 2){
          moves++; q('#m-moves', view).textContent = moves + ' moves';
          lock = true;
          if(deck[+up[0].dataset.i] === deck[+up[1].dataset.i]){
            up.forEach(c=>{ c.classList.remove('up'); c.classList.add('done'); c.textContent = deck[+c.dataset.i]; });
            done++; up = []; lock = false;
            NX.sfx.play('pop');
            if(done === icons.length){
              NX.setGameBest('gm_mem', Math.max(1, 100 - moves*2));
              NX.confetti(); NX.sfx.play('confetti');
              stage(`<h2>Cleared in ${moves} moves! 🎉</h2><button class="btn btn-green" onclick="NX.router.go('games')">Back to arcade</button>`);
            }
          } else {
            setTimeout(()=>{ up.forEach(c=>{ c.classList.remove('up'); c.textContent=''; }); up = []; lock = false; }, 650);
            NX.sfx.play('err');
          }
        }
      };
    });
    q('#g-restart', view).onclick = ()=>memory();
    gameCleanup = null;
  }

  /* ---------- reaction ---------- */
  function reaction(){
    let waitT = null, goAt = 0;
    stage(`<h2>Reaction Test</h2>
      <div class="reaction-pad" id="r-pad">Click to start</div>
      <div class="row gap-8"><span class="pill gray" id="r-last">—</span><span class="pill gray" id="r-best">${NX.gameBest('gm_react')?NX.gameBest('gm_react')+' ms best':'no best yet'}</span></div>`);
    const pad = q('#r-pad', view);
    pad.onclick = ()=>{
      if(pad.classList.contains('wait')) return;
      if(pad.classList.contains('go')){
        const ms = Math.round(performance.now() - goAt);
        pad.classList.remove('go'); pad.textContent = ms + ' ms — click to retry';
        q('#r-last', view).textContent = ms + ' ms';
        const best = NX.gameBest('gm_react');
        if(best == null || ms < best){ NX.setGameBest('gm_react', 9999 - ms); NX.toastOk('New record!', ms + ' ms'); }
        q('#r-best', view).textContent = (9999-NX.gameBest('gm_react')) + ' ms best';
        clearTimeout(waitT); NX.sfx.play('ok');
        return;
      }
      pad.classList.add('wait'); pad.textContent = 'Wait for green…';
      waitT = setTimeout(()=>{
        pad.classList.remove('wait'); pad.classList.add('go');
        pad.textContent = 'CLICK!'; goAt = performance.now();
        NX.sfx.play('tick');
      }, 900 + Math.random()*2200);
    };
    gameCleanup = ()=>clearTimeout(waitT);
  }

  /* ---------- snake ---------- */
  function snake(){
    stage(`<h2>Snake</h2><div class="snake-stage"><canvas class="snake-canvas" id="sn-c" width="360" height="360"></canvas></div>
      <div class="row gap-8"><span class="pill gray" id="sn-score">0</span>
      <span class="faint small">Arrow keys · eat the green dots</span>
      <button class="btn btn-soft btn-sm" id="g-restart">Restart</button></div>`);
    const cv = q('#sn-c', view), c = cv.getContext('2d');
    const N = 18, S = 360/N;
    let snakeArr = [{x:9,y:9},{x:8,y:9},{x:7,y:9}], dir = {x:1,y:0}, food = {x:12,y:9}, score = 0, dead = false, loop = null;
    function place(){ do{ food = {x:Math.floor(Math.random()*N), y:Math.floor(Math.random()*N)}; } while(snakeArr.some(s=>s.x===food.x&&s.y===food.y)); }
    function step(){
      if(dead) return;
      const head = { x:(snakeArr[0].x+dir.x+N)%N, y:(snakeArr[0].y+dir.y+N)%N };
      if(snakeArr.some(s=>s.x===head.x&&s.y===head.y)){
        dead = true; clearInterval(loop);
        NX.setGameBest('gm_snake', score);
        c.fillStyle = 'rgba(18,18,18,.72)'; c.fillRect(0,0,360,360);
        c.fillStyle = '#F6F5F3'; c.font = '700 22px Inter, sans-serif'; c.textAlign = 'center';
        c.fillText('Game over — ' + score, 180, 175);
        c.font = '13px Inter, sans-serif'; c.fillText('Press Restart', 180, 200);
        return;
      }
      snakeArr.unshift(head);
      if(head.x===food.x && head.y===food.y){ score += 10; q('#sn-score', view).textContent = score; place(); NX.sfx.play('pop'); }
      else snakeArr.pop();
      c.fillStyle = '#F1F0ED'; c.fillRect(0,0,360,360);
      c.fillStyle = '#7CD56E';
      c.beginPath(); c.arc(food.x*S+S/2, food.y*S+S/2, S/2-3, 0, Math.PI*2); c.fill();
      snakeArr.forEach((s,i)=>{
        c.fillStyle = i===0 ? '#121212' : '#5C5E63';
        c.beginPath(); c.roundRect(s.x*S+1.5, s.y*S+1.5, S-3, S-3, 5); c.fill();
      });
    }
    const keyH = e=>{
      const m = {ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}}[e.key];
      if(m){ e.preventDefault(); if(m.x !== -dir.x || m.y !== -dir.y) dir = m; }
    };
    document.addEventListener('keydown', keyH);
    place(); loop = setInterval(step, 110);
    q('#g-restart', view).onclick = ()=>{ clearInterval(loop); document.removeEventListener('keydown', keyH); snake(); };
    gameCleanup = ()=>{ clearInterval(loop); document.removeEventListener('keydown', keyH); };
  }

  /* ---------- word scramble ---------- */
  const WORDS = ['pebble','focus','widget','rocket','notebook','channel','workspace','keyboard','pixel','morning','coffee','stream','garden','silence','moment'];
  function scramble(){
    let word = U.pick(WORDS), shown = word.split('').sort(()=>Math.random()-0.5).join(''), t = 45, timer = null, solved = 0;
    stage(`<h2>Word Scramble</h2>
      <div class="scramble-word" id="w-word">${shown.toUpperCase()}</div>
      <div class="row gap-8"><input class="input" id="w-in" placeholder="Your guess" style="width:220px">
        <button class="btn btn-green" id="w-go">Guess</button>
        <button class="btn btn-soft btn-sm" id="w-skip">Skip</button>
        <span class="pill gray" id="w-t">45s</span><span class="pill gray" id="w-n">0 solved</span></div>`);
    const inp = q('#w-in', view); inp.focus();
    function next(){
      word = U.pick(WORDS);
      shown = word.split('').sort(()=>Math.random()-0.5).join('');
      q('#w-word', view).textContent = shown.toUpperCase();
      inp.value = ''; inp.focus();
    }
    function check(){
      if(inp.value.trim().toLowerCase() === word){
        solved++; q('#w-n', view).textContent = solved + ' solved';
        NX.sfx.play('ok'); NX.confetti();
        if(solved > (NX.gameBest('gm_word')||0)) NX.setGameBest('gm_word', solved);
        next();
      } else { NX.sfx.play('err'); inp.style.animation = 'nx-shake .4s'; setTimeout(()=>inp.style.animation='',400); }
    }
    q('#w-go', view).onclick = check;
    inp.addEventListener('keydown', e=>{ if(e.key==='Enter') check(); });
    q('#w-skip', view).onclick = next;
    timer = setInterval(()=>{
      t--; q('#w-t', view).textContent = t + 's';
      if(t<=0){ clearInterval(timer); NX.setGameBest('gm_word', Math.max(solved, NX.gameBest('gm_word')||0));
        stage(`<h2>Time!</h2><p class="muted">You solved ${solved} word${solved===1?'':'s'}.</p>
          <button class="btn btn-green" id="w-again">Play again</button>`);
        q('#w-again', view).onclick = ()=>scramble(); }
    }, 1000);
    gameCleanup = ()=>clearInterval(timer);
  }

  /* ---------- clicker ---------- */
  function clicker(){
    let t = 10, clicks = 0, timer = null, playing = false;
    stage(`<h2>Focus Clicker</h2>
      <div class="reaction-pad" id="c-pad" style="border-radius:50%;width:220px;height:220px;background:var(--green);color:#0E2B0A;font-size:42px">🪨</div>
      <div class="row gap-8"><span class="pill gray" id="c-t">10s</span><span class="pill gray" id="c-n">0 clicks</span></div>`);
    const pad = q('#c-pad', view);
    pad.onclick = (e)=>{
      if(!playing) return;
      clicks++; q('#c-n', view).textContent = clicks + ' clicks';
      NX.sfx.play('tick');
      pad.style.transform = 'scale(.94)'; setTimeout(()=>pad.style.transform='', 60);
    };
    pad.ontransitionend = ()=>{};
    playing = true;
    timer = setInterval(()=>{
      t--; q('#c-t', view).textContent = t + 's';
      if(t<=0){
        clearInterval(timer); playing = false;
        NX.setGameBest('gm_click', Math.max(clicks, NX.gameBest('gm_click')||0));
        stage(`<h2>${clicks} clicks in 10s!</h2><p class="muted">${clicks>60?'Lightning fingers ⚡':clicks>35?'Solid pace 👏':'Warm up those wrists'}</p>
          <button class="btn btn-green" id="c-again">Again</button>`);
        q('#c-again', view).onclick = ()=>clicker();
        NX.confetti();
      }
    }, 1000);
    gameCleanup = ()=>clearInterval(timer);
  }

  /* ---------- simon says ---------- */
  function simon(){
    const pads = [
      { c:'#7CD56E', f:'#0E2B0A' }, { c:'#5EB8FF', f:'#0B2540' },
      { c:'#E8853D', f:'#3A2008' }, { c:'#8B5CF6', f:'#241245' }
    ];
    let seq = [], step = 0, playing = false, accT = [];
    stage(`<h2>Simon Says</h2>
      <div class="simon-grid">
        ${pads.map((p,i)=>`<button class="simon-pad" data-p="${i}" style="background:${p.c};color:${p.f}"></button>`).join('')}
      </div>
      <div class="row gap-8"><span class="pill gray" id="si-lvl">Level 0</span>
      <span class="pill gray" id="si-best">Best: ${NX.gameBest('gm_simon')||0}</span>
      <button class="btn btn-green btn-sm" id="si-start">Start</button></div>`);
    const flash = (i, ms=380)=>new Promise(res=>{
      const el = q(`[data-p="${i}"]`, view);
      el.style.filter = 'brightness(1.9)'; NX.sfx.play('tick');
      setTimeout(()=>{ el.style.filter = ''; setTimeout(res, 140); }, ms);
    });
    async function showSeq(){
      playing = false; q('#si-lvl', view).textContent = 'Watch…';
      for(const s of seq){ await flash(s); }
      q('#si-lvl', view).textContent = 'Level ' + seq.length + ' — your turn';
      step = 0; playing = true;
    }
    qa('.simon-pad', view).forEach(btn=>btn.onclick = async ()=>{
      if(!playing) return;
      const i = +btn.dataset.p;
      await flash(i, 180);
      if(seq[step] === i){
        step++;
        if(step === seq.length){
          playing = false;
          if(seq.length > (NX.gameBest('gm_simon')||0)){ NX.setGameBest('gm_simon', seq.length); q('#si-best', view).textContent = 'Best: ' + seq.length; }
          q('#si-lvl', view).textContent = 'Nice!';
          setTimeout(async ()=>{ seq.push(Math.floor(Math.random()*4)); q('#si-lvl', view).textContent = 'Level ' + (seq.length-1); await showSeq(); }, 700);
        }
      } else {
        playing = false;
        NX.sfx.play('err');
        NX.setGameBest('gm_simon', Math.max(seq.length-1, 0));
        stage(`<h2>Out at level ${seq.length-1} 🎯</h2><p class="muted">You remembered ${seq.length-1} steps.</p><button class="btn btn-green" id="si-again">Try again</button>`);
        q('#si-again', view).onclick = ()=>simon();
      }
    });
    q('#si-start', view).onclick = async ()=>{ seq = [Math.floor(Math.random()*4)]; await showSeq(); };
    gameCleanup = null;
  }

  /* ---------- math rush ---------- */
  function mathRush(){
    let t = 30, score = 0, streak = 0, timer = null, cur = null;
    function make(){
      const ops = ['+','-','×'];
      const op = ops[Math.floor(Math.random()*ops.length)];
      let a = 2 + Math.floor(Math.random()* (op==='×'? 11 : 40));
      let b = 2 + Math.floor(Math.random()* (op==='×'? 9 : 30));
      if(op === '-' && b > a){ const tmp=a; a=b; b=tmp; }
      const ans = op==='+'? a+b : op==='-'? a-b : a*b;
      let choices = new Set([ans]);
      while(choices.size < 4){ choices.add(ans + (Math.floor(Math.random()*17)-8)); }
      const arr = Array.from(choices).sort(()=>Math.random()-0.5);
      return { q:`${a} ${op} ${b}`, ans, arr };
    }
    function draw(){
      cur = make();
      q('#ma-q', view).textContent = cur.q + ' = ?';
      q('#ma-opts', view).innerHTML = cur.arr.map(v=>`<button class="btn btn-soft" data-a="${v}" style="font-weight:700">${v}</button>`).join('');
      qa('[data-a]', view).forEach(b=>b.onclick = ()=>pick(+b.dataset.a));
    }
    function pick(v){
      if(v === cur.ans){ score += 10 + streak*2; streak++; NX.sfx.play('ok'); }
      else { streak = 0; NX.sfx.play('err'); }
      q('#ma-s', view).textContent = score;
      q('#ma-st', view).textContent = 'streak ' + streak;
      draw();
    }
    stage(`<h2>Math Rush</h2>
      <div class="math-q" id="ma-q">—</div>
      <div class="row gap-8" id="ma-opts" style="justify-content:center;flex-wrap:wrap"></div>
      <div class="row gap-8" style="justify-content:center"><span class="pill gray" id="ma-s">0</span><span class="pill gray" id="ma-st">streak 0</span><span class="pill gray" id="ma-t">30s</span></div>`);
    draw();
    timer = setInterval(()=>{
      t--; q('#ma-t', view).textContent = t + 's';
      if(t<=0){
        clearInterval(timer);
        NX.setGameBest('gm_math', Math.max(score, NX.gameBest('gm_math')||0));
        stage(`<h2>${score} points!</h2><p class="muted">${score>150?'Human calculator 🧠':score>60?'Sharp! 👏':'Keep practicing'}</p><button class="btn btn-green" id="ma-again">Again</button>`);
        q('#ma-again', view).onclick = ()=>mathRush();
        NX.confetti();
      }
    }, 1000);
    gameCleanup = ()=>clearInterval(timer);
  }

  /* ---------- aim trainer ---------- */
  function aimTrainer(){
    let hits = 0, misses = 0, t = 20, timer = null, spawnT = null;
    stage(`<h2>Aim Trainer</h2>
      <div class="aim-pad" id="ai-pad"><div class="aim-dot" id="ai-dot" style="display:none"></div></div>
      <div class="row gap-8" style="justify-content:center"><span class="pill gray" id="ai-h">0 hits</span><span class="pill gray" id="ai-m">0 misses</span><span class="pill gray" id="ai-t">20s</span></div>
      <div class="row gap-8" style="justify-content:center"><button class="btn btn-green" id="ai-start">Start</button></div>`);
    const pad = q('#ai-pad', view), dot = q('#ai-dot', view);
    function place(){
      dot.style.display = '';
      dot.style.left = (8 + Math.random()*78) + '%';
      dot.style.top = (8 + Math.random()*74) + '%';
      const s = 26 + Math.random()*22;
      dot.style.width = s+'px'; dot.style.height = s+'px';
    }
    dot.onclick = (e)=>{ e.stopPropagation(); hits++; q('#ai-h', view).textContent = hits + ' hits'; NX.sfx.play('pop'); place(); };
    pad.onclick = ()=>{ misses++; q('#ai-m', view).textContent = misses + ' misses'; };
    q('#ai-start', view).onclick = ()=>{
      hits = 0; misses = 0; t = 20;
      q('#ai-h', view).textContent = '0 hits'; q('#ai-m', view).textContent = '0 misses';
      place();
      clearInterval(timer); clearInterval(spawnT);
      spawnT = setInterval(place, 1100);
      timer = setInterval(()=>{
        t--; q('#ai-t', view).textContent = t + 's';
        if(t<=0){
          clearInterval(timer); clearInterval(spawnT); dot.style.display='none';
          const acc = hits+misses ? Math.round(hits/(hits+misses)*100) : 0;
          NX.setGameBest('gm_aim', Math.max(hits, NX.gameBest('gm_aim')||0));
          stage(`<h2>${hits} targets hit!</h2><p class="muted">Accuracy ${acc}% · ${hits>25?'Sniper 🎯':hits>14?'Good aim 👏':'Warm up and retry'}</p><button class="btn btn-green" id="ai-again">Again</button>`);
          q('#ai-again', view).onclick = ()=>aimTrainer();
        }
      }, 1000);
    };
    gameCleanup = ()=>{ clearInterval(timer); clearInterval(spawnT); };
  }

  /* ---------- typing speed ---------- */
  const TYPE_TEXT = [
    'calm focus is not a mood it is a habit built one small rep at a time',
    'the fastest way through a task is to start it badly and then improve',
    'clear the noise keep the promise and let the work compound quietly',
    'a calm workspace is a feature not a decoration and it should feel like one',
    'measure the work not the hours and let the numbers tell you where to go',
    'small daily wins stack into something you are proud of six months from now'
  ];
  function typing(){
    const LEN = 30;
    let text = U.pick(TYPE_TEXT), typed = '', errs = 0, t = LEN, timer = null, done = false, started = false;
    stage(`<h2>Typing Speed</h2>
      <div class="type-wrap">
        <div class="type-pass" id="ty-pass"></div>
        <input class="input" id="ty-in" placeholder="Click here, then type the text above" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="row gap-8" style="justify-content:center;flex-wrap:wrap">
        <span class="pill gray" id="ty-wpm">0 WPM</span>
        <span class="pill gray" id="ty-acc">100% acc</span>
        <span class="pill gray" id="ty-t">30s</span>
        <span class="pill gray" id="ty-best">${NX.gameBest('gm_type')?NX.gameBest('gm_type')+' WPM best':'no best yet'}</span>
        <button class="btn btn-soft btn-sm" id="ty-restart">Restart</button></div>`);
    const pass = q('#ty-pass', view), inp = q('#ty-in', view);
    function stats(){
      const secs = Math.max(1, LEN - t);
      return {
        wpm: Math.round((typed.length/5) / (secs/60)),
        acc: typed.length ? Math.round(((typed.length - errs)/typed.length)*100) : 100
      };
    }
    function render(){
      pass.innerHTML = text.split('').map((c,i)=>{
        const cls = i < typed.length ? (typed[i] === c ? 'ok' : 'bad') : (i === typed.length ? 'cur' : '');
        return `<span class="${cls}">${c === ' ' ? '&nbsp;' : U.esc(c)}</span>`;
      }).join('');
      const st = stats();
      q('#ty-wpm', view).textContent = st.wpm + ' WPM';
      q('#ty-acc', view).textContent = st.acc + '% acc';
      const cur = pass.querySelector('.cur');
      if(cur) cur.scrollIntoView({ block:'nearest' });
    }
    function finish(){
      clearInterval(timer); done = true; inp.disabled = true;
      const st = stats();
      const best = NX.gameBest('gm_type');
      const isNew = best == null || st.wpm > best;
      NX.setGameBest('gm_type', st.wpm);
      const verdict = st.wpm >= 80 ? 'Machine pace' : st.wpm >= 55 ? 'Solid working speed' :
                      st.wpm >= 35 ? 'Decent — keep drilling' : 'Room to grow, keep at it';
      stage(`<h2>${st.wpm} WPM</h2>
        <p class="muted">${st.acc}% accuracy · ${typed.length} characters · ${verdict}${isNew ? ' · new best 🎉' : ''}</p>
        <div class="row gap-8" style="justify-content:center">
          <button class="btn btn-green" id="ty-again">Again</button>
          <button class="btn btn-soft" id="ty-back">Back to arcade</button></div>`);
      q('#ty-again', view).onclick = ()=>typing();
      q('#ty-back', view).onclick = ()=>NX.router.go('games');
      if(isNew){ NX.confetti(); NX.sfx.play('confetti'); }
    }
    inp.addEventListener('input', ()=>{
      if(done) return;
      if(!started){
        started = true;
        clearInterval(timer);
        timer = setInterval(()=>{
          t--; q('#ty-t', view).textContent = t + 's';
          if(t <= 0) finish();
        }, 1000);
      }
      typed = inp.value.slice(0, text.length);
      let e = 0;
      for(let i=0;i<typed.length;i++) if(typed[i] !== text[i]) e++;
      errs = e;
      if(typed.length >= text.length){ render(); finish(); return; }
      render();
      if(typed.length % 5 === 0) NX.sfx.play('tick');
    });
    q('#ty-restart', view).onclick = ()=>typing();
    render();
    setTimeout(()=>{ if(!done) inp.focus(); }, 40);
    gameCleanup = ()=>clearInterval(timer);
  }

  /* ---------- minesweeper ---------- */
  function mines(){
    const R = 9, C = 9, MINES = 10;
    const NB = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    let grid = [], over = false, won = false, flags = 0, secs = 0, timer = null, opened = 0;
    const inb = (r,c)=> r >= 0 && r < R && c >= 0 && c < C;
    function build(first){
      grid = [];
      for(let r=0;r<R;r++){
        const row = [];
        for(let c=0;c<C;c++) row.push({ m:false, n:0, open:false, flag:false });
        grid.push(row);
      }
      if(first){
        let placed = 0;
        while(placed < MINES){
          const r = Math.floor(Math.random()*R), c = Math.floor(Math.random()*C);
          if(grid[r][c].m) continue;
          grid[r][c].m = true; placed++;
        }
        for(let r=0;r<R;r++) for(let c=0;c<C;c++){
          let n = 0;
          NB.forEach(([dr,dc])=>{ if(inb(r+dr,c+dc) && grid[r+dr][c+dc].m) n++; });
          grid[r][c].n = n;
        }
      }
    }
    function start(){
      clearInterval(timer);
      timer = setInterval(()=>{ secs++; paint(); }, 1000);
    }
    function reveal(r,c){
      const cell = grid[r][c];
      if(cell.open || cell.flag || over) return;
      cell.open = true; opened++;
      if(cell.m){ lose(); return; }
      if(cell.n === 0) NB.forEach(([dr,dc])=>{ if(inb(r+dr,c+dc) && !grid[r+dr][c+dc].open && !grid[r+dr][c+dc].flag) reveal(r+dr,c+dc); });
      if(opened === R*C - MINES) win();
    }
    function toggleFlag(r,c){
      const cell = grid[r][c];
      if(cell.open || over) return;
      cell.flag = !cell.flag;
      flags += cell.flag ? 1 : -1;
      NX.sfx.play('tick');
      paint();
    }
    function lose(){
      clearInterval(timer); over = true;
      grid.forEach(row=>row.forEach(cell=>{ if(cell.m) cell.open = true; }));
      NX.sfx.play('err');
      paint();
      q('#mn-msg', view).innerHTML = `<b>Boom.</b> You cleared ${opened} of ${R*C - MINES} safe squares in ${secs}s.`;
    }
    function win(){
      clearInterval(timer); over = true; won = true;
      const best = NX.gameBest('gm_mine');
      const isNew = best == null || secs < best;
      NX.recordMin('gm_mine', secs);
      NX.sfx.play('confetti'); NX.confetti();
      q('#mn-msg', view).innerHTML = `<b>Cleared in ${secs}s${isNew ? ' — new best 🎉' : ' · best ' + best + 's'}.</b>`;
      paint();
    }
    function paint(){
      const host = q('#mn-grid', view);
      if(!host) return;
      host.innerHTML = grid.map((row,r)=>row.map((cell,c)=>{
        let cls = 'mine-cell';
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
        b.oncontextmenu = (e)=>{ e.preventDefault(); toggleFlag(+b.dataset.r, +b.dataset.c); };
      });
      q('#mn-flags', view).textContent = flags + ' / ' + MINES + ' flags';
      q('#mn-time', view).textContent = secs + 's';
    }
    stage(`<h2>Minesweeper</h2>
      <div class="row gap-8" style="justify-content:center">
        <span class="pill gray" id="mn-flags">0 / ${MINES} flags</span>
        <span class="pill gray" id="mn-time">0s</span>
        <span class="pill gray">${NX.gameBest('gm_mine')!=null ? 'Best ' + NX.gameBest('gm_mine') + 's' : R+'×'+C+' · '+MINES+' mines'}</span>
        <button class="btn btn-soft btn-sm" id="g-restart">Restart</button></div>
      <div class="mine-grid" id="mn-grid" style="grid-template-columns:repeat(${C},1fr)"></div>
      <p class="muted" id="mn-msg">Click to reveal · right-click to flag · first click is always safe.</p>`);
    build(true);
    paint();
    q('#g-restart', view).onclick = ()=>mines();
    gameCleanup = ()=>clearInterval(timer);
  }

  /* ---------- sudoku lite ---------- */
  const SUD_DIFF = [
    { v:'easy',   l:'Easy',   holes:42 },
    { v:'medium', l:'Medium', holes:34 },
    { v:'hard',   l:'Hard',   holes:28 }
  ];
  function sudOk(b, i, v){
    const r = Math.floor(i/9), c = i % 9;
    for(let k=0;k<9;k++){
      if(b[r*9+k] === v) return false;
      if(b[k*9+c] === v) return false;
    }
    const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
    for(let x=0;x<3;x++) for(let y=0;y<3;y++) if(b[(br+x)*9+bc+y] === v) return false;
    return true;
  }
  function sudFill(b, i){
    while(i < 81 && b[i]) i++;
    if(i >= 81) return true;
    const order = [1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5);
    for(const v of order){
      if(!sudOk(b,i,v)) continue;
      b[i] = v;
      if(sudFill(b, i+1)) return true;
      b[i] = 0;
    }
    return false;
  }
  function sudCount(b, i, limit){
    while(i < 81 && b[i]) i++;
    if(i >= 81) return 1;
    const r = Math.floor(i/9), c = i % 9;
    let n = 0;
    for(let v=1; v<=9; v++){
      if(!sudOk(b,i,v)) continue;
      b[i] = v;
      n += sudCount(b, i+1, limit - n);
      b[i] = 0;
      if(n >= limit) break;
    }
    return n;
  }
  function sudMake(holes){
    const b = Array(81).fill(0);
    sudFill(b, 0);
    const order = [...Array(81).keys()].sort(()=>Math.random()-0.5);
    let dug = 0;
    for(const i of order){
      if(dug >= holes) break;
      const bak = b[i];
      b[i] = 0;
      if(sudCount(b.slice(), 0, 2) === 1) dug++;
      else b[i] = bak;
    }
    return b;
  }
  function conflicts(b){
    const bad = new Set();
    for(let i=0;i<81;i++){
      if(!b[i]) continue;
      const r = Math.floor(i/9), c = i % 9, br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
      for(let k=0;k<9;k++){
        const j = r*9+k; if(j!==i && b[j] === b[i]){ bad.add(i); bad.add(j); }
        const j2 = k*9+c; if(j2!==i && b[j2] === b[i]){ bad.add(i); bad.add(j2); }
      }
      for(let x=0;x<3;x++) for(let y=0;y<3;y++){
        const j = (br+x)*9+bc+y;
        if(j!==i && b[j] === b[i]){ bad.add(i); bad.add(j); }
      }
    }
    return bad;
  }
  function sudoku(){
    let diff = 'easy', given = [], board = [], notes = [], sel = -1, noteMode = false, over = false;
    let secs = 0, timer = null, keyH = null;

    function newPuzzle(){
      const cfg = SUD_DIFF.find(d=>d.v === diff);
      given = sudMake(cfg.holes);
      board = given.slice();
      notes = Array.from({ length:81 }, ()=>[]);
      sel = -1; over = false; secs = 0;
      clearInterval(timer);
      timer = setInterval(()=>{ secs++; paint(); }, 1000);
      paint();
    }
    function setSel(i){
      sel = i;
      paint();
    }
    function place(v){
      if(over || sel < 0 || given[sel]) return;
      if(noteMode && v){ notes[sel] = notes[sel].includes(v) ? notes[sel].filter(x=>x!==v) : notes[sel].concat(v).sort(); }
      else {
        board[sel] = board[sel] === v ? 0 : v;
        notes[sel] = [];
      }
      NX.sfx.play('tick');
      checkWin();
      paint();
    }
    function checkWin(){
      if(board.some(v=>!v)) return;
      clearInterval(timer); over = true;
      const key = 'gm_sudoku_' + diff;
      const best = NX.gameBest(key);
      const isNew = best == null || secs < best;
      NX.recordMin(key, secs);
      NX.confetti(); NX.sfx.play('confetti');
      q('#su-msg', view).innerHTML = `<b>Solved in ${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}${isNew ? ' — new best for ' + diff + ' 🎉' : ''}.</b>`;
      paint();
    }
    function paint(){
      const host = q('#su-grid', view);
      if(!host) return;
      const bad = conflicts(board);
      const sr = sel >= 0 ? Math.floor(sel/9) : -1, sc = sel >= 0 ? sel % 9 : -1;
      const sbr = sr >= 0 ? Math.floor(sr/3)*3 : -1, sbc = sc >= 0 ? Math.floor(sc/3)*3 : -1;
      host.innerHTML = board.map((v,i)=>{
        const r = Math.floor(i/9), c = i % 9;
        let cls = 'sud-cell';
        if(given[i]) cls += ' giv';
        if(i === sel) cls += ' sel';
        else if(sr >= 0 && (r === sr || c === sc || (r >= sbr && r < sbr+3 && c >= sbc && c < sbc+3))) cls += ' peer';
        if(v && bad.has(i)) cls += ' bad';
        if((r+1) % 3 === 0 && r !== 8) cls += ' bb';
        if((c+1) % 3 === 0 && c !== 8) cls += ' br';
        const val = v ? `<span class="sud-val">${v}</span>` : '';
        const marks = notes[i].length
          ? `<span class="sud-notes ${v ? 'mini' : ''}">${notes[i].map(n=>`<i>${n}</i>`).join('')}</span>`
          : '';
        return `<button class="${cls}" data-i="${i}">${val}${marks}</button>`;
      }).join('');
      qa('.sud-cell', host).forEach(b=>{
        b.onclick = ()=>setSel(+b.dataset.i);
      });
      const cfg = SUD_DIFF.find(d=>d.v === diff);
      const best = NX.gameBest('gm_sudoku_' + diff);
      q('#su-t', view).textContent = Math.floor(secs/60) + ':' + String(secs%60).padStart(2,'0');
      q('#su-best', view).textContent = best != null ? 'Best ' + Math.floor(best/60) + ':' + String(best%60).padStart(2,'0') : cfg.l + ' — no best yet';
      q('#su-notes', view).classList.toggle('on', noteMode);
    }

    stage(`<h2>Sudoku Lite</h2>
      <div class="row gap-8" style="justify-content:center;flex-wrap:wrap">
        <div class="seg" id="su-diff">${SUD_DIFF.map(d=>`<button data-d="${d.v}" class="${d.v===diff?'on':''}">${d.l}</button>`).join('')}</div>
        <span class="pill gray" id="su-t">0:00</span>
        <span class="pill gray" id="su-best">—</span>
      </div>
      <div class="sud-grid" id="su-grid"></div>
      <div class="sud-pad" id="su-pad">
        ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="btn btn-soft" data-n="${n}">${n}</button>`).join('')}
        <button class="btn btn-soft" data-n="0" data-tip="Erase">${NX.icon('x')}</button>
        <button class="btn btn-outline" id="su-notes" data-tip="Pencil marks">Notes</button>
        <button class="btn btn-green btn-sm" id="g-restart">New puzzle</button>
      </div>
      <p class="muted" id="su-msg">Arrows or click to move · number keys to fill · every puzzle has exactly one solution.</p>`);

    qa('[data-d]', view).forEach(b=>b.onclick = ()=>{
      diff = b.dataset.d;
      qa('[data-d]', view).forEach(x=>x.classList.toggle('on', x.dataset.d === diff));
      newPuzzle();
    });
    qa('[data-n]', view).forEach(b=>b.onclick = ()=>place(+b.dataset.n));
    q('#su-notes', view).onclick = ()=>{ noteMode = !noteMode; paint(); };
    q('#g-restart', view).onclick = ()=>newPuzzle();
    keyH = e=>{
      if(e.key.startsWith('Arrow')){
        e.preventDefault();
        const r = sel < 0 ? 0 : Math.floor(sel/9), c = sel < 0 ? 0 : sel % 9;
        const d2 = { ArrowUp:[-1,0], ArrowDown:[1,0], ArrowLeft:[0,-1], ArrowRight:[0,1] }[e.key];
        const nr = U.clamp(r + d2[0], 0, 8), nc = U.clamp(c + d2[1], 0, 8);
        setSel(nr*9 + nc);
      }
      else if(/^[1-9]$/.test(e.key)) place(+e.key);
      else if(e.key === 'Backspace' || e.key === 'Delete') place(0);
      else if(e.key.toLowerCase() === 'n'){ noteMode = !noteMode; paint(); }
    };
    document.addEventListener('keydown', keyH);
    newPuzzle();
    gameCleanup = ()=>{ clearInterval(timer); document.removeEventListener('keydown', keyH); };
  }

  /* ---------- color match (stroop) ---------- */
  const STROOP = [
    { n:'RED',    c:'#E25C4A' },
    { n:'GREEN',  c:'#7CD56E' },
    { n:'BLUE',   c:'#3E7BFA' },
    { n:'YELLOW', c:'#D4A017' }
  ];
  function stroop(){
    let score = 0, misses = 0, t = 45, timer = null, over = false, streak = 0, inkIdx = 0;
    stage(`<h2>Color Match</h2>
      <div class="stroop-word" id="sm-word">—</div>
      <p class="faint small">Tap the swatch that matches the <b>ink</b>, not the word.</p>
      <div class="stroop-pad" id="sm-pad">${STROOP.map((s,i)=>`<button class="stroop-swatch" data-i="${i}" style="background:${s.c}" data-tip="${s.n}"></button>`).join('')}</div>
      <div class="row gap-8" style="justify-content:center;flex-wrap:wrap">
        <span class="pill gray" id="sm-score">0 right</span>
        <span class="pill gray" id="sm-streak">streak 0</span>
        <span class="pill gray" id="sm-t">45s</span>
        <span class="pill gray">${NX.gameBest('gm_stroop')!=null ? 'Best ' + NX.gameBest('gm_stroop') : 'no best yet'}</span>
        <button class="btn btn-soft btn-sm" id="g-restart">Restart</button></div>`);
    function next(){
      const word = Math.floor(Math.random()*STROOP.length);
      let ink = Math.floor(Math.random()*STROOP.length);
      while(ink === word) ink = Math.floor(Math.random()*STROOP.length);
      inkIdx = ink;
      const el = q('#sm-word', view);
      el.textContent = STROOP[word].n;
      el.style.color = STROOP[ink].c;
    }
    function finish(){
      clearInterval(timer); over = true;
      const best = NX.gameBest('gm_stroop');
      const isNew = best == null || score > best;
      NX.setGameBest('gm_stroop', score);
      const acc = (score + misses) ? Math.round(score/(score+misses)*100) : 0;
      stage(`<h2>${score} right</h2>
        <p class="muted">${acc}% accuracy · ${misses} wrong · ${isNew ? 'new best 🎉' : 'best ' + best}</p>
        <button class="btn btn-green" id="sm-again">Again</button>`);
      q('#sm-again', view).onclick = ()=>stroop();
      if(isNew) NX.confetti();
    }
    qa('[data-i]', view).forEach(b=>b.onclick = ()=>{
      if(over) return;
      if(+b.dataset.i === inkIdx){
        score++; streak++;
        NX.sfx.play('ok');
      } else {
        misses++; streak = 0;
        NX.sfx.play('err');
        b.style.outline = '2px solid var(--red)';
        setTimeout(()=>{ b.style.outline = ''; }, 220);
      }
      q('#sm-score', view).textContent = score + ' right';
      q('#sm-streak', view).textContent = 'streak ' + streak;
      next();
    });
    q('#g-restart', view).onclick = ()=>stroop();
    next();
    timer = setInterval(()=>{
      t--; q('#sm-t', view).textContent = t + 's';
      if(t <= 0) finish();
    }, 1000);
    gameCleanup = ()=>clearInterval(timer);
  }

  /* ---------- break the code ---------- */
  function code(){
    const MAX = 8;
    let secret = [], rows = [], over = false, input = [0,0,0,0];
    function newSecret(){ secret = Array.from({ length:4 }, ()=>1 + Math.floor(Math.random()*6)); }
    function grade(g){
      let exact = 0, rest = [], srest = [];
      for(let i=0;i<4;i++){
        if(g[i] === secret[i]) exact++;
        else { rest.push(g[i]); srest.push(secret[i]); }
      }
      let misplaced = 0;
      srest.forEach(v=>{ const k = rest.indexOf(v); if(k > -1){ rest.splice(k,1); misplaced++; } });
      return { exact, misplaced };
    }
    function submit(){
      if(over || input.some(v=>!v)) return;
      const res = grade(input);
      rows.push({ guess:input.slice(), ...res });
      input = [0,0,0,0];
      NX.sfx.play(res.exact === 4 ? 'confetti' : 'tick');
      paint();
      if(res.exact === 4){
        over = true;
        const best = NX.gameBest('gm_code');
        const isNew = best == null || rows.length < best;
        NX.recordMin('gm_code', rows.length);
        q('#cd-msg', view).innerHTML = `<b>Cracked in ${rows.length} ${rows.length===1?'guess':'guesses'}${isNew ? ' — new best 🎉' : ''}.</b>`;
        NX.confetti();
      } else if(rows.length >= MAX){
        over = true;
        q('#cd-msg', view).innerHTML = `<b>Out of guesses.</b> The lock was ${secret.join('')}.`;
      }
      paint();
    }
    function paint(){
      const host = q('#cd-rows', view);
      if(!host) return;
      host.innerHTML = rows.map(r=>`
        <div class="cd-row ${r.exact===4?'win':''}">
          <span class="cd-digits">${r.guess.join('')}</span>
          <span class="cd-fb">${'<i class="exact"></i>'.repeat(r.exact)}${'<i class="mis"></i>'.repeat(r.misplaced)}</span>
          <span class="cd-note">${r.exact} exact · ${r.misplaced} misplaced</span>
        </div>`).join('') +
        (over ? '' : `<div class="cd-row live">
          <span class="cd-digits">${input.map(v=>v||'').join('')}</span>
          <span class="cd-fb"></span><span class="cd-note">guess ${rows.length+1} of ${MAX}</span>
        </div>`);
      const best = NX.gameBest('gm_code');
      q('#cd-best', view).textContent = best != null ? 'Best ' + best + ' guesses' : '4 digits · each 1-6';
    }
    function press(d){
      if(over) return;
      const i = input.findIndex(v=>!v);
      if(i === -1) return;
      input[i] = d;
      NX.sfx.play('tick');
      if(input.every(v=>v)) submit();
      else paint();
    }
    stage(`<h2>Break the Code</h2>
      <div class="cd-board">
        <div class="cd-rows" id="cd-rows"></div>
        <div class="cd-pad">
          ${[1,2,3,4,5,6,7,8,9].map(n=>`<button class="btn btn-soft" data-k="${n}">${n}</button>`).join('')}
          <button class="btn btn-outline" data-k="0">Clear</button>
        </div>
      </div>
      <div class="row gap-8" style="justify-content:center;flex-wrap:wrap">
        <span class="pill gray" id="cd-best">4 digits · each 1-6</span>
        <button class="btn btn-soft btn-sm" id="g-restart">New lock</button>
        <button class="btn btn-green btn-sm" id="cd-back">Back to arcade</button>
      </div>
      <p class="muted" id="cd-msg">Fill four slots. Green means right digit, right spot. Yellow means right digit, wrong spot.</p>`);
    qa('[data-k]', view).forEach(b=>b.onclick = ()=>{
      if(b.dataset.k === '0'){ input = [0,0,0,0]; paint(); return; }
      press(+b.dataset.k);
    });
    q('#g-restart', view).onclick = ()=>code();
    q('#cd-back', view).onclick = ()=>NX.router.go('games');
    newSecret(); rows = []; over = false; input = [0,0,0,0];
    paint();
    gameCleanup = null;
  }

  function launch(id){ NX.launchGame(id); }

  /* built-ins are closure-scoped, so they register on first render */
  NX.registerGames({
    gm_2048:g2048, gm_mem:memory, gm_react:reaction, gm_snake:snake, gm_word:scramble,
    gm_click:clicker, gm_simon:simon, gm_math:mathRush, gm_aim:aimTrainer,
    gm_type:typing, gm_mine:mines, gm_sudoku:sudoku, gm_stroop:stroop, gm_code:code
  });

  renderGrid();
});

/* ---------- registry ----------
   Other files (38-arcade.js) add games at load time via
   NX.registerGames({ id: launchFn }) and get scoring, bests and
   playtime for free. Built-ins join on the first Arcade render.   */
NX.gameRegistry = NX.gameRegistry || {};
NX.registerGames = function(map){
  Object.assign(NX.gameRegistry, map || {});
  return Object.keys(map || {});
};
NX.launchGame = function(id, retried){
  /* Entitlement gate. Runs BEFORE the registry lookup so a locked game
     cannot be started by ANY path — grid click, command palette, deep
     link, or a direct NX.launchGame() call. The second flag lets the
     store launch a game it just unlocked without re-entering the gate. */
  if(!retried && NX.store && NX.store.isUnlocked && !NX.store.isUnlocked('game:' + id)){
    const meta = (NX.GAMES || []).find(g => g.id === id);
    if(meta && NX.openGameGate) NX.openGameGate(meta);
    else NX.toastInfo('Locked', String(id || ''));
    return;
  }
  let fn = NX.gameRegistry[id];
  if(typeof fn !== 'function' && !retried && NX.router.routes.games){
    /* built-ins are not registered until the Arcade renders once */
    try{ NX.router.go('games'); }catch(e){}
    fn = NX.gameRegistry[id];
    if(typeof fn !== 'function'){
      NX.toastInfo('Not available', String(id || ''));
      return;
    }
  }
  if(typeof fn !== 'function'){ NX.toastInfo('Not available', String(id || '')); return; }
  try{ NX.sfx.play('open'); }catch(e){}
  if(NX.recordPlay) NX.recordPlay(id);
  fn();
  setTimeout(()=>{
    const live = q('#gm-live', document);
    if(live && live.scrollIntoView) live.scrollIntoView({ behavior:'smooth', block:'start' });
  }, 60);
};
})(window.NX);
