/* ============================================================
   Pebble 3.0 — 11-shell.js
   App shell: Elera-style sidebar (grouped nav + green pill),
   topbar, notification center, theme engine, hotkeys
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* ---------------- theme engine ---------------- */
const THEMES = [
  { id:'elera',       name:'Elera Light', dark:false, bg:'#F6F5F3', side:'#F6F5F3', main:'#FFFFFF', pill:'#7CD56E' },
  { id:'pebble-dark', name:'Pebble Dark', dark:true,  bg:'#161614', side:'#161614', main:'#1F1F1D', pill:'#7CD56E' },
  { id:'midnight',    name:'Midnight',    dark:true,  bg:'#0B1020', side:'#0B1020', main:'#111730', pill:'#5AD8A6' },
  { id:'nord',        name:'Nord',        dark:true,  bg:'#2E3440', side:'#2E3440', main:'#3B4252', pill:'#A3BE8C' },
  { id:'forest',      name:'Forest',      dark:true,  bg:'#101610', side:'#101610', main:'#172017', pill:'#8FD97A' },
  { id:'rose',        name:'Rose',        dark:false, bg:'#FBF3F4', side:'#FBF3F4', main:'#FFFFFF', pill:'#E8849B' },
  { id:'ocean',       name:'Ocean',       dark:false, bg:'#F1F6F8', side:'#F1F6F8', main:'#FFFFFF', pill:'#2EB5A0' },
  { id:'mono',        name:'Mono',        dark:false, bg:'#F4F4F4', side:'#F4F4F4', main:'#FFFFFF', pill:'#1A1A1A' },
  { id:'sunset',      name:'Sunset',      dark:false, bg:'#FBF4EF', side:'#FBF4EF', main:'#FFFFFF', pill:'#F08A4B' },
  { id:'candy',       name:'Candy',       dark:false, bg:'#F5F2FB', side:'#F5F2FB', main:'#FFFFFF', pill:'#9E7BFF' },
  { id:'coffee',      name:'Coffee',      dark:false, bg:'#F3EEE8', side:'#F3EEE8', main:'#FFFFFF', pill:'#B08954' },
  { id:'slate',       name:'Slate',       dark:true,  bg:'#181B20', side:'#181B20', main:'#20242B', pill:'#8FA3BF' },
  { id:'neon',        name:'Neon',        dark:true,  bg:'#0C0C0F', side:'#0C0C0F', main:'#141419', pill:'#5EF38C' }
];
NX.THEMES = THEMES;
/* Locked themes are gated. `force` is required in exactly two places:
   boot (so a locked-but-saved theme can never brick startup) and an
   explicit equip after purchase. Everything else goes through the
   gate and bounces the user to the store. */
NX.applyTheme = function(id, opts){
  const t = THEMES.find(x=>x.id===id) || THEMES[0];
  if(!opts || !opts.force){
    const unlocked = NX.store && NX.store.isUnlocked && NX.store.isUnlocked('theme:' + t.id);
    if(!unlocked){
      if(NX.openStore) NX.openStore('theme:' + t.id);
      return false;
    }
  }
  document.documentElement.setAttribute('data-theme', t.id);
  const isLight = !t.dark;
  document.documentElement.classList.toggle('light', isLight);
  if(document.body) document.body.classList.toggle('light', isLight);
  const s = NX.store.get('settings'); s.theme = t.id; NX.store.set('settings', s);
  return true;
};
/* Ctrl+J must SKIP locked themes, otherwise the hotkey looks broken
   the moment any theme is locked. */
NX.cycleTheme = function(){
  const s = NX.store.get('settings');
  const i = THEMES.findIndex(t=>t.id===s.theme);
  const isUnlocked = id => !(NX.store && NX.store.isUnlocked) || NX.store.isUnlocked('theme:' + id);
  let next = null;
  for(let step = 1; step <= THEMES.length; step++){
    const cand = THEMES[(i + step) % THEMES.length];
    if(isUnlocked(cand.id)){ next = cand; break; }
  }
  /* everything locked (should be impossible: 4 are always free) —
     fall back to the current theme rather than looping forever */
  next = next || THEMES[i] || THEMES[0];
  if(NX.applyTheme(next.id)){
    NX.toastInfo('Theme', next.name, { life:1800 });
  }
};

/* ---------------- nav model ---------------- */
const NAV = [
{ group:'Workspace', items:[
    { r:'today',      n:'Today',      ic:'sun' },
    { r:'dashboard',  n:'Dashboard',  ic:'dashboard' },
    { r:'canvas',     n:'Canvas',     ic:'brush' },
    { r:'chat',       n:'Chat',       ic:'chat' },
    { r:'messages',   n:'Messages',   ic:'user' },
    { r:'notes',      n:'Notes',      ic:'notes' },
    { r:'todo',       n:'Tasks',      ic:'todo' }
  ]},
  { group:'Intelligence', items:[
    { r:'ai',         n:'Pel AI',     ic:'ai' },
    { r:'prompts',    n:'Prompts',    ic:'star' },
    { r:'timeless',   n:'Timeless',   ic:'clock' },
    { r:'reminders',  n:'Reminders',  ic:'bell' }
  ]},
  { group:'Explore', items:[
    { r:'games',      n:'Arcade',     ic:'game' },
    { r:'focus',      n:'Focus',      ic:'target' }
  ]},
  { group:'Rewards', items:[
    { r:'store',      n:'Store',      ic:'star' },
    { r:'leaderboard',n:'Leaderboard',ic:'bar' }
  ]},
  { group:'Manage', items:[
    { r:'apps',       n:'Apps',       ic:'grid' }
  ]}
];
NX.NAV = NAV;

function routeTitle(){
  for(const g of NAV){ const it = g.items.find(i=>i.r === NX.router.currentName); if(it) return it.n; }
  const map = { settings:'Settings', store:'Store', leaderboard:'Leaderboard', apps:'Apps & features' };
  return map[NX.router.currentName] || 'Pebble';
}

