/* ============================================================
   Pebble 3.0 — 56-sidebar.js
   Sidebar behaviour that outgrew the shell: scrolling, collapsible
   categories, hide/show, drag between categories, and UI scaling.

   Loaded AFTER 11-shell.js, which still owns the markup. This file
   replaces NX.renderSidebar with a richer version and keeps the old
   name so nothing else has to change.

   WHY A SEPARATE FILE
     The sidebar used to be one flat column of groups with
     `overflow:hidden` on the rail. With every module enabled the last
     group and the whole footer were simply clipped off the bottom —
     Settings and the profile block were unreachable on short windows.
     Fixing that meant real structure (a scroll region, per-group
     state, drag targets, a scale control), which is more than the
     shell should be carrying.

   STATE, all in NX.store so it survives a reload
     ui:navCollapsed  { GroupName:true }   folder is folded shut
     ui:navHidden     { GroupName:true }   group removed from the rail
     ui:navLayout     { GroupName:[route] } order + which group owns a row
     ui:scale         0.8 .. 1.4           UI zoom
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* The nav table lives in 11-shell.js and is published as NX.NAV. Kept under
   the same name so the code below reads like the shell's own. */
const NAV = NX.NAV;

/* ---------------- persisted sidebar state ---------------- */

const K_COLLAPSED = 'ui:navCollapsed';
const K_HIDDEN    = 'ui:navHidden';
const K_LAYOUT    = 'ui:navLayout';
const K_SCALE     = 'ui:scale';

function readMap(key){
  try{
    const v = NX.store.get(key, null);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  }catch(e){ return {}; }
}
function writeMap(key, obj){
  try{ NX.store.set(key, obj); }catch(e){}
  NX.events.emit('sidebar:changed', { key, obj });
}

const collapsed = ()=> readMap(K_COLLAPSED);
const hidden    = ()=> readMap(K_HIDDEN);

/* The layout is the source of truth for order and membership. It starts as a
   copy of NAV and is rewritten whenever a row is dragged. Groups the user
   emptied are kept (with an empty array) rather than deleted, so an item can
   always be dragged back into them. */
function baseLayout(){
  const l = {};
  NAV.forEach(g => { l[g.group] = g.items.map(i => i.r); });
  return l;
}
function layout(){
  const saved = readMap(K_LAYOUT);
  const base  = baseLayout();
  /* Merge three things: the order the user arranged, the membership they
     chose by dragging, and any route that exists now but was not in the
     saved map (a module added in a later version would otherwise stay
     invisible forever). */
  const out = {};
  Object.keys(base).forEach(g => { out[g] = []; });

  Object.keys(saved).forEach(g => {
    if(!Array.isArray(saved[g])) return;
    /* a group that no longer exists in NAV still gets an array, so a route
       dragged into it is not silently dropped */
    if(!out[g]) out[g] = [];
    saved[g].forEach(r => {
      if(typeof r === 'string' && !out[g].includes(r)) out[g].push(r);
    });
  });

  const placed = new Set([].concat(...Object.keys(out).map(g => out[g])));
  NAV.forEach(g => {
    g.items.forEach(i => { if(!placed.has(i.r)) out[g.group].push(i.r); });
  });

  /* Drop routes that no longer exist at all, so a deleted module does not
     leave a phantom row that can never be rendered. */
  Object.keys(out).forEach(g => { out[g] = out[g].filter(r => !!routeInfo(r)); });
  return out;
}

function routeInfo(r){
  for(const g of NAV){ const it = g.items.find(i => i.r === r); if(it) return it; }
  return null;
}

/* ---------------- UI scale ----------------
   `zoom` on the root element is the only thing that scales a layout built
   out of px and fixed widths without rewriting every rule. It also
   re-lays-out, so the responsive breakpoints still see a real viewport.
   Media queries evaluate against the unzoomed viewport, so a zoomed window
   behaves like a smaller window — which is why the shell has to be
   responsive anyway. */

const SCALE_MIN = 0.8, SCALE_MAX = 1.4, SCALE_STEP = 0.1;

