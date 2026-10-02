/* ============================================================
   Pebble 3.0 — 26-reminders.js
   Reminders with native app-icon notifications + scheduler
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let filter = 'upcoming';

function rems(){ return NX.store.get('reminders', []); }
function saveRems(r){ NX.store.set('reminders', r); NX.refreshBadges(); }

/* ---------------- scheduler ---------------- */
function tick(){
  const list = rems();
  let changed = false;
  list.forEach(r=>{
    if(!r.fired && r.when <= Date.now()){
      r.fired = true; changed = true;
      fire(r);
      if(r.repeat && r.repeat !== 'none'){
        const step = r.repeat === 'daily' ? 86400e3 : r.repeat === 'weekly' ? 7*86400e3 : 3600e3;
        let next = r.when + step;
        while(next <= Date.now()) next += step;
        list.push({ id:U.uid('rm'), name:r.name, when:next, repeat:r.repeat, cat:r.cat, fired:false });
      }
    }
  });
  if(changed){
    saveRems(list);
    if(NX.router.currentName === 'reminders') NX.router.go('reminders');
    if(NX.router.currentName === 'dashboard') NX.router.go('dashboard');
  }
}
function fire(r){
  NX.sfx.play('notify');
  NX.native.notify({ title:'⏰ ' + r.name, body: (r.note ? r.note + ' · ' : '') + U.hhmm(r.when) + (r.repeat!=='none' ? ' · ' + r.repeat : '') });
  NX.pushNotif('Reminder: ' + r.name, U.untilStr(r.when) === 'now' ? 'It\'s time!' : r.note || '', 'bell');
  NX.toastInfo('⏰ ' + r.name, r.note || 'Your reminder went off', { life: 8000 });
}
function startScheduler(){ setInterval(tick, 15000); setTimeout(tick, 3000); }

/* native reminder thread pings this every 20s (lib.rs spawn_reminder_thread) */
NX.reminders = { pollDue: tick };

NX.newReminder = function(){
  const body = h(`<div>
    <div class="field" style="margin-bottom:12px"><label>Reminder</label><input class="input" id="nrm-name" placeholder="e.g. Call the bank"></div>
    <div class="row gap-10" style="margin-bottom:12px">
      <div class="field grow"><label>Date</label><input class="input" id="nrm-date" type="date"></div>
      <div class="field grow"><label>Time</label><input class="input" id="nrm-time" type="time"></div>
    </div>
    <div class="row gap-10" style="margin-bottom:12px">
      <div class="field grow"><label>Repeat</label><select class="select" id="nrm-rep">
        <option value="none">Once</option><option value="hourly">Hourly</option>
        <option value="daily">Daily</option><option value="weekly">Weekly</option></select></div>
      <div class="field grow"><label>Category</label><select class="select" id="nrm-cat">
        <option value="work">Work</option><option value="health">Health</option>
        <option value="life">Life</option><option value="learn">Learn</option></select></div>
    </div>
    <div class="field"><label>Note (optional)</label><input class="input" id="nrm-note" placeholder="Extra detail"></div>
    <div class="row gap-6" style="margin-top:12px;flex-wrap:wrap">
      ${[['15',15],['30',30],['60',60]].map(([l,m])=>`<button class="chip" data-quick="${m}">in ${l} min</button>`).join('')}
      <button class="chip" data-quick="tom">tomorrow 9am</button>
    </div>
  </div>`);
  const d = new Date(Date.now() + 3600e3);
  q('#nrm-date', body) || null;
  NX.modal({ title:'New reminder', icon:'bell', body, footer:[
    { label:'Cancel', cls:'btn-soft' },
    { label:'Set reminder', cls:'btn-green', onClick:()=>{
        const name = q('#nrm-name', body).value.trim(); if(!name){ q('#nrm-name', body).focus(); return; }
        const dateV = q('#nrm-date', body).value, timeV = q('#nrm-time', body).value || '09:00';
        const when = dateV ? new Date(dateV + 'T' + timeV).getTime() : Date.now() + 3600e3;
        const list = rems();
        list.push({ id:U.uid('rm'), name, when, repeat:q('#nrm-rep', body).value, cat:q('#nrm-cat', body).value, note:q('#nrm-note', body).value.trim(), fired:false });
        saveRems(list); NX.closeAllModals(); NX.sfx.play('ok');
        NX.toastOk('Reminder set', name + ' · ' + U.untilStr(when));
        NX.router.go('reminders');
      } }
  ]});
  const dateEl = q('#nrm-date', body), timeEl = q('#nrm-time', body);
  dateEl.value = U.todayKey(); timeEl.value = String(d.getHours()).padStart(2,'0') + ':00';
  qa('[data-quick]', body).forEach(b=>b.onclick = ()=>{
    if(b.dataset.quick === 'tom'){
      const t = new Date(); t.setDate(t.getDate()+1); t.setHours(9,0,0,0);
      dateEl.value = U.todayKey(t); timeEl.value = '09:00';
    } else {
      const t = new Date(Date.now() + (+b.dataset.quick)*60e3);
      dateEl.value = U.todayKey(t);
      timeEl.value = String(t.getHours()).padStart(2,'0') + ':' + String(t.getMinutes()).padStart(2,'0');
    }
  });
  setTimeout(()=>q('#nrm-name', body) && q('#nrm-name', body).focus(), 50);
};

