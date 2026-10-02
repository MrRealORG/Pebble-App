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
    <div class="row gap-8"><span class="pill green">${icon('game')} 9 games · zero loading</span>
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

  function launch(id){
    NX.sfx.play('open');
    ({ gm_2048:g2048, gm_mem:memory, gm_react:reaction, gm_snake:snake, gm_word:scramble, gm_click:clicker,
       gm_simon:simon, gm_math:mathRush, gm_aim:aimTrainer }[id] || (()=>{}))();
    setTimeout(()=>q('#gm-live', view) && q('#gm-live', view).scrollIntoView({behavior:'smooth', block:'start'}), 60);
  }

  renderGrid();
});
})(window.NX);
