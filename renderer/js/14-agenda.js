/* ============================================================
   PebbleX v0.1 — 14-agenda.js
   Navigation power tools:
     · Today — one agenda merging tasks due, reminders and
       the focus goal, with everything one click away
     · sidebar full keyboard navigation
     · split view — any module beside Notes without losing place
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* ============================================================
   TODAY  (route: 'today')
   ============================================================ */
function dayBuckets(){
  const today = U.todayKey();
  const tom = U.todayKey(new Date(Date.now()+86400e3));
  const week = U.todayKey(new Date(Date.now()+7*86400e3));
  const tasks = NX.store.get('tasks', []) || [];
  const open = tasks.filter(t => !t.done);
  return {
    overdue:  open.filter(t => t.due && t.due <  today),
    today:    open.filter(t => !t.due || t.due === today),
    tomorrow: open.filter(t => t.due === tom),
    week:     open.filter(t => t.due && t.due > tom && t.due <= week),
    later:    open.filter(t => t.due && t.due >  week),
    doneToday:tasks.filter(t => t.done).slice(-8).reverse()
  };
}

NX.routeInShell('today', 'Today', 'sun', function(view){
  const b = dayBuckets();
  const rems = (NX.store.get('reminders', []) || [])
    .filter(r => !r.fired)
    .sort((x,y)=> x.when - y.when);
  const dueSoon = rems.filter(r => r.when - Date.now() < 86400e3 * 2);
  const t = NX.totals ? NX.totals() : { prod:0, neut:0, distr:0 };
  const goalMin = NX.store.get('settings', {}).focusGoalMin || 240;
  const plan = (NX.store.get('focus', {}) || {});
  const log = (plan.rounds || []);

  function taskRow(t, tone){
    return `<div class="ag-row" data-task="${t.id}">
      <span class="check ${t.done?'checked':''}" data-check="${t.id}">${icon('check')}</span>
      <span class="ag-txt">
        <b class="ellipsis">${U.esc(t.name)}</b>
        ${t.note ? `<i class="ellipsis">${U.esc(t.note)}</i>` : ''}
      </span>
      ${t.due ? `<span class="pill ${tone}">${U.esc(t.due === U.todayKey() ? 'Today' : t.due)}</span>` : ''}
      ${t.important ? `<span class="pill orange">${icon('star',11)}</span>` : ''}
      ${t.steps && t.steps.length ? `<span class="ag-steps">${t.steps.filter(s=>s.done).length}/${t.steps.length}</span>` : ''}
    </div>`;
  }
  function group(title, ic, rows, empty, tone){
    if(!rows.length) return '';
    return `<div class="card ag-card">
      <div class="card-h"><div class="tile sm">${icon(ic)}</div>
        <div><div class="c-title">${U.esc(title)}</div></div>
        <div class="spacer"></div><span class="count-chip">${rows.length}</span></div>
      <div class="card-b" style="padding-top:6px">
        <div class="ag-list">${rows.map(r => typeof r === 'string' ? r : taskRow(r, tone)).join('')}</div>
      </div></div>`;
  }

  const totalOpen = b.overdue.length + b.today.length + b.tomorrow.length + b.week.length + b.later.length;
  const goalPct = Math.min(100, Math.round((t.prod/60) / goalMin * 100));

  view.innerHTML = `
  <div class="page" id="ag-page">
    <div class="row gap-8" style="flex-wrap:wrap">
      <span class="pill green">${icon('sun')} ${U.dayName(0)}</span>
      <span class="pill ${b.overdue.length?'red':'gray'}">${totalOpen} open</span>
      <span class="pill ${goalPct>=100?'green':'gray'}">${Math.round(t.prod/60)} / ${goalMin} min focused</span>
      <span class="faint small">${log.length ? log.length + ' focus round' + (log.length===1?'':'s') + ' today' : 'No rounds yet today'}</span>
      <span style="flex:1"></span>
      <button class="btn btn-soft btn-sm" id="ag-focus">${icon('timer')} Focus</button>
      <button class="btn btn-dark btn-sm" id="ag-add">${icon('plus')} Capture</button>
    </div>

    <div class="ag-grid">
      <div class="tl-col">
        ${group(b.overdue.length ? 'Overdue' : '', 'alert', b.overdue, '', 'red') || ''}
        ${group('Today', 'check', b.today, 'Nothing due — enjoy the calm.', 'green')}
        ${b.tomorrow.length ? group('Tomorrow', 'calendar', b.tomorrow, '', 'blue') : ''}
        ${b.week.length ? group('This week', 'calendar', b.week, '', 'purple') : ''}
        ${b.later.length ? group('Later', 'clock', b.later, '', 'gray') : ''}
        ${!totalOpen ? `<div class="empty card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${NX.ICON_PATHS.inbox}"/></svg>
          <div class="e-title">Inbox zero</div><div class="e-sub">No open tasks at all. Capture something new with Ctrl+⇧+U.</div>
          <button class="btn btn-green" id="ag-add2">${icon('plus')} Capture a task</button></div>` : ''}
      </div>

      <div class="tl-col">
        <div class="card">
          <div class="card-h"><div class="tile sm">${icon('bell')}</div>
            <div><div class="c-title">Next 48 hours</div><div class="c-sub">${rems.length ? rems.length + ' scheduled' : 'Nothing scheduled'}</div></div></div>
          <div class="card-b" style="padding-top:6px">
            ${dueSoon.length ? `<div class="ag-list">${dueSoon.slice(0,8).map(r=>`
              <div class="ag-row">
                <span class="ag-ic">${icon('bell')}</span>
                <span class="ag-txt"><b class="ellipsis">${U.esc(r.name)}</b><i>${U.esc(U.untilStr(r.when))}${r.repeat && r.repeat!=='none' ? ' · ' + r.repeat : ''}</i></span>
                <button class="btn btn-soft btn-sm" data-snooze="${r.id}" data-tip="Snooze 10 min">${icon('snooze')} 10m</button>
              </div>`).join('')}</div>`
              : `<div class="empty" style="padding:22px"><div class="e-sub">No reminders in the next two days.</div></div>`}
          </div>
        </div>

        <div class="card">
          <div class="card-h"><div class="tile sm">${icon('gauge')}</div>
            <div><div class="c-title">Focus goal</div><div class="c-sub">${goalPct}% of ${goalMin} min</div></div>
            <div class="spacer"></div>
            ${log.length ? `<span class="pill green">${U.fmtTime(log.reduce((a,r)=>a+(r.sec||0),0))}</span>` : ''}
          </div>
          <div class="card-b" style="padding-top:6px">
            <div class="meter"><i style="width:${goalPct}%"></i></div>
            <div class="ag-rounds">
              ${log.slice(-5).reverse().map(r=>`<div class="ag-round">
                <span class="pill ${r.cat||'green'}">${r.sec ? Math.round(r.sec/60) + 'm' : '—'}</span>
                <span class="ag-txt"><b class="ellipsis">${U.esc(r.task || r.note || 'Open focus')}</b></span>
                <span class="tiny faint">${U.esc(U.hhmm(r.at))}</span>
              </div>`).join('') || '<div class="tiny faint" style="padding:8px 2px">No rounds logged yet — press Ctrl+⇧+Enter.</div>'}
            </div>
          </div>
        </div>

        ${b.doneToday.length ? `<div class="card">
          <div class="card-h"><div class="tile sm">${icon('award')}</div>
            <div><div class="c-title">Recently done</div></div></div>
          <div class="card-b" style="padding-top:6px"><div class="ag-list">
            ${b.doneToday.map(t=>`<div class="ag-row done">
              <span class="ag-ic">${icon('check')}</span>
              <span class="ag-txt"><b class="ellipsis">${U.esc(t.name)}</b></span></div>`).join('')}
          </div></div></div>` : ''}
      </div>
    </div>
  </div>`;

  qa('[data-check]', view).forEach(c=>c.onclick = ()=>{
    const id = c.dataset.check;
    const list = NX.store.get('tasks', []) || [];
    const tk = list.find(x=>x.id===id);
    if(!tk) return;
    const was = !!tk.done, wasCol = tk.col, wasAt = tk.doneAt;
    tk.done = !tk.done;
    if(tk.done){ tk.doneAt = Date.now(); tk.col = 'done'; NX.sfx.play('ok'); NX.confetti(c.getBoundingClientRect().left, c.getBoundingClientRect().top); }
    else { delete tk.doneAt; tk.col = wasCol || 'today'; NX.sfx.play('pop'); }
    NX.store.set('tasks', list);
    NX.refreshBadges && NX.refreshBadges();
    NX.undoable(tk.done ? 'Task completed' : 'Task reopened', tk.name, ()=>{
      const l2 = NX.store.get('tasks', []) || [];
      const x = l2.find(y=>y.id===id);
      if(!x) return;
      x.done = was; x.col = wasCol;
      if(was) x.doneAt = wasAt; else delete x.doneAt;
      NX.store.set('tasks', l2);
      NX.refreshBadges && NX.refreshBadges();
      NX.router.go('today');
    });
    setTimeout(()=>NX.router.go('today'), 30);
  });

  qa('[data-snooze]', view).forEach(b=>b.onclick = ()=>{
    const id = b.dataset.snooze;
    const list = NX.store.get('reminders', []) || [];
    const r = list.find(x=>x.id===id);
    if(!r) return;
    const was = r.when;
    r.when = Date.now() + 10*60e3;
    NX.store.set('reminders', list);
    NX.sfx.play('tick');
    NX.undoable('Snoozed 10 minutes', r.name, ()=>{
      const l2 = NX.store.get('reminders', []) || [];
      const x = l2.find(y=>y.id===id);
      if(!x) return;
      x.when = was; NX.store.set('reminders', l2);
      NX.router.go('today');
    });
    NX.toastInfo('Snoozed', r.name + ' · 10 minutes');
    NX.router.go('today');
  });

  const add = q('#ag-add', view), add2 = q('#ag-add2', view);
  if(add) add.onclick = ()=>NX.openCapture('task');
  if(add2) add2.onclick = ()=>NX.openCapture('task');
  const fo = q('#ag-focus', view);
  if(fo) fo.onclick = ()=>{ NX.router.go('focus'); setTimeout(()=>NX.pomo && NX.pomo.start(), 120); };
});

