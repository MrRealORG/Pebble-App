/* ============================================================
   PebbleX v0.1 — 12-motion.js
   Motion & navigation layer:
     · directional view transitions (slide / zoom / lift / stack)
     · staggered content reveal
     · sliding active-nav pill + pinned sidebar group
     · topbar title roll + breadcrumbs
     · button ripples & micro-interactions
     · animated counters
     · per-tab scroll memory
     · quick switcher (Ctrl+Shift+K) & global search (Ctrl+Shift+F)
   Presentational only — no engine or data code is touched.
   ============================================================ */
(function(NX){
'use strict';
const { q, qa, util:U, icon } = NX;

let REDUCED = false;
try{ REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){}

const M = NX.motion = {
  dir:'fwd', trail:[], recent:[], enabled:true
};
/* Settings → Customize → Reduce motion overrides the OS preference,
   so the switch actually does something (it never did before). */
M.reduce = function(){
  if(!M.enabled) return true;
  try{ if(NX.store.get('settings', {}).reduceMotion) return true; }catch(e){}
  return REDUCED;
};
M.osReduce = ()=> REDUCED;

/* ============================================================
   RECENT ROUTES
   ============================================================ */
function pushRecent(name){
  M.recent = [name].concat(M.recent.filter(r=>r!==name)).slice(0,8);
  try{ NX.store.set('recentRoutes', M.recent); }catch(e){}
}
function navFor(route){
  for(const g of NX.NAV || []){
    const it = g.items.find(i=>i.r === route);
    if(it) return { group:g.group, item:it };
  }
  if(route === 'settings') return { group:'PebbleX', item:{ n:'Settings', ic:'settings' } };
  return null;
}
M.navFor = navFor;

/* ============================================================
   PINNED MODULES
   ============================================================ */
function pins(){ const p = NX.store.get('pinnedRoutes', []); return Array.isArray(p) ? p : []; }
function isPinned(r){ return pins().indexOf(r) > -1; }
function togglePin(r){
  const p = pins();
  const i = p.indexOf(r);
  if(i > -1) p.splice(i,1); else p.push(r);
  NX.store.set('pinnedRoutes', p);
  const meta = navFor(r);
  try{ NX.router.go(NX.router.currentName); }catch(e){}
  NX.toastOk(i > -1 ? 'Unpinned' : 'Pinned to top',
    meta ? meta.item.n + (i > -1 ? ' removed from your pinned row' : ' now first in your sidebar') : '');
}
M.pins = pins; M.isPinned = isPinned; M.togglePin = togglePin;

/* ============================================================
   VIEW TRANSITION
   ============================================================ */
function directionFor(name){
  const dir = M.trail.indexOf(name) > -1 ? 'back' : 'fwd';
  if(M.trail[M.trail.length-1] !== name) M.trail.push(name);
  if(M.trail.length > 24) M.trail.splice(0, M.trail.length-24);
  return dir;
}

function swapLayer(view, oldEl){
  const r = view.getBoundingClientRect();
  if(!r.width || !r.height) return null;
  const layer = document.createElement('div');
  layer.className = 'nx-swap nx-swap--' + M.dir;
  layer.setAttribute('aria-hidden','true');
  layer.style.left = r.left + 'px';
  layer.style.top = r.top + 'px';
  layer.style.width = r.width + 'px';
  layer.style.height = r.height + 'px';
  layer.appendChild(oldEl);
  document.body.appendChild(layer);
  requestAnimationFrame(()=> layer.classList.add('out'));
  setTimeout(()=>{ if(layer.parentNode) layer.remove(); }, 640);
  return layer;
}

/* staggered reveal */
function stagger(root){
  let items = Array.prototype.slice.call(root.querySelectorAll('.card'));
  if(items.length < 2){
    const first = root.firstElementChild;
    if(first) items = Array.prototype.slice.call(first.children);
  }
  if(items.length < 2) return;
  /* Kept deliberately tight. This ran 20 items at 46ms each, so the last card
     did not appear for ~900ms and every tab change felt like it was buffering.
     A short, small cascade reads as polish instead of latency, and it is
     skipped entirely when the user has asked for reduced motion. */
  const MAX = 8, STEP = 24;
  items.slice(0, MAX).forEach((el, i)=>{
    if(el.classList.contains('nx-stagger')) return;
    el.classList.add('nx-stagger');
    el.style.animationDelay = Math.round(i * STEP) + 'ms';
    const done = ()=>{ el.classList.remove('nx-stagger'); el.style.animationDelay=''; };
    el.addEventListener('animationend', done, { once:true });
    setTimeout(done, 500 + i*STEP);
  });
}

/* ---------------- animated counters ---------------- */
M.countUp = function(el, to, dur){
  if(!el) return;
  const suffix = String(el.textContent).replace(/[-\d.,\s]/g,'');
  if(M.reduce()){ el.textContent = to.toLocaleString() + suffix; return; }
  el.textContent = '0' + suffix;
  dur = dur || 620;
  const t0 = performance.now();
  const step = now=>{
    const p = Math.min(1, (now - t0)/dur);
    el.textContent = Math.round(to * (1 - Math.pow(1-p,3))).toLocaleString() + suffix;
    if(p < 1 && !el._cuDone) el._cu = requestAnimationFrame(step);
  };
  el._cu = requestAnimationFrame(step);
};
function countUpScan(root){
  if(M.reduce()) return;
  const cands = Array.prototype.slice.call(root.querySelectorAll('[data-count], .count-up'));
  cands.slice(0,24).forEach((el, i)=>{
    if(el._cuPending) return;
    el._cuPending = true;
    const attr = el.getAttribute('data-count');
    const to = parseFloat(attr !== null ? attr : el.textContent);
    if(isNaN(to)){ el._cuPending = false; return; }
    setTimeout(()=>{ el._cuPending = false; M.countUp(el, to); }, 120 + i*40);
  });
}

M.decorate = function(view){
  if(!view) return;
  const first = view.firstElementChild;
  if(first && !M.reduce() && !first.classList.contains('nx-enter')){
    first.classList.add('nx-enter');
    const done = ()=> first.classList.remove('nx-enter');
    first.addEventListener('animationend', done, { once:true });
    setTimeout(done, 900);
  }
  if(M.reduce()) return;
  stagger(view);
  countUpScan(view);
};

/* ---------------- topbar title roll ---------------- */
M.rollTitle = function(text){
  const el = q('.topbar .page-title > span');
  if(!el || el.textContent === text) return;
  el.textContent = text;
  if(M.reduce()) return;
  el.classList.remove('nx-roll');
  void el.offsetWidth;
  el.classList.add('nx-roll');
  const done = ()=> el.classList.remove('nx-roll');
  el.addEventListener('animationend', done, { once:true });
  setTimeout(done, 800);
};

/* ---------------- sliding nav pill ---------------- */
function placePill(target){
  const sb = q('.sidebar');
  if(!sb) return;
  const pill = sb.querySelector('.nav-pill');
  if(pill) pill.remove();
}

/* Nav highlight is cleanly applied directly to .nav-item.on without detached floating pills */
M.syncNav = function(){
  const sb = q('.sidebar');
  if(!sb) return;
  const pill = sb.querySelector('.nav-pill');
  if(pill) pill.remove();
};

M.renderCrumbs = function(route){
  const host = q('#topbar-crumbs');
  if(!host) return;
  const meta = navFor(route);
  if(!meta){ host.innerHTML = ''; host.classList.remove('on'); return; }
  host.classList.add('on');
  host.innerHTML = `<span class="c-grp">${U.esc(meta.group)}</span><i class="c-sep">${icon('chevR',11)}</i><span class="c-cur">${U.esc(meta.item.n)}</span>` +
    (isPinned(route) ? `<span class="c-pin">${icon('star',11)}</span>` : '');
};

/* ---------------- per-tab scroll memory ---------------- */
const scrollTimers = {};
function bindScrollMemory(route, view){
  clearTimeout(scrollTimers[route]);
  const saved = NX.store.get('scroll:' + route, 0) || 0;
  if(saved) requestAnimationFrame(()=>{ view.scrollTop = saved; });
  if(view._scrollBound) return;
  view._scrollBound = true;
  view.addEventListener('scroll', ()=>{
    clearTimeout(scrollTimers[route]);
    scrollTimers[route] = setTimeout(()=>{
      try{ NX.store.set('scroll:' + route, view.scrollTop); }catch(e){}
    }, 400);
  }, { passive:true });
}

/* ============================================================
   RIPPLES + MICRO-INTERACTIONS
   ============================================================ */
const RIPPLE_SEL = '.btn, .icon-btn, .chip, .nav-item, .seg button, .sud-cell, .mine-cell, ' +
                   '.game-card, .theme-card, .simon-pad, .qs-item, .cmdk-item, .gs-item';
document.addEventListener('pointerdown', e=>{
  if(M.reduce()) return;
  const t = e.target.closest && e.target.closest(RIPPLE_SEL);
  if(!t || t.disabled || t.disabled === '') return;
  const r = t.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 1.15;
  const s = document.createElement('i');
  s.className = 'nx-ripple';
  s.style.width = s.style.height = d + 'px';
  s.style.left = (e.clientX - r.left - d/2) + 'px';
  s.style.top = (e.clientY - r.top - d/2) + 'px';
  if(getComputedStyle(t).position === 'static') t.style.position = 'relative';
  t.style.overflow = 'hidden';
  t.appendChild(s);
  setTimeout(()=> s.remove(), 640);
}, { passive:true });

/* press pop for tappable cards */
let pressTimer = null;
document.addEventListener('pointerdown', e=>{
  if(M.reduce()) return;
  const c = e.target.closest && e.target.closest('.game-card, .api-card, .pr-card, .theme-card');
  if(!c) return;
  c.classList.add('nx-press');
  clearTimeout(pressTimer);
  pressTimer = setTimeout(()=> qa('.nx-press').forEach(x=>x.classList.remove('nx-press')), 200);
}, { passive:true });

/* checkbox pop */
document.addEventListener('click', e=>{
  const c = e.target.closest && e.target.closest('.check, .mstodo-check-btn');
  if(!c || M.reduce()) return;
  c.classList.remove('nx-pop'); void c.offsetWidth; c.classList.add('nx-pop');
  const done = ()=> c.classList.remove('nx-pop');
  c.addEventListener('animationend', done, { once:true });
  setTimeout(done, 500);
}, true);

/* sidebar context menu — pin / quick switcher */
document.addEventListener('contextmenu', e=>{
  const item = e.target.closest && e.target.closest('.nav-item[data-route]');
  if(!item || item.dataset.route === '__widget' || item.dataset.route === 'settings') return;
  e.preventDefault();
  const r = item.dataset.route;
  const acts = [
    { label:'Go to ' + ((navFor(r) || {}).item || {}).n, icon:'chevR', onClick:()=>NX.router.go(r) },
    isPinned(r) ? { label:'Unpin from top', icon:'x', onClick:()=>togglePin(r) }
                : { label:'Pin to top', icon:'star', onClick:()=>togglePin(r) },
    '-',
    { label:'Quick switcher', icon:'grid', hint:'Ctrl ⇧ K', onClick:()=>NX.openQuickSwitcher() },
    { label:'Search everything', icon:'search', hint:'Ctrl ⇧ F', onClick:()=>NX.openGlobalSearch() }
  ];
  try{ NX.menu(item, acts, { align:'left' }); }catch(err){ NX.router.go(r); }
});

/* ============================================================
   JUMP + HIGHLIGHT
   ============================================================ */
M.focusText = function(route, text, sel){
  NX.router.go(route);
  setTimeout(()=>{
    const view = q('#shell-view');
    if(!view) return;
    const t = String(text || '').toLowerCase();
    const nodes = Array.prototype.slice.call(view.querySelectorAll(sel || '.note-card, .task-card, .pr-card, .rem-row, .chan-item, .note-card .nc-title'));
    const hit = nodes.find(n => String(n.textContent || '').toLowerCase().indexOf(t) > -1);
    if(!hit){
      NX.toastInfo('Opened ' + ((navFor(route) || {}).item || {}).n, text);
      return;
    }
    const target = hit.classList.contains('nc-title') ? hit.parentElement : hit;
    target.scrollIntoView({ block:'center', behavior: M.reduce() ? 'auto' : 'smooth' });
    target.classList.add('nx-hl');
    setTimeout(()=> target.classList.remove('nx-hl'), 2400);
  }, 280);
};

/* ============================================================
   QUICK SWITCHER  (Ctrl+Shift+K)
   ============================================================ */
let qsOpen = false;
NX.openQuickSwitcher = function(){
  if(qsOpen) return; qsOpen = true;
  const back = NX.h(`<div class="qs-backdrop"><div class="qs-panel" role="dialog" aria-label="Quick switcher">
    <div class="qs-input-row">${icon('grid')}<input placeholder="Jump to a module…" aria-label="Filter modules"></div>
    <div class="qs-grid"></div>
    <div class="qs-foot"><span class="tiny faint">← → move</span><span class="tiny faint">↑ ↓ jump</span><span class="tiny faint">1–9 open</span><span class="tiny faint">esc close</span>
      <span class="tiny faint" style="margin-left:auto">★ pinned first</span></div>
  </div></div>`);
  const input = back.querySelector('input');
  const grid = back.querySelector('.qs-grid');
  let all = [], sel = 0;

  function modules(){
    const p = pins();
    const list = [];
    (NX.NAV || []).forEach(g => g.items.forEach(it => list.push({ r:it.r, n:it.n, ic:it.ic, group:g.group })));
    list.push({ r:'settings', n:'Settings', ic:'settings', group:'PebbleX' });
    return list.sort((a,b)=>{
      const pa = p.indexOf(a.r), pb = p.indexOf(b.r);
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    });
  }
  function render(){
    const qy = input.value.trim().toLowerCase();
    all = modules().filter(m => !qy || (m.n + ' ' + m.group + ' ' + m.r).toLowerCase().indexOf(qy) > -1);
    if(!all.length){ grid.innerHTML = `<div class="qs-empty">Nothing matches “${U.esc(input.value)}”</div>`; return; }
    sel = U.clamp(sel, 0, all.length-1);
    grid.innerHTML = all.map((m,i)=>`<button class="qs-item ${i===sel?'on':''}" data-i="${i}">
        <span class="qs-ic">${icon(m.ic)}</span>
        <span class="qs-txt"><b>${U.esc(m.n)}</b><i>${U.esc(m.group)}</i></span>
        ${isPinned(m.r) ? `<span class="qs-star">${icon('star',12)}</span>` : ''}
        ${i < 9 ? `<span class="qs-hot">${i+1}</span>` : ''}
      </button>`).join('');
    qa('.qs-item', grid).forEach(b => b.onclick = ()=>{ close(); NX.router.go(all[+b.dataset.i].r); });
    const on = grid.querySelector('.qs-item.on');
    if(on) on.scrollIntoView({ block:'nearest' });
  }
  function close(){ qsOpen = false; back.remove(); document.removeEventListener('keydown', keyH); }
  function move(n, cols){ sel = U.clamp(sel + n, 0, all.length-1); render(); }
  function keyH(e){
    if(e.key === 'Escape'){ close(); }
    else if(e.key === 'ArrowRight'){ e.preventDefault(); move(1); }
    else if(e.key === 'ArrowLeft'){ e.preventDefault(); move(-1); }
    else if(e.key === 'ArrowDown'){ e.preventDefault(); move(3); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); move(-3); }
    else if(/^[1-9]$/.test(e.key) && !input.value){ const i = +e.key - 1; if(all[i]){ close(); NX.router.go(all[i].r); } }
    else if(e.key === 'Enter'){ e.preventDefault(); const m = all[sel]; if(m){ close(); NX.router.go(m.r); } }
  }
  back.addEventListener('pointerdown', e=>{ if(e.target === back) close(); });
  input.addEventListener('input', ()=>{ sel = 0; render(); });
  document.addEventListener('keydown', keyH);
  const host = document.getElementById('nx-overlay-root') || document.body;
  host.appendChild(back);
  render();
  setTimeout(()=> input.focus(), 20);
  try{ NX.sfx.play('open'); }catch(e){}
};

/* ============================================================
   GLOBAL SEARCH  (Ctrl+Shift+F)
   ============================================================ */
const SEARCH_SEL = {
  notes:'#shell-view .note-card',
  todo:'#shell-view .mstodo-row, #shell-view .task-card',
  prompts:'#shell-view .pr-card',
  reminders:'#shell-view .rem-row'
};
function searchIndex(qy){
  const out = [];
  const hit = hay => String(hay == null ? '' : hay).toLowerCase().indexOf(qy) > -1;
  (NX.store.get('notes', []) || []).forEach(n=>{
    if(hit(n.title) || hit(n.body) || hit(n.text))
      out.push({ route:'notes', g:'Notes', ic:'notes', t:n.title || 'Untitled', s:'note', run:()=>M.focusText('notes', n.title || 'Untitled') });
  });
  (NX.store.get('tasks', []) || []).forEach(t=>{
    if(hit(t.name) || hit(t.notes))
      out.push({ route:'todo', g:'Tasks', ic:'todo', t:t.name || 'Untitled task', s:t.done ? 'completed' : 'open task', run:()=>M.focusText('todo', t.name || 'Untitled task') });
  });
  (NX.store.get('prompts', []) || []).forEach(p=>{
    if(hit(p.title) || hit(p.body) || hit(p.text))
      out.push({ route:'prompts', g:'Prompts', ic:'star', t:p.title || 'Untitled prompt', s:'prompt', run:()=>M.focusText('prompts', p.title || 'Untitled prompt') });
  });
  (NX.store.get('reminders', []) || []).forEach(r=>{
    if(hit(r.name) || hit(r.note))
      out.push({ route:'reminders', g:'Reminders', ic:'bell', t:r.name || 'Reminder', s:r.when || '', run:()=>NX.router.go('reminders') });
  });
  Object.entries(NX.store.get('messages', {}) || {}).forEach(([ch, arr])=>{
    (arr || []).forEach(m=>{
      if(hit(m.text))
        out.push({ route:'chat', g:'Chat', ic:'chat', t:String(m.text).slice(0,72), s:ch, run:()=>NX.router.go('chat') });
    });
  });
  return out.slice(0, 60);
}

NX.openGlobalSearch = function(){
  const back = NX.h(`<div class="gs-backdrop"><div class="gs-panel" role="dialog" aria-label="Search everything">
    <div class="gs-input-row">${icon('search')}<input placeholder="Search notes, tasks, prompts, reminders and chat…" aria-label="Search"></div>
    <div class="gs-results"></div>
    <div class="gs-foot"><span class="tiny faint">↑↓ move</span><span class="tiny faint">↵ open</span><span class="tiny faint">esc close</span>
      <span class="tiny faint" style="margin-left:auto" id="gs-count"></span></div>
  </div></div>`);
  const input = back.querySelector('input');
  const results = back.querySelector('.gs-results');
  const count = back.querySelector('#gs-count');
  let rows = [], sel = 0;

  function paint(){
    if(!rows.length){ results.innerHTML = `<div class="gs-empty">Type at least two characters.<br><span class="tiny faint">Notes, tasks, prompts, reminders and chat are all searchable.</span></div>`; return; }
    results.innerHTML = rows.map((r,i)=>`<button class="gs-item ${i===sel?'on':''}" data-i="${i}">
        <span class="gs-ic">${icon(r.ic)}</span>
        <span class="gs-txt"><b>${U.esc(r.t)}</b><i>${U.esc(r.g)} · ${U.esc(r.s)}</i></span>
      </button>`).join('');
    qa('.gs-item', results).forEach(b => b.onclick = ()=>{ close(); rows[+b.dataset.i].run(); });
    const on = results.querySelector('.gs-item.on');
    if(on) on.scrollIntoView({ block:'nearest' });
  }
  function render(){
    const qy = input.value.trim().toLowerCase();
    if(qy.length < 2){ rows = []; sel = 0; count.textContent = ''; paint(); return; }
    rows = searchIndex(qy); sel = 0;
    count.textContent = rows.length ? rows.length + (rows.length === 60 ? '+ results' : ' results') : 'no matches';
    paint();
  }
  function close(){ back.remove(); document.removeEventListener('keydown', keyH); }
  function keyH(e){
    if(e.key === 'Escape'){ close(); }
    else if(e.key === 'ArrowDown'){ e.preventDefault(); sel = Math.min(sel+1, rows.length-1); paint(); }
    else if(e.key === 'ArrowUp'){ e.preventDefault(); sel = Math.max(sel-1, 0); paint(); }
    else if(e.key === 'Enter'){ e.preventDefault(); const r = rows[sel]; if(r){ close(); r.run(); } }
  }
  back.addEventListener('pointerdown', e=>{ if(e.target === back) close(); });
  input.addEventListener('input', render);
  document.addEventListener('keydown', keyH);
  const host = document.getElementById('nx-overlay-root') || document.body;
  host.appendChild(back);
  render();
  setTimeout(()=> input.focus(), 20);
  try{ NX.sfx.play('open'); }catch(e){}
};

/* ============================================================
   SHORTCUT SHEET  (?) / Ctrl+/
   ============================================================ */
const SHORTCUTS = [
  ['Navigate', [
    ['Ctrl / ⌘ + K',     'Command palette'],
    ['Ctrl / ⌘ + ⇧ + K', 'Quick switcher — jump to any module'],
    ['Ctrl / ⌘ + ⇧ + F', 'Search notes, tasks, prompts, chat'],
    ['?  or  Ctrl + /',  'This shortcut sheet'],
    ['Esc',              'Close menus, dialogs and overlays']
  ]],
  ['Focus', [
    ['Ctrl / ⌘ + ⇧ + ⏎', 'Start or pause a focus round from anywhere'],
    ['Ctrl / ⌘ + J',      'Cycle through all 13 themes'],
    ['Ctrl / ⌘ + ⇧ + W',  'Toggle the desktop widget']
  ]],
  ['Writing', [
    ['Enter',        'Send message (chat) · create (notes)'],
    ['Shift + Enter','New line in a message'],
    ['/',            'Notes slash menu'],
    ['/',            'Games quick menu where available']
  ]],
  ['Arcade', [
    ['← ↑ → ↓',      '2048 and Snake'],
    ['Arrows + 1-9',  'Sudoku — move and fill'],
    ['N',             'Sudoku — toggle pencil marks'],
    ['1 – 9',         'Break the Code'],
    ['Right-click',   'Minesweeper — plant or clear a flag'],
    ['Type along',    'Typing Speed starts the clock on your first key']
  ]],
  ['Sidebar', [
    ['Right-click',   'Any module — pin it to the top or unpin'],
    ['1 – 9',         'Quick switcher: open directly']
  ]]
];
let sheetOpen = false;
NX.openShortcuts = function(){
  if(sheetOpen) return; sheetOpen = true;
  const dlg = NX.modal({
    title:'Keyboard shortcuts', icon:'command', size:'m-lg',
    body: SHORTCUTS.map(([group, rows])=>`
      <div class="sc-group">
        <div class="sc-label">${U.esc(group)}</div>
        ${rows.map(([k,d])=>`<div class="hotkey-row"><div class="hk-name">${U.esc(d)}</div>
          <div class="kbd-combo">${U.esc(k).split(' + ').map(x=>`<kbd>${U.esc(x)}</kbd>`).join('')}</div></div>`).join('')}
      </div>`).join(''),
    footer:[{ label:'Got it', cls:'btn-green' }]
  });
  const back = dlg.closest('.modal-backdrop');
  const close = ()=>{ sheetOpen = false; document.removeEventListener('keydown', hk); };
  const hk = (e)=>{ if(e.key === 'Escape'){ close(); } };
  document.addEventListener('keydown', hk);
  if(back) back.addEventListener('remove', close);
  return dlg;
};
NX.closeShortcuts = ()=>{ sheetOpen = false; };

/* ============================================================
   HOOKS
   The shell is rebuilt on every navigation, so the transition
   has to be lifted above the router: snapshot the outgoing view
   first, then let the router do its normal work.
   ============================================================ */
function enterRoute(name, args){
  const route = NX.router.routes[name];
  if(!route) return _go.apply(NX.router, args);
  if(route.layout !== 'app') return _go.apply(NX.router, args);

  /* snapshot the outgoing view — the shell is rebuilt by the router.
     Views holding a live canvas are skipped: a blurred fixed layer
     would keep repainting them for the whole transition. */
  const view = q('#shell-view');
  const old = view ? view.firstElementChild : null;
  const heavy = !!(old && old.querySelector && old.querySelector('canvas'));
  M.dir = directionFor(name);
  pushRecent(name);
  const layer = (old && !heavy && view.id === 'shell-view' && !M.reduce()) ? swapLayer(view, old) : null;

  const out = _go.apply(NX.router, args);

  const fresh = q('#shell-view');
  if(fresh){
    M.rollTitle(route.title || name);
    M.renderCrumbs(name);
    M.decorate(fresh);
    bindScrollMemory(name, fresh);
  }
  M.syncNav();
  if(layer) setTimeout(()=> M.syncNav(), 60);
  return out;
}

const _go = NX.router.go;
NX.router.go = function(name){
  return enterRoute(name, arguments);
};

/* global hotkeys */
document.addEventListener('keydown', e=>{
  const mod = e.ctrlKey || e.metaKey;
  const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);

  /* ? opens the sheet, but never while typing */
  if(!inField && !mod && e.key === '?'){ e.preventDefault(); NX.openShortcuts(); return; }
  if(!inField && mod && !e.shiftKey && e.key === '/'){ e.preventDefault(); NX.openShortcuts(); return; }

  if(!mod) return;
  if(e.shiftKey && e.key === 'Enter'){
    e.preventDefault();
    if(NX.pomo && NX.pomo.st) NX.pomo.pause(); else if(NX.pomo) NX.pomo.start();
    return;
  }
  if(!e.shiftKey) return;
  const k = e.key.toLowerCase();
  if(k === 'k'){ e.preventDefault(); NX.openQuickSwitcher(); }
  else if(k === 'f'){ e.preventDefault(); NX.openGlobalSearch(); }
});

