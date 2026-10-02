/* ============================================================
   PebbleX v0.1 — 13-capture.js
   Global capture & session tooling:
     · Quick Capture   (Ctrl+Shift+U) — note / task / reminder
                       from any tab, without navigating away
     · Ask Pebble      (Ctrl+Shift+A) — AI omnibox with context
     · Session undo stack — anything destructive can be rolled
       back for the rest of the session, not just one toast
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* ============================================================
   SESSION UNDO STACK
   ============================================================ */
const Stack = {
  items: [],
  MAX: 25,
  push(entry){                                  // { label, undo, at }
    this.items.unshift(entry);
    if(this.items.length > this.MAX) this.items.length = this.MAX;
    NX.events.emit('undo:changed');
  },
  peek(){ return this.items[0] || null; },
  undo(){
    const e = this.items.shift();
    if(!e) return false;
    try{ e.undo(); }catch(err){ console.error('[undo]', err); }
    NX.events.emit('undo:changed');
    NX.toastOk('Undone', e.label);
    return true;
  },
  clear(){ this.items = []; NX.events.emit('undo:changed'); },
  get count(){ return this.items.length; }
};
NX.undoStack = Stack;

/* supersedes NX.undoable — same toast, plus the session stack */
NX.undoable = function(title, msg, undoFn, opts={}){
  if(typeof undoFn === 'function' && opts.stack !== false){
    Stack.push({ label: title, undo: undoFn, at: Date.now() });
  }
  return NX.toast('info', title, msg, Object.assign({
    action:{ label:'Undo', onClick: ()=>{
      if(typeof undoFn === 'function'){
        const i = Stack.items.findIndex(x => x.undo === undoFn);
        if(i > -1) Stack.items.splice(i,1);
        undoFn();
      }
    } }
  }, opts));
};

/* ============================================================
   QUICK CAPTURE  (Ctrl+Shift+U)
   ============================================================ */
const CAPTURE_MODES = [
  { v:'note',     l:'Note',     ic:'notes', ph:'Title — then the detail after a dash' },
  { v:'task',     l:'Task',     ic:'todo',  ph:'What needs doing?' },
  { v:'reminder', l:'Reminder', ic:'bell',  ph:'Remind me to…' }
];
let capOpen = false;

