/* ============================================================
   PebbleX v0.1 — 32-focus.js
   Focus suite: pomodoro, breathing patterns, offline ambient
   noise, 20-20-20 eye breaks, today's focus ledger.
   Everything runs on device — no network, no accounts.
   ============================================================ */
(function(NX){
'use strict';
const { q, qa, util:U, icon } = NX;

/* ---------------- ambient sound (WebAudio, generated) ---------------- */
const Sound = {
  ctx:null, out:null, nodes:[], on:false, mode:'brown', vol:0.32,
  MODES:[
    { v:'brown', l:'Brown noise', d:'Deep, even, masks a room.' },
    { v:'rain',  l:'Rain',        d:'Brighter hiss, keeps you awake.' },
    { v:'hum',   l:'Deep hum',    d:'Low drone for long stretches.' }
  ],
  ensure(){
    if(this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.ctx.destination);
    return this.ctx;
  },
  buffer(kind){
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for(let i=0;i<len;i++){
      const w = Math.random()*2-1;
      if(kind === 'brown'){ last = (last + 0.02*w)/1.02; d[i] = last*3.5; }
      else d[i] = w*0.55;
    }
    return b;
  },
  fade(v){
    if(!this.ctx || !this.out) return;
    const t = this.ctx.currentTime;
    try{
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(v, t + 0.5);
    }catch(e){}
  },
  teardown(){
    this.nodes.forEach(n=>{ try{ n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} });
    this.nodes = [];
  },
  build(){
    const ctx = this.ensure(); if(!ctx) return false;
    try{ if(ctx.state === 'suspended') ctx.resume(); }catch(e){}
    this.teardown();
    if(this.mode === 'hum'){
      [55, 110.3].forEach(f=>{
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0.07;
        o.connect(g); g.connect(this.out); o.start(); this.nodes.push(o);
      });
    } else {
      const s = ctx.createBufferSource();
      s.buffer = this.buffer(this.mode === 'brown' ? 'brown' : 'white');
      s.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = this.mode === 'brown' ? 40 : 620;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = this.mode === 'brown' ? 820 : 7200;
      s.connect(hp); hp.connect(lp); lp.connect(this.out);
      s.start(); this.nodes.push(s);
    }
    this.on = true;
    this.fade(this.vol);
    return true;
  },
  stop(){ this.fade(0); this.teardown(); this.on = false; },
  toggle(){ if(this.on){ this.stop(); } else if(!this.build()) NX.toastErr('Audio unavailable', 'This browser blocked WebAudio.'); },
  setMode(m){
    this.mode = m;
    if(this.on) this.build();
  },
  setVol(v){
    this.vol = U.clamp(v, 0, 1);
    if(this.on) this.fade(this.vol);
  },
  blip(freq=660, ms=120){
    const ctx = this.ensure(); if(!ctx) return;
    try{ if(ctx.state === 'suspended') ctx.resume(); }catch(e){}
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms/1000);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + ms/1000 + 0.05);
  }
};
NX.focusSound = Sound;

/* ---------------- breathing patterns ---------------- */
const BREATHE = {
  box:    { l:'Box 4-4-4-4', steps:[ {t:'Breathe in',s:.55,d:4}, {t:'Hold',s:1,d:4}, {t:'Breathe out',s:.55,d:4}, {t:'Hold',s:.55,d:4} ] },
  relax:  { l:'4-7-8',      steps:[ {t:'Breathe in',s:.55,d:4}, {t:'Hold',s:1,d:7}, {t:'Breathe out',s:.55,d:8} ] },
  quick:  { l:'Quick 4-6',  steps:[ {t:'Breathe in',s:.55,d:4}, {t:'Breathe out',s:.55,d:6} ] }
};

/* ---------------- local timers (cleared when leaving the tab) ---------------- */
let T = { breath:null, eye:null, today:null };
let dispose = null;
function clearT(){
  Object.keys(T).forEach(k=>{ if(T[k]) clearTimeout(T[k]); if(T[k]) clearInterval(T[k]); T[k] = null; });
}
function later(k, fn, ms){ T[k] = setTimeout(fn, ms); }
function every(k, fn, ms){ T[k] = setInterval(fn, ms); }

function weekBars(){
  const tl = NX.store.get('timeless', {});
  const out = [];
  for(let i=6;i>=0;i--){
    const d = tl[U.todayKey(new Date(Date.now()-i*86400e3))] || {};
    let prod = 0;
    Object.entries(d).forEach(([k,a])=>{ if(k!=='__hours' && a && a.sec && a.cat === 'prod') prod += a.sec; });
    out.push({ label:new Date(Date.now()-i*86400e3).toLocaleDateString(undefined,{weekday:'short'}).slice(0,2), prod });
  }
  return out;
}

