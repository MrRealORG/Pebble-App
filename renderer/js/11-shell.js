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
NX.applyTheme = function(id){
  const t = THEMES.find(x=>x.id===id) || THEMES[0];
  document.documentElement.setAttribute('data-theme', t.id);
  const s = NX.store.get('settings'); s.theme = t.id; NX.store.set('settings', s);
  document.querySelector('meta[name="theme-color"]')?.remove();
};
NX.cycleTheme = function(){
  const s = NX.store.get('settings');
  const i = THEMES.findIndex(t=>t.id===s.theme);
  const next = THEMES[(i+1) % THEMES.length];
  NX.applyTheme(next.id);
  NX.toastInfo('Theme', next.name, { life:1800 });
};

/* ---------------- nav model ---------------- */
const NAV = [
{ group:'Workspace', items:[
    { r:'today',      n:'Today',      ic:'sun' },
    { r:'dashboard',  n:'Dashboard',  ic:'dashboard' },
    { r:'chat',       n:'Chat',       ic:'chat' },
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
    { r:'media',      n:'Screenshot', ic:'camera' },
    { r:'focus',      n:'Focus',      ic:'target' }
  ]}
];
NX.NAV = NAV;

function routeTitle(){
  for(const g of NAV){ const it = g.items.find(i=>i.r === NX.router.currentName); if(it) return it.n; }
  const map = { settings:'Settings' };
  return map[NX.router.currentName] || 'Pebble';
}

/* ---------------- shell render ---------------- */
let sidebarMini = false;

