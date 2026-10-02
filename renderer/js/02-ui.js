/* ============================================================
   Pebble 3.0 — 02-ui.js
   Shared UI: modal, menu, tooltip, command palette, notif center
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* ---------------- dropdown menu ---------------- */
NX.menu = function(anchor, items, opts={}){
  NX.closeMenu();
  const m = h(`<div class="menu" role="menu"></div>`);
  items.forEach(it=>{
    if(it === '-'){ m.appendChild(h('<div class="menu-sep"></div>')); return; }
    if(it.label && it.header){ m.appendChild(h(`<div class="menu-label">${U.esc(it.label)}</div>`)); return; }
    const btn = h(`<button class="menu-item ${it.danger?'danger':''}" role="menuitem">
      ${it.icon? icon(it.icon) : ''}<span>${U.esc(it.label)}</span>${it.hint?`<span class="mi-right">${U.esc(it.hint)}</span>`:''}
    </button>`);
    btn.onclick = (e)=>{ e.stopPropagation(); NX.closeMenu(); try{ it.onClick && it.onClick(); }catch(err){ console.error(err); } };
    m.appendChild(btn);
  });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = opts.align === 'right' ? r.right - mw : r.left;
  let y = r.bottom + 8;
  if(y + mh > innerHeight - 10) y = r.top - mh - 8;
  x = U.clamp(x, 8, innerWidth - mw - 8);
  m.style.left = x+'px'; m.style.top = y+'px';
  setTimeout(()=>{
    const off = (e)=>{ if(!m.contains(e.target)) NX.closeMenu(); };
    document.addEventListener('pointerdown', off, { once:true });
  },0);
  try{ if(NX.sfx) NX.sfx.play('tick'); }catch(e){}
  return m;
};
NX.closeMenu = function(){ qa('.menu').forEach(m=>m.remove()); };

/* ---------------- modal ---------------- */
NX.modal = function({ title, icon:ic, body, footer, size='', onClose }){
  const back = h(`<div class="modal-backdrop"></div>`);
  const dlg = h(`<div class="modal ${size}" role="dialog" aria-modal="true">
    <div class="modal-h">
      ${ic? `<div class="tile sm">${icon(ic)}</div>`:''}
      <div class="m-title">${U.esc(title)}</div>
      <button class="icon-btn sm x-close" aria-label="Close">${icon('x')}</button>
    </div>
    <div class="modal-b"></div>
    ${footer? '<div class="modal-f"></div>' : ''}
  </div>`);
  const bodyHost = dlg.querySelector('.modal-b');
  if(typeof body === 'string') bodyHost.innerHTML = body;
  else if(body) bodyHost.appendChild(body);
  if(footer){
    const f = dlg.querySelector('.modal-f');
    footer.forEach(b=>{
      const el = h(`<button class="btn ${b.cls||'btn-soft'}">${b.icon?icon(b.icon):''}${U.esc(b.label)}</button>`);
      el.onclick = ()=>{ if(b.onClick) b.onClick(dlg); else NX.closeModal(dlg); };
      f.appendChild(el);
    });
  }
  dlg.querySelector('.x-close').onclick = ()=>NX.closeModal(dlg);
  back.appendChild(dlg);
  back.addEventListener('pointerdown', (e)=>{ if(e.target === back) NX.closeModal(dlg); });
  const esc = (e)=>{ if(e.key === 'Escape'){ NX.closeModal(dlg); } };
  document.addEventListener('keydown', esc);
  dlg._cleanup = ()=>document.removeEventListener('keydown', esc);
  document.getElementById('nx-overlay-root').appendChild(back);
  try{ if(NX.sfx) NX.sfx.play('open'); }catch(e){}
  return dlg;
};
NX.closeModal = function(dlg){
  const back = dlg ? dlg.closest('.modal-backdrop') : q('.modal-backdrop');
  if(!back) return;
  if(dlg && dlg._cleanup) dlg._cleanup();
  back.style.animation = 'nx-fade .15s ease both reverse';
  setTimeout(()=>back.remove(), 140);
};
NX.closeAllModals = ()=>qa('.modal-backdrop').forEach(b=>b.remove());

/* confirm helper */
NX.confirm = function(title, msg, onYes, opts={}){
  NX.modal({
    title, icon: opts.icon || 'trash',
    body:`<p style="font-size:13.5px;color:var(--ink-2);line-height:1.6">${U.esc(msg)}</p>`,
    footer:[
      { label:'Cancel', cls:'btn-soft' },
      { label: opts.yes || 'Delete', cls: opts.danger===false?'btn-green':'btn-danger', onClick:()=>{ NX.closeAllModals(); onYes && onYes(); } }
    ]
  });
};

