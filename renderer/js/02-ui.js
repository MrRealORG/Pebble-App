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
  let r = null;
  if(anchor && typeof anchor.getBoundingClientRect === 'function'){
    r = anchor.getBoundingClientRect();
  } else if(anchor && (typeof anchor.clientX === 'number' || typeof anchor.pageX === 'number')){
    const cx = anchor.clientX || anchor.pageX || 0;
    const cy = anchor.clientY || anchor.pageY || 0;
    r = { left: cx, right: cx, top: cy, bottom: cy, width: 0, height: 0 };
  } else if(anchor && anchor.target && typeof anchor.target.getBoundingClientRect === 'function'){
    r = anchor.target.getBoundingClientRect();
  } else {
    r = { left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2, width: 0, height: 0 };
  }
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
      group:'Jump to', run: ()=>NX.router.go(k)
    }));
    const act = [
      { name:'Quick-Capture Spotlight', hint:'Alt Space', icon:'search', group:'Find', run:()=>NX.openSpotlight && NX.openSpotlight() },
      { name:'Ask Pebble AI Copilot', hint:'Ctrl ⇧ A', icon:'robot', group:'AI', run:()=>NX.openAskPebble && NX.openAskPebble() },
      { name:'Knowledge Graph View', hint:'Notes', icon:'activity', group:'Notes', run:()=>NX.openNotesGraph && NX.openNotesGraph() },
      { name:'Search everything',  hint:'Ctrl ⇧ F', icon:'search', group:'Find', run:()=>NX.openGlobalSearch && NX.openGlobalSearch() },
      { name:'Quick switcher',     hint:'Ctrl ⇧ K', icon:'grid',   group:'Find', run:()=>NX.openQuickSwitcher && NX.openQuickSwitcher() },
      { name:'Quick capture',      hint:'Ctrl ⇧ U', icon:'zap',    group:'Find', run:()=>NX.openCapture && NX.openCapture() },
      { name:'Ask Pel',            hint:'Ctrl ⇧ A', icon:'ai',     group:'AI',   run:()=>NX.openAsk && NX.openAsk() },
      { name:'Undo last action',   hint:'Ctrl ⇧ Z', icon:'undo',   group:'Find', run:()=>NX.undoStack && NX.undoStack.undo() },
      { name:'Session undo history',hint:'History',icon:'history', group:'Find', run:()=>NX.openUndoStack && NX.openUndoStack() },
      { name:'Keyboard shortcuts', hint:'?',        icon:'command',group:'Find', run:()=>NX.openShortcuts && NX.openShortcuts() },
      { name:'Today agenda',       hint:'Agenda',   icon:'sun',    group:'Find', run:()=>NX.router.go('today') },
      { name:'Toggle split view',  hint:'Split',    icon:'layers', group:'Find', run:()=>NX.splitView && NX.splitView.toggle() },
      { name:'Start a focus round',hint:'Ctrl ⇧ ⏎', icon:'timer',  group:'Focus',run:()=>{ if(NX.pomo && NX.pomo.st) NX.pomo.pause(); else if(NX.pomo) NX.pomo.start(); NX.router.go('focus'); } },
      { name:'New note',        hint:'Action', icon:'notes',   group:'Create', run:()=>{ NX.router.go('notes'); setTimeout(()=>NX.newNote && NX.newNote(), 60); } },
      { name:'New task',        hint:'Action', icon:'todo',    group:'Create', run:()=>{ NX.router.go('todo'); setTimeout(()=>NX.newTask && NX.newTask(), 60); } },
      { name:'New reminder',    hint:'Action', icon:'bell',    group:'Create', run:()=>{ NX.router.go('reminders'); setTimeout(()=>NX.newReminder && NX.newReminder(), 60); } },
      { name:'New prompt',      hint:'Action', icon:'star',    group:'Create', run:()=>{ NX.router.go('prompts'); setTimeout(()=>NX.newPrompt && NX.newPrompt(), 60); } },
      { name:'Start a focus round', hint:'Focus', icon:'target', group:'Focus', run:()=>{ NX.router.go('focus'); setTimeout(()=>{ NX.pomo && NX.pomo.start(); }, 120); } },
      { name:'Breathing 4-7-8', hint:'Focus', icon:'activity', group:'Focus', run:()=>NX.router.go('focus') },
      { name:'Toggle theme',    hint:'Action', icon:'palette', group:'System', run:()=>NX.cycleTheme && NX.cycleTheme() },
      { name:'Toggle widget',   hint:'Action', icon:'widget',  group:'System', run:()=>NX.widget && NX.widget.toggle() },
      { name:'Start Pomodoro',  hint:'Timeless', icon:'clock', group:'Focus', run:()=>{ NX.router.go('timeless'); setTimeout(()=>NX.pomo && NX.pomo.start(), 80); } },
      { name:'Day Planner & Time Blocking', hint:'Planner', icon:'calendar', group:'Workspace', run:()=>NX.router.go('planner') },
      { name:'Backup & Restore Vault', hint:'Encrypted', icon:'download', group:'Data', run:()=>NX.backup && NX.backup.openModal && NX.backup.openModal() },
      { name:'Report a bug / Diagnostics', hint:'System', icon:'activity', group:'System', run:()=>NX.openBugReporter && NX.openBugReporter() },
      { name:'Repair database',            hint:'System', icon:'refresh',  group:'System', run:()=>NX.repairDatabase && NX.repairDatabase() },
      { name:'Export workspace',hint:'Data',  icon:'download', group:'Data', run:()=>NX.exportWorkspace && NX.exportWorkspace() },
      { name:'Play a game',     hint:'Fun',   icon:'game',    group:'Fun', run:()=>NX.router.go('games') }
    ];
    const recent = ((NX.motion && NX.motion.recent) || []).map(r=>{
      const meta = NX.motion && NX.motion.navFor ? NX.motion.navFor(r) : null;
      if(!meta) return null;
      return { name: meta.item.n, hint:'Recent', icon: meta.item.ic, group:'Recent', run:()=>NX.router.go(r) };
    }).filter(Boolean);
    return { mods, act, recent };
  };

  function renderList(qry){
    const A = actions();
    let rows;
    if(qry){
      const pool = A.mods.concat(A.act);
      rows = pool.filter(a => (a.name + ' ' + a.hint).toLowerCase().indexOf(qry.toLowerCase()) > -1);
    } else {
      rows = A.recent.slice(0, 4)
        .concat(A.mods.slice(0, 8))
        .concat(A.act.filter(a => a.group === 'Create' || a.group === 'Find' || a.group === 'Focus'));
    }
    results = rows;
    sel = U.clamp(sel, 0, Math.max(0, results.length-1));
    list.innerHTML = results.length
      ? results.map((a,i)=>{
          const head = (i===0 || results[i-1].group !== a.group) ? `<div class="cmdk-head">${U.esc(a.group || '')}</div>` : '';
          return head + `<div class="cmdk-item ${i===sel?'on':''}" data-i="${i}">
          <div class="ck-ic">${icon(a.icon)}</div>
          <div style="min-width:0"><div class="ck-name">${U.esc(a.name)}</div><div class="ck-hint">${U.esc(a.hint)}</div></div>
          <span class="ck-go">↵</span></div>`;
        }).join('')
      : `<div class="cmdk-empty">Nothing matches “${U.esc(qry)}”</div>`;
    qa('.cmdk-item', list).forEach(el=>{
      el.onclick = ()=>{ const a = results[+el.dataset.i]; close(); a.run(); };
    });
    const on = list.querySelector('.cmdk-item.on');
    if(on) on.scrollIntoView({ block:'nearest' });
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

/* celebratory radial sparkle burst — smooth, modern micro-interaction */
NX.confetti = function(x, y){
  const colors = ['#7CD56E','#5EB8FF','#E8853D','#8B5CF6','#E05C9C','#FFD166'];
  const originX = (x != null && !isNaN(x) && x > 0) ? x : (window.innerWidth / 2);
  const originY = (y != null && !isNaN(y) && y > 0) ? y : (window.innerHeight * 0.35);
  for(let i = 0; i < 22; i++){
    const angle = (Math.PI * 2 * i) / 22 + (Math.random() * 0.4 - 0.2);
    const dist = 35 + Math.random() * 75;
    const dx = Math.round(Math.cos(angle) * dist);
    const dy = Math.round(Math.sin(angle) * dist + 16);
    const color = colors[i % colors.length];
    const b = document.createElement('i');
    b.className = 'sparkle-bit';
    b.style.left = originX + 'px';
    b.style.top = originY + 'px';
    b.style.background = color;
    b.style.boxShadow = `0 0 6px ${color}`;
    b.style.setProperty('--dx', `${dx}px`);
    b.style.setProperty('--dy', `${dy}px`);
    document.body.appendChild(b);
    setTimeout(() => { try { b.remove(); } catch(e){} }, 780);
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
/* client-side image compression to modern .webp format */
NX.compressImageToWebP = function(input, opts = {}){
  const maxW = opts.maxWidth || 1024;
  const maxH = opts.maxHeight || 1024;
  const quality = opts.quality != null ? opts.quality : 0.85;

  return new Promise((resolve, reject) => {
    function processImage(img){
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      if(!w || !h){ return reject(new Error('Invalid image dimensions')); }

      let scale = 1;
      if(w > maxW || h > maxH){
        scale = Math.min(maxW / w, maxH / h);
      }
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      if(!ctx){ return reject(new Error('Canvas context not available')); }

      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);

      let mimeType = 'image/webp';
      let dataUrl = '';
      try {
        dataUrl = canvas.toDataURL(mimeType, quality);
      } catch(e) {
        dataUrl = '';
      }
      if(!dataUrl || !dataUrl.startsWith('data:image/webp')){
        mimeType = 'image/png';
        dataUrl = canvas.toDataURL(mimeType);
      }

      if(canvas.toBlob){
        canvas.toBlob(blob => {
          resolve({
            dataUrl,
            blob: blob || null,
            width: cw,
            height: ch,
            format: mimeType === 'image/webp' ? 'webp' : 'png'
          });
        }, mimeType, quality);
      } else {
        resolve({
          dataUrl,
          blob: null,
          width: cw,
          height: ch,
          format: mimeType === 'image/webp' ? 'webp' : 'png'
        });
      }
    }

    if(typeof input === 'string'){
      const img = new Image();
      img.onload = () => processImage(img);
      img.onerror = () => reject(new Error('Failed to load image from URL'));
      img.src = input;
    } else if(input instanceof Blob || input instanceof File){
      const url = URL.createObjectURL(input);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        processImage(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image file'));
      };
      img.src = url;
    } else {
      reject(new Error('Unsupported input type for image compression'));
    }
  });
};
})(window.NX);
