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

  /* ---- user image assets (see src-tauri/src/assets.rs) ---- */
  /* Rust validates the bytes, strips EXIF/GPS and writes fixed-size
     derivatives; only metadata comes back to the renderer. */
  async assetImport(dataUrl, name, kind){
    const r = await this.invoke('asset_import', { dataUrl, name: name || 'image', kind: kind || 'misc' });
    return (r && r.ok && r.data) ? r.data : null;
  },
  async assetList(kind){
    const r = await this.invoke('asset_list', { kind: kind || null });
    return (r && r.ok && Array.isArray(r.data)) ? r.data : [];
  },
  async assetDelete(id){
    const r = await this.invoke('asset_delete', { id });
    return !!(r && r.ok && r.data);
  },
  async assetExport(id, dest){
    const r = await this.invoke('asset_export', { id, dest: dest || 'pebble-image.png' });
    return (r && r.ok && r.data) ? r.data : null;
  },
  async assetUsage(){
    const r = await this.invoke('asset_usage');
    return (r && r.ok && r.data) ? r.data : { bytes:0, count:0, dir:'' };
  },
  async assetPrune(){
    const r = await this.invoke('asset_prune');
    return (r && r.ok) ? (r.data || 0) : 0;
  },

  /* ---- notes vault on disk ---- */
  async noteVaultStatus(){
    const r = await this.invoke('note_vault_status');
    return (r && r.ok && r.data) ? r.data : { ok:false, root:'', files:[], folders:[] };
  },

  /* ---- system controls (see src-tauri/src/sysctl.rs) ----
     Every one of these returns { ok, supported, error } rather than
     throwing. Brightness is absent on external monitors and volume
     returns E_NOTIMPL over RDP, so "unsupported" is a normal answer. */
  async sysBrightness(){
    const r = await this.invoke('sys_brightness');
    return (r && r.ok && r.data) ? r.data : { ok:false, supported:false, value:0, error:'unavailable' };
  },
  async sysBrightnessSet(level){
    const r = await this.invoke('sys_brightness_set', { level: Number(level) || 0 });
    return (r && r.ok && r.data) ? r.data : { ok:false, supported:false, error:'unavailable' };
  },
  async sysVolume(){
    const r = await this.invoke('sys_volume');
    return (r && r.ok && r.data) ? r.data : { ok:false, supported:false, value:0, error:'unavailable' };
  },
  async sysVolumeSet(level){
    const r = await this.invoke('sys_volume_set', { level: Number(level) || 0 });
    return (r && r.ok && r.data) ? r.data : { ok:false, supported:false, error:'unavailable' };
  },
  async sysPower(){
    const r = await this.invoke('sys_power');
    return (r && r.ok && r.data) ? r.data : { ok:false, error:'unavailable' };
  },
  async sysForegroundApp(){
    const r = await this.invoke('sys_foreground_app');
    return (r && r.ok && Array.isArray(r.data)) ? r.data : [];
  },
  async sysDataLocations(){
    const r = await this.invoke('sys_data_locations');
    return (r && r.ok && Array.isArray(r.data)) ? r.data : [];
  },

  /* ---- local league (shared file, no server) ---- */
  async leagueRead(){
    const r = await this.invoke('league_read');
    return (r && r.ok && r.data) ? r.data : '[]';
  },
  async leagueMerge(entry){
    const r = await this.invoke('league_merge', { entry });
    return !!(r && r.ok && r.data);
  },
  async leaguePath(){
    const r = await this.invoke('league_path');
    return (r && r.ok && r.data) ? r.data : '';
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

  /* speech recognition (native offline ASR) */
  async asrRecord(timeoutMs){
    const r = await this.invoke('asr_record', { timeout_ms: timeoutMs || 15000 });
    return r && r.ok ? (r.data || '') : '';
  },

  /* paths / shell */
  async appPaths(){ const r = await this.invoke('app_paths'); return r && r.ok ? r.data : null; },
  async openExternal(url){ const r = await this.invoke('open_external', { url }); return !!(r && r.ok && r.data); },

  /* widget window (desktop) */
  async widgetToggle(show){ const r = await this.invoke('widget_toggle', { show: show === undefined ? null : !!show }); return r && r.ok ? r.data : null; },
  /* resize the widget window between full and compact heights */
  async widgetSize(mini){ const r = await this.invoke('widget_size', { mini: !!mini }); return !!(r && r.ok && r.data); },
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