/* ---------------- module route ---------------- */
NX.routeInShell('focus', 'Focus', 'target', function(view){
  clearT();

  view.innerHTML = `
  <div class="page" id="fx-page">
    <div class="row gap-8" style="flex-wrap:wrap">
      <span class="pill green">${icon('target')} Deep work suite</span>
      <span class="faint small">Timer, breathing, ambient noise and eye breaks — all generated on device.</span>
    </div>
    <div class="focus-grid">
      <div class="tl-col">
        <div class="card" id="fx-timer"></div>
        <div class="card" id="fx-breathe"></div>
        <div class="card" id="fx-today"></div>
      </div>
      <div class="tl-col">
        <div class="card" id="fx-sound"></div>
        <div class="card" id="fx-eye"></div>
        <div class="card" id="fx-week"></div>
      </div>
    </div>
  </div>`;

  /* ================= TIMER ================= */
  function pomoCfg(){ return NX.store.get('pomo', { len:25, breakLen:5 }); }
  function roundTotal(st){
    const cfg = pomoCfg();
    return (st && st.mode === 'break' ? (cfg.breakLen||5) : (cfg.len||25)) * 60;
  }
  function skipRound(){
    const cfg = pomoCfg();
    const cur = NX.pomo.st;
    const mode = cur && cur.mode === 'focus' ? 'break' : 'focus';
    NX.pomo.start();
    NX.pomo.st = { mode, left: (mode === 'focus' ? (cfg.len||25) : (cfg.breakLen||5))*60, running:true };
    NX.events.emit('pomo:changed');
  }
  function renderTimer(){
    const host = q('#fx-timer', view); if(!host) return;
    const cfg = pomoCfg();
    const st = NX.pomo.st;
    const stats = NX.store.get('pomoStats', { done:0 });
    const t = NX.totals();
    const total = roundTotal(st);
    const pct = st ? Math.max(0, Math.min(100, (1 - st.left/total)*100)) : 0;

    /* build the chrome once — the clock ticks every second, so only
       the dynamic nodes get touched afterwards (no focus/hover loss) */
    if(!host.dataset.built){
      host.innerHTML = `
        <div class="card-h">
          <div class="tile">${icon('clock')}</div>
          <div><div class="c-title">Focus timer</div><div class="c-sub" id="fx-t-sub">Ready when you are</div></div>
          <div class="spacer"></div>
          <button class="icon-btn sm" id="fx-skip" data-tip="Skip to next round">${icon('chevR')}</button>
        </div>
        <div class="card-b">
          <div class="fx-clock" id="fx-t-clock">${U.fmtClock((cfg.len||25)*60)}</div>
          <div class="fx-state" id="fx-t-state">ready</div>
          <div class="meter fx-meter"><i id="fx-t-bar" style="width:0%"></i></div>
          <div class="fx-lens">
            ${[15,25,45,60].map(n=>`<button class="chip" data-len="${n}">${n}m</button>`).join('')}
          </div>
          <div class="row gap-8" style="justify-content:center" id="fx-t-acts"></div>
          <div class="row gap-8" style="justify-content:center;flex-wrap:wrap;margin-top:12px" id="fx-t-pills"></div>
        </div>`;
      host.dataset.built = '1';
      q('#fx-skip', host).onclick = skipRound;
      qa('[data-len]', host).forEach(b=>b.onclick = ()=>{
        const c2 = pomoCfg(); c2.len = +b.dataset.len;
        NX.store.set('pomo', c2);
        if(NX.pomo.st && NX.pomo.st.mode === 'focus') NX.pomo.reset();
        renderTimer();
      });
      host._actsKey = null;
    }

    const left = st ? st.left : (cfg.len||25)*60;
    const clock = q('#fx-t-clock', host);
    clock.textContent = U.fmtClock(left);
    clock.classList.toggle('paused', !!st && !st.running);
    q('#fx-t-state', host).textContent = st ? (st.running ? st.mode : 'paused') : 'ready';
    q('#fx-t-sub', host).textContent = st ? (st.mode === 'focus' ? 'Deep work round' : 'Break round') : 'Ready when you are';
    q('#fx-t-bar', host).style.width = pct.toFixed(1) + '%';

    qa('[data-len]', host).forEach(b=>b.classList.toggle('active', +b.dataset.len === (cfg.len||25)));

    const actsKey = st ? (st.mode + (st.running ? '|run' : '|pause')) : 'idle';
    if(host._actsKey !== actsKey){
      host._actsKey = actsKey;
      q('#fx-t-acts', host).innerHTML = st
        ? `<button class="btn btn-green btn-lg" id="fx-run">${icon(st.running?'pause':'play')} ${st.running?'Pause':'Resume'}</button>
           <button class="btn btn-soft" id="fx-reset">Reset</button>`
        : `<button class="btn btn-green btn-lg" id="fx-run">${icon('play')} Start focus</button>`;
      const run = q('#fx-run', host);
      if(run) run.onclick = ()=>{ NX.pomo.st ? NX.pomo.pause() : NX.pomo.start(); };
      const rst = q('#fx-reset', host);
      if(rst) rst.onclick = ()=>NX.pomo.reset();
    }
    q('#fx-t-pills', host).innerHTML =
      `<span class="pill gray">${stats.done} rounds all-time</span>
       <span class="pill green">${Math.round(t.prod/60)} min focused today</span>`;
  }

  /* ================= BREATHING ================= */
  let breathOn = false, step = 0, cycles = 0, pattern = 'box';

  function breathAdvance(){
    const p = BREATHE[pattern];
    const s = p.steps[step];
    const circle = q('#fx-b-circle', view), label = q('#fx-b-label', view);
    if(!circle || !label) return;
    circle.style.transitionDuration = s.d + 's';
    circle.style.transform = 'scale(' + s.s + ')';
    label.textContent = s.t + ' · ' + s.d + 's';
    const sub = q('#fx-b-sub', view);
    if(sub) sub.textContent = 'Cycle ' + (cycles+1) + ' · step ' + (step+1) + ' of ' + p.steps.length;
    later('breath', ()=>{
      step = (step+1) % p.steps.length;
      if(step === 0){ cycles++; Sound.blip(520, 180); }
      breathAdvance();
    }, s.d*1000);
  }
  function breathToggle(){
    breathOn = !breathOn;
    if(breathOn){ step = 0; breathAdvance(); Sound.blip(440, 120); }
    else { clearTimeout(T.breath); T.breath = null; }
    renderBreath();
  }
  function renderBreath(){
    const host = q('#fx-breathe', view); if(!host) return;
    const p = BREATHE[pattern];
    const mins = p.steps.reduce((a,s)=>a+s.d,0) * cycles;
    host.innerHTML = `
      <div class="card-h">
        <div class="tile">${icon('activity')}</div>
        <div><div class="c-title">Breathing</div><div class="c-sub" id="fx-b-sub">${breathOn ? 'Cycle ' + (cycles+1) : 'Pick a rhythm, follow the circle'}</div></div>
      </div>
      <div class="card-b">
        <div class="fx-breath-wrap">
          <div class="fx-breath ${breathOn?'go':''}" id="fx-b-circle" style="transform:scale(${breathOn?p.steps[step].s:.55})"></div>
          <div class="fx-breath-label" id="fx-b-label">${breathOn ? p.steps[step].t : 'Ready'}</div>
        </div>
        <div class="fx-lens">
          ${Object.keys(BREATHE).map(k=>`<button class="chip ${pattern===k?'active':''}" data-pat="${k}">${BREATHE[k].l}</button>`).join('')}
        </div>
        <div class="row gap-8" style="justify-content:center">
          <button class="btn ${breathOn?'btn-soft':'btn-green'}" id="fx-b-go">${icon(breathOn?'pause':'play')} ${breathOn?'Stop':'Begin'}</button>
          <button class="btn btn-soft btn-sm" id="fx-b-reset">Reset</button>
        </div>
        <div class="row gap-8" style="justify-content:center;margin-top:10px">
          <span class="pill gray">${cycles} cycles</span>
          <span class="pill gray">${Math.floor(mins/60)}m ${mins%60}s breathed</span>
        </div>
      </div>`;
    qa('[data-pat]', host).forEach(b=>b.onclick = ()=>{
      pattern = b.dataset.pat;
      const was = breathOn;
      if(was){ clearTimeout(T.breath); step = 0; }
      renderBreath();
      if(was) breathAdvance();
    });
    q('#fx-b-go', host).onclick = breathToggle;
    q('#fx-b-reset', host).onclick = ()=>{
      breathOn = false; cycles = 0; step = 0; clearTimeout(T.breath); T.breath = null; renderBreath();
    };
  }

  /* ================= AMBIENT ================= */
  function renderSound(){
    const host = q('#fx-sound', view); if(!host) return;
    const cur = Sound.MODES.find(m=>m.v === Sound.mode) || Sound.MODES[0];
    host.innerHTML = `
      <div class="card-h">
        <div class="tile">${icon('volume')}</div>
        <div><div class="c-title">Ambient</div><div class="c-sub">${cur.d}</div></div>
        <div class="spacer"></div>
        <span class="pill ${Sound.on?'green':'gray'}" id="fx-s-pill">${Sound.on?'playing':'off'}</span>
      </div>
      <div class="card-b">
        <div class="fx-lens">
          ${Sound.MODES.map(m=>`<button class="chip ${Sound.mode===m.v?'active':''}" data-mode="${m.v}">${m.l}</button>`).join('')}
        </div>
        <div class="fx-viz ${Sound.on?'go':''}" id="fx-viz">${Array.from({length:26},()=>'<i></i>').join('')}</div>
        <div class="row gap-12">
          <span class="faint small" style="width:52px">Volume</span>
          <input type="range" class="fx-range" id="fx-vol" min="0" max="100" value="${Math.round(Sound.vol*100)}" aria-label="Ambient volume">
        </div>
        <div class="row gap-8">
          <button class="btn ${Sound.on?'btn-soft':'btn-green'}" id="fx-s-play">${icon(Sound.on?'pause':'play')} ${Sound.on?'Stop':'Play'}</button>
          <button class="btn btn-soft" id="fx-s-test">Test tone</button>
        </div>
      </div>`;
    qa('[data-mode]', host).forEach(b=>b.onclick = ()=>{ Sound.setMode(b.dataset.mode); renderSound(); });
    q('#fx-s-play', host).onclick = ()=>{ Sound.toggle(); renderSound(); };
    q('#fx-s-test', host).onclick = ()=>{ Sound.blip(660, 140); setTimeout(()=>Sound.blip(880, 140), 160); };
    q('#fx-vol', host).addEventListener('input', e=>Sound.setVol(+e.target.value/100));
  }

  /* ================= EYE BREAK ================= */
  let eyeOn = false, eyeLeft = 20*60;
  function renderEye(){
    const host = q('#fx-eye', view); if(!host) return;
    host.innerHTML = `
      <div class="card-h">
        <div class="tile">${icon('eye')}</div>
        <div><div class="c-title">Eye break</div><div class="c-sub">20-20-20 rule</div></div>
        <div class="spacer"></div>
        <span class="pill ${eyeOn?'green':'gray'}" id="fx-e-pill">${eyeOn?'on':'off'}</span>
      </div>
      <div class="card-b">
        <div class="fx-eye-timer">${U.fmtClock(eyeLeft)}</div>
        <p class="faint small" style="text-align:center;max-width:280px;margin:0 auto">
          Every 20 minutes, look at something 20 feet away for 20 seconds. It eases eye strain and refocus.</p>
        <div class="row gap-10" style="justify-content:center;margin-top:12px">
          <label class="row gap-8" style="cursor:pointer">
            <span class="switch"><input type="checkbox" id="fx-e-on" ${eyeOn?'checked':''}><span class="track"></span></span>
            <span class="small bold">Remind me</span>
          </label>
          <button class="btn btn-soft btn-sm" id="fx-e-now">Take one now</button>
        </div>
      </div>`;
    q('#fx-e-on', host).onchange = e=>{
      eyeOn = e.target.checked;
      if(eyeOn){ eyeLeft = 20*60; every('eye', eyeTick, 1000); }
      else { clearInterval(T.eye); T.eye = null; }
      renderEye();
    };
    q('#fx-e-now', host).onclick = eyeRemind;
  }
  function eyeTick(){
    eyeLeft--;
    if(eyeLeft <= 0){ eyeRemind(); eyeLeft = 20*60; }
    const el = q('#fx-eye-timer', view);
    if(el) el.textContent = U.fmtClock(eyeLeft);
  }
  function eyeRemind(){
    NX.toastInfo('Eye break', 'Look 20 feet away for 20 seconds.', { life:5000 });
    try{ NX.pushNotif('Time for an eye break', 'Look at something 20 feet away for 20s.', 'eye'); }catch(e){}
    try{ NX.native.notify({ title:'👀 Eye break', body:'Look at something 20 feet away for 20 seconds.' }); }catch(e){}
    Sound.blip(880, 200);
  }

  /* ================= TODAY ================= */
  function renderToday(){
    const host = q('#fx-today', view); if(!host) return;
    const t = NX.totals();
    const goalMin = NX.store.get('settings', {}).focusGoalMin || 240;
    const goal = goalMin*60;
    const rows = [
      { l:'Productive', v:t.prod, c:'var(--green)' },
      { l:'Neutral',    v:t.neut, c:'var(--yellow)' },
      { l:'Distraction',v:t.distr, c:'var(--red)' }
    ];
    const scored = Math.round(t.prod / Math.max(1, t.prod + t.distr) * 100);
    host.innerHTML = `
      <div class="card-h">
        <div class="tile">${icon('pie')}</div>
        <div><div class="c-title">Today's focus ledger</div><div class="c-sub">Live from Timeless</div></div>
        <div class="spacer"></div>
        <span class="pill ${scored>=70?'green':scored>=40?'yellow':'red'}">${scored}% focus</span>
      </div>
      <div class="card-b">
        <div class="row gap-16">
          <div class="score-ring" style="width:96px;height:96px">
            <svg viewBox="0 0 130 130" width="96" height="96" class="ring">
              <circle cx="65" cy="65" r="52" class="bg" stroke-width="15"/>
              <circle cx="65" cy="65" r="52" fill="none" stroke="var(--green)" stroke-width="15" stroke-linecap="round"
                stroke-dasharray="${Math.round(326.7)}" stroke-dashoffset="${Math.round(326.7*(1 - scored/100))}" transform="rotate(-90 65 65)"/>
              <text x="65" y="62" text-anchor="middle" style="font-size:24px;font-weight:800;fill:var(--ink)">${scored}%</text>
              <text x="65" y="80" text-anchor="middle" style="font-size:10px;font-weight:700;letter-spacing:.05em;fill:var(--ink-3)">FOCUS</text>
            </svg>
          </div>
          <div class="fx-rows">
            ${rows.map(r=>`<div class="fx-row">
              <span class="row gap-6"><i style="width:10px;height:10px;border-radius:3px;background:${r.c};flex:none"></i>
                <span class="small bold">${r.l}</span></span>
              <div class="meter" style="flex:1"><i style="width:${t.total ? Math.round(r.v/t.total*100) : 0}%;background:${r.c}"></i></div>
              <b class="small mono-num" style="min-width:56px;text-align:right">${U.fmtTime(r.v)}</b>
            </div>`).join('')}
          </div>
        </div>
        <div class="fx-goal">
          <div class="row small"><span class="muted">Daily goal</span><b style="margin-left:auto" class="mono-num">${Math.round(t.prod/60)} / ${goalMin} min</b></div>
          <div class="meter"><i style="width:${Math.min(100, Math.round(t.prod/goal*100))}%"></i></div>
        </div>
      </div>`;
  }

  /* ================= WEEK ================= */
  function renderWeek(){
    const host = q('#fx-week', view); if(!host) return;
    const bars = weekBars();
    const peak = Math.max(600, ...bars.map(b=>b.prod));
    const totalMin = Math.round(bars.reduce((a,b)=>a+b.prod,0)/60);
    host.innerHTML = `
      <div class="card-h">
        <div class="tile">${icon('activity')}</div>
        <div><div class="c-title">Last 7 days</div><div class="c-sub">${totalMin} productive minutes</div></div>
        <div class="spacer"></div>
        <span class="pill ${totalMin>120?'green':'gray'}">${totalMin>120?'strong week':'build it up'}</span>
      </div>
      <div class="card-b">
        <div class="fx-week">
          ${bars.map(b=>`<div class="fx-wcol">
            <div class="fx-wbar-track"><i style="height:${Math.max(3, Math.round(b.prod/peak*100))}%"></i></div>
            <span>${b.label}</span>
          </div>`).join('')}
        </div>
        <div class="row gap-8" style="justify-content:center;margin-top:12px">
          <button class="btn btn-soft btn-sm" id="fx-w-go">${icon('clock')} Open Timeless</button>
          <span class="faint tiny">${bars[6].prod > 0 ? 'Today is tracking' : 'Start a focus round to log time'}</span>
        </div>
      </div>`;
    q('#fx-w-go', host).onclick = ()=>NX.router.go('timeless');
  }

  /* ---------------- boot the tab ---------------- */
  renderTimer(); renderBreath(); renderSound(); renderEye(); renderToday(); renderWeek();

  const offPomo = NX.events.on('pomo:changed', renderTimer);
  const offTot = NX.events.on('timeless:tick', ()=>{ renderToday(); renderWeek(); });
  dispose = ()=>{ offPomo(); offTot(); clearT(); };
});

/* run the previous visit's cleanup when navigating away from Focus */
let pending = null;
const _focusRender = NX.router.routes.focus.render;
NX.router.routes.focus.render = function(app){
  if(pending){ pending(); pending = null; }
  _focusRender.call(NX.router.routes.focus, app);
  pending = dispose;
};
})(window.NX);