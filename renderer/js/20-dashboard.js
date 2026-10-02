/* ============================================================
   Pebble 3.0 — 20-dashboard.js
   Elera-style overview: stat strip, activity table, peak chart,
   month heatmap, task snapshot, next reminders
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

function statsToday(){
  const today = U.todayKey();
  const tl = (NX.store.get('timeless', {})[today]) || {};
  let focusSec = 0, distractSec = 0;
  Object.values(tl).forEach(a=>{ if(a.cat==='prod') focusSec += a.sec; if(a.cat==='distr') distractSec += a.sec; });
  const tasks = NX.store.get('tasks', []);
  const msgs = Object.values(NX.store.get('messages', {})).reduce((n,arr)=>n+arr.filter(m=>m.me && U.todayKey(m.ts)===today).length, 0);
  const pomo = NX.store.get('pomoStats', { done:0 });
  return { focusSec, distractSec, tasksOpen: tasks.filter(t=>!t.done).length, tasksDone: tasks.filter(t=>t.done).length, msgs, pomoDone: pomo.done||0 };
}

function streak(){
  const tl = NX.store.get('timeless', {});
  let s = 0;
  for(let i=0;i<60;i++){
    const d = NX.store.get('timeless', {})[U.todayKey(new Date(Date.now()-i*86400e3))];
    const active = d && Object.values(d).some(a=>a.sec > 300);
    if(active) s++; else if(i>0) break;
  }
  return s;
}

NX.routeInShell('dashboard', 'Dashboard', 'dashboard', function(view){
  const st = statsToday();
  const today = U.todayKey();
  const goalMin = NX.store.get('settings', {}).focusGoalMin || 240;
  const goalPct = Math.min(100, Math.round((st.focusSec/60) / goalMin * 100));
  const sk = streak();

  /* welcome-back / resume detection: PebbleX remembers what this PC holds */
  const tlData = NX.store.get('timeless', {});
  const yKey = U.todayKey(new Date(Date.now()-86400e3));
  const yData = tlData[yKey] || {};
  let ySec = 0; Object.entries(yData).forEach(([k,a])=>{ if(k!=='__hours' && a && a.sec) ySec += a.sec; });
  const lastNote = (NX.store.get('notes', [])[0]) || null;
  const openTasks = NX.store.get('tasks', []).filter(t=>!t.done);
  const hasHistory = ySec > 120 || sk > 1 || openTasks.length > 0;
  const dismissed = NX.store.get('ui:resumeDismissed', '') === today;

  view.innerHTML = `
  <div class="page">
    ${hasHistory && !dismissed ? `
    <div class="resume-banner anim-in">
      <div class="rb-ic">${icon('history')}</div>
      <div class="rb-txt">
        <b>Welcome back${st.tasksOpen?' — '+st.tasksOpen+' task'+(st.tasksOpen===1?'':'s')+' waiting':''}.</b>
        <span>Yesterday you tracked <b>${U.fmtTime(ySec)}</b> and your streak is <b>${sk} day${sk===1?'':'s'}</b>.
        Everything is exactly where you left it — continue?</span>
      </div>
      <div class="rb-acts">
        ${lastNote?`<button class="btn btn-soft btn-sm" id="rb-note">${icon('notes')} Open last note</button>`:''}
        <button class="btn btn-soft btn-sm" id="rb-tasks">${icon('todo')} Tasks</button>
        <button class="btn btn-green btn-sm" id="rb-time">${icon('clock')} Timeless</button>
        <button class="icon-btn sm" id="rb-x" data-tip="Dismiss for today">${icon('x')}</button>
      </div>
    </div>`:''}
    <div class="card stat-strip anim-in">
      <div class="stat">
        <div class="tile">${icon('todo')}</div>
        <div><div class="s-label">Open tasks</div>
          <div class="s-num">${st.tasksOpen}<span class="of"> / ${st.tasksOpen+st.tasksDone}</span></div></div>
        <span class="delta up" style="margin-left:auto">${st.tasksDone} done</span>
      </div>
      <div class="stat">
        <div class="tile">${icon('clock')}</div>
        <div><div class="s-label">Focus time today</div>
          <div class="s-num">${U.fmtTime(st.focusSec)}</div></div>
        <span class="delta ${goalPct>=100?'up':'warn'}" style="margin-left:auto">${goalPct}% of goal</span>
      </div>
      <div class="stat">
        <div class="tile">${icon('chat')}</div>
        <div><div class="s-label">Messages today</div>
          <div class="s-num">${st.msgs}</div></div>
      </div>
      <div class="stat">
        <div class="tile">${icon('fire')}</div>
        <div><div class="s-label">Streak</div>
          <div class="s-num">${sk}<span class="of"> day${sk===1?'':'s'}</span></div></div>
      </div>
    </div>

    <div class="dash-live">
      <div class="card live-weather anim-in" style="animation-delay:.03s;background:var(--dark-card);border-radius:20px" id="db-weather">
        <div class="card-h" style="color:#F6F5F3"><div class="tile sm" style="background:rgba(255,255,255,.12);color:#F6F5F3" id="db-wx-ic">${icon('globe')}</div>
          <div><div class="c-title" style="color:#F6F5F3" id="db-wx-city">Weather</div><div class="c-sub" style="color:#9B9B94" id="db-wx-sub">Live outside your window</div></div>
          <div class="spacer"></div><span class="count-chip" id="db-wx-at"></span></div>
        <div class="card-b" id="db-wx-body" style="padding-top:10px"><div class="faint small">Fetching live weather…</div></div>
      </div>

      <div class="card live-joke anim-in" style="animation-delay:.06s" id="db-joke">
        <div class="card-h"><div class="tile sm" style="background:var(--orange-soft);color:var(--orange-deep, var(--ink-2))">${icon('star')}</div>
          <div><div class="c-title">Joke of the moment</div><div class="c-sub">A fresh one every time you land here</div></div>
          <div class="spacer"></div><button class="btn btn-soft btn-sm" id="db-joke-another">${icon('refresh')} Another</button></div>
        <div class="card-b" id="db-joke-body" style="padding-top:10px"><div class="faint small">Fetching a fresh joke…</div></div>
      </div>
    </div>

    <div class="dash-grid">
      <div class="card anim-in" style="animation-delay:.05s">
        <div class="card-h"><div class="tile sm">${icon('activity')}</div>
          <div><div class="c-title">Live workspace</div><div class="c-sub">Everything you touched today</div></div>
          <div class="spacer"></div><span class="count-chip" id="db-act-count"></span></div>
        <div class="card-b" style="padding-top:6px"><div style="overflow-x:auto"><table class="etable" id="db-activity"></table></div></div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
        <div class="card anim-in" style="animation-delay:.1s">
          <div class="card-h"><div class="tile sm">${icon('clock')}</div>
            <div><div class="c-title">Peak focus hours</div><div class="c-sub">Today, by hour</div></div></div>
          <div class="card-b"><div id="db-peak" style="display:flex;align-items:flex-end;gap:6px;height:130px"></div></div>
        </div>
        <div class="card anim-in" style="animation-delay:.15s">
          <div class="card-h"><div class="tile sm">${icon('bell')}</div>
            <div><div class="c-title">Next up</div><div class="c-sub">Reminders & alerts</div></div>
            <div class="spacer"></div>
            <button class="btn btn-soft btn-sm" id="db-all-rem">View all</button></div>
          <div class="card-b" id="db-reminders" style="padding-top:8px"></div>
        </div>
      </div>
    </div>

    <div class="dash-row2">
      <div class="card anim-in" style="background:var(--dark-card);border-radius:20px;animation-delay:.2s">
        <div class="card-h" style="color:#F6F5F3"><div class="tile sm" style="background:rgba(255,255,255,.12);color:#F6F5F3">${icon('calendar')}</div>
          <div><div class="c-title" style="color:#F6F5F3">Active days</div><div class="c-sub" style="color:#9B9B94">This month</div></div></div>
        <div class="card-b"><div class="heat" id="db-heat"></div></div>
      </div>

      <div class="card anim-in" style="animation-delay:.25s">
        <div class="card-h"><div class="tile sm">${icon('target')}</div>
          <div><div class="c-title">Focus goal</div><div class="c-sub">${goalMin} min target today</div></div></div>
          <div class="card-b" style="display:flex;flex-direction:column;align-items:center;gap:12px">
            <div class="score-ring" style="width:130px;height:130px">
              <svg class="ring" width="130" height="130" viewBox="0 0 130 130">
                <circle class="bg" cx="65" cy="65" r="56" stroke-width="11"/>
                <circle class="fg" id="db-ring" cx="65" cy="65" r="56" stroke-width="11"
                  stroke-dasharray="${(2*Math.PI*56).toFixed(1)}" stroke-dashoffset="${(2*Math.PI*56).toFixed(1)}"/>
              </svg>
              <div class="sr-num"><b>${goalPct}%</b><span>of goal</span></div>
            </div>
            <div class="muted small" id="db-goal-txt"></div>
          </div>
      </div>

      <div class="card anim-in" style="animation-delay:.3s">
        <div class="card-h"><div class="tile sm">${icon('todo')}</div>
          <div><div class="c-title">Task snapshot</div><div class="c-sub">Open work right now</div></div></div>
        <div class="card-b" id="db-tasks" style="padding-top:8px"></div>
      </div>
    </div>
  </div>`;

  /* resume banner actions */
  const rb = (id, fn)=>{ const b = q(id, view); if(b) b.onclick = fn; };
  rb('#rb-note', ()=>NX.router.go('notes'));
  rb('#rb-tasks', ()=>NX.router.go('todo'));
  rb('#rb-time', ()=>NX.router.go('timeless'));
  rb('#rb-x', ()=>{ NX.store.set('ui:resumeDismissed', today); NX.router.go('dashboard'); });

  /* activity table */
  const acts = [];
  Object.entries(NX.store.get('timeless', {})[today] || {}).forEach(([k,a])=>{
    if(a.sec > 60) acts.push({ ic:'clock', c:a.cat, name:a.name, detail:U.fmtTime(a.sec), ts:Date.now()-1000 });
  });
  NX.store.get('tasks', []).slice(0,4).forEach(t=>acts.push({ ic:'todo', c:'task', name:t.name, detail: t.done?'completed':'open', ts:t.created }));
  NX.store.get('notes', []).slice(0,3).forEach(n=>acts.push({ ic:'notes', c:'note', name:n.title, detail:'note', ts:n.updated }));
  acts.sort((a,b)=>b.ts-a.ts);
  const tbl = q('#db-activity', view);
  const show = acts.slice(0, 7);
  q('#db-act-count', view).textContent = acts.length + ' today';
  if(!show.length){
    tbl.outerHTML = `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${NX.ICON_PATHS.activity}"/></svg><div class="e-sub">Activity from Timeless, Tasks and Notes will appear here.</div></div>`;
  } else {
    tbl.innerHTML = `<thead><tr><th>What</th><th>Kind</th><th style="text-align:right">Detail</th></tr></thead><tbody>${
      show.map(a=>`<tr>
        <td style="display:flex;align-items:center;gap:10px"><span class="avatar sm" style="background:${U.colorFor(a.name)}">${icon(a.ic)}</span><b class="ellipsis" style="max-width:280px">${U.esc(a.name)}</b></td>
        <td><span class="pill ${a.c==='prod'?'green':a.c==='distr'?'red':a.c==='task'?'blue':a.c==='note'?'purple':'gray'}">${U.esc(a.c)}</span></td>
        <td style="text-align:right" class="mono-num">${U.esc(a.detail)}</td></tr>`).join('')
    }</tbody>`;
  }

  /* peak hours chart */
  const hours = new Array(15).fill(0).map((_,i)=>({ h:i+8, v:0 })); // 8am..10pm
  const tlToday = NX.store.get('timeless', {})[today] || {};
  const slots = (tlToday.__hours) || {};
  Object.entries(slots).forEach(([h1,v])=>{ const idx = +h1 - 8; if(idx>=0 && idx<hours.length) hours[idx].v += v; });
  const max = Math.max(60, ...hours.map(x=>x.v));
  const peak = q('#db-peak', view);
  if(tlToday.__hours && Object.keys(tlToday.__hours).length){
    peak.innerHTML = hours.map(x=>`<div class="bar-col" data-tip="${x.h>12?x.h-12+' pm':x.h+' am'}">
      <div class="bar ${x.v===Math.max(...hours.map(y=>y.v)) && x.v>0?'hot':''}" style="height:${Math.max(4, x.v/max*100)}%"></div>
      <div class="bar-label">${x.h%12===0?12:x.h%12}${x.h<12?'a':'p'}</div></div>`).join('');
  } else {
    // demo silhouette until Timeless collects data
    const demo = [8,20,35,22,48,30,90,45,60,26,38,18,30,12,22];
    peak.innerHTML = demo.map((v,i)=>`<div class="bar-col" data-tip="Waiting for live data">
      <div class="bar ${v===90?'hot':''}" style="height:${v}%;opacity:.55"></div>
      <div class="bar-label">${(i+8)%12===0?12:(i+8)%12}${(i+8)<12?'a':'p'}</div></div>`).join('');
  }

  /* reminders */
  const rems = NX.store.get('reminders', []).filter(r=>!r.fired).sort((a,b)=>a.when-b.when).slice(0,3);
  const remEl = q('#db-reminders', view);
  remEl.innerHTML = rems.length ? rems.map(r=>`
    <div class="app-row"><div class="ar-ic" style="background:var(--green-soft);color:var(--green-deep)">${icon('bell')}</div>
      <div style="min-width:0;flex:1"><div class="ar-name">${U.esc(r.name)}</div><div class="ar-cat">${U.esc(U.untilStr(r.when))}${r.repeat!=='none'?' · '+U.esc(r.repeat):''}</div></div>
      <span class="pill gray mono-num">${U.esc(U.hhmm(r.when))}</span></div>`).join('')
    : `<div class="empty" style="padding:18px"><div class="e-sub">No upcoming reminders — add one in Reminders.</div></div>`;
  q('#db-all-rem', view).onclick = ()=>NX.router.go('reminders');

  /* heatmap (this month, demo-seeded until data exists) */
  const heat = q('#db-heat', view);
  const tlAll = NX.store.get('timeless', {});
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
  const days = new Date(y, mo+1, 0).getDate();
  let heatHtml = '';
  for(let d=1; d<=days; d++){
    const key = `${y}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const rec = tlAll[key];
    const activeMin = rec ? Math.round(Object.values(rec).reduce((s,a)=>s+(a.sec||0),0)/60) : (d<now.getDate()? 40 + (d*37)%120 : 0);
    const hot = activeMin >= 60;
    heatHtml += `<i class="${hot?'hot':''} ${d===now.getDate()?'today':''}" data-tip="${key} · ${activeMin} min">${d}</i>`;
  }
  heat.innerHTML = heatHtml;

  /* goal ring */
  setTimeout(()=>{
    const ring = q('#db-ring', view);
    if(ring){ ring.style.strokeDashoffset = String(2*Math.PI*56 * (1 - goalPct/100)); }
  }, 150);
  const ring = q('#db-ring', view);
  if(ring) ring.style.strokeDashoffset = String(2*Math.PI*56 * (1 - goalPct/100));
  q('#db-goal-txt', view).textContent = st.focusSec > 0
    ? `${U.fmtTime(st.focusSec)} focused — ${st.distractSec>0? U.fmtTime(st.distractSec)+' distracted' : 'zero distraction. Chef kiss.'}`
    : 'Open Timeless and let it watch your apps — the ring fills as you focus.';

  /* task snapshot */
  const tasks = NX.store.get('tasks', []).filter(t=>!t.done).slice(0, 4);
  const tEl = q('#db-tasks', view);
  tEl.innerHTML = tasks.length ? tasks.map(t=>`
    <div class="app-row">
      <div class="ar-ic" style="background:${t.cat==='health'?'var(--green-soft);color:var(--green-deep)':t.cat==='work'?'var(--blue-soft);color:var(--blue)':'var(--purple-soft);color:var(--purple)'}">${icon('todo')}</div>
      <div style="min-width:0;flex:1"><div class="ar-name ellipsis">${U.esc(t.name)}</div><div class="ar-cat">${U.esc(t.col)}</div></div>
      <button class="btn btn-soft btn-sm" data-done="${t.id}">Done</button>
    </div>`).join('')
    : `<div class="empty" style="padding:18px"><div class="e-sub">Inbox zero. Add tasks in Tasks.</div></div>`;
  qa('[data-done]', tEl).forEach(b=>b.onclick = ()=>{
    const ts = NX.store.get('tasks', []);
    const t = ts.find(x=>x.id === b.dataset.done);
    if(t){ t.done = true; t.doneAt = Date.now(); NX.store.set('tasks', ts); NX.confetti(e.clientX, e.clientY); NX.sfx.play('ok'); NX.router.go('dashboard'); }
  });

  /* ---------- live weather (fresh on every visit) ---------- */
  (async ()=>{
    const w = await NX.weather.load();
    const city = q('#db-wx-city', view), sub = q('#db-wx-sub', view),
          body = q('#db-wx-body', view), at = q('#db-wx-at', view), ic = q('#db-wx-ic', view);
    if(!body) return;   // navigated away
    if(w && w.ok){
      city.textContent = `${w.emoji}  ${w.temp}°C — ${U.esc(w.city)}`;
      sub.textContent = `${U.esc(w.desc)} · feels ${w.feels}°`;
      at.textContent = w.cached ? 'cached' : 'live';
      ic.innerHTML = `<span style="font-size:20px">${w.emoji}</span>`;
      body.innerHTML = `<div class="wx-row">
          <div class="wx-cell"><div class="wx-k">High / Low</div><div class="wx-v">${w.hi}° / ${w.lo}°</div></div>
          <div class="wx-cell"><div class="wx-k">Wind</div><div class="wx-v">${w.wind} km/h</div></div>
          <div class="wx-cell"><div class="wx-k">Humidity</div><div class="wx-v">${w.hum}%</div></div>
        </div>`;
    } else {
      city.textContent = 'Weather unavailable';
      sub.textContent = 'Could not reach the weather service';
      body.innerHTML = `<div class="faint small">Pebble will retry next time you open the dashboard.</div>`;
    }
  })();

  /* ---------- joke of the moment (fresh on every visit) ---------- */
  async function loadJoke(){
    const j = await NX.joke.load();
    const body = q('#db-joke-body', view); if(!body) return;
    if(j && j.ok){
      body.innerHTML = `<div class="joke-box">
        <div class="joke-setup">${U.esc(j.setup)}</div>
        ${j.punchline ? `<div class="joke-punch" id="db-joke-punch"><button class="btn btn-soft btn-sm" id="db-joke-reveal">Reveal punchline</button></div>` : ''}
        <div class="faint tiny" style="margin-top:8px">via ${U.esc(j.source)}</div>
      </div>`;
      const rev = q('#db-joke-reveal', body);
      if(rev) rev.onclick = ()=>{ q('#db-joke-punch', body).innerHTML = `<div class="joke-punchline">${U.esc(j.punchline)}</div>`; NX.sfx.play('pop'); };
    } else {
      body.innerHTML = `<div class="faint small">Joke service is napping. Try "Another".</div>`;
    }
  }
  loadJoke();
  const ja = q('#db-joke-another', view); if(ja) ja.onclick = loadJoke;
});
})(window.NX);