/* ============================================================
   POST-RENDER HOOKS
   Lets a feature add a card to a module it does not own,
   so no two files have to own the same route's markup.
   ============================================================ */
const afterRender = {};
const _routeInShell = NX.routeInShell;
NX.routeInShell = function(name, title, ic, renderFn, onMount){
  return _routeInShell(name, title, ic, function(view){
    renderFn(view);
    const hooks = afterRender[name] || [];
    for(let i=0;i<hooks.length;i++){
      try{ hooks[i](view); }
      catch(e){ console.error('[after:'+name+']', e); }
    }
  }, onMount);
};
/* several features can hook the same route — returns an unregister fn */
NX.afterRouteRender = function(name, fn){
  (afterRender[name] = afterRender[name] || []).push(fn);
  return function(){
    const arr = afterRender[name] || [];
    const i = arr.indexOf(fn);
    if(i > -1) arr.splice(i,1);
  };
};
NX.renderRouteHook = function(name){ return (afterRender[name] || []).slice(); };

/* ============================================================
   FOCUS — round history, streak and break reminders
   ============================================================ */
function focusCard(){
  const host = document.createElement('div');
  host.id = 'fx-history';
  host.className = 'card';
  return host;
}
function renderFocusHistory(view){
  let card = q('#fx-history', view);
  const grid = q('#fx-page .focus-grid', view);
  if(!grid) return;
  const right = grid.children[1];
  if(!card){
    card = focusCard();
    (right || grid).appendChild(card);
  }
  const L = NX.focusLog || { rounds:()=>[], streak:()=>0, week:()=>[] };
  const rounds = L.rounds();
  const today = rounds.filter(r => U.todayKey(r.at) === U.todayKey());
  const week = L.week();
  const totalMin = Math.round(week.reduce((a,d)=> a + d.sec, 0)/60);
  const best = week.reduce((a,d)=> Math.max(a, d.sec), 0);
  const standMin = (NX.store.get('settings', {}) || {}).standReminderMin || 0;
  const held = (NX.deferredNotifs || []).length;

  card.innerHTML = `
    <div class="card-h">
      <div class="tile">${icon('award')}</div>
      <div><div class="c-title">Rounds & streak</div>
        <div class="c-sub">${today.length} today · ${L.streak()} day streak</div></div>
      <div class="spacer"></div>
      ${NX.dnd && NX.dnd.on ? `<span class="pill green">${icon('shield')} ${U.esc(NX.dnd.label)}</span>` : `<span class="pill gray">${week.length*0 + totalMin}m this week</span>`}
    </div>
    <div class="card-b">
      <div class="fx-week" style="height:104px">
        ${week.map(d=>`<div class="fx-wcol">
          <div class="fx-wbar-track"><i style="height:${best ? Math.max(3, Math.round(d.sec/best*100)) : 3}%${d.today ? ';box-shadow:inset 0 0 0 2px var(--surface)' : ''}"></i></div>
          <span>${d.label}</span>
        </div>`).join('')}
      </div>
      <div class="fx-rounds">
        ${today.slice(-4).reverse().map(r=>`<div class="ag-round">
          <span class="pill ${r.sec>=25*60?'green':'gray'}">${Math.round(r.sec/60)}m</span>
          <span class="ag-txt"><b class="ellipsis">${U.esc(r.task || 'Open focus')}</b></span>
          <span class="tiny faint">${U.esc(U.hhmm(r.at))}</span>
        </div>`).join('') || `<div class="tiny faint" style="padding:10px 2px">No rounds yet today. Press <b>Ctrl+⇧+Enter</b> to start one without leaving this tab.</div>`}
      </div>
      <div class="fx-stand">
        <div class="row gap-8">
          <span class="tiny bold">Stand & water reminder</span>
          <span style="flex:1"></span>
          <div class="cap-chips">
            ${[[0,'Off'],[30,'30m'],[45,'45m'],[60,'1h']].map(([m,l])=>
              `<button class="chip ${standMin===m?'active':''}" data-stand="${m}">${l}</button>`).join('')}
          </div>
        </div>
        ${held ? `<div class="fx-held">${icon('bell')} ${held} reminder${held===1?'':'s'} held by ${U.esc(NX.dnd.label)} — <button class="linkish" id="fx-held-clear">show all</button></div>` : ''}
      </div>
    </div>`;

  qa('[data-stand]', card).forEach(b=>b.onclick = ()=>{
    const s = NX.store.get('settings', {}) || {};
    s.standReminderMin = +b.dataset.stand;
    NX.store.set('settings', s);
    NX.sfx.play('tick');
    renderFocusHistory(view);
    if(+b.dataset.stand > 0) NX.toastInfo('Stand reminder on', 'Every ' + b.textContent);
  });
  const clr = q('#fx-held-clear', card);
  if(clr) clr.onclick = ()=>{
    const heldList = NX.deferredNotifs || [];
    if(!heldList.length) return;
    heldList.forEach(d => NX.pushNotif('Held reminder', d.name, 'bell'));
    heldList.length = 0;
    NX.events.emit('dnd:deferred');
    NX.toastOk('Reminders released');
    renderFocusHistory(view);
  };
}
NX.afterRouteRender('focus', renderFocusHistory);