/* ---------------- shell render ---------------- */
/* Read the persisted state instead of hardcoding false. The toggle saved to
   ui:sidebarMini but nothing ever read it back, so the sidebar silently sprang
   open on every launch and the collapse looked broken. */
let sidebarMini = (function(){
  try{ return !!NX.store.get('ui:sidebarMini', false); }catch(e){ return false; }
})();

function badgeFor(r){
  if(r === 'todo'){ const t = NX.store.get('tasks', []).filter(x=>!x.done).length; return t || ''; }
  if(r === 'reminders'){ const n = NX.store.get('reminders', []).filter(x=>!x.fired).length; return n || ''; }
  return '';
}

/* The footer used to read "Pro plan" — a hardcoded string that meant
   nothing. It now shows the real level and balance. */
function sideBalText(){
  if(!NX.points) return '';
  const lv = NX.points.level();
  return 'L' + lv.n + ' · ' + NX.points.balance().toLocaleString() + ' pts';
}

/** Repaint just the sidebar user block, without rebuilding the shell. */
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
  const pinned = (NX.store.get('pinnedRoutes', []) || []).filter(r => (NAV.flatMap(g=>g.items)).some(i=>i.r===r));
  const isPinnedRoute = r => NX.motion && NX.motion.isPinned ? NX.motion.isPinned(r) : pinned.includes(r);
  const sb = h(`<aside class="sidebar ${sidebarMini?'mini':''}">
    <div class="brand">
      <div class="brand-mark">${NX.brandMark()}</div>
      <div class="brand-name">PebbleX <span class="env">X</span></div>
      <button class="collapse-btn" data-tip="Collapse sidebar">${icon('chevL')}</button>
    </div>
  </aside>`);

  const navBtn = it =>{
    const b = badgeFor(it.r);
    const pinned = isPinnedRoute(it.r);
    const el = h(`<button class="nav-item ${cur===it.r?'on':''}" data-name="${it.n}" data-route="${it.r}">
        <span class="ni-icon">${icon(it.ic)}</span>
        <span class="ni-name">${U.esc(it.n)}</span>
        ${pinned? `<span class="ni-pin">${icon('star',12)}</span>` : `<span class="ni-hover-star">${icon('pin',12)}</span>`}
        ${b?`<span class="ni-badge">${b}</span>`:''}
      </button>`);
    el.onclick = ()=>NX.router.go(it.r);
    return el;
  };

  /* A module that is switched off, or explicitly hidden from the sidebar,
     does not get a nav row. The Apps screen and Settings still reach it,
     so nothing becomes unreachable. */
  const isVisible = r => {
    if(NX.apps && NX.apps.isHidden(r)) return false;
    if(NX.modules && NX.modules.isOn && !NX.modules.isOn(r)) return false;
    return true;
  };

  /* pinned group first — order follows the pin list */
  if(pinned.length){
    const grp = h(`<div class="nav-group"><div class="nav-label"><span>Pinned</span></div></div>`);
    pinned.forEach(r=>{
      const it = NAV.flatMap(g=>g.items).find(i=>i.r===r);
      if(it && isVisible(r)) grp.appendChild(navBtn(it));
    });
    if(grp.children.length) sb.appendChild(grp);
  }

  NAV.forEach(g=>{
    /* a group whose every app is off/hidden is dropped entirely rather
       than left as a bare label */
    const visible = g.items.filter(it => !pinned.includes(it.r) && isVisible(it.r));
    if(!visible.length) return;
    const grp = h(`<div class="nav-group"><div class="nav-label"><span>${U.esc(g.group)}</span></div></div>`);
    visible.forEach(it=>grp.appendChild(navBtn(it)));
    sb.appendChild(grp);
  });
  const foot = h(`<div class="side-foot">
    <button class="nav-item ${cur==='settings'?'on':''}" data-name="Settings" data-route="settings">
      <span class="ni-icon">${icon('settings')}</span><span class="ni-name">Settings</span></button>
    <button class="nav-item" data-name="Widget" data-route="__widget">
      <span class="ni-icon">${icon('widget')}</span><span class="ni-name">Desktop widget</span></button>
    <div class="side-user" data-tip="Your profile">
      <span id="side-user-av">${NX.avatarHtml ? NX.avatarHtml(profile,'lg') : `<span class="avatar lg" style="background:${U.esc(profile.avatar)}">${U.initials(profile.name)}</span>`}</span>
      <span class="su-txt"><span class="su-name">${U.esc(profile.name)}</span><span class="su-plan side-bal" id="side-bal">${sideBalText()}</span></span>
    </div>
  </div>`);
  foot.querySelector('[data-route="__widget"]').onclick = ()=>NX.widget && NX.widget.toggle();
  foot.querySelector('.side-user').onclick = (e)=>NX.menu(e.currentTarget, [
    { label:'Profile settings', icon:'user', onClick:()=>NX.router.go('settings') },
    { label:'Themes', icon:'palette', onClick:()=>{ NX.router.go('settings'); } },
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
  sb.querySelector('.collapse-btn').onclick = ()=>{
    sidebarMini = !sidebarMini;
    sb.classList.toggle('mini', sidebarMini);
    NX.store.set('ui:sidebarMini', sidebarMini);
    /* the pill has to re-measure at the new width, and the layout needs a
       frame before it settles */
    requestAnimationFrame(()=>{ try{ NX.motion && NX.motion.syncNav && NX.motion.syncNav(); }catch(e){} });
    /* let the width transition finish, then tell the view host it changed */
    setTimeout(()=> window.dispatchEvent(new Event('resize')), 280);
  };
  host.appendChild(sb);
  return sb;
}

/* ---------------- workspace tabs engine ---------------- */
const DEFAULT_WORKSPACE_TABS = [
  { id: 'tab-notes', route: 'notes', title: 'Notes', icon: 'notes' },
  { id: 'tab-canvas', route: 'canvas', title: 'Canvas', icon: 'brush' },
  { id: 'tab-todo', route: 'todo', title: 'Tasks', icon: 'todo' },
  { id: 'tab-timeless', route: 'timeless', title: 'Timeless', icon: 'clock' }
];

const TABS_STORE_KEY = 'workspace:tabs';
const ACTIVE_TAB_STORE_KEY = 'workspace:activeTabId';

function getStoredTabs(){
  try {
    const list = NX.store.get(TABS_STORE_KEY, null);
    if(Array.isArray(list) && list.length) return list;
  }catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_WORKSPACE_TABS));
}