function clampScale(n){
  n = Number(n);
  if(!Number.isFinite(n)) return 1;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n * 100) / 100));
}
function getScale(){
  let v = 1;
  try{ v = clampScale(NX.store.get(K_SCALE, 1)); }catch(e){}
  return v;
}
function applyScale(){
  const v = getScale();
  /* At 1 do not write the property at all. Leaving `zoom:1` on the root is
     harmless but it means the document always carries a zoom context, which
     is the kind of thing that quietly changes how position:fixed behaves. */
  try{
    if(v === 1) document.documentElement.style.removeProperty('zoom');
    else document.documentElement.style.zoom = String(v);
  }catch(e){}
  /* the viewport changed size in CSS pixels, so anything that measured
     itself needs to re-measure */
  setTimeout(()=>{
    try{ window.dispatchEvent(new Event('resize')); }catch(e){}
    try{ NX.motion && NX.motion.syncNav && NX.motion.syncNav(); }catch(e){}
  }, 60);
  NX.events.emit('ui:scale', v);
  return v;
}
NX.getScale  = getScale;
NX.setScale  = function(n){
  const v = clampScale(n);
  try{ NX.store.set(K_SCALE, v); }catch(e){}
  applyScale();
  return v;
};
NX.zoomUI    = function(dir){
  const next = clampScale(getScale() + (dir === 'out' || dir === -1 ? -SCALE_STEP : SCALE_STEP));
  NX.setScale(next);
  const host = q('[data-scale-readout]');
  if(host) host.textContent = Math.round(next * 100) + '%';
  return next;
};

/* ---------------- render ---------------- */

function badgeFor(r){
  if(r === 'todo'){ const t = NX.store.get('tasks', []).filter(x=>!x.done).length; return t || ''; }
  if(r === 'reminders'){ const n = NX.store.get('reminders', []).filter(x=>!x.fired).length; return n || ''; }
  return '';
}

/* Folding, hiding and dragging all change the shape of the rail, so they need
   to redraw it. renderSidebar needs the host it was given, and the callers
   below are event handlers with no host in scope — so remember it. Without
   this, clicking the hide button threw
   `Cannot read properties of undefined (reading 'appendChild')`. */
let lastHost = null;
function rerender(){
  if(!lastHost) return null;
  const old = lastHost.querySelector('.sidebar');
  if(old && old.parentNode) old.parentNode.removeChild(old);
  return renderSidebar(lastHost);
}

function sideBalText(){
  if(!NX.points) return '';
  const lv = NX.points.level();
  return 'L' + lv.n + ' · ' + NX.points.balance().toLocaleString() + ' pts';
}

NX.refreshSidebarUser = function(){
  const profile = NX.store.get('profile', NX.defaults.profile);
  const av = q('#side-user-av');
  if(av && NX.avatarHtml) av.innerHTML = NX.avatarHtml(profile, 'lg');
  const bal = q('#side-bal');
  if(bal) bal.textContent = sideBalText();
};