/* stand & water nudges, independent of the eye break */
let standTimer = null;
function syncStand(){
  if(standTimer){ clearInterval(standTimer); standTimer = null; }
  const mins = (NX.store.get('settings', {}) || {}).standReminderMin || 0;
  if(!mins) return;
  let left = mins*60;
  standTimer = setInterval(()=>{
    left--;
    if(left > 0) return;
    left = mins*60;
    if(NX.dnd && NX.dnd.on) return;
    NX.toastInfo('Stand up & hydrate', 'Two minutes — your back and eyes will thank you.', { life:6000 });
    NX.sfx.play('notify');
  }, 1000);
}
document.addEventListener('DOMContentLoaded', ()=> setTimeout(syncStand, 400));
NX.events.on('store:settings', ()=>{ clearTimeout(standTimer); setTimeout(syncStand, 120); });

/* ============================================================
   SPLIT VIEW — any module pinned beside Notes
   ============================================================ */
const SPLITS = [
  { v:'off',    l:'Notes' },
  { v:'notes',  l:'Notes' },
  { v:'todo',   l:'Tasks' },
  { v:'chat',   l:'Chat' },
  { v:'today',  l:'Today' }
];
NX.splitView = {
  get(){ return NX.store.get('splitView', 'off'); },
  set(v){ NX.store.set('splitView', v || 'off'); },
  toggle(){
    const cur = this.get();
    this.set(cur === 'off' ? 'notes' : 'off');
    NX.toastInfo('Split view', cur === 'off' ? 'Notes pinned beside this module' : 'Split view closed');
    if(NX.router.currentName) NX.router.go(NX.router.currentName);
  }
};