/* ---------------- tooltip (instant) ---------------- */
let tipEl = null;
document.addEventListener('mouseover', (e)=>{
  const t = e.target.closest('[data-tip]');
  if(!t) return;
  if(tipEl) tipEl.remove();
  tipEl = h(`<div class="nx-tip">${U.esc(t.getAttribute('data-tip'))}</div>`);
  document.body.appendChild(tipEl);
  const r = t.getBoundingClientRect();
  const x = U.clamp(r.left + r.width/2 - tipEl.offsetWidth/2, 8, innerWidth - tipEl.offsetWidth - 8);
  let y = r.top - tipEl.offsetHeight - 8;
  if(y < 8) y = r.bottom + 8;
  tipEl.style.left = x+'px'; tipEl.style.top = y+'px';
});
document.addEventListener('mouseout', (e)=>{
  if(e.target.closest && e.target.closest('[data-tip]') && tipEl){ tipEl.remove(); tipEl = null; }
});

/* ---------------- command palette (Ctrl+K) ---------------- */
let cmdkOpen = false;
NX.openCommandPalette = function(){
  if(cmdkOpen) return; cmdkOpen = true;
  const back = h(`<div class="cmdk-backdrop"><div class="cmdk">
    <input placeholder="Jump to a module, run an action…" aria-label="Command">
    <div class="cmdk-list"></div>
  </div></div>`);
  const input = back.querySelector('input');
  const list = back.querySelector('.cmdk-list');
  let sel = 0, results = [];

  const actions = ()=> {
    const mods = Object.keys(NX.router.routes).filter(k=>NX.router.routes[k].layout==='app').map(k=>({
      name: NX.router.routes[k].title || k, hint:'Module', icon: NX.router.routes[k].icon || 'grid',
      run: ()=>NX.router.go(k)
    }));
    return mods.concat([
      { name:'New note',        hint:'Action', icon:'notes',   run:()=>{ NX.router.go('notes'); setTimeout(()=>NX.newNote && NX.newNote(), 60); } },
      { name:'New task',        hint:'Action', icon:'todo',    run:()=>{ NX.router.go('todo'); setTimeout(()=>NX.newTask && NX.newTask(), 60); } },
      { name:'New reminder',    hint:'Action', icon:'bell',    run:()=>{ NX.router.go('reminders'); setTimeout(()=>NX.newReminder && NX.newReminder(), 60); } },
      { name:'Toggle theme',    hint:'Action', icon:'palette', run:()=>NX.cycleTheme && NX.cycleTheme() },
      { name:'Toggle widget',   hint:'Action', icon:'widget',  run:()=>NX.widget && NX.widget.toggle() },
      { name:'Start Pomodoro',  hint:'Timeless', icon:'clock', run:()=>{ NX.router.go('timeless'); setTimeout(()=>NX.pomo && NX.pomo.start(), 80); } },
      { name:'Take a screenshot',hint:'Media', icon:'camera',  run:()=>{ NX.router.go('media'); setTimeout(()=>NX.capture && NX.capture(), 80); } },
      { name:'Export workspace',hint:'Data',  icon:'download',run:()=>NX.exportWorkspace && NX.exportWorkspace() },
      { name:'Play a game',     hint:'Fun',   icon:'game',    run:()=>NX.router.go('games') }
    ]);
  };

  function renderList(qry){
    const all = actions();
    results = qry ? all.filter(a=>(a.name+' '+a.hint).toLowerCase().includes(qry.toLowerCase())) : all.slice(0, 9);
    sel = U.clamp(sel, 0, Math.max(0, results.length-1));
    list.innerHTML = results.length
      ? results.map((a,i)=>`<div class="cmdk-item ${i===sel?'on':''}" data-i="${i}">
          <div class="ck-ic">${icon(a.icon)}</div>
          <div style="min-width:0"><div class="ck-name">${U.esc(a.name)}</div><div class="ck-hint">${U.esc(a.hint)}</div></div>
          <span class="ck-go">↵</span></div>`).join('')
      : `<div class="cmdk-empty">Nothing matches “${U.esc(qry)}”</div>`;
    qa('.cmdk-item', list).forEach(el=>{
      el.onclick = ()=>{ const a = results[+el.dataset.i]; close(); a.run(); };
    });
  }
  function close(){ cmdkOpen = false; back.remove(); document.removeEventListener('keydown', keyH); }
  function keyH(e){
    if(e.key === 'Escape'){ close(); }
    else if(e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(sel+1, results.length-1); renderList(input.value); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(sel-1, 0); renderList(input.value); }
    else if(e.key === 'Enter'){ e.preventDefault(); const a = results[sel]; if(a){ close(); a.run(); } }
  }
  back.addEventListener('pointerdown', e=>{ if(e.target === back) close(); });
  input.addEventListener('input', ()=>{ sel = 0; renderList(input.value); });
  document.addEventListener('keydown', keyH);
  document.getElementById('nx-overlay-root').appendChild(back);
  renderList('');
  setTimeout(()=>input.focus(), 20);
  try{ if(NX.sfx) NX.sfx.play('open'); }catch(e){}
};