function persistStoredTabs(tabs){
  try { NX.store.set(TABS_STORE_KEY, tabs); }catch(e){}
}

function getStoredActiveTabId(){
  try {
    const id = NX.store.get(ACTIVE_TAB_STORE_KEY, null);
    if(id) return id;
  }catch(e){}
  const list = getStoredTabs();
  return list[0] ? list[0].id : 'tab-notes';
}

function persistActiveTabId(id){
  try { NX.store.set(ACTIVE_TAB_STORE_KEY, id); }catch(e){}
}

function routeInfoFor(r){
  for(const g of NAV){
    const it = g.items.find(i=>i.r === r);
    if(it) return { title: it.n, icon: it.ic };
  }
  const map = {
    settings: { title: 'Settings', icon: 'settings' },
    store: { title: 'Store', icon: 'star' },
    leaderboard: { title: 'Leaderboard', icon: 'bar' },
    apps: { title: 'Apps & features', icon: 'grid' }
  };
  return map[r] || { title: (r.charAt(0).toUpperCase() + r.slice(1)), icon: 'notes' };
}

function renderWebTabView(tab){
  const view = q('#shell-view');
  if(!view) return;
  const clean = NX.cleanHost ? NX.cleanHost(tab.url) : tab.title;
  const fav = NX.getWebsiteFaviconHtml ? NX.getWebsiteFaviconHtml(tab.url, { size: 34 }) : '';
  view.innerHTML = `
    <div class="web-tab-viewer card anim-in" style="margin:20px auto;max-width:920px;padding:22px;border-radius:18px;background:var(--surface);border:1px solid var(--line);box-shadow:var(--sh-card)">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--line)">
        ${fav}
        <div style="flex:1;min-width:0">
          <h2 style="font-size:18px;font-weight:700;margin:0 0 4px;color:var(--ink)">${U.esc(tab.title || clean)}</h2>
          <div style="font-size:12px;color:var(--ink-3);display:flex;align-items:center;gap:8px">
            <span style="font-family:monospace">${U.esc(tab.url)}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <a href="${U.esc(tab.url)}" target="_blank" rel="noopener" class="btn btn-dark btn-sm" style="display:inline-flex;align-items:center;gap:6px">
            ${icon('external', 13)} <span>Open in Browser</span>
          </a>
          <button class="btn btn-soft btn-sm" id="wt-copy-btn" style="display:inline-flex;align-items:center;gap:5px">${icon('copy', 12)} <span>Copy</span></button>
        </div>
      </div>
      <div style="height:calc(100vh - 200px);border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--bg)">
        <iframe src="${U.esc(tab.url)}" style="width:100%;height:100%;border:none" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      </div>
    </div>
  `;
  const cp = q('#wt-copy-btn', view);
  if(cp) cp.onclick = () => {
    if(NX.native && NX.native.clipboardWrite) NX.native.clipboardWrite(tab.url).then(()=>NX.toastOk('URL copied', tab.url));
  };
}