NX.openCapture = function(mode){
  if(capOpen) return; capOpen = true;
  let kind = mode || NX.store.get('settings', {}).captureDefault || 'note';
  if(!CAPTURE_MODES.some(m=>m.v === kind)) kind = 'note';

  const dlg = NX.modal({
    title:'Quick capture', icon:'zap',
    body:`<div class="cap">
      <div class="cap-modes" id="cap-modes">
        ${CAPTURE_MODES.map(m=>`<button class="cap-mode ${m.v===kind?'on':''}" data-m="${m.v}">${icon(m.ic)} ${m.l}</button>`).join('')}
      </div>
      <textarea class="input cap-input" id="cap-text" rows="3"
        placeholder="${CAPTURE_MODES.find(m=>m.v===kind).ph}"></textarea>
      <div class="cap-extras" id="cap-extras"></div>
      <div class="cap-foot">
        <span class="tiny faint" id="cap-hint">Ctrl+Enter to save · Esc to cancel</span>
        <span style="flex:1"></span>
        <button class="btn btn-soft" id="cap-task-toggle" data-tip="Open this note right after saving">${icon('chevR')} Open when done</button>
        <button class="btn btn-green" id="cap-save">${icon('check')} Save</button>
      </div>
    </div>`,
    onClose: ()=>{ capOpen = false; }
  });

  const host = dlg;
  const text = q('#cap-text', host);
  const extras = q('#cap-extras', host);
  const openAfter = { on:true };

  function renderExtras(){
    if(kind === 'task'){
      const today = U.todayKey();
      extras.innerHTML = `
        <div class="cap-row">
          <span class="tiny faint" style="width:52px">Due</span>
          <div class="cap-chips">
            <button class="chip ${''}" data-due="">None</button>
            <button class="chip" data-due="${today}">Today</button>
            <button class="chip" data-due="${U.todayKey(new Date(Date.now()+86400e3))}">Tomorrow</button>
            <button class="chip" data-due="${U.todayKey(new Date(Date.now()+7*86400e3))}">Next week</button>
          </div>
        </div>
        <div class="cap-row">
          <span class="tiny faint" style="width:52px">List</span>
          <div class="cap-chips" id="cap-lists">
            <button class="chip on" data-list="all">All</button>
            <button class="chip" data-list="work">Work</button>
            <button class="chip" data-list="personal">Personal</button>
            <button class="chip" data-list="learn">Learning</button>
          </div>
        </div>`;
      qa('[data-due]', extras).forEach(b=>b.onclick = ()=>{
        qa('[data-due]', extras).forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); NX.sfx.play('tick');
      });
      qa('[data-list]', extras).forEach(b=>b.onclick = ()=>{
        qa('[data-list]', extras).forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); NX.sfx.play('tick');
      });
    } else if(kind === 'reminder'){
      extras.innerHTML = `
        <div class="cap-row">
          <span class="tiny faint" style="width:52px">In</span>
          <div class="cap-chips">
            ${[['','None',0],['15','15 min',15e3],['60','1 hour',3600e3],['180','3 hours',10800e3],['d1','Tomorrow',86400e3]]
              .map(([v,l,m],i)=>`<button class="chip ${i===2?'on':''}" data-in="${m}">${l}</button>`).join('')}
          </div>
        </div>
        <div class="cap-row">
          <span class="tiny faint" style="width:52px">Repeat</span>
          <div class="cap-chips" id="cap-rep">
            ${[['none','Never'],['daily','Daily'],['weekly','Weekly']].map(([v,l])=>
              `<button class="chip ${v==='none'?'on':''}" data-rep="${v}">${l}</button>`).join('')}
          </div>
        </div>`;
      qa('[data-in]', extras).forEach(b=>b.onclick = ()=>{
        qa('[data-in]', extras).forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); NX.sfx.play('tick');
      });
      qa('[data-rep]', extras).forEach(b=>b.onclick = ()=>{
        qa('[data-rep]', extras).forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); NX.sfx.play('tick');
      });
    } else {
      const folders = [...new Set((NX.store.get('notes', []) || []).map(n=>n.folder).filter(Boolean))];
      extras.innerHTML = `
        <div class="cap-row">
          <span class="tiny faint" style="width:52px">Folder</span>
          <div class="cap-chips">
            <button class="chip on" data-folder="">Inbox</button>
            ${folders.map(f=>`<button class="chip" data-folder="${U.esc(f)}">${U.esc(f)}</button>`).join('')}
          </div>
        </div>`;
      qa('[data-folder]', extras).forEach(b=>b.onclick = ()=>{
        qa('[data-folder]', extras).forEach(x=>x.classList.remove('on'));
        b.classList.add('on'); NX.sfx.play('tick');
      });
    }
  }

  function picked(sel, attr){
    const el = q(sel + ' .chip.on', host);
    return el ? el.getAttribute(attr) : null;
  }

  function save(){
    const raw = text.value.trim();
    if(!raw){ text.focus(); NX.sfx.play('err'); return; }
    const split = raw.indexOf(' — ');
    const title = split > -1 ? raw.slice(0, split).trim() : raw;
    const detail = split > -1 ? raw.slice(split + 3).trim() : '';

    if(kind === 'note'){
      const folder = picked('#cap-extras','data-folder') || '';
      const n = { id:U.uid('nt'), title, body:'# '+title+(detail?'\n\n'+detail:'\n\n'), tags:[], pinned:false, updated:Date.now(), folder };
      const list = NX.store.get('notes', []) || [];
      NX.store.set('notes', [n].concat(list));
      NX.sfx.play('pop');
      NX.undoable('Note captured', title, ()=>{
        NX.store.set('notes', (NX.store.get('notes', []) || []).filter(x=>x.id !== n.id));
        NX.toastOk('Note removed', title);
      });
      if(openAfter.on){ NX.closeAllModals(); NX.router.go('notes'); setTimeout(()=>NX.openNoteById && NX.openNoteById(n.id), 140); }
      else NX.closeAllModals();
      return;
    }

    if(kind === 'task'){
      const due = picked('#cap-extras','data-due');
      const listId = picked('#cap-extras','data-list') || 'all';
      const t = { id:U.uid('tk'), name:title, note:detail, col:'today', cat:listId, listId,
                  due:due || '', myDay:true, created:Date.now(), done:false, steps:[], estimateMin:0 };
      const list = NX.store.get('tasks', []) || [];
      NX.store.set('tasks', [t].concat(list));
      NX.refreshBadges && NX.refreshBadges();
      NX.sfx.play('pop');
      NX.undoable('Task captured', title, ()=>{
        NX.store.set('tasks', (NX.store.get('tasks', []) || []).filter(x=>x.id !== t.id));
        NX.refreshBadges && NX.refreshBadges();
        NX.toastOk('Task removed', title);
      });
      NX.closeAllModals();
      if(NX.router.currentName === 'todo') NX.router.go('todo');
      return;
    }

    const mins = parseInt(picked('#cap-extras','data-in') || '3600', 10);
    const repeat = picked('#cap-extras','data-rep') || 'none';
    const r = { id:U.uid('rm'), name:title, note:detail, when:Date.now() + mins,
                repeat, cat:'work', fired:false };
    const list = NX.store.get('reminders', []) || [];
    NX.store.set('reminders', list.concat([r]));
    NX.refreshBadges && NX.refreshBadges();
    NX.sfx.play('pop');
    NX.undoable('Reminder set', title + ' · ' + U.fmtTime(mins), ()=>{
      NX.store.set('reminders', (NX.store.get('reminders', []) || []).filter(x=>x.id !== r.id));
      NX.refreshBadges && NX.refreshBadges();
      NX.toastOk('Reminder removed', title);
    });
    NX.closeAllModals();
    if(NX.router.currentName === 'reminders') NX.router.go('reminders');
  }

  qa('[data-m]', host).forEach(b=>b.onclick = ()=>{
    kind = b.dataset.m;
    qa('[data-m]', host).forEach(x=>x.classList.remove('on'));
    b.classList.add('on');
    text.placeholder = CAPTURE_MODES.find(m=>m.v===kind).ph;
    renderExtras();
    text.focus();
    NX.sfx.play('tick');
  });
  q('#cap-save', host).onclick = save;
  q('#cap-task-toggle', host).onclick = ()=>{
    openAfter.on = !openAfter.on;
    q('#cap-task-toggle', host).classList.toggle('on', openAfter.on);
    NX.sfx.play('tick');
  };
  text.addEventListener('keydown', e=>{
    if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); save(); }
    if(e.key === 'Enter' && !e.shiftKey && kind !== 'note'){ e.preventDefault(); save(); }
  });

  renderExtras();
  capOpen = false; // NX.modal owns the overlay; the flag only blocks re-entry while open
  setTimeout(()=> text.focus(), 60);
  try{ NX.sfx.play('open'); }catch(e){}
};