function renderSidebar(host){
  const profile = NX.store.get('profile', NX.defaults.profile);
  const cur = NX.router.currentName;
  const mini = (function(){ try{ return !!NX.store.get('ui:sidebarMini', false); }catch(e){ return false; } })();
  const hid = hidden(), col = collapsed(), lay = layout();

  /* A module that is switched off, or explicitly hidden, does not get a nav
     row. The Apps screen and Settings still reach it. */
  const isVisible = r => {
    if(NX.apps && NX.apps.isHidden(r)) return false;
    if(NX.modules && NX.modules.isOn && !NX.modules.isOn(r)) return false;
    return true;
  };

  const sb = h(`<aside class="sidebar ${mini?'mini':''}">
    <div class="brand">
      <div class="brand-mark">${NX.brandMark()}</div>
      <div class="brand-name">PebbleX <span class="env">X</span></div>
      <button class="collapse-btn" data-tip="Collapse sidebar">${icon('chevL')}</button>
    </div>
    <div class="nav-scroll" id="nav-scroll"></div>
  </aside>`);

  const scroll = q('.nav-scroll', sb);

  /* ---------- one row ---------- */
  const navBtn = (it, groupName) =>{
    const b = badgeFor(it.r);
    const el = h(`<button class="nav-item ${cur===it.r?'on':''}" data-name="${it.n}" data-route="${it.r}" data-group="${groupName}" draggable="true">
        <span class="ni-grip" aria-hidden="true">${icon('dots',13)}</span>
        <span class="ni-icon">${icon(it.ic)}</span>
        <span class="ni-name">${U.esc(it.n)}</span>
        ${b ? `<span class="ni-badge">${b}</span>` : ''}
      </button>`);
    el.onclick = ()=>NX.router.go(it.r);
    return el;
  };

  /* ---------- one group ---------- */
  const addGroup = (groupName, routes, opts) =>{
    opts = opts || {};
    const rows = routes.map(r => routeInfo(r)).filter(it => it && isVisible(it.r));

    if(!rows.length && !opts.isPinned) return;

    const isCol = !!col[groupName];
    const grp = h(`<div class="nav-group" data-group="${U.esc(groupName)}">
        <div class="nav-label-row">
          <button class="nav-label" data-toggle="${U.esc(groupName)}" aria-expanded="${!isCol}">
            <span class="nl-chev">${icon('chevD',13)}</span>
            <span class="nl-text">${U.esc(groupName)}</span>
            <span class="nl-count">${rows.length || ''}</span>
          </button>
          <button class="nl-eye" data-hide="${U.esc(groupName)}" data-tip="${opts.isPinned?'Pinned cannot be hidden':'Hide this group'}">${icon('eye',13)}</button>
        </div>
        <div class="nav-items" data-drop="${U.esc(groupName)}"><div class="nav-items-in"></div></div>
      </div>`);

    const inner = q('.nav-items-in', grp);
    rows.forEach(it => inner.appendChild(navBtn(it, groupName)));

    if(isCol) grp.classList.add('collapsed');

    /* fold / unfold */
    const toggle = q('.nav-label', grp);
    toggle.onclick = ()=>{
      const c = collapsed();
      const now = !c[groupName];
      c[groupName] = now;
      writeMap(K_COLLAPSED, c);
      /* let the class flip, then read the new height so the transition runs
         from a real value rather than from `auto` */
      grp.classList.toggle('collapsed', now);
      toggle.setAttribute('aria-expanded', String(!now));
    };

    /* hide / show the whole group */
    const eye = q('.nl-eye', grp);
    eye.onclick = (e)=>{
      e.stopPropagation();
      const hs = hidden();
      hs[groupName] = !hs[groupName];
      writeMap(K_HIDDEN, hs);
      rerender();
    };

    scroll.appendChild(grp);
    attachDrop(grp, groupName);
  };

  /* ---------- drag and drop between groups ---------- */
  let dragRoute = null;

  function attachDrop(grp, groupName){
    const zone = q('.nav-items', grp);

    zone.addEventListener('dragover', (e)=>{
      if(!dragRoute) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      grp.classList.add('drop-on');
      /* insertion caret */
      const after = itemAfter(zone, e.clientY);
      zone.querySelectorAll('.drop-before').forEach(n => n.classList.remove('drop-before'));
      if(after) after.classList.add('drop-before');
    });
    zone.addEventListener('dragleave', (e)=>{
      if(e.target === zone || !zone.contains(e.relatedTarget)){
        grp.classList.remove('drop-on');
        zone.querySelectorAll('.drop-before').forEach(n => n.classList.remove('drop-before'));
      }
    });
    zone.addEventListener('drop', (e)=>{
      e.preventDefault();
      grp.classList.remove('drop-on');
      zone.querySelectorAll('.drop-before').forEach(n => n.classList.remove('drop-before'));
      if(!dragRoute) return;
      const after = itemAfter(zone, e.clientY);
      moveRoute(dragRoute, groupName, after ? after.dataset.route : null);
      dragRoute = null;
    });
  }

  /* Which existing row is the pointer below? Returns the row to insert
     *before*, or null to append at the end. */
  function itemAfter(zone, y){
    const rows = qa('.nav-item', zone);
    for(const r of rows){
      const b = r.getBoundingClientRect();
      if(y < b.top + b.height / 2) return r;
    }
    return null;
  }

  function moveRoute(route, toGroup, beforeRoute){
    const lay = layout();
    /* pull it out of wherever it is */
    Object.keys(lay).forEach(g => { lay[g] = lay[g].filter(r => r !== route); });
    if(!lay[toGroup]) lay[toGroup] = [];
    let at = lay[toGroup].length;
    if(beforeRoute){
      const i = lay[toGroup].indexOf(beforeRoute);
      if(i >= 0) at = i;
    }
    lay[toGroup].splice(at, 0, route);
    writeMap(K_LAYOUT, lay);
    rerender();
  }

  /* one delegated set of listeners for every row */
  scroll.addEventListener('dragstart', (e)=>{
    const el = e.target.closest('.nav-item');
    if(!el) return;
    dragRoute = el.dataset.route;
    el.classList.add('dragging');
    try{ e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragRoute); }catch(err){}
  });
  scroll.addEventListener('dragend', (e)=>{
    const el = e.target.closest('.nav-item');
    if(el) el.classList.remove('dragging');
    qa('.drop-on').forEach(n => n.classList.remove('drop-on'));
    qa('.drop-before').forEach(n => n.classList.remove('drop-before'));
    dragRoute = null;
  });

  /* ---------- pinned (kept above the fold, not draggable out) ---------- */
  const pinList = (NX.store.get('pinnedRoutes', []) || []).filter(r => routeInfo(r));
  if(pinList.length){
    const vis = pinList.filter(isVisible);
    if(vis.length) addGroup('Pinned', vis, { isPinned:true });
  }

  /* ---------- the real groups ---------- */
  NAV.forEach(g => {
    if(hid[g.group]) return;
    addGroup(g.group, lay[g.group] || g.items.map(i => i.r));
  });

  /* ---------- footer ---------- */
  const foot = h(`<div class="side-foot">
    <div class="scale-row">
      <button class="icon-btn sm" data-scale="out" data-tip="Smaller UI">${icon('minus',15)}</button>
      <span class="scale-readout" data-scale-readout>${Math.round(getScale()*100)}%</span>
      <button class="icon-btn sm" data-scale="in" data-tip="Bigger UI">${icon('plus',15)}</button>
      <button class="icon-btn sm" data-scale="reset" data-tip="Reset to 100%">${icon('refresh',14)}</button>
    </div>
    <button class="nav-item ${cur==='settings'?'on':''}" data-name="Settings" data-route="settings">
      <span class="ni-grip" aria-hidden="true"></span>
      <span class="ni-icon">${icon('settings')}</span><span class="ni-name">Settings</span></button>
    <button class="nav-item" data-name="Widget" data-route="__widget">
      <span class="ni-grip" aria-hidden="true"></span>
      <span class="ni-icon">${icon('widget')}</span><span class="ni-name">Desktop widget</span></button>
    <div class="side-user" data-tip="Your profile">
      <span id="side-user-av">${NX.avatarHtml ? NX.avatarHtml(profile,'lg') : `<span class="avatar lg" style="background:${U.esc(profile.avatar)}">${U.initials(profile.name)}</span>`}</span>
      <span class="su-txt"><span class="su-name">${U.esc(profile.name)}</span><span class="su-plan side-bal" id="side-bal">${sideBalText()}</span></span>
    </div>
  </div>`);

  foot.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-scale]');
    if(!b) return;
    const k = b.dataset.scale;
    if(k === 'reset') NX.setScale(1);
    else NX.zoomUI(k);
    const ro = q('[data-scale-readout]', foot);
    if(ro) ro.textContent = Math.round(getScale()*100) + '%';
  });

  foot.querySelector('[data-route="__widget"]').onclick = ()=>NX.widget && NX.widget.toggle();
  foot.querySelector('.side-user').onclick = (e)=>NX.menu(e.currentTarget, [
    { label:'Profile settings', icon:'user', onClick:()=>NX.router.go('settings') },
    { label:'Themes', icon:'palette', onClick:()=>NX.router.go('settings') },
    '-',
    { label:'Lock PebbleX', icon:'logout', onClick:()=>{
        NX.store.set('session',{authed:false});
        if(NX.native.available && NX.native.mode === 'tauri'){ NX.native.quitApp(); }
        else { location.hash='#/login'; location.reload(); }
      } },
    { label:'Export workspace', icon:'download', onClick:()=>NX.exportWorkspace() },
  ], { align:'left' });
  foot.querySelector('[data-route="settings"]').onclick = ()=>NX.router.go('settings');

  sb.appendChild(foot);
  sb.appendChild(h('<div class="nav-pill" aria-hidden="true"></div>'));

  /* collapse to rail */
  sb.querySelector('.collapse-btn').onclick = ()=>{
    let v = false;
    try{ v = !NX.store.get('ui:sidebarMini', false); NX.store.set('ui:sidebarMini', v); }catch(e){}
    sb.classList.toggle('mini', v);
    requestAnimationFrame(()=>{ try{ NX.motion && NX.motion.syncNav && NX.motion.syncNav(); }catch(e){} });
    setTimeout(()=> window.dispatchEvent(new Event('resize')), 280);
  };

  /* keep the open group in view when navigating */
  if(cur) setTimeout(()=>{
    const on = q(`.nav-item[data-route="${cur}"]`, sb);
    if(on && on.scrollIntoView) on.scrollIntoView({ block:'nearest' });
  }, 30);

  lastHost = host;
  host.appendChild(sb);
  return sb;
}
NX.renderSidebar = renderSidebar;