function openWebTabModal(){
  const popular = [
    { name: 'GitHub', url: 'https://github.com' },
    { name: 'Notion', url: 'https://notion.so' },
    { name: 'YouTube', url: 'https://youtube.com' },
    { name: 'ChatGPT', url: 'https://chatgpt.com' },
    { name: 'Google Docs', url: 'https://docs.google.com' },
    { name: 'Figma', url: 'https://figma.com' },
    { name: 'Twitter / X', url: 'https://x.com' },
    { name: 'Reddit', url: 'https://reddit.com' }
  ];

  const dlg = NX.modal({
    title: 'Open Website Tab',
    icon: 'star',
    size: 'sm',
    body: `
      <div style="display:flex;flex-direction:column;gap:14px">
        <p style="font-size:12.5px;color:var(--ink-2);margin:0">Enter any website domain or link to open as a dedicated tab with live favicon:</p>
        <div class="row gap-8" style="display:flex;align-items:center;gap:8px">
          <input class="input" id="wt-input-url" placeholder="e.g. github.com, notion.so, apple.com…" style="flex:1;height:38px;padding:0 12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--line);color:var(--ink)">
          <button class="btn btn-green" id="wt-confirm-open" style="height:38px;padding:0 14px">Open</button>
        </div>
        <div>
          <div class="faint tiny bold" style="margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Quick Launch</div>
          <div class="row gap-6" style="display:flex;flex-wrap:wrap;gap:6px">
            ${popular.map(p => `
              <button class="btn btn-soft btn-sm wt-quick-chip" data-url="${p.url}" data-name="${p.name}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:8px">
                ${NX.getWebsiteFaviconHtml ? NX.getWebsiteFaviconHtml(p.url, { size: 14 }) : ''}
                <span>${p.name}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `
  });

  const inp = q('#wt-input-url', dlg);
  const btn = q('#wt-confirm-open', dlg);
  const trigger = (url, name) => {
    let clean = (url || '').trim();
    if(!clean) return;
    if(!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
    const title = name || (NX.cleanHost ? NX.cleanHost(clean) : clean);
    NX.closeModal(dlg);
    NX.tabs.open({
      id: 'tab-web-' + U.uid(4),
      route: 'web',
      title,
      url: clean,
      isWeb: true
    });
  };

  if(btn && inp){
    btn.onclick = () => trigger(inp.value);
    inp.onkeydown = (e) => { if(e.key === 'Enter') trigger(inp.value); };
    setTimeout(() => inp.focus(), 80);
  }

  qa('.wt-quick-chip', dlg).forEach(b => {
    b.onclick = () => trigger(b.dataset.url, b.dataset.name);
  });
}

NX.tabs = {
  list(){ return getStoredTabs(); },
  activeId(){ return getStoredActiveTabId(); },
  active(){
    const list = getStoredTabs();
    const id = getStoredActiveTabId();
    return list.find(t=>t.id===id) || list[0] || null;
  },
  open(opts = {}){
    let list = getStoredTabs();
    const route = opts.route || 'notes';
    const isWeb = !!opts.isWeb;
    const url = opts.url || null;
    const info = routeInfoFor(route);
    const title = opts.title || info.title;
    const icon = opts.icon || info.icon;
    const params = opts.params || null;
    const id = opts.id || ('tab-' + (isWeb ? 'web-' : '') + route + '-' + U.uid(3));

    let existing = list.find(t => {
      if(isWeb && t.isWeb && t.url === url) return true;
      if(!isWeb && !t.isWeb && t.route === route){
        if(params && t.params) return JSON.stringify(params) === JSON.stringify(t.params);
        if(!params && !t.params) return true;
      }
      return false;
    });

    if(existing){
      persistActiveTabId(existing.id);
      NX.tabs.render();
      if(!opts.noNavigate){
        if(existing.isWeb) renderWebTabView(existing);
        else NX.router.go(existing.route, existing.params);
      }
      return existing;
    }

    const tab = { id, route, title, icon, url, isWeb, params };
    list.push(tab);
    persistStoredTabs(list);
    persistActiveTabId(id);
    NX.tabs.render();
    if(!opts.noNavigate){
      if(isWeb) renderWebTabView(tab);
      else NX.router.go(route, params);
    }
    try{ if(NX.sfx) NX.sfx.play('pop'); }catch(e){}
    return tab;
  },
  switch(id){
    const list = getStoredTabs();
    const tab = list.find(t=>t.id===id);
    if(!tab) return;
    persistActiveTabId(id);
    NX.tabs.render();
    if(tab.isWeb && tab.url){
      renderWebTabView(tab);
    } else {
      NX.router.go(tab.route, tab.params);
    }
    try{ if(NX.sfx) NX.sfx.play('tick'); }catch(e){}
  },
  close(id, e){
    if(e){ e.stopPropagation(); e.preventDefault(); }
    let list = getStoredTabs();
    if(list.length <= 1){
      NX.toastInfo('Workspace', 'At least one tab remains open');
      return;
    }
    const idx = list.findIndex(t=>t.id===id);
    if(idx < 0) return;
    const curId = getStoredActiveTabId();
    list.splice(idx, 1);
    persistStoredTabs(list);
    if(curId === id){
      const next = list[Math.min(idx, list.length - 1)];
      persistActiveTabId(next.id);
      NX.tabs.switch(next.id);
    } else {
      NX.tabs.render();
    }
    try{ if(NX.sfx) NX.sfx.play('tick'); }catch(e){}
  },
  updateActiveTitle(title, ic){
    let list = getStoredTabs();
    const id = getStoredActiveTabId();
    const t = list.find(x=>x.id===id);
    if(t){
      if(title) t.title = title;
      if(ic) t.icon = ic;
      persistStoredTabs(list);
      NX.tabs.render();
    }
  },
  syncFromRoute(name, params){
    let list = getStoredTabs();
    const id = getStoredActiveTabId();
    let cur = list.find(t=>t.id===id);
    if(cur && cur.route === name){
      if(params) cur.params = params;
      persistStoredTabs(list);
      NX.tabs.render();
      return;
    }
    let other = list.find(t=>t.route === name && !t.isWeb);
    if(other){
      persistActiveTabId(other.id);
      NX.tabs.render();
      return;
    }
    const info = routeInfoFor(name);
    if(cur && !cur.isWeb){
      cur.route = name;
      cur.title = info.title;
      cur.icon = info.icon;
      cur.params = params || null;
      persistStoredTabs(list);
      NX.tabs.render();
    } else {
      NX.tabs.open({ route: name, title: info.title, icon: info.icon, params, noNavigate: true });
    }
  },
  newTabPrompt(anchor){
    NX.menu(anchor || q('#ws-tab-add-btn'), [
      { label:'Open Notes Tab', icon:'notes', onClick:()=>NX.tabs.open({ route:'notes', title:'Notes', icon:'notes' }) },
      { label:'Open Canvas Board', icon:'brush', onClick:()=>NX.tabs.open({ route:'canvas', title:'Canvas', icon:'brush' }) },
      { label:'Open Tasks Tab', icon:'todo', onClick:()=>NX.tabs.open({ route:'todo', title:'Tasks', icon:'todo' }) },
      { label:'Open Timeless Activity', icon:'clock', onClick:()=>NX.tabs.open({ route:'timeless', title:'Timeless', icon:'clock' }) },
      { label:'Open Pel AI Copilot', icon:'ai', onClick:()=>NX.tabs.open({ route:'ai', title:'Pel AI', icon:'ai' }) },
      '-',
      { label:'Open Real Website Tab…', icon:'star', onClick:()=>openWebTabModal() }
    ], { align:'left' });
  },
  render(){
    const host = typeof q === 'function' ? q('#ws-tabs-strip') : (document.querySelector ? document.querySelector('#ws-tabs-strip') : null);
    if(!host) return;
    const tabs = getStoredTabs();
    const activeId = getStoredActiveTabId();

    host.innerHTML = '';
    tabs.forEach(tab => {
      const isActive = tab.id === activeId;
      const el = document.createElement('div');
      el.className = 'ws-tab ' + (isActive ? 'active' : '');
      el.dataset.tabId = tab.id;
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', String(isActive));
      el.title = tab.title + (tab.url ? ' (' + tab.url + ')' : '');

      let iconHtml = '';
      if(tab.isWeb && tab.url && NX.getWebsiteFaviconHtml){
        iconHtml = NX.getWebsiteFaviconHtml(tab.url, { size: 14, cls: 'tab-web-fav' });
      } else {
        iconHtml = icon(tab.icon || 'notes', 13);
      }

      el.innerHTML = '<span class="ws-tab-ic">' + iconHtml + '</span>' +
        '<span class="ws-tab-txt">' + U.esc(tab.title) + '</span>' +
        '<button class="ws-tab-close" title="Close Tab (Ctrl+W)">&times;</button>';

      el.onclick = (e) => {
        if(e.target.closest('.ws-tab-close')) return;
        NX.tabs.switch(tab.id);
      };

      el.onauxclick = (e) => {
        if(e.button === 1){
          e.preventDefault();
          NX.tabs.close(tab.id);
        }
      };

      const closeBtn = el.querySelector('.ws-tab-close');
      if(closeBtn){
        closeBtn.onclick = (e) => NX.tabs.close(tab.id, e);
      }

      el.oncontextmenu = (e) => {
        e.preventDefault();
        NX.menu(e, [
          { label: 'Close Tab', icon: 'x', onClick: () => NX.tabs.close(tab.id) },
          { label: 'Close Other Tabs', icon: 'trash', onClick: () => {
              persistStoredTabs([tab]);
              persistActiveTabId(tab.id);
              NX.tabs.render();
            }
          },
          { label: 'Duplicate Tab', icon: 'plus', onClick: () => {
              NX.tabs.open({ route: tab.route, title: tab.title + ' (Copy)', icon: tab.icon, params: tab.params, url: tab.url, isWeb: tab.isWeb });
            }
          }
        ]);
      };

      host.appendChild(el);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'ws-tab-add';
    addBtn.id = 'ws-tab-add-btn';
    addBtn.title = 'New Tab (Ctrl+T)';
    addBtn.innerHTML = icon('plus', 12);
    addBtn.onclick = (e) => NX.tabs.newTabPrompt(e.currentTarget);
    host.appendChild(addBtn);
  }
};

/* ---------------- Glass Shade Tint Engine ---------------- */
NX.setGlassShade = function(shade){
  const clean = shade || 'emerald';
  document.documentElement.setAttribute('data-glass-shade', clean);
  try { NX.store.set('ui:glassShade', clean); }catch(e){}
  NX.toastOk('Glass Shade', clean.charAt(0).toUpperCase() + clean.slice(1) + ' Acrylic');
};

NX.initGlassShade = function(){
  try {
    const saved = NX.store.get('ui:glassShade', 'emerald');
    document.documentElement.setAttribute('data-glass-shade', saved);
  }catch(e){}
};

/* ---------------- Optional Window Transparency ---------------- */
NX.isWindowTransparent = function(){
  return Boolean(NX.store && NX.store.get('ui:windowTransparency', false));
};

NX.setWindowTransparency = function(on){
  const v = Boolean(on);
  document.documentElement.setAttribute('data-window-transparency', v ? 'on' : 'off');
  try { NX.store.set('ui:windowTransparency', v); }catch(e){}
  NX.toastOk('Desktop Glass', v ? 'See-Through Acrylic Enabled' : 'Solid Opaque Mode (0% Lag)');
};

NX.initWindowTransparency = function(){
  try {
    const v = NX.isWindowTransparent();
    document.documentElement.setAttribute('data-window-transparency', v ? 'on' : 'off');
  }catch(e){}
};

NX.openGlassyHub = function(anchor){
  const existing = document.getElementById('nx-glass-hub-dropdown');
  if(existing){ existing.remove(); return; }

  const curShade = (NX.store && NX.store.get('ui:glassShade', 'emerald')) || 'emerald';
  const isTrans = NX.isWindowTransparent();
  const unread = NX.unreadNotifs();
  const bal = sideBalText();
  const curThemeObj = THEMES.find(t=>t.id === (NX.store.get('settings',{}).theme)) || THEMES[0];
  const sfxOn = !(NX.store.get('settings',{}).muteSfx);

  const rect = anchor ? anchor.getBoundingClientRect() : { right: window.innerWidth - 16, bottom: 44 };
  const rightOffset = Math.max(12, window.innerWidth - rect.right);
  const topOffset = rect.bottom + 6;

  const menu = h(`<div id="nx-glass-hub-dropdown" class="glass-hub-card anim-in" style="position:fixed;top:${topOffset}px;right:${rightOffset}px;z-index:9500;width:300px">
    <div class="gh-head">
      <div class="row gap-8" style="align-items:center">
        <span class="gh-bolt">⚡</span>
        <div>
          <div class="bold" style="font-size:13px;line-height:1.2">PebbleX Hub</div>
          <div class="faint tiny">${bal || 'Quick Controls &amp; Shortcuts'}</div>
        </div>
      </div>
      <button class="gh-close-btn" id="gh-close" title="Close Hub">&times;</button>
    </div>

    <div class="gh-section">
      <div class="gh-sec-lbl">Quick Create</div>
      <div class="gh-grid-3">
        <button class="gh-grid-btn" id="gh-new-note">
          <span class="gh-btn-ic">${icon('notes', 14)}</span>
          <span>+ Note</span>
        </button>
        <button class="gh-grid-btn" id="gh-new-task">
          <span class="gh-btn-ic">${icon('todo', 14)}</span>
          <span>+ Task</span>
        </button>
        <button class="gh-grid-btn" id="gh-new-canvas">
          <span class="gh-btn-ic">${icon('brush', 14)}</span>
          <span>+ Canvas</span>
        </button>
        <button class="gh-grid-btn" id="gh-new-webtab">
          <span class="gh-btn-ic">${icon('globe', 14)}</span>
          <span>+ Web Tab</span>
        </button>
        <button class="gh-grid-btn" id="gh-new-rem">
          <span class="gh-btn-ic">${icon('bell', 14)}</span>
          <span>+ Alert</span>
        </button>
        <button class="gh-grid-btn" id="gh-new-prompt">
          <span class="gh-btn-ic">${icon('star', 14)}</span>
          <span>+ Prompt</span>
        </button>
      </div>
    </div>

    <div class="gh-section">
      <div class="gh-sec-lbl">Intelligence &amp; Alerts</div>
      <div class="gh-action-list">
        <button class="gh-act-row" id="gh-copilot">
          <span class="gh-row-ic" style="color:var(--green)">${icon('robot', 15)}</span>
          <span class="gh-row-txt">Pebble Copilot AI</span>
          <span class="kbd">Ctrl+Shift+A</span>
        </button>
        <button class="gh-act-row" id="gh-notifs">
          <span class="gh-row-ic" style="color:var(--orange)">${icon('bell', 15)}</span>
          <span class="gh-row-txt">Notifications</span>
          ${unread ? `<span class="pill red sm">${unread}</span>` : `<span class="faint tiny">0 new</span>`}
        </button>
        <button class="gh-act-row" id="gh-cycle-theme">
          <span class="gh-row-ic" style="color:var(--purple, #8b5cf6)">${icon('palette', 15)}</span>
          <span class="gh-row-txt">Theme: <b>${U.esc(curThemeObj.name)}</b></span>
          <span class="faint tiny">Cycle (Ctrl+J)</span>
        </button>
      </div>
    </div>

    <div class="gh-section">
      <div class="gh-sec-lbl" style="display:flex;align-items:center;justify-content:space-between">
        <span>Desktop Glass (See-Through)</span>
        <button class="btn btn-sm ${isTrans?'btn-green':'btn-soft'}" id="gh-trans-toggle" style="padding:2px 8px;font-size:11px;font-weight:700;line-height:1.2;cursor:pointer">
          ${isTrans ? 'Glass: ON' : 'Solid: OFF'}
        </button>
      </div>
      <div class="faint tiny" style="margin:4px 0 8px">Keep OFF for solid opaque background &amp; 0% lag.</div>
      <div class="gh-shade-row" style="${isTrans ? '' : 'opacity:0.6'}">
        ${[
          { id:'emerald', name:'Calm Emerald', color:'#7CD56E' },
          { id:'ocean',   name:'Deep Ocean',   color:'#5EB8FF' },
          { id:'sunset',  name:'Warm Sunset',  color:'#E8853D' },
          { id:'violet',  name:'Royal Violet', color:'#8B5CF6' },
          { id:'neon',    name:'Cyber Neon',   color:'#5EF38C' },
          { id:'crystal', name:'Clear Mica',   color:'#E2E8F0' }
        ].map(sh => `
          <button class="gh-shade-dot ${curShade===sh.id?'active':''}" data-shade="${sh.id}" title="${sh.name}" style="background:${sh.color}">
            ${curShade===sh.id ? '✓' : ''}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="gh-foot">
      <button class="gh-toggle-btn ${sfxOn?'on':''}" id="gh-sfx-toggle" title="Toggle audio feedback">
        <span>${sfxOn ? '🔊 Sound: On' : '🔇 Sound: Off'}</span>
      </button>
      <button class="gh-toggle-btn" id="gh-widget-toggle" title="Toggle Desktop Floating Widget">
        <span>🗔 Mini Widget</span>
      </button>
    </div>
  </div>`);

  document.body.appendChild(menu);

  const close = () => { menu.remove(); document.removeEventListener('click', outsideClick); };
  const outsideClick = (e) => {
    if(!menu.contains(e.target) && (!anchor || !anchor.contains(e.target))) close();
  };
  setTimeout(() => document.addEventListener('click', outsideClick), 40);

  q('#gh-close', menu).onclick = close;
  q('#gh-new-note', menu).onclick = () => { close(); NX.router.go('notes'); setTimeout(()=>NX.newNote && NX.newNote(), 60); };
  q('#gh-new-task', menu).onclick = () => { close(); NX.router.go('todo'); setTimeout(()=>NX.newTask && NX.newTask(), 60); };
  q('#gh-new-canvas', menu).onclick = () => { close(); NX.router.go('canvas'); };
  q('#gh-new-webtab', menu).onclick = () => { close(); openWebTabModal(); };
  q('#gh-new-rem', menu).onclick = () => { close(); NX.router.go('reminders'); setTimeout(()=>NX.newReminder && NX.newReminder(), 60); };
  q('#gh-new-prompt', menu).onclick = () => { close(); NX.router.go('prompts'); setTimeout(()=>NX.newPrompt && NX.newPrompt(), 60); };

  q('#gh-copilot', menu).onclick = () => { close(); NX.openAskPebble && NX.openAskPebble(); };
  q('#gh-notifs', menu).onclick = () => { close(); NX.openNotifCenter && NX.openNotifCenter(anchor); };
  q('#gh-cycle-theme', menu).onclick = () => { NX.cycleTheme(); close(); };

  const transBtn = q('#gh-trans-toggle', menu);
  if(transBtn){
    transBtn.onclick = () => {
      const next = !NX.isWindowTransparent();
      NX.setWindowTransparency(next);
      transBtn.className = `btn btn-sm ${next ? 'btn-green' : 'btn-soft'}`;
      transBtn.textContent = next ? 'Glass: ON' : 'Solid: OFF';
      const shadeRow = menu.querySelector('.gh-shade-row');
      if(shadeRow) shadeRow.style.opacity = next ? '1' : '0.6';
    };
  }

  qa('.gh-shade-dot', menu).forEach(dot => {
    dot.onclick = () => {
      const sh = dot.dataset.shade;
      NX.setGlassShade(sh);
      qa('.gh-shade-dot', menu).forEach(d => { d.classList.remove('active'); d.textContent = ''; });
      dot.classList.add('active');
      dot.textContent = '✓';
      try{ NX.sfx.play('tick'); }catch(e){}
    };
  });

  q('#gh-sfx-toggle', menu).onclick = (e) => {
    const s = NX.store.get('settings', {});
    s.muteSfx = !s.muteSfx;
    NX.store.set('settings', s);
    e.currentTarget.classList.toggle('on', !s.muteSfx);
    e.currentTarget.querySelector('span').textContent = s.muteSfx ? '🔇 Sound: Off' : '🔊 Sound: On';
    if(!s.muteSfx) try{ NX.sfx.play('pop'); }catch(err){}
  };

  q('#gh-widget-toggle', menu).onclick = () => {
    close();
    if(NX.widget && NX.widget.toggle) NX.widget.toggle();
  };
};

function renderTopbar(host){
  const title = routeTitle();
  const unread = NX.unreadNotifs();
  const bar = h(`<header class="topbar ultra-minimal custom-glass-bar">
    <div class="topbar-tabs-container">
      <div class="page-title" style="display:none"><span>${U.esc(title)}</span></div>
      <div class="topbar-crumbs" id="topbar-crumbs" style="display:none" aria-label="Breadcrumb"></div>
      <div class="workspace-tabs-strip" id="ws-tabs-strip" role="tablist"></div>
    </div>
    <div class="search-box sm omni-search-box" id="tp-search" role="button" tabindex="0" data-tip="Quick search, commands, or enter URL (Ctrl+K)">
      ${icon('search',13)}<input placeholder="Search notes, tasks, or enter URL…" readonly>
      <span class="kbd">Ctrl K</span>
    </div>
    <div class="topbar-actions glassy-actions-cluster" style="display:flex;align-items:center;gap:6px">
      <button class="topbar-hub-btn glassy-pill" id="tp-hub-btn" data-tip="Pebble Hub — Quick Actions, Copilot &amp; Glass Controls">
        <span class="th-sparkle">⚡</span>
        <span class="th-label">Hub</span>
        ${unread? `<span class="th-badge red" id="tp-bell-badge">${unread>9?'9+':unread}</span>`:''}
        <span class="th-arrow">▾</span>
      </button>
      <div style="display:none">
        <button id="tp-theme"></button>
        <button id="tp-copilot"></button>
        <button id="tp-bell"></button>
        <button id="tp-points"></button>
        <button id="tp-new"></button>
      </div>
    </div>
  </header>`);

  const hubBtn = bar.querySelector('#tp-hub-btn');
  if(hubBtn) hubBtn.onclick = (e) => NX.openGlassyHub(e.currentTarget);

  const themeBtn = bar.querySelector('#tp-theme');
  if(themeBtn) themeBtn.onclick = () => NX.cycleTheme();
  bar.querySelector('#tp-search').onclick = ()=> (NX.openSpotlight ? NX.openSpotlight() : NX.openCommandPalette());
  bar.querySelector('#tp-search').onkeydown = (e)=>{ if(e.key==='Enter') (NX.openSpotlight ? NX.openSpotlight() : NX.openCommandPalette()); };
  bar.querySelector('#tp-copilot').onclick = ()=> NX.openAskPebble && NX.openAskPebble();
  bar.querySelector('#tp-bell').onclick = (e)=>NX.openNotifCenter(e.currentTarget);
  const ptsBtn = bar.querySelector('#tp-points');
  if(ptsBtn) ptsBtn.onclick = ()=>NX.router.go('store');
  bar.querySelector('#tp-new').onclick = (e)=>NX.openGlassyHub(e.currentTarget);
  host.appendChild(bar);
  NX.initWindowTransparency();
  NX.initGlassShade();
  NX.tabs.render();
}

NX.refreshBadges = function(){
  const sb = q('.sidebar'); if(!sb) return;
  qa('.nav-item[data-route]', sb).forEach(el=>{
    const r = el.dataset.route;
    const old = el.querySelector('.ni-badge');
    if(old) old.remove();
    const b = badgeFor(r);
    if(b){
      const chip = h(`<span class="ni-badge">${b}</span>`);
      el.appendChild(chip);
    }
  });
  const bellBadge = q('#tp-bell-badge');
  const unread = NX.unreadNotifs();
  if(bellBadge){ bellBadge.remove(); }
  if(unread){
    const wrap = q('.bell-wrap');
    wrap && wrap.appendChild(h(`<span class="bell-badge" id="tp-bell-badge">${unread>9?'9+':unread}</span>`));
  }
};

/** Balance chip in the topbar. Only rendered once points exists —
    11-shell.js loads before 45-points.js, so this must tolerate its
    absence rather than assume it. */
function pointsChip(){
  if(!NX.points) return '';
  return `<button class="hud-points" id="tp-points" data-tip="Your points — click for the store">
    <span class="hud-points-ic">${icon('star',12)}</span>
    <span class="hud-points-val" id="tp-points-val">${NX.points.balance().toLocaleString()}</span>
    <span class="hud-points-lv" id="tp-points-lv">L${NX.points.level().n}</span>
  </button>`;
}

NX.refreshPointsChip = function(){
  const val = q('#tp-points-val');
  const lv = q('#tp-points-lv');
  if(!NX.points) return;
  if(val){
    const before = val.textContent;
    const now = NX.points.balance().toLocaleString();
    val.textContent = now;
    if(before !== now){
      const chip = q('#tp-points');
      if(chip){
        chip.classList.remove('bump');
        void chip.offsetWidth;
        chip.classList.add('bump');
      }
    }
  }
  if(lv) lv.textContent = 'L' + NX.points.level().n;
  NX.refreshSidebarUser && NX.refreshSidebarUser();
};

/* ---------------- app route ---------------- */
NX.router.register('app', { title:'Pebble', layout:'app', render(){} }); // fallback

NX.renderShell = function(routeName){
  const app = q('#nx-app');
  app.classList.add('app-root');
  document.body.classList.remove('login-mode');
  app.innerHTML = '';
  const host = h('<div style="display:flex;width:100%;height:100%"><div class="main-col" style="display:flex;flex-direction:column;flex:1;min-width:0"><div id="shell-top"></div><div class="view-host" id="shell-view"></div></div></div>');
  app.appendChild(host);
  // sidebar lives left of main col — rebuild layout properly
  app.innerHTML = '';
  const layout = h('<div class="app-layout" style="display:flex;width:100%;height:100%"></div>');
  app.appendChild(layout);
  /* Go through NX.renderSidebar, not the local function: 56-sidebar.js
     replaces it with the version that scrolls, folds and drags. Calling the
     local one would silently keep the old flat column. */
  NX.renderSidebar(layout);
  const mainCol = h('<div class="main-col"></div>');
  layout.appendChild(mainCol);
  const topHost = h('<div id="shell-top"></div>'); mainCol.appendChild(topHost);
  const view = h('<div class="view-host" id="shell-view"></div>'); mainCol.appendChild(view);
  renderTopbar(topHost);
  NX.refreshBadges();
  return view;
};

/* Router wrapper: every module route renders INTO the shell */
NX.routeInShell = function(name, title, ic, renderFn, onMount){
  NX.router.register(name, {
    title, icon: ic, layout:'app',
    render(app, params){
      params = params || null;
      /* Build the shell ONCE and reuse it. This used to compare
         dataset.route against the incoming name, so switching tabs tore the
         whole shell down — sidebar, topbar, badges — and rebuilt it before the
         view rendered. That is why every tab felt like it loaded twice. The
         title, the active nav item and the badges are all updated in place
         below, so nothing needs rebuilding per navigation. */
      const view = q('#shell-view') || NX.renderShell(name);
      view.dataset.route = name;
      const layout = q('.app-layout');
      if(layout){
        layout.classList.toggle('notes-mode', name === 'notes');
      }
      try{ document.body.classList.toggle('in-notes-route', name === 'notes'); }catch(e){}
      // update topbar title without rebuilding search/bell
      const t = q('.topbar .page-title > span');
      if(t) t.textContent = title;
      qa('.sidebar .nav-item').forEach(el=>el.classList.toggle('on', el.dataset.route === name));
      NX.refreshBadges();
      if(NX.tabs && NX.tabs.syncFromRoute) NX.tabs.syncFromRoute(name, params);
      if(view._cleanup){
        try{ view._cleanup(); }catch(e){}
        view._cleanup = null;
      }
      view.classList.remove('full');
      view.innerHTML = '';
      view.scrollTop = 0;
      try{ renderFn(view, params); }
      catch(e){
        console.error('['+name+']', e);
        view.innerHTML = `<div class="empty"><div class="e-title">This view stumbled</div><div class="e-sub">${U.esc(e.message)}</div></div>`;
      }
      /* the split pane lives outside the reused shell, so it is (re)applied
         here rather than being rebuilt with the shell */
      try{ if(NX.applySplit) NX.applySplit(); }catch(e){}
    },
    onMount(){ if(onMount) onMount(); }
  });
};

/* patch Router.go to use currentName */
Object.defineProperty(NX.router, 'currentName', { get(){ return (location.hash||'#/dashboard').replace(/^#\/?/,'').split('/')[0] || 'dashboard'; } });

/* ---------------- hotkeys ---------------- */
document.addEventListener('keydown', (e)=>{
  const mod = e.ctrlKey || e.metaKey;
  if(mod && e.key.toLowerCase() === 'k'){ e.preventDefault(); NX.openCommandPalette(); }
  else if(mod && e.key.toLowerCase() === 't'){ e.preventDefault(); NX.tabs && NX.tabs.newTabPrompt && NX.tabs.newTabPrompt(); }
  else if(mod && e.key.toLowerCase() === 'w' && !e.shiftKey){
    e.preventDefault();
    if(NX.tabs && NX.tabs.close && NX.tabs.activeId){
      NX.tabs.close(NX.tabs.activeId());
    }
  }
  else if((e.altKey && (e.code === 'Space' || e.key === ' ')) || (mod && e.shiftKey && (e.code === 'Space' || e.key === ' '))){
    e.preventDefault();
    NX.openSpotlight ? NX.openSpotlight() : NX.openCommandPalette();
  }
  else if(mod && e.shiftKey && e.key.toLowerCase() === 'a'){
    e.preventDefault();
    NX.openAskPebble && NX.openAskPebble();
  }
  else if(mod && e.key.toLowerCase() === 'j'){ e.preventDefault(); NX.cycleTheme(); }
  else if(mod && e.key.toLowerCase() === 'w' && e.shiftKey){ e.preventDefault(); NX.widget && NX.widget.toggle(); }
  else if(mod && e.shiftKey && e.key.toLowerCase() === 'b'){ e.preventDefault(); NX.openBugReporter && NX.openBugReporter(); }
  else if(mod && e.shiftKey && e.key.toLowerCase() === 's'){ e.preventDefault(); NX.router.go('store'); }
  else if(mod && e.shiftKey && e.key.toLowerCase() === 'l'){ e.preventDefault(); NX.router.go('leaderboard'); }
  else if(e.key === 'Escape'){ NX.closeMenu(); }
});

/* live balance + level, repainted in place (never a shell rebuild) */
NX.events.on('points:changed', ()=>{ NX.refreshPointsChip && NX.refreshPointsChip(); });
NX.events.on('store:entitlements', ()=>{ NX.refreshSidebarUser && NX.refreshSidebarUser(); });

/* live day in topbar */
const _topbarTimer = setInterval(()=>{ const s = typeof q === 'function' ? q('#tp-sub') : null; if(s) s.textContent = U.dayName(0); }, 60e3);
if(_topbarTimer && typeof _topbarTimer.unref === 'function') _topbarTimer.unref();
})(window.NX);