function badgeFor(r){
  if(r === 'todo'){ const t = NX.store.get('tasks', []).filter(x=>!x.done).length; return t || ''; }
  if(r === 'reminders'){ const n = NX.store.get('reminders', []).filter(x=>!x.fired).length; return n || ''; }
  return '';
}

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

  /* pinned group first — order follows the pin list */
  if(pinned.length){
    const grp = h(`<div class="nav-group"><div class="nav-label"><span>Pinned</span></div></div>`);
    pinned.forEach(r=>{
      const it = NAV.flatMap(g=>g.items).find(i=>i.r===r);
      if(it) grp.appendChild(navBtn(it));
    });
    sb.appendChild(grp);
  }

  NAV.forEach(g=>{
    const grp = h(`<div class="nav-group"><div class="nav-label"><span>${U.esc(g.group)}</span></div></div>`);
    g.items.forEach(it=>{
      if(pinned.includes(it.r)) return;
      grp.appendChild(navBtn(it));
    });
    sb.appendChild(grp);
  });
  const foot = h(`<div class="side-foot">
    <button class="nav-item ${cur==='settings'?'on':''}" data-name="Settings" data-route="settings">
      <span class="ni-icon">${icon('settings')}</span><span class="ni-name">Settings</span></button>
    <button class="nav-item" data-name="Widget" data-route="__widget">
      <span class="ni-icon">${icon('widget')}</span><span class="ni-name">Desktop widget</span></button>
    <div class="side-user" data-tip="Your profile">
      <span class="avatar lg" style="background:${U.esc(profile.avatar)}">${U.initials(profile.name)}</span>
      <span class="su-txt"><span class="su-name">${U.esc(profile.name)}</span><span class="su-plan">${U.esc(profile.plan||'Pro')} plan</span></span>
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
  };
  host.appendChild(sb);
  return sb;
}

function renderTopbar(host){
  const title = routeTitle();
  const unread = NX.unreadNotifs();
  const bar = h(`<header class="topbar">
    <div class="page-title"><span>${U.esc(title)}</span><span class="sub" id="tp-sub">${U.esc(U.dayName(0))}</span></div>
    <div class="topbar-crumbs" id="topbar-crumbs" aria-label="Breadcrumb"></div>
    <div class="search-box" id="tp-search" role="button" tabindex="0" data-tip="Search & commands">
      ${icon('search')}<input placeholder="Search…" readonly>
      <span class="kbd">Ctrl K</span>
    </div>
    <button class="icon-btn" data-tip="Module grid" id="tp-grid">${icon('grid')}</button>
    <button class="icon-btn" data-tip="Ask Pebble AI Copilot (Ctrl+Shift+A)" id="tp-copilot" style="color:var(--green)">${icon('robot', 18)}</button>
    <button class="icon-btn" data-tip="Bug Reporter & Diagnostics" id="tp-bug" style="color:var(--orange)">${icon('activity', 17)}</button>
    <span class="bell-wrap">
      <button class="icon-btn" data-tip="Notifications" id="tp-bell">${icon('bell')}</button>
      ${unread? `<span class="bell-badge" id="tp-bell-badge">${unread>9?'9+':unread}</span>`:''}
    </span>
    <button class="btn btn-dark" id="tp-new">${icon('plus')} New</button>
  </header>`);
  bar.querySelector('#tp-search').onclick = ()=> (NX.openSpotlight ? NX.openSpotlight() : NX.openCommandPalette());
  bar.querySelector('#tp-search').onkeydown = (e)=>{ if(e.key==='Enter') (NX.openSpotlight ? NX.openSpotlight() : NX.openCommandPalette()); };
  bar.querySelector('#tp-copilot').onclick = ()=> NX.openAskPebble && NX.openAskPebble();
  const bugBtn = bar.querySelector('#tp-bug');
  if(bugBtn) bugBtn.onclick = ()=> NX.openBugReporter && NX.openBugReporter();
  bar.querySelector('#tp-grid').onclick = (e)=>NX.menu(e.currentTarget, NAV.flatMap(g=>[{label:g.group, header:true}].concat(g.items.map(it=>({ label:it.n, icon:it.ic, onClick:()=>NX.router.go(it.r) })))));
  bar.querySelector('#tp-bell').onclick = (e)=>NX.openNotifCenter(e.currentTarget);
  bar.querySelector('#tp-new').onclick = (e)=>NX.menu(e.currentTarget, [
    { label:'New note', icon:'notes', onClick:()=>{ NX.router.go('notes'); setTimeout(()=>NX.newNote && NX.newNote(), 60); } },
    { label:'New task', icon:'todo', onClick:()=>{ NX.router.go('todo'); setTimeout(()=>NX.newTask && NX.newTask(), 60); } },
    { label:'New reminder', icon:'bell', onClick:()=>{ NX.router.go('reminders'); setTimeout(()=>NX.newReminder && NX.newReminder(), 60); } },
    '-',
    { label:'New chat message', icon:'chat', onClick:()=>{ NX.router.go('chat'); setTimeout(()=>q('#ci-input') && q('#ci-input').focus(), 120); } },
    { label:'Save a prompt', icon:'star', onClick:()=>{ NX.router.go('prompts'); setTimeout(()=>NX.newPrompt && NX.newPrompt(), 60); } },
  ], { align:'right' });
  host.appendChild(bar);
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
  const layout = h('<div style="display:flex;width:100%;height:100%"></div>');
  app.appendChild(layout);
  renderSidebar(layout);
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
    render(app){
      const view = (q('#shell-view') && q('#shell-view').dataset.route === name)
        ? q('#shell-view')
        : NX.renderShell(name);
      view.dataset.route = name;
      // update topbar title without rebuilding search/bell
      const t = q('.topbar .page-title > span');
      if(t) t.textContent = title;
      qa('.sidebar .nav-item').forEach(el=>el.classList.toggle('on', el.dataset.route === name));
      NX.refreshBadges();
      view.classList.remove('full');
      view.innerHTML = '';
      view.scrollTop = 0;
      try{ renderFn(view); }
      catch(e){
        console.error('['+name+']', e);
        view.innerHTML = `<div class="empty"><div class="e-title">This view stumbled</div><div class="e-sub">${U.esc(e.message)}</div></div>`;
      }
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
  else if(e.key === 'Escape'){ NX.closeMenu(); }
});

/* live day in topbar */
setInterval(()=>{ const s = q('#tp-sub'); if(s) s.textContent = U.dayName(0); }, 60e3);
})(window.NX);