window.addEventListener('resize', ()=> M.syncNav());
document.addEventListener('click', e=>{
  if(e.target.closest && e.target.closest('.collapse-btn')) setTimeout(()=> M.syncNav(), 280);
});
/* the sidebar is rebuilt on every navigation, so re-measure once the
   new layout has actually settled — otherwise the pill lands on a
   stale position and looks like a floating blob */
(function keepPillHonest(){
  if(typeof ResizeObserver === 'undefined') return;
  let last = null;
  const check = ()=>{
    const sb = q('.sidebar');
    if(!sb){ last = null; return; }
    const on = q('.nav-item.on', sb);
    const key = sb.className + '|' + (on ? on.dataset.route : '') + '|' + sb.children.length;
    if(key === last) return;
    last = key;
    requestAnimationFrame(()=> M.syncNav());
  };
  const ro = new ResizeObserver(check);
  const attach = ()=>{
    const sb = q('.sidebar');
    if(sb && ro) { try{ ro.disconnect(); ro.observe(sb); }catch(e){} }
  };
  document.addEventListener('DOMContentLoaded', attach);
  document.addEventListener('click', attach);
  setInterval(attach, 1500);
})();

/* boot */
try{ M.recent = NX.store.get('recentRoutes', []) || []; }catch(e){ M.recent = []; }
})(window.NX);