NX.routeInShell('reminders', 'Reminders', 'bell', function(view){
  const list = rems();
  const now = Date.now();
  const upcoming = list.filter(r=>!r.fired).sort((a,b)=>a.when-b.when);
  const past = list.filter(r=>r.fired).sort((a,b)=>b.when-a.when).slice(0,8);
  const cats = { work:['Work','blue'], health:['Health','green'], life:['Life','purple'], learn:['Learn','teal'] };

  view.innerHTML = `
  <div class="page">
    <div class="row" style="gap:10px">
      <div class="seg" id="rm-seg">
        <button class="on">Upcoming <span class="count-chip" style="margin-left:4px">${upcoming.length}</span></button>
        <button>History</button>
      </div>
      <span style="flex:1"></span>
      <button class="btn btn-outline btn-sm" id="rm-test" data-tip="Fire a test notification with the Pebble icon">${icon('bell')} Test ping</button>
      <button class="btn btn-dark" id="rm-new">${icon('plus')} New reminder</button>
    </div>
    <div class="rem-list" id="rm-list"></div>
  </div>`;

  function renderList(){
    const host = q('#rm-list', view);
    if(filter === 'upcoming'){
      host.innerHTML = upcoming.length ? upcoming.map(r=>`
        <div class="rem-row" style="--rm:${r.cat==='health'?'var(--green)':r.cat==='work'?'var(--blue)':r.cat==='learn'?'var(--teal)':'var(--purple)'}">
          <div class="rr-ic">${icon('bell')}</div>
          <div style="min-width:0"><div class="rr-name">${U.esc(r.name)}</div>
            <div class="rr-when">${U.esc(new Date(r.when).toLocaleString())} · ${U.esc(U.untilStr(r.when))}${r.repeat!=='none'?' · repeats '+U.esc(r.repeat):''}</div>
            ${r.note?`<div class="rr-when">${U.esc(r.note)}</div>`:''}</div>
          <span class="pill ${cats[r.cat]?cats[r.cat][1]:'gray'}" style="margin-left:auto">${cats[r.cat]?cats[r.cat][0]:r.cat}</span>
          <button class="icon-btn sm" data-done="${r.id}" data-tip="Mark done">${icon('check')}</button>
          <button class="icon-btn sm" data-del="${r.id}" style="color:var(--red)" data-tip="Delete">${icon('trash')}</button>
        </div>`).join('')
        : `<div class="empty card"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${NX.ICON_PATHS.bell}"/></svg>
            <div class="e-title">Nothing scheduled</div><div class="e-sub">Reminders pop up as native Windows notifications — icon and all.</div>
            <button class="btn btn-green" id="rm-empty-new">${icon('plus')} Create one</button></div>`;
      const en = q('#rm-empty-new', host); if(en) en.onclick = ()=>NX.newReminder();
    } else {
      host.innerHTML = past.length ? past.map(r=>`
        <div class="rem-row" style="opacity:.75">
          <div class="rr-ic">${icon('check')}</div>
          <div><div class="rr-name">${U.esc(r.name)}</div>
            <div class="rr-when">Went off ${U.esc(U.relTime(r.when))} · ${U.esc(new Date(r.when).toLocaleTimeString())}</div></div>
          <button class="icon-btn sm" style="margin-left:auto;color:var(--red)" data-del="${r.id}">${icon('trash')}</button>
        </div>`).join('')
        : `<div class="empty card"><div class="e-sub">History will fill up as reminders fire.</div></div>`;
    }
    qa('[data-del]', host).forEach(b=>b.onclick = ()=>{
      const id = b.dataset.del;
      const gone = rems().find(x => x.id === id);
      if(!gone) return;
      saveRems(rems().filter(x => x.id !== id));
      NX.sfx.play('err');
      NX.router.go('reminders');
      NX.undoable('Reminder deleted', gone.name || 'Reminder', () => {
        const cur = rems();
        if(cur.some(x => x.id === id)) return;
        saveRems(cur.concat([gone]));
        NX.router.go('reminders');
        NX.toastOk('Reminder restored', gone.name || '');
      });
    });
    qa('[data-done]', host).forEach(b=>b.onclick = ()=>{
      const l = rems(); const r = l.find(x=>x.id===b.dataset.done);
      if(r){ r.fired = true; saveRems(l); NX.sfx.play('ok'); NX.router.go('reminders'); }
    });
  }

  const seg = q('#rm-seg', view);
  qa('button', seg).forEach((b,i)=>b.onclick = ()=>{
    qa('button', seg).forEach(x=>x.classList.remove('on')); b.classList.add('on');
    filter = i===0 ? 'upcoming' : 'history'; renderList();
  });
  q('#rm-new', view).onclick = ()=>NX.newReminder();
  q('#rm-test', view).onclick = async ()=>{
    const ok = await NX.native.notify({ title:'🔔 Pebble works!', body:'Native notification from your workspace — with our icon.' });
    NX.pushNotif('Test notification', 'If you saw this, notifications are live', 'bell');
    NX.toastOk(ok ? 'Notification sent' : 'Shown in-app', ok ? 'Delivered by Windows with the Pebble icon.' : 'Desktop builds show these natively.');
  };

  renderList();
});

NX.reminderScheduler = { start: startScheduler };
})(window.NX);
