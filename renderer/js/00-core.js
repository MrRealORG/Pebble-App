/* ============================================================
   Pebble 3.0 — 00-core.js
   NX global core: storage, event bus, router, icons, utils
   ============================================================ */
'use strict';
window.NX = window.NX || {};

(function(NX){
  const VERSION = '0.1.0';

  /* ---------------- storage backend ---------------- */
  const LS_PREFIX = 'pebble.';
  const mem = {};
  let backendReady = false;
  let changeCount = 0;

  const Store = {
    get(key, fallback){
      try{
        const raw = localStorage.getItem(LS_PREFIX + key);
        if(raw == null) return key in mem ? mem[key] : fallback;
        return JSON.parse(raw);
      }catch(e){ return fallback; }
    },
    set(key, val){
      mem[key] = val;
      try{ localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); }catch(e){}
      NX.events.emit('store:'+key, val);
      // auto-backup every 20 changes
      changeCount++;
      if(changeCount % 20 === 0) Store.autoBackup();
      // mirror to desktop backend (fire & forget, debounced per key)
      scheduleMirror(key);
      return val;
    },
    del(key){
      delete mem[key];
      try{ localStorage.removeItem(LS_PREFIX + key); }catch(e){}
      NX.events.emit('store:'+key, undefined);
    },
    dump(){
      const out = { _v: 2, _savedAt: Date.now() };
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(LS_PREFIX)) out[k.slice(LS_PREFIX.length)] = Store.get(k.slice(LS_PREFIX.length));
      }
      return out;
    },
    restore(dump){
      if(!dump || typeof dump !== 'object') return;
      Object.keys(dump).forEach(k => {
        if(k !== '_v' && k !== '_savedAt' && k !== '_exportedAt') Store.set(k, dump[k]);
      });
    },
    autoBackup(){
      try{
        const dump = Store.dump();
        localStorage.setItem(LS_PREFIX + '_backup', JSON.stringify(dump));
      }catch(e){}
    },
    stats(){
      const notes = Store.get('notes', []);
      const tasks = Store.get('tasks', []);
      const prompts = Store.get('prompts', []);
      const tl = Store.get('timeless', {});
      let bytes = 0;
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(LS_PREFIX)) bytes += (localStorage.getItem(k)||'').length * 2;
      }
      return {
        notesCount: Array.isArray(notes) ? notes.length : 0,
        tasksCount: Array.isArray(tasks) ? tasks.length : 0,
        promptsCount: Array.isArray(prompts) ? prompts.length : 0,
        daysTracked: Object.keys(tl).length,
        sizeKB: Math.round(bytes / 1024),
        lastBackup: Store.get('_backup') ? 'available' : 'none'
      };
    },
    wipe(){
      const kill = [];
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(k && k.startsWith(LS_PREFIX)) kill.push(k);
      }
      kill.forEach(k=>localStorage.removeItem(k));
      Object.keys(mem).forEach(k=>delete mem[k]);
    },
    async flush(){
      if(!NX.native || !NX.native.available) return;
      /* drain any pending debounce and ride the single in-flight mirror */
      clearTimeout(mirrorTimer);
      mirrorTimer = null;
      if(mirrorBusy){ mirrorQueued = false; return; }
      try{ await NX.native.invoke('save_workspace', { data: JSON.stringify(Store.dump()) }); }catch(e){}
    }
  };
  /* The mirror payload is ALWAYS the whole store, so debouncing per key was
     pure waste: writing N distinct keys scheduled N independent timers, each
     serialising the entire store and pushing a full snapshot to a synchronous
     native command. A 16-key burst wrote the workspace 17 times — tens of
     megabytes of redundant I/O straight onto the UI thread, which is what
     hangs the app (Windows AppHangB1). One coalescing timer instead. */
  let mirrorTimer = null, mirrorBusy = false, mirrorQueued = false;

  async function runMirror(){
    mirrorTimer = null;
    if(mirrorBusy){ mirrorQueued = true; return; }
    mirrorBusy = true;
    try{ await NX.native.invoke('save_workspace', { data: JSON.stringify(Store.dump()) }); }catch(e){}
    mirrorBusy = false;
    /* a write landed while we were serialising — take exactly one more pass */
    if(mirrorQueued){ mirrorQueued = false; scheduleMirror(); }
  }

  function scheduleMirror(){
    if(!NX.native || !NX.native.available) return;
    clearTimeout(mirrorTimer);
    mirrorTimer = setTimeout(runMirror, 500);
  }
  NX.store = Store;
  NX.restoreBackend = async function(){
    if(!NX.native || !NX.native.available) return;
    try{
      const res = await NX.native.invoke('load_workspace');
      const raw = res && res.ok ? res.data : null;
      let doc = null;
      if(raw && typeof raw === 'object' && !Array.isArray(raw)){
        doc = raw;                                   // native doc already parsed
      } else if(typeof raw === 'string' && raw.length > 4){
        try{ doc = JSON.parse(raw); }catch(e){ doc = null; }
      }
      if(doc && typeof doc === 'object'){
        Object.keys(doc).forEach(k=>{
          try{
            const parsed = typeof doc[k] === 'string' ? JSON.parse(doc[k]) : doc[k];
            if(localStorage.getItem(LS_PREFIX+k) == null && parsed != null) Store.set(k, parsed);
          }catch(e){}
        });
      }
      // Self-heal corrupted arrays
      ['notes','tasks','prompts','reminders','servers'].forEach(col=>{
        const val = Store.get(col, null);
        if(val !== null && !Array.isArray(val) && NX.defaults[col]){
          Store.set(col, NX.defaults[col]);
        }
      });
      backendReady = true;
    }catch(e){ backendReady = true; }
  };
  NX.backendReady = ()=>backendReady;

  NX.exportWorkspace = function(){
    const dump = Store.dump();
    dump._exportedAt = Date.now();
    dump._version = VERSION;
    const json = JSON.stringify(dump, null, 2);
    const fname = 'PebbleX-backup-' + (new Date().toISOString().slice(0,10)) + '.json';
    U.download(fname, json);
    NX.toastOk('Workspace exported', fname);
  };
  NX.importWorkspace = function(fileOrText){
    try{
      const data = typeof fileOrText === 'string' ? JSON.parse(fileOrText) : fileOrText;
      if(!data || typeof data !== 'object') throw new Error('Invalid JSON format');
      Store.restore(data);
      NX.toastOk('Workspace restored', 'Your data has been restored successfully.');
      setTimeout(()=>location.reload(), 500);
    }catch(e){
      NX.toastErr('Import failed', e.message);
    }
  };

  /* ---------------- event bus ---------------- */
  const listeners = {};
  NX.events = {
    on(evt, fn){ (listeners[evt] = listeners[evt] || []).push(fn); return ()=>NX.events.off(evt, fn); },
    off(evt, fn){
      const arr = listeners[evt]; if(!arr) return;
      const i = arr.indexOf(fn); if(i>-1) arr.splice(i,1);
    },
    emit(evt, data){ (listeners[evt]||[]).slice().forEach(fn=>{ try{ fn(data); }catch(e){ console.error('[evt]', evt, e); } }); }
  };

  /* ---------------- utils ---------------- */
  const U = NX.util = {
    uid(p='id'){ return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); },
    esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
    fmtTime(sec){
      sec = Math.max(0, Math.floor(sec||0));
      const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
      if(h>0) return h+'h '+String(m).padStart(2,'0')+'m';
      if(m>0) return m+'m '+String(s).padStart(2,'0')+'s';
      return s+'s';
    },
    fmtClock(sec){
      sec = Math.max(0, Math.floor(sec||0));
      const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
      return (h>0? String(h).padStart(2,'0')+':':'') + String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    },
    todayKey(d){ const t = d? new Date(d) : new Date(); return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0'); },
    dayName(offset=0){ const d = new Date(); d.setDate(d.getDate()+offset); return d.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'}); },
    hhmm(d){ const t = d? new Date(d) : new Date(); return String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0'); },
    relTime(ts){
      const diff = Date.now() - ts;
      if(diff < 60e3) return 'just now';
      if(diff < 3600e3) return Math.floor(diff/60e3)+'m ago';
      if(diff < 86400e3) return Math.floor(diff/3600e3)+'h ago';
      return Math.floor(diff/86400e3)+'d ago';
    },
    untilStr(ts){
      const diff = ts - Date.now();
      if(diff <= 0) return 'now';
      const m = Math.floor(diff/60e3);
      if(m < 60) return 'in '+m+'m';
      const h = Math.floor(m/60);
      if(h < 24) return 'in '+h+'h '+(m%60)+'m';
      return 'in '+Math.floor(h/24)+'d';
    },
    pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; },
    clamp(n,a,b){ return Math.max(a, Math.min(b, n)); },
    initials(name){
      const p = String(name||'?').trim().split(/\s+/);
      return ((p[0]||'')[0]||'?').toUpperCase() + (p.length>1 ? (p[p.length-1][0]||'').toUpperCase() : '');
    },
    hashCode(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i); h|=0; } return Math.abs(h); },
    hashPin(pin){
      if(!pin) return '';
      const s = String(pin).trim();
      let h1 = 5381;
      for(let i=0;i<s.length;i++) h1 = ((h1<<5)+h1+s.charCodeAt(i))|0;
      return 'h'+(h1>>>0).toString(36);
    },
    verifyPin(pin, storedHash){
      if(!pin || !storedHash) return false;
      const s = String(pin).trim();
      if(U.hashPin(s) === storedHash) return true;
      if(String(U.hashCode(s)) === storedHash) return true;
      return false;
    },
    colorFor(s){
      const palette = ['#7CD56E','#5EB8FF','#E8853D','#8B5CF6','#E05C9C','#0FA3A3','#E25C4A','#D4A017','#4A90D9','#67B26F'];
      return palette[U.hashCode(String(s)) % palette.length];
    },
    download(filename, text, mime='application/json'){
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], {type: mime}));
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 400);
    }
  };

  /* ---------------- h() dom builder ---------------- */
  NX.h = function(html){
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  NX.q = (sel, root)=> (root||document).querySelector(sel);
  NX.qa = (sel, root)=> Array.from((root||document).querySelectorAll(sel));

  /* ---------------- router ---------------- */
  const Router = {
    routes:{}, current:null, layout:'app',
    register(name, opts){ this.routes[name] = opts; },
    go(name, params){
      if(!this.routes[name]) name = 'dashboard';
      const r = this.routes[name];
      if(this.current && this.current.onLeave) try{ this.current.onLeave(); }catch(e){}
      this.current = r;
      this.layout = r.layout || 'app';
      location.hash = '#/' + name + (params? '/'+params : '');
      renderRoute(name, params);
      SFX_SAFE('nav');
    },
    start(){
      window.addEventListener('hashchange', ()=>{
        const name = (location.hash||'').replace(/^#\/?/, '').split('/')[0] || 'dashboard';
        if(this.routes[name] && this.current !== this.routes[name]) this.go(name);
      });
    }
  };
  function renderRoute(name, params){
    const app = document.getElementById('nx-app');
    if(!app) return;
    const r = Router.routes[name];
    document.body.classList.toggle('login-mode', Router.layout === 'login');
    document.body.classList.toggle('widget-mode', Router.layout === 'widget');
    try{
      app.innerHTML = '';
      r.render(app, params);
      if(r.onMount) r.onMount(app, params);
    }catch(e){
      console.error('[route:'+name+']', e);
      app.innerHTML = '<div style="padding:40px" class="empty"><div class="e-title">Something hiccupped</div><div class="e-sub">'+U.esc(e.message)+'</div></div>';
    }
    document.title = (r.title? r.title+' — ' : '') + 'Pebble';
  }
  NX.router = Router;

  /* ---------------- toast ---------------- */
  NX.toast = function(type, title, msg, opts={}){
    const host = document.getElementById('nx-toasts'); if(!host) return;
    const icons = { ok:'M20 6 9 17l-5-5', err:'M12 8v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z', info:'M12 8h.01M11 12h1v4h1' };
    const act = opts.action;
    const el = NX.h(`<div class="toast ${act?'has-action':''}" role="status">
      <div class="t-icon ${type}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[type]||icons.info}"/></svg></div>
      <div style="min-width:0;flex:1"><div class="t-title">${U.esc(title)}</div>${msg?`<div class="t-msg">${U.esc(msg)}</div>`:''}</div>
      ${act? `<button class="t-action">${U.esc(act.label)}</button>` : ''}
      <button class="t-x icon-btn sm" aria-label="Dismiss"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    </div>`);
    let dead = false;
    const kill = ()=>{ if(dead) return; dead = true; el.classList.add('out'); setTimeout(()=>el.remove(), 240); };
    el.querySelector('.t-x').onclick = kill;
    if(act){
      el.querySelector('.t-action').onclick = ()=>{
        kill();
        try{ act.onClick && act.onClick(); }catch(e){ console.error(e); }
      };
    }
    host.appendChild(el);
    const life = opts.life || (act ? 6500 : type==='err'? 5200 : 3800);
    setTimeout(kill, life);
    while(host.children.length > 4) host.firstElementChild.remove();
  };
  NX.toastOk  = (t,m,o)=>NX.toast('ok',t,m,o);
  NX.toastErr = (t,m,o)=>NX.toast('err',t,m,o);
  NX.toastInfo= (t,m,o)=>NX.toast('info',t,m,o);

  /* undoable action toast — "Marked done / Undo" */
  NX.undoable = function(title, msg, undoFn, opts={}){
    return NX.toast('info', title, msg, Object.assign({ action:{ label:'Undo', onClick: undoFn } }, opts));
  };

  function SFX_SAFE(name){ try{ if(NX.sfx) NX.sfx.play(name); }catch(e){} }

  /* ---------------- ICONS (mono, consistent stroke) ---------------- */
  const P = {
    dashboard:'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    chat:'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
    notes:'M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v6h6M9 13h6M9 17h6',
    todo:'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
    ai:'M12 2a4 4 0 0 1 4 4c1.7 0 3 1.3 3 3 0 .6-.14 1.1-.38 1.57A3.5 3.5 0 0 1 19 17h-.55A3.5 3.5 0 0 1 12 19a3.5 3.5 0 0 1-6.45-2H5a3.5 3.5 0 0 1-.62-6.43A3 3 0 0 1 8 6a4 4 0 0 1 4-4zM12 8v8M8.5 12h7',
    clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
    bell:'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
    api:'M4 7h16M4 12h16M4 17h10M18 15l3 3-3 3',
    image:'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
    game:'M6 12h4M8 10v4M15 11h.01M18 13h.01M17.32 5H6.68a4 4 0 0 0-3.98 3.6c-.25 2.16-.34 4.02-.2 5.72.13 1.6.35 3.05.7 4.4.28 1.06 1.33 1.7 2.35 1.28.9-.37 1.8-1.03 2.72-1.96.5-.5 1.17-.79 1.87-.79h3.72c.7 0 1.37.29 1.87.79.92.93 1.82 1.59 2.72 1.96 1.02.42 2.07-.22 2.35-1.28.35-1.35.57-2.8.7-4.4.14-1.7.05-3.56-.2-5.72A4 4 0 0 0 17.32 5z',
    settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
    plus:'M12 5v14M5 12h14',
    search:'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35',
    x:'M18 6 6 18M6 6l12 12',
    check:'M20 6 9 17l-5-5',
    chevL:'m15 18-6-6 6-6',
    chevR:'m9 18 6-6-6-6',
    chevD:'m6 9 6 6 6-6',
    dots:'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    send:'m22 2-7 20-4-9-9-4zM22 2 11 13',
    hash:'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
    volume:'M11 5 6 9H2v6h4l5 4zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14',
    mic:'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
    users:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    user:'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    grid:'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    folder:'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
    star:'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
    fire:'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
    zap:'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
    target:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    trophy:'M6 9a6 6 0 0 0 12 0V3H6zM6 5H3v2a4 4 0 0 0 4 4M18 5h3v2a4 4 0 0 1-4 4M12 15v4M8 21h8',
    pie:'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
    activity:'M22 12h-4l-3 9L9 3l-3 9H2',
    eye:'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    camera:'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    download:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    upload:'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
    trash:'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6',
    edit:'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z',
    copy:'M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    palette:'M12 22a10 10 0 1 1 0-20c5.5 0 10 4 10 9a5 5 0 0 1-5 5h-2.5a1.5 1.5 0 0 0-1.1 2.5A1.5 1.5 0 0 1 12 22zM7.5 10.5h.01M12 7h.01M16.5 10.5h.01',
    monitor:'M2 3h20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 21h8M12 17v4',
    globe:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
    layers:'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    filter:'M22 3H2l8 9.46V19l4 2v-8.54z',
    pin:'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z',
    refresh:'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
    minimize:'M5 12h14',
    square:'M4 4h16v16H4z',
    chrome:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16.5 4 12 12M4.9 8.5h9.2M7.5 19.5 12 12',
    calendar:'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    grid:'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    mic:'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
    play:'m5 3 14 9-14 9z',
    pause:'M6 4h4v16H6zM14 4h4v16h-4z',
    rocket:'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09zM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2zM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
    book:'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
    widget:'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
    logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
    sliders:'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    tag:'M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01',
    history:'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
    code:'M16 18l6-6-6-6M8 6l-6 6 6 6',
    list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    minus:'M5 12h14',
    /* --- extended set: focus suite, arcade 2.0, navigation, system --- */
    sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
    robot:'M12 8V4M12 4a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM9 13h.01M15 13h.01M9.5 16.5h5',
    brain:'M9.5 2A2.5 2.5 0 0 0 7 4.5v.4A3 3 0 0 0 4.5 8 3 3 0 0 0 5 13.6 3 3 0 0 0 8.5 16 2.5 2.5 0 0 0 11 18.5V4.5A2.5 2.5 0 0 0 9.5 2zM14.5 2A2.5 2.5 0 0 1 17 4.5v.4A3 3 0 0 1 19.5 8 3 3 0 0 1 19 13.6 3 3 0 0 1 15.5 16 2.5 2.5 0 0 1 13 18.5V4.5A2.5 2.5 0 0 1 14.5 2z',
    wind:'M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2',
    timer:'M10 2h4M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2.5 2.5',
    moon:'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    coffee:'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4zM6 1v3M10 1v3M14 1v3',
    keyboard:'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
    bug:'M14 6a2 2 0 1 0-4 0v1H8a4 4 0 0 0-4 4v3a6 6 0 0 0 12 0v-3a4 4 0 0 0-4-4h-2zM3 13h5M16 13h5M8 6 6 4M16 6l2-2',
    key:'M21 2l-2 2M11.39 11.61a5.5 5.5 0 1 1-7.78 7.78 5.5 5.5 0 0 1 7.78-7.78zM11.39 11.61L15.5 7.5M15.5 7.5l3 3L22 7l-3-3M15.5 7.5L19 4',
    headphones:'M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z',
    inbox:'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
    shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    lock:'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
    link:'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    sparkle:'M12 2.5l2.1 6.1 6.1 2.1-6.1 2.1-2.1 6.1-2.1-6.1L3.8 10.7l6.1-2.1zM19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
    gauge:'M12 14l4-4M3.34 19a10 10 0 1 1 17.32 0',
    bar:'M6 20v-6M12 20V8M18 20V4',
    award:'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM8.21 13.89 7 23l5-3 5 3-1.21-9.12',
    flag:'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
    command:'M6 8h12M6 16h12M9 8v8M15 8v8M9 4v4M15 4v4M9 16v4M15 16v4',
    undo:'M3 7v6h6M3.5 13a9 9 0 1 0 2.1-9.4L3 7',
    snooze:'M12 3a9 9 0 1 0 9 9M12 7v5l3.5 2M21 3l-6 6M21 9h-6',
    alert:'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
    trending:'M23 6l-9.5 9.5-5-5L1 18M17 6h6v6'
  };
  const missingIcons = {};
  NX.icon = function(name, size){
    const d = P[name];
    if(!d && !missingIcons[name]){ missingIcons[name] = true; console.warn('[NX.icon] unknown icon "'+name+'"'); }
    const path = d || P.hash;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${size?` style="width:${size}px;height:${size}px"`:''} aria-hidden="true"><path d="${path}"/></svg>`;
  };
  // brand mark (pebble glyph)
  NX.brandMark = function(){
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3c4 0 7 2.2 7 5.4 0 1.9-.8 3.2-2 4.2.5.7.8 1.5.8 2.4 0 3.3-2.8 6-5.8 6-3.4 0-6-2.3-6-5.6 0-1.7.6-3 1.7-4C6.6 10.4 5 9 5 7.6 5 5 8 3 12 3z" fill="currentColor"/><path d="M12 3c4 0 7 2.2 7 5.4 0 1.9-.8 3.2-2 4.2" stroke="var(--green)" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>`;
  };
  NX.ICON_PATHS = P;
})(window.NX);
