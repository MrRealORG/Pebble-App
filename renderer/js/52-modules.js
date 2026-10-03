/* ============================================================
   PebbleX — 52-modules.js
   One registry of every switchable app/module, so Settings, the app
   drawer and the route guard all agree on what is on.

   DESIGN RULES
   1. Turning a module OFF never deletes data. It stops its background
      engine, hides it from the sidebar, and bounces its route to
      Settings. Everything comes back intact when re-enabled.
   2. `core` modules cannot be disabled. Disabling the shell or the
      store would strand the user with no way back.
   3. Offline mode is a SWITCH, not a module: it blanks every outbound
      network call rather than hiding a feature, so a disabled-looking
      feature can never quietly phone home.
   4. Route guards live here, not in each module, so a module cannot
      forget to check.
   ============================================================ */
(function(NX){
'use strict';
const { q, qa, util:U, icon } = NX;

const KEY = 'modules';

/* ============================================================
   REGISTRY
   ============================================================ */
const REGISTRY = [
  { id:'today',       n:'Today',        ic:'sun',     group:'Workspace', on:true,  core:true,
    d:'Your day at a glance' },
  { id:'dashboard',   n:'Dashboard',    ic:'dashboard', group:'Workspace', on:true,
    d:'Stats, weather, activity heatmap' },
  { id:'chat',        n:'Chat',         ic:'chat',    group:'Workspace', on:true,
    d:'Servers, channels and messages' },
  { id:'messages',    n:'Messages',     ic:'user',    group:'Workspace', on:true, net:true,
    d:'Chat with people — channels, DMs and slash commands. Optional; needs a cloud account.' },
  { id:'notes',       n:'Notes',        ic:'notes',   group:'Workspace', on:true, core:true,
    d:'Your markdown vault on disk' },
  { id:'todo',        n:'Tasks',        ic:'todo',    group:'Workspace', on:true,
    d:'Kanban board and to-dos' },
  { id:'planner',     n:'Day Planner',  ic:'calendar', group:'Workspace', on:false,
    d:'Time blocking for a single day' },

  { id:'ai',          n:'Pel AI',       ic:'ai',      group:'Intelligence', on:true,
    d:'Keyless AI chat. Needs the internet', net:true },
  { id:'prompts',     n:'Prompts',      ic:'star',    group:'Intelligence', on:true,
    d:'Your saved prompt library' },
  { id:'timeless',    n:'Timeless',     ic:'clock',   group:'Intelligence', on:true,
    d:'Automatic time tracking of every app you use' },
  { id:'reminders',   n:'Reminders',    ic:'bell',    group:'Intelligence', on:true,
    d:'Alerts that fire while Pebble is closed' },

  { id:'games',       n:'Arcade',       ic:'game',    group:'Explore', on:true,
    d:'17 mini-games, daily challenge, achievements' },
  { id:'media',       n:'Screenshot',   ic:'camera',  group:'Explore', on:true,
    d:'Capture and annotate your screen' },
  { id:'focus',       n:'Focus',        ic:'target',  group:'Explore', on:true,
    d:'Pomodoro, ambient sound, focus shield' },

  { id:'store',       n:'Store',        ic:'star',    group:'Rewards', on:true,
    d:'Spend points on themes and games' },
  { id:'leaderboard', n:'Leaderboard',  ic:'bar',     group:'Rewards', on:true,
    d:'Your records and your league' },
  { id:'mediaLibrary',n:'Media library',ic:'layers',  group:'Rewards', on:true,
    d:'Every image you have imported' },
  { id:'system',      n:'System',       ic:'sliders', group:'Rewards', on:true,
    d:'Brightness, volume and battery' },

  { id:'weather',     n:'Weather card', ic:'cloud',   group:'Background', on:true, net:true,
    d:'Live forecast on the dashboard' },
  { id:'widget',      n:'Desktop widget', ic:'widget', group:'Background', on:true,
    d:'A small always-on-top window' },
  { id:'extension',   n:'Browser extension', ic:'api', group:'Background', on:false,
    d:'Chrome extension bridge', net:true },
  { id:'backup',      n:'Backup',       ic:'download', group:'Background', on:true,
    d:'Export, snapshots and encrypted vault backup' },
  { id:'google',      n:'Google sync',  ic:'cloud',  group:'Background', on:false, net:true,
    d:'Two-way Google Tasks sync and Drive backup' }
];

const BY_ID = {};
REGISTRY.forEach(m => { BY_ID[m.id] = m; });
NX.MODULES = REGISTRY;

/* ============================================================
   STATE
   ============================================================ */
function state(){
  const raw = NX.store.get(KEY, null);
  const saved = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  REGISTRY.forEach(m => {
    /* a module is on unless the user explicitly turned it off */
    out[m.id] = (m.id in saved) ? !!saved[m.id] : m.on !== false;
  });
  return out;
}
function persist(s){
  /* store only the OFF ones — keeps the doc small and means a newly
     shipped module defaults to its registry value instead of inheriting
     a stale 'off' from before it existed */
  const off = {};
  REGISTRY.forEach(m => { if(!s[m.id]) off[m.id] = false; });
  NX.store.set(KEY, off);
}

let cur = null;
function flags(){
  if(!cur) cur = state();
  return cur;
}

/* ============================================================
   API
   ============================================================ */
NX.modules = {
  registry(){ return REGISTRY.slice(); },
  byId(id){ return BY_ID[id] || null; },
  all(){ return flags(); },

  isOn(id){
    const m = BY_ID[id];
    /* An id that is not a managed module must never be treated as disabled.
       Returning false here meant the route guard below wrapped EVERY route
       and switched off anything missing from the registry — Settings,
       Chat, the login window and the widget all rendered "X is switched off",
       which made Settings (and therefore the cloud config) unreachable. */
    if(!m) return true;
    return flags()[id] !== false;
  },

  /** modules the user may actually turn off (core ones excluded) */
  toggleable(){
    return REGISTRY.filter(m => !m.core);
  },

  enabled(){
    return REGISTRY.filter(m => flags()[m.id] !== false);
  },

  set(id, on){
    const m = BY_ID[id];
    if(!m) return false;
    if(m.core && !on){
      NX.toastErr('Always on', m.n + ' is part of the shell and cannot be disabled.');
      return false;
    }
    const s = flags();
    if(s[id] === on) return true;
    s[id] = on;
    persist(s);
    NX.events.emit('modules:changed', { id, on });
    applySideEffects(id, on);
    return true;
  },

  toggle(id){ return this.set(id, !this.isOn(id)); },

  /** reset every module to its registry default */
  resetAll(){
    cur = null;
    NX.store.del(KEY);
    NX.events.emit('modules:changed', { id:'*', on:true });
    REGISTRY.forEach(m => { if(!BY_ID[m.id].core) applySideEffects(m.id, this.isOn(m.id)); });
  }
};

/* ============================================================
   SIDE EFFECTS
   Stopping a background engine when a module is switched off is the
   whole point — a "disabled" Timeless must not keep polling the
   foreground window every 2 seconds.
   ============================================================ */
function applySideEffects(id, on){
  try{
    if(id === 'timeless'){
      if(NX.timeless && typeof NX.timeless.setEnabled === 'function') NX.timeless.setEnabled(on);
    }
    if(id === 'reminders'){
      if(NX.reminderScheduler && typeof NX.reminderScheduler.setEnabled === 'function') NX.reminderScheduler.setEnabled(on);
    }
    if(id === 'extension'){
      if(NX.extsync && typeof NX.extsync.setEnabled === 'function') NX.extsync.setEnabled(on);
    }
    if(id === 'widget'){
      if(!on && NX.native && NX.native.widgetToggle) NX.native.widgetToggle(false);
    }
    if(id === 'weather'){
      NX.weather = NX.weather || {};
      NX.weather.disabled = !on;
      if(!on){ try{ NX.events.emit('weather:clear'); }catch(e){} }
    }
    if(id === 'google'){
      /* stopping sync must actually stop it, not just hide the toggle */
      if(!on && NX.google && NX.google.disconnect){
        try{ NX.google.setEnabled && NX.google.setEnabled('tasks', false); }catch(e){}
        try{ NX.events.emit('google:changed', { connected:false }); }catch(e){}
      }
    }
  }catch(e){ console.error('module side effect ' + id, e); }
  NX.events.emit('modules:refresh-nav');
}

/* ============================================================
   ROUTE GUARD
   Wrapped once, globally, so no module can forget to check. A
   disabled route lands on Settings -> Apps & features rather than a
   blank view, which is the difference between "broken" and "off".
   ============================================================ */
(function guardRoutes(){
  const Router = NX.router;
  if(!Router || !Router.register || Router._pebbleGuarded) return;
  Router._pebbleGuarded = true;

  /* Wrap ONE route in place. Idempotent, and never touches the layout
     or title fields the shell depends on. */
  function wrap(name, opts){
    if(!opts || opts.__guarded) return;
    opts.__guarded = true;
    const inner = opts.render;
    opts.render = function(app, params){
      if(!NX.modules.isOn(name)){
        /* Render the "switched off" panel into the VIEW, not into #nx-app.
           Writing to #nx-app wiped the sidebar and topbar, so the next
           navigation had to rebuild the whole shell — the same double-render
           that was fixed in the router. */
        try{
          const target = (typeof q === 'function' && q('#shell-view')) || app;
          return renderDisabled(target, name, opts.title || name);
        }
        catch(e){ console.error('disabled view ' + name, e); }
      }
      return inner.call(this, app, params);
    };
  }

  /* Routes already registered BEFORE this file loaded. 11-shell.js and
     every module call routeInShell at load time, and this file loads at
     position 52 — so without this pass the guard would protect nothing
     at all, which is precisely the bug this comment exists to prevent. */
  const wrapExisting = ()=>{
    Object.keys(Router.routes || {}).forEach(name => wrap(name, Router.routes[name]));
  };
  wrapExisting();

  /* And any registered afterwards (this file itself, 53-apps.js). */
  const origRegister = Router.register.bind(Router);
  Router.register = function(name, opts){
    wrap(name, opts);
    return origRegister(name, opts);
  };
  /* routeInShell is called at load time by other modules, so make sure
     it still points at the wrapped register */
  NX.router.register = Router.register;
})();

function renderDisabled(host, name, title){
  const m = BY_ID[name];
  host.innerHTML = `<div class="page"><div class="empty" style="max-width:440px;margin:60px auto">
    <div class="e-title">${U.esc(title)} is switched off</div>
    <div class="e-sub">${U.esc(m ? m.d : 'This feature is disabled.')}</div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
      <button class="btn btn-green" id="dis-on">${icon('check')} Turn it back on</button>
      <button class="btn btn-soft" id="dis-set">${icon('sliders')} All apps</button>
    </div>
  </div></div>`;
  const on = q('#dis-on', host);
  if(on) on.onclick = ()=>{ NX.modules.set(name, true); NX.router.go(name); };
  const st = q('#dis-set', host);
  if(st) st.onclick = ()=>{ NX.router.go('settings/apps'); };
}

/* ============================================================
   OFFLINE MODE
   A hard local switch. It does not merely hide online features — it
   makes the outbound helpers refuse, so nothing can phone home even
   if a module forgets to check.
   ============================================================ */
NX.offline = {
  key: 'offlineMode',
  on(){ return !!NX.store.get(NX.offline.key, false); },

  set(on){
    NX.store.set(NX.offline.key, !!on);
    NX.events.emit('offline:changed', !!on);
    if(on){
      /* stop the background network work immediately */
      try{ NX.media && NX.media.setCfg({ enabled:false }); }catch(e){}
      try{ NX.cloud && NX.cloud.disable && NX.cloud.disable(); }catch(e){}
      NX.toastOk('Offline mode on', 'Nothing will be sent or fetched.');
    } else {
      NX.toastOk('Offline mode off', 'Online features are available again.');
    }
    NX.events.emit('modules:refresh-nav');
  },

  toggle(){ this.set(!this.on()); }
};

/** A fetch wrapper every online call should route through. Returns a
    clear rejection offline so callers can degrade instead of hanging. */
NX.netFetch = function(url, opts){
  if(NX.offline.on()){
    return Promise.reject(new Error('offline-mode'));
  }
  return fetch(url, opts);
};

/* ============================================================
   HELPERS used by the UI
   ============================================================ */
NX.modules.grouped = function(){
  const s = flags();
  const groups = [];
  REGISTRY.forEach(m => {
    let g = groups.find(x => x.id === m.group);
    if(!g){ g = { id:m.group, n:m.group, items:[] }; groups.push(g); }
    g.items.push({ m, on: s[m.id] !== false });
  });
  return groups;
};

} )(window.NX);