(function splitShell(){
  /* The split pane used to be built inside renderShell, which only worked
     because the shell was rebuilt on every navigation. The shell is now built
     once and reused, so the split is applied explicitly: after each route
     render and whenever the setting changes. */
  NX.applySplit = function(){
    const view = q('#shell-view');
    const col = view && view.closest('.main-col');
    if(!view || !col) return;
    const split = NX.splitView.get();
    const current = NX.router.currentName;
    const wrap = q('.nx-split', col);
    const wantSplit = !!split && split !== 'off' && split !== current;

    if(!wantSplit){
      if(wrap){
        col.appendChild(view);          // lift it back out of the wrapper
        wrap.remove();
        view.style.flex = '';
      }
      return;
    }

    const paint = ()=>{
      const sub = q('#nx-split-host');
      if(!sub) return;
      sub.innerHTML = `<div class="nx-split-title"><span class="tiny faint">${U.esc((SPLITS.find(s=>s.v===split)||{}).l || split)} · preview</span></div>`;
      NX.renderInto(sub, split);
    };

    if(wrap){ paint(); return; }       // already applied, just refresh

    const wrapNew = h('<div class="nx-split"></div>');
    const main = h('<div class="nx-split-main"></div>');
    const side = h('<div class="nx-split-side"></div>');
    main.appendChild(view);
    wrapNew.appendChild(main);
    wrapNew.appendChild(side);
    col.appendChild(wrapNew);
    view.style.flex = '1';
    side.innerHTML = `<div class="nx-split-bar">
        <span class="ni-icon">${icon(({notes:'notes',todo:'todo',chat:'chat',today:'sun'})[split] || 'notes')}</span>
        <b>${U.esc((SPLITS.find(s=>s.v===split)||{}).l || split)}</b>
        <button class="icon-btn sm" id="sp-close" data-tip="Close split view">${icon('x')}</button>
      </div>
      <div class="nx-split-host" id="nx-split-host"></div>`;
    const close = q('#sp-close', side);
    if(close) close.onclick = ()=>NX.splitView.set('off');
    paint();
  };

  /* re-apply whenever the setting changes */
  const _set = NX.splitView.set.bind(NX.splitView);
  NX.splitView.set = function(v){ _set(v); NX.applySplit(); };
})();

/* render a compact read-only panel — deliberately NOT the live route,
   because every shell route owns singleton DOM (view.dataset.route,
   scroll memory, timers) and rendering one twice corrupts both. */
NX.renderInto = function(host, route){
  const esc = U.esc;
  let html = '';
  if(route === 'notes'){
    const notes = (NX.store.get('notes', []) || []).slice(0, 12);
    html = notes.length ? `<div class="ag-list">${notes.map(n=>`
      <div class="ag-row" data-jump-note="${n.id}">
        <span class="ag-ic">${icon('notes')}</span>
        <span class="ag-txt"><b class="ellipsis">${esc(n.title || 'Untitled')}</b>
          <i>${esc(U.relTime(n.updated || Date.now()))}${n.folder ? ' · ' + esc(n.folder) : ''}</i></span>
      </div>`).join('')}</div>`
      : `<div class="empty" style="padding:26px"><div class="e-sub">No notes yet.</div></div>`;
  }
  else if(route === 'todo'){
    const open = (NX.store.get('tasks', []) || []).filter(t=>!t.done).slice(0, 14);
    html = open.length ? `<div class="ag-list">${open.map(t=>`
      <div class="ag-row">
        <span class="check" data-check="${t.id}">${icon('check')}</span>
        <span class="ag-txt"><b class="ellipsis">${esc(t.name)}</b>
          ${t.due ? `<i>${esc(t.due)}</i>` : ''}</span>
      </div>`).join('')}</div>`
      : `<div class="empty" style="padding:26px"><div class="e-sub">Inbox zero.</div></div>`;
  }
  else if(route === 'chat'){
    const msgs = NX.store.get('messages', {}) || {};
    const last = Object.values(msgs).flat().slice(-10);
    html = last.length ? `<div class="ag-list">${last.map(m=>`
      <div class="ag-row">
        <span class="ag-ic">${icon('chat')}</span>
        <span class="ag-txt"><b class="ellipsis">${esc(m.who || 'Someone')}</b>
          <i>${esc(String(m.text || '').slice(0, 70))}</i></span>
      </div>`).join('')}</div>`
      : `<div class="empty" style="padding:26px"><div class="e-sub">No messages yet.</div></div>`;
  }
  else if(route === 'today'){
    const b = dayBuckets();
    const rows = b.overdue.concat(b.today);
    html = rows.length ? `<div class="ag-list">${rows.slice(0,14).map(t=>`
      <div class="ag-row">
        <span class="check ${t.done?'checked':''}" data-check="${t.id}">${icon('check')}</span>
        <span class="ag-txt"><b class="ellipsis">${esc(t.name)}</b></span>
      </div>`).join('')}</div>`
      : `<div class="empty" style="padding:26px"><div class="e-sub">Nothing due. Enjoy it.</div></div>`;
  }
  else {
    html = `<div class="empty" style="padding:26px"><div class="e-sub">${esc(route)} cannot be split.</div></div>`;
  }

  host.innerHTML = `<div class="nx-split-title"><span class="tiny faint">${esc((SPLITS.find(s=>s.v===route)||{}).l || route)} · preview</span></div>` + html;

  qa('[data-jump-note]', host).forEach(el=>el.onclick = ()=>{
    NX.splitView.set('off');
    setTimeout(()=>NX.openNoteById && NX.openNoteById(el.dataset.jumpNote), 80);
  });
  qa('[data-check]', host).forEach(el=>el.onclick = ()=>{
    const id = el.dataset.check;
    const list = NX.store.get('tasks', []) || [];
    const t = list.find(x=>x.id===id);
    if(!t) return;
    const was = !!t.done;
    t.done = !t.done;
    if(t.done){ t.doneAt = Date.now(); t.col='done'; } else { delete t.doneAt; t.col='today'; }
    NX.store.set('tasks', list);
    NX.refreshBadges && NX.refreshBadges();
    NX.undoable(t.done ? 'Task completed' : 'Task reopened', t.name, ()=>{
      const l2 = NX.store.get('tasks', []) || [];
      const x = l2.find(y=>y.id===id);
      if(!x) return;
      x.done = was; if(!was) delete x.doneAt; else x.doneAt = Date.now();
      NX.store.set('tasks', l2);
      NX.refreshBadges && NX.refreshBadges();
      NX.renderInto(host, route);
    });
    NX.renderInto(host, route);
    NX.toastInfo('Split view', 'Change saved in the main tab too');
  });
};