/* ---------------- settings panel ----------------
   A "Sidebar" section so hidden groups can be brought back and the layout
   reset. Without this, hiding your only route to a screen would be permanent. */

NX.sidebarSettings = function(){
  const hid = hidden(), lay = layout(), col = collapsed();
  const groups = NAV.map(g => g.group);

  const rows = groups.map(name => {
    const isHid = !!hid[name];
    const count = (lay[name] || []).filter(r => routeInfo(r)).length;
    return `<div class="row gap-8 side-cfg-row" data-g="${U.esc(name)}">
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;font-weight:700">${U.esc(name)}</div>
        <div class="faint tiny">${count} item${count===1?'':'s'}${col[name]?' · folded':''}</div>
      </div>
      <button class="btn btn-soft btn-sm" data-act="fold" data-g="${U.esc(name)}">${col[name]?'Unfold':'Fold'}</button>
      <button class="btn btn-soft btn-sm" data-act="hide" data-g="${U.esc(name)}">${isHid?'Show':'Hide'}</button>
    </div>`;
  }).join('');

  const wrap = h(`<div class="side-cfg">
    <div class="faint tiny" style="margin-bottom:10px">Drag a row in the sidebar onto another category to move it. Everything here is saved per device.</div>
    ${rows}
    <div class="row gap-8" style="margin-top:12px">
      <button class="btn btn-soft btn-sm" data-act="reset">Reset sidebar</button>
    </div>
  </div>`);

  wrap.addEventListener('click', (e)=>{
    const b = e.target.closest('[data-act]');
    if(!b) return;
    const act = b.dataset.act, g = b.dataset.g;

    if(act === 'reset'){
      writeMap(K_LAYOUT, baseLayout());
      writeMap(K_COLLAPSED, {});
      writeMap(K_HIDDEN, {});
      rerender();
      NX.renderSidebarSettings && NX.renderSidebarSettings();
      return;
    }
    if(act === 'fold'){
      const c = collapsed(); c[g] = !c[g]; writeMap(K_COLLAPSED, c);
    }
    if(act === 'hide'){
      const hs = hidden(); hs[g] = !hs[g]; writeMap(K_HIDDEN, hs);
      if(hs[g]){ const c = collapsed(); delete c[g]; writeMap(K_COLLAPSED, c); }
    }
    rerender();
    NX.renderSidebarSettings && NX.renderSidebarSettings();
  });

  return wrap;
};

/* Re-render the settings list in place, so fold/hide feels live. */
NX.renderSidebarSettings = function(){
  const host = q('#side-cfg-host');
  if(!host) return;
  host.innerHTML = '';
  host.appendChild(NX.sidebarSettings());
};

/* ---------------- boot ---------------- */
NX.events.on('shell:ready', ()=>{ applyScale(); });
/* Apply immediately too: 56 loads after the shell, and a saved scale should
   not flash at 100% first. */
applyScale();

NX.SIDEBAR_LIMITS = { SCALE_MIN, SCALE_MAX, SCALE_STEP };

})(window.NX);
