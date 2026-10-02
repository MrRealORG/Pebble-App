/* ============================================================
   Pebble 3.2 — 03-native.js
   Tauri bridge with bullet-proof stubs (never crashes on web).
   Maps the renderer surface onto the Pebble 3.2 Rust commands:
   workspace mirror, active-window tracking, REAL app icons,
   extension bridge status/queue, crash logs, captures, widget.
   ============================================================ */
(function(NX){
'use strict';

function findTauri(){
  try{
    if(window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function'){
      return window.__TAURI__.core;
    }
    if(window.__TAURI__ && typeof window.__TAURI__.invoke === 'function'){
      return window.__TAURI__;
    }
    const ti = window.__TAURI_INTERNALS__;
    if(ti && typeof ti.invoke === 'function') return ti;
  }catch(e){}
  return null;
}

let seq = 0;

const native = {
  available:false, mode:'web',

  /* invoke: returns { ok, data } — never throws */
  invoke(cmd, args){
    const ti = findTauri();
    if(!ti){
      if(window.electronAPI && typeof window.electronAPI.invoke === 'function'){
        return Promise.resolve(window.electronAPI.invoke(cmd, args || {}))
          .then(v=>({ ok:true, data:v })).catch(e=>({ ok:false, error:String(e) }));
      }
      return Promise.resolve({ ok:false, stub:true });
    }
    return Promise.resolve(ti.invoke(cmd, args || {}))
      .then(v=>({ ok:true, data:v }))
      .catch(err=>({ ok:false, error:String(err) }));
  },

  async version(){ const r = await this.invoke('get_version'); return r && r.ok ? r.data : null; },

  /* active window tracking for Timeless (desktop only)
     → { name, exe, path, title, url, pid } or null */
  async activeWindow(){
    const r = await this.invoke('get_active_window');
    return r && r.ok ? r.data : null;
  },

  /* native notification with app icon */
  async notify({ title, body, silent }){
    const r = await this.invoke('notify', { title: title || 'Pebble', body: body || '', silent: !!silent });
    if(r && r.ok && r.data) return true;
    try{
      if('Notification' in window){
        if(Notification.permission === 'granted'){ new Notification(title, { body }); return true; }
        if(Notification.permission !== 'denied'){ Notification.requestPermission().then(p=>{ if(p==='granted') new Notification(title, { body }); }); }
      }
    }catch(e){}
    return false;
  },

  /* screenshot capture → { dataUrl } */
  async capture(hideSelf){
    const r = await this.invoke('capture_monitor', { hideSelf: hideSelf !== false });
    return r && r.ok && r.data ? { dataUrl: r.data } : null;
  },

  async monitors(){ const r = await this.invoke('list_monitors'); return r && r.ok ? (r.data || []) : []; },

  async clipboardRead(){ const r = await this.invoke('read_clipboard'); return r && r.ok ? r.data : null; },
  async clipboardWrite(text){ const r = await this.invoke('write_clipboard', { text }); return !!(r && r.ok && r.data); },
  async clipboardImage(){ const r = await this.invoke('read_clipboard_image'); return r && r.ok ? r.data : null; },

  /* save a file (base64 dataUrl or raw text) into Downloads/Pebble */
  async saveImage(dataUrl, name){
    const r = await this.invoke('save_file', { name: name || ('pebble-'+Date.now()+'.png'), content: dataUrl, base64: true });
    return r && r.ok ? r.data : null;
  },
  async saveTextFile(name, text){
    const r = await this.invoke('save_file', { name, content: text, base64: false });
    return r && r.ok ? r.data : null;
  },

  /* real icon for an app — { ok, url } (asset.localhost png) */
  async appIcon(exe, name){
    const r = await this.invoke('app_icon', { exe: exe || '', name: name || '' });
    return r && r.ok ? r.data : { ok:false, url:null };
  },

  /* chrome extension bridge */
  async extStatus(){
    const r = await this.invoke('ext_status');
    return r && r.ok ? r.data : { connected:false, lastSeen:0, queued:0, extSessions:0 };
  },
  async drainExt(){
    const r = await this.invoke('drain_ext_queue');
    return r && r.ok && Array.isArray(r.data) ? r.data : [];
  },

  /* crash reports (native panic hook) */
  async crashLogs(){
    const r = await this.invoke('read_crash_logs');
    return r && r.ok && Array.isArray(r.data) ? r.data : [];
  },
  async clearCrashLogs(){
    const r = await this.invoke('clear_crash_logs');
    return !!(r && r.ok);
  },

  /* paths / shell */
  async appPaths(){ const r = await this.invoke('app_paths'); return r && r.ok ? r.data : null; },
  async openExternal(url){ const r = await this.invoke('open_external', { url }); return !!(r && r.ok && r.data); },

  /* widget window (desktop) */
  async widgetToggle(show){ const r = await this.invoke('widget_toggle', { show: show === undefined ? null : !!show }); return r && r.ok ? r.data : null; },
  async loginDone(profileName){ const r = await this.invoke('login_done', { name: profileName }); return !!(r && r.ok && r.data); },
  async quitApp(){ await this.invoke('quit_app'); },
  async showMain(){ await this.invoke('show_main'); },
  async startDragging(){
    try {
      if (window.__TAURI__ && window.__TAURI__.window) {
        const cur = window.__TAURI__.window.getCurrentWindow();
        if (cur && typeof cur.startDragging === 'function') {
          return await cur.startDragging();
        }
      }
    } catch(e) {}
  }
};

/* detect environment */
(function detect(){
  if(findTauri() || window.__PEBBLE_WINDOW__){
    native.available = true; native.mode = 'tauri';
  } else if(window.nexadekElectron || (window.electronAPI && window.electronAPI.ping)){
    native.available = true; native.mode = 'electron';
  } else {
    native.available = false; native.mode = 'web';
  }
})();

window.nex = new Proxy({}, { get: ()=>native });   // legacy alias
NX.native = native;
})(window.NX);