/* ============================================================
   ASK PEBBLE  (Ctrl+Shift+A)
   ============================================================ */
let askOpen = false;
NX.openAsk = function(){
  if(askOpen) return; askOpen = true;
  const back = h(`<div class="qs-backdrop"><div class="gs-panel" role="dialog" aria-label="Ask Pebble">
    <div class="gs-input-row">${icon('ai')}<input placeholder="Ask Pel anything — attach context with @note, @task or @today" aria-label="Ask"></div>
    <div class="ask-chips" id="ask-chips">
      <span class="tiny faint">Attach:</span>
      <button class="chip" data-ctx="today">@today</button>
      <button class="chip" data-ctx="open">@open</button>
      <button class="chip" data-ctx="tasks">@tasks</button>
      <button class="chip" data-ctx="timeline">@timeline</button>
    </div>
    <div class="ask-context" id="ask-ctx"></div>
    <div class="ask-answer" id="ask-answer"></div>
    <div class="gs-foot"><span class="tiny faint">⏎ send · esc close</span>
      <span class="tiny faint" style="margin-left:auto" id="ask-engine">—</span></div>
  </div></div>`);
  const input = back.querySelector('input');
  const chips = back.querySelector('#ask-chips');
  const ctxBox = back.querySelector('#ask-ctx');
  const answer = back.querySelector('#ask-answer');
  const engine = back.querySelector('#ask-engine');
  let ctx = [];
  let busy = false, aborted = false;

  engine.textContent = NX.ai && NX.ai.label ? NX.ai.label() : 'Pel AI';

  function contextBlob(){
    const t = NX.totals ? NX.totals() : { prod:0, neut:0, distr:0 };
    const open = (NX.store.get('tasks', []) || []).filter(x=>!x.done).slice(0,12);
    const tl = NX.store.get('timeless', {})[U.todayKey()] || {};
    const apps = Object.entries(tl).filter(([k])=>k!=='__hours').slice(0,8)
      .map(([k,a])=>`${k}: ${Math.round(a.sec/60)}m (${a.cat})`).join(', ');
    const parts = [];
    if(ctx.includes('today')) parts.push('Today so far: ' + Math.round(t.prod/60) + ' productive minutes, ' + Math.round(t.distr/60) + ' distraction minutes.');
    if(ctx.includes('tasks')) parts.push('Open tasks: ' + (open.map(x=>x.name).join('; ') || 'none'));
    if(ctx.includes('timeline')) parts.push('Time tracked: ' + (apps || 'nothing yet'));
    if(ctx.includes('open')){
      const n = (NX.store.get('notes', []) || [])[0];
      if(n) parts.push('Most recent note "' + n.title + '":\n' + String(n.body || '').slice(0,700));
    }
    return parts.join('\n\n');
  }

  qa('[data-ctx]', chips).forEach(b=>b.onclick = ()=>{
    const c = b.dataset.ctx;
    ctx = ctx.includes(c) ? ctx.filter(x=>x!==c) : ctx.concat([c]);
    b.classList.toggle('active', ctx.includes(c));
    NX.sfx.play('tick');
    ctxBox.innerHTML = ctx.length
      ? `<div class="ask-ctx-line">${icon('link')} Context attached: ${ctx.map(c=>'@'+c).join(' ')}</div>`
      : '';
  });

  function close(){ askOpen = false; aborted = true; back.remove(); document.removeEventListener('keydown', keyH); }

  async function send(){
    const qy = input.value.trim();
    if(!qy || busy) return;
    busy = true; aborted = false;
    input.value = '';
    answer.innerHTML = `<div class="ai-typing">${icon('sparkle')} <span class="dots"><i>•</i><i>•</i><i>•</i></span></div>
      <button class="btn btn-soft btn-sm ask-stop" id="ask-stop">${icon('x')} Stop</button>`;
    const stop = q('#ask-stop', answer);
    if(stop) stop.onclick = ()=>{ aborted = true; NX.ai.cancel(); };
    const blob = contextBlob();
    const prompt = blob ? qy + '\n\n--- context ---\n' + blob : qy;
    try{
      const out = await NX.ai.ask(prompt, {
        noContext: ctx.length > 0,       /* explicit context replaces the snapshot */
        onDelta: t => {
          if(aborted) return;
          answer.innerHTML = `<div class="ask-reply">${U.esc(t).replace(/\n/g,'<br>')}<span class="ai-caret"></span></div>
            <button class="btn btn-soft btn-sm ask-stop" id="ask-stop">${icon('x')} Stop</button>`;
          const s = q('#ask-stop', answer);
          if(s) s.onclick = ()=>{ aborted = true; NX.ai.cancel(); };
        }
      });
      if(!aborted){
        answer.innerHTML = `<div class="ask-reply">${U.esc(out || 'No answer came back.')}</div>`;
        const s = NX.store.get('ai', { history:[] });
        if(s && Array.isArray(s.history)){
          s.history.push({ role:'user', content:qy });
          s.history.push({ role:'assistant', content:out });
          NX.store.set('ai', s);
        }
      }
    }catch(e){
      if(!aborted) answer.innerHTML = `<div class="ask-error">${U.esc(e.message || 'Something went wrong')}</div>`;
    }
    busy = false;
  }

  function keyH(e){
    if(e.key === 'Escape'){ close(); }
    else if(e.key === 'Enter'){ e.preventDefault(); send(); }
  }
  back.addEventListener('pointerdown', e=>{ if(e.target === back) close(); });
  input.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); send(); } });
  document.addEventListener('keydown', keyH);
  (document.getElementById('nx-overlay-root') || document.body).appendChild(back);
  setTimeout(()=> input.focus(), 20);
  try{ NX.sfx.play('open'); }catch(e){}
};