/* ============================================================
   SIDEBAR KEYBOARD NAVIGATION
   ============================================================ */
(function keyboardNav(){
  document.addEventListener('keydown', e=>{
    const mod = e.ctrlKey || e.metaKey;
    if(mod) return;
    const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
    if(inField) return;
    if(e.target && e.target.closest && e.target.closest('.modal-backdrop, .qs-backdrop, .gs-backdrop, .cmdk-backdrop, .menu')) return;

    const key = e.key;
    if(!['ArrowDown','ArrowUp','Home','End'].includes(key)) return;
    if(key === 'Home' && !e.altKey) return;
    if(key === 'End' && !e.altKey) return;

    const sb = q('.sidebar');
    if(!sb) return;
    const items = qa('.nav-item[data-route]', sb);
    if(!items.length) return;

    const active = document.activeElement;
    let idx = items.findIndex(b => b === active);
    if(idx < 0) idx = items.findIndex(b => b.classList.contains('on'));
    if(idx < 0) idx = 0;

    if(e.altKey && key === 'ArrowDown'){ e.preventDefault(); items[(idx+1) % items.length].focus(); return; }
    if(e.altKey && key === 'ArrowUp'){ e.preventDefault(); items[(idx-1+items.length) % items.length].focus(); return; }
    if(e.altKey && key === 'Home'){ e.preventDefault(); items[0].focus(); return; }
    if(e.altKey && key === 'End'){ e.preventDefault(); items[items.length-1].focus(); return; }

    /* arrows navigate only while the sidebar already has focus */
    if(active && active.closest && active.closest('.sidebar')){
      e.preventDefault();
      if(key === 'ArrowDown') items[Math.min(idx+1, items.length-1)].focus();
      else if(key === 'ArrowUp') items[Math.max(idx-1, 0)].focus();
      else if(key === 'Home') items[0].focus();
      else if(key === 'End') items[items.length-1].focus();
    }
  });
})();
})(window.NX);