/* ---------------- notification center ---------------- */
NX.notifLog = function(){ return NX.store.get('notifLog', []); };
NX.pushNotif = function(title, msg, icon_){
  const log = NX.notifLog();
  log.unshift({ id:U.uid('nt'), title, msg, icon:icon_||'bell', ts:Date.now(), read:false });
  NX.store.set('notifLog', log.slice(0, 60));
  NX.events.emit('notifs:changed');
  NX.sfx && NX.sfx.play('notify');
};
NX.openNotifCenter = function(anchor){
  const existing = q('.notif-pop');
  if(existing){ existing.remove(); return; }
  const log = NX.notifLog();
  const pop = h(`<div class="notif-pop">
    <div class="np-h">Notifications <span class="count-chip">${log.length}</span>
      <button class="icon-btn sm" style="margin-left:auto" data-tip="Mark all read">${icon('check')}</button></div>
    <div class="np-list"></div>
  </div>`);
  const listEl = pop.querySelector('.np-list');
  if(!log.length){
    listEl.innerHTML = `<div class="empty" style="padding:26px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${NX.ICON_PATHS.bell}"/></svg><div class="e-sub">All quiet. Reminders & alerts land here.</div></div>`;
  } else {
    log.slice(0, 12).forEach(n=>{
      const it = h(`<div class="notif-item ${n.read?'':'unread'}">
        <div class="n-ic" style="background:var(--surface-3);color:var(--ink-2)">${icon(n.icon)}</div>
        <div style="min-width:0"><div class="n-t">${U.esc(n.title)}</div><div class="n-m">${U.esc(n.msg)}</div></div>
        <span class="n-time">${U.esc(U.relTime(n.ts))}</span>
      </div>`);
      it.onclick = ()=>{ n.read = true; NX.store.set('notifLog', log); it.classList.remove('unread'); };
      listEl.appendChild(it);
    });
  }
  pop.querySelector('[data-tip]').onclick = ()=>{
    log.forEach(n=>n.read = true); NX.store.set('notifLog', log);
    qa('.notif-item', pop).forEach(el=>el.classList.remove('unread'));
    NX.events.emit('notifs:changed');
  };
  document.getElementById('nx-overlay-root').appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  pop.style.top = (r.bottom + 10) + 'px';
  pop.style.left = U.clamp(r.right - pw, 10, innerWidth - pw - 10) + 'px';
  setTimeout(()=>{
    const off = (e)=>{ if(!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)){ pop.remove(); document.removeEventListener('pointerdown', off); } };
    document.addEventListener('pointerdown', off);
  }, 0);
};

/* unread count helper */
NX.unreadNotifs = ()=> NX.notifLog().filter(n=>!n.read).length;

/* confetti */
NX.confetti = function(x, y){
  const colors = ['#7CD56E','#5EB8FF','#E8853D','#8B5CF6','#E05C9C','#FFD166'];
  for(let i=0;i<26;i++){
    const b = h(`<i class="confetti-bit" style="left:${x!=null?x:50 + (Math.random()*30-15)}%;background:${U.pick(colors)};animation-delay:${Math.random()*0.2}s;transform:rotate(${Math.random()*360}deg)"></i>`);
    b.style.left = (x!=null? x + (Math.random()*60-30) : innerWidth*0.5 + (Math.random()*120-60)) + 'px';
    document.body.appendChild(b);
    setTimeout(()=>b.remove(), 1600);
  }
};

/* segmented + helper builders */
NX.seg = function(opts, current, onPick){
  const el = h('<div class="seg" role="tablist"></div>');
  opts.forEach(o=>{
    const b = h(`<button role="tab" class="${o.v===current?'on':''}">${U.esc(o.l)}</button>`);
    b.onclick = ()=>{ qa('button', el).forEach(x=>x.classList.remove('on')); b.classList.add('on'); onPick(o.v); };
    el.appendChild(b);
  });
  return el;
};
})(window.NX);