/* ============================================================
   UNDO POPOVER
   ============================================================ */
NX.openUndoStack = function(){
  const body = Stack.items.length
    ? `<div class="undo-list">${Stack.items.slice(0,12).map((e,i)=>`
        <div class="undo-row">
          <span class="undo-ic">${icon('undo')}</span>
          <span class="undo-txt"><b>${U.esc(e.label)}</b><i>${U.esc(U.relTime(e.at))} · ${i===0?'Ctrl+Z next':'press to step back'}</i></span>
          ${i===0?`<button class="btn btn-soft btn-sm" id="undo-top">${icon('undo')} Undo</button>`:''}
        </div>`).join('')}</div>`
    : `<div class="empty" style="padding:26px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${NX.ICON_PATHS.undo}"/></svg>
        <div class="e-title">Nothing to undo</div>
        <div class="e-sub">Deleted notes, tasks, prompts and reminders all land here for the rest of this session.</div>
      </div>`;
  const dlg = NX.modal({ title:'Session undo', icon:'undo', body, size:'' });
  const top = q('#undo-top', dlg);
  if(top) top.onclick = ()=>{ NX.closeAllModals(); Stack.undo(); };
  qa('.undo-row', dlg).forEach((row, i)=>{
    if(i === 0) return;
    row.style.cursor = 'pointer';
    row.onclick = ()=>{
      NX.closeAllModals();
      const item = Stack.items[i];
      if(!item) return;
      Stack.items.splice(i,1);
      try{ item.undo(); }catch(err){ console.error(err); }
      NX.toastOk('Undone', item.label);
    };
  });
};

/* ============================================================
   HOTKEYS
   ============================================================ */
document.addEventListener('keydown', e=>{
  const mod = e.ctrlKey || e.metaKey;
  if(!mod || !e.shiftKey) return;
  const k = e.key.toLowerCase();
  if(k === 'u'){ e.preventDefault(); NX.openCapture(); }
  else if(k === 'a'){ e.preventDefault(); NX.openAsk(); }
  else if(k === 'z'){ e.preventDefault(); Stack.undo(); }
});
})(window.NX);