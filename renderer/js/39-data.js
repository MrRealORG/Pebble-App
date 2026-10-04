/* ============================================================
   PebbleX v0.1 — 39-data.js
   Data & reliability:
     · live "saved 2s ago" indicator in the topbar
     · per-collection storage breakdown
     · CSV export for every module
     · settings search
     · automatic daily snapshots with rollback
     · offline / connectivity indicator
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* ============================================================
   1. LAST SAVED
   ============================================================ */
const Save = {
  at: 0, count: 0,
  start(){
    const store = NX.store;
    if(store.__saveHooked) return;
    store.__saveHooked = true;
    const orig = store.set.bind(store);
    store.set = function(key, val){
      const r = orig(key, val);
      Save.at = Date.now();
      Save.count++;
      NX.events.emit('store:saved', { key });
      return r;
    };
    /* count what already happened this session */
    Save.at = Date.now();
  },
  ago(){
    if(!Save.at) return 'not saved yet';
    const s = Math.floor((Date.now() - Save.at)/1000);
    if(s < 3) return 'saved just now';
    if(s < 60) return 'saved ' + s + 's ago';
    const m = Math.floor(s/60);
    if(m < 60) return 'saved ' + m + 'm ago';
    return 'saved ' + Math.floor(m/60) + 'h ago';
  }
};
NX.saveState = Save;
Save.start();

/* ============================================================
   6. OFFLINE INDICATOR
   ============================================================ */
const Net = {
  online: true,
  aiDown: false,
  init(){
    this.online = navigator.onLine !== false;
    window.addEventListener('online', ()=>{ this.online = true;  NX.events.emit('net:changed'); });
    window.addEventListener('offline', ()=>{ this.online = false; NX.events.emit('net:changed'); });
    NX.events.on('net:changed', ()=> NX.toastInfo(this.online ? 'Back online' : 'Offline',
      this.online ? 'Everything will sync again' : 'Pebble keeps working — nothing is lost'));
  }
};
NX.net = Net;
Net.init();

/* ============================================================
   TOPBAR CHIPS — saved + offline + storage
   ============================================================ */
const _renderShell = NX.renderShell;
NX.renderShell = function(routeName){
  const view = _renderShell.apply(NX, arguments);
  try{
    const top = view.closest('.main-col');
    const bar = top && top.querySelector('#shell-top .topbar');
    if(bar && !bar.querySelector('#nx-status')){
      const chip = h(`<div class="nx-status ultra-mini" id="nx-status" style="display:inline-flex;align-items:center;gap:6px">
        <button class="nx-status-btn-mini" id="nx-saved" data-tip="Auto-saved to disk · click for snapshots" style="display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:99px;font-size:11px;background:rgba(255,255,255,0.04);border:1px solid var(--line);color:var(--ink-3);cursor:pointer">
          <span class="status-dot green" style="width:6px;height:6px;border-radius:50%;background:var(--green)"></span>
          <span id="nx-saved-t">saved</span>
        </button>
        <button class="icon-btn sm" id="nx-storage" data-tip="Storage & backups" style="width:26px;height:26px">${icon('layers',12)}</button>
      </div>`);
      bar.insertBefore(chip, bar.querySelector('#tp-search'));
      q('#nx-storage', chip).onclick = ()=>NX.openStorage();
      q('#nx-saved', chip).onclick = ()=>NX.openSnapshots();
    }
  }catch(e){}
  syncStatus();
  return view;
};

function syncStatus(){
  if(window.NX && NX.login && !NX.login.isAuthed()) return;
  const saved = q('#nx-saved-t');
  if(saved) saved.textContent = Save.ago();
  const netT = q('#nx-net-t');
  const netB = q('#nx-net');
  if(netT && netB){
    const off = !Net.online;
    netT.textContent = off ? 'offline' : (Net.aiDown ? 'ai down' : 'online');
    netB.classList.toggle('warn', off || Net.aiDown);
    netB.setAttribute('data-tip', off ? 'No internet — everything still works locally'
      : Net.aiDown ? 'Pel AI is unreachable; on-device answers still work' : 'Connected');
  }
  const sc = q('#nx-saved');
  if(sc){
    const s = Math.floor((Date.now() - Save.at)/1000);
    sc.classList.toggle('warn', Save.at > 0 && s > 300);
    sc.setAttribute('data-tip', 'Last workspace save · ' + Save.count + ' writes this session');
  }
}
setInterval(syncStatus, 30000);
NX.events.on('store:saved', syncStatus);
NX.events.on('net:changed', syncStatus);

/* ============================================================
   2. STORAGE BREAKDOWN
   ============================================================ */
const COLLECTIONS = [
  { k:'notes',      n:'Notes',      ic:'notes' },
  { k:'tasks',      n:'Tasks',      ic:'todo' },
  { k:'messages',   n:'Chat',       ic:'chat' },
  { k:'prompts',    n:'Prompts',    ic:'star' },
  { k:'reminders',  n:'Reminders',  ic:'bell' },
  { k:'timeless',   n:'Timeless',   ic:'clock' },
  { k:'servers',    n:'Servers',    ic:'globe' },
  { k:'noteHistory',n:'Note history',ic:'history' },
  { k:'focus',      n:'Focus log',  ic:'timer' },
  { k:'gamePlays',  n:'Game stats', ic:'game' },
  { k:'snapshots',  n:'Snapshots',  ic:'shield' }
];
function sizeOf(key){
  let raw;
  try{ raw = localStorage.getItem('pebble.' + key); }catch(e){ raw = null; }
  return raw ? raw.length * 2 : 0;
}
function breakdown(){
  const rows = COLLECTIONS.map(c => ({ ...c, bytes: sizeOf(c.k) }))
    .filter(r => r.bytes > 0)
    .sort((a,b) => b.bytes - a.bytes);
  const total = rows.reduce((a,r) => a + r.bytes, 0);
  return { rows, total };
}
NX.storageBreakdown = breakdown;

NX.openStorage = function(){
  const { rows, total } = breakdown();
  const peak = Math.max(1, ...rows.map(r => r.bytes));
  const counts = {
    notes:(NX.store.get('notes',[])||[]).length,
    tasks:(NX.store.get('tasks',[])||[]).length,
    prompts:(NX.store.get('prompts',[])||[]).length,
    reminders:(NX.store.get('reminders',[])||[]).length
  };
  NX.modal({
    title:'Storage & backups', icon:'layers', size:'m-lg',
    body:`<div class="store">
      <div class="store-total">
        <div><b>${(total/1024).toFixed(1)} KB</b><i>of local workspace data</i></div>
        <div style="flex:1"></div>
        <button class="btn btn-soft btn-sm" id="store-backup">${icon('download')} Export backup</button>
        <button class="btn btn-soft btn-sm" id="store-snap">${icon('shield')} Snapshots</button>
      </div>
      <div class="store-rows">
        ${rows.map(r=>`
          <div class="store-row">
            <span class="store-ic">${icon(r.ic)}</span>
            <span class="store-txt">
              <b>${U.esc(r.n)}</b>
              <i>${counts[r.k] != null ? counts[r.k] + ' item' + (counts[r.k]===1?'':'s') : (Array.isArray(NX.store.get(r.k)) ? NX.store.get(r.k).length + ' entries' : '')}</i>
              <span class="meter"><i style="width:${Math.round(r.bytes/peak*100)}%"></i></span>
            </span>
            <span class="store-bytes">${r.bytes < 1024 ? r.bytes + ' B' : (r.bytes/1024).toFixed(1) + ' KB'}</span>
            <button class="icon-btn sm" data-clear="${r.k}" data-tip="Clear ${U.esc(r.n.toLowerCase())}">${icon('trash')}</button>
          </div>`).join('') || '<div class="empty" style="padding:26px"><div class="e-sub">Nothing stored yet.</div></div>'}
      </div>
      <p class="tiny faint" style="margin:0">Clearing a collection is undoable for the rest of the session.</p>
    </div>`,
    footer:[{ label:'Close', cls:'btn-soft' }]
  });
  const back = q('.modal-backdrop');
  if(!back) return;
  q('#store-backup', back).onclick = ()=>NX.exportWorkspace();
  q('#store-snap', back).onclick = ()=>{ NX.closeAllModals(); NX.openSnapshots(); };
  qa('[data-clear]', back).forEach(b=>b.onclick = ()=>{
    const k = b.dataset.clear;
    const was = NX.store.get(k, null);
    NX.store.set(k, Array.isArray(was) ? [] : (typeof was === 'object' && was ? {} : 0));
    NX.toastInfo('Cleared ' + k, 'Undo restores it', { action:{ label:'Undo', onClick:()=>{
      NX.store.set(k, was);
      NX.toastOk('Restored ' + k);
      NX.openStorage();
    } } });
  });
};

/* ============================================================
   5. DAILY SNAPSHOTS
   ============================================================ */
const SNAP_MAX = 7;
function snaps(){ const s = NX.store.get('snapshots', {}); return s && typeof s === 'object' ? s : {}; }
function snapKey(){ return U.todayKey(); }
function takeSnapshot(label){
  try{
    const dump = NX.store.dump();
    delete dump.snapshots;
    const all = snaps();
    const s = Object.assign({}, all);
    s[snapKey()] = { at:Date.now(), label: label || 'Auto', keys:Object.keys(dump).length, dump };
    const keys = Object.keys(s).sort();
    while(keys.length > SNAP_MAX) delete s[keys.shift()];
    NX.store.set('snapshots', s);
    NX.events.emit('snap:changed');
    return true;
  }catch(e){ return false; }
}
NX.snapshots = {
  take: takeSnapshot,
  list(){ return Object.keys(snaps()).sort().reverse().map(k => Object.assign({ key:k }, snaps()[k])); },
  restore(key){
    const s = snaps()[key];
    if(!s || !s.dump) return false;
    const current = NX.store.dump();
    const keep = ['snapshots'];
    NX.store.restore(s.dump);
    keep.forEach(k => NX.store.set(k, current[k]));
    NX.events.emit('snap:changed');
    NX.toastOk('Workspace restored', 'Snapshot from ' + new Date(s.at).toLocaleString());
    NX.undoable('Rolled back to a snapshot', new Date(s.at).toLocaleString(), ()=>{
      NX.store.restore(current);
      NX.toastOk('Back to your current data');
    }, { life:8000 });
    return true;
  }
};

let lastSnapDay = null;
function autoSnapshot(){
  const k = snapKey();
  if(lastSnapDay === k) return;
  lastSnapDay = k;
  if(!snaps()[k]) takeSnapshot('Auto · start of day');
}
document.addEventListener('DOMContentLoaded', ()=> setTimeout(autoSnapshot, 1200));

/* a bulk import is the single most destructive thing a user can do —
   take a safety net first. (Patching NX.store.restore is not enough:
   importWorkspace closes over the internal Store object.) */
const _import = NX.importWorkspace;
NX.importWorkspace = function(){
  try{ takeSnapshot('Before import'); }catch(e){}
  return _import.apply(NX, arguments);
};

NX.openSnapshots = function(){
  const list = NX.snapshots.list();
  NX.modal({
    title:'Snapshots', icon:'shield', size:'m-lg',
    body: list.length
      ? `<div class="ag-list">${list.map(s=>`
          <div class="ag-row">
            <span class="ag-ic">${icon('shield')}</span>
            <span class="ag-txt">
              <b>${U.esc(s.label || 'Snapshot')}</b>
              <i>${U.esc(new Date(s.at).toLocaleString())} · ${s.keys || 0} collections</i>
            </span>
            <button class="btn btn-soft btn-sm" data-roll="${s.key}">Roll back</button>
          </div>`).join('')}</div>
         <p class="tiny faint" style="margin:14px 0 0">Pebble keeps ${SNAP_MAX} daily snapshots. Rolling back is itself undoable.</p>`
      : `<div class="empty" style="padding:34px"><div class="e-title">No snapshots yet</div>
         <div class="e-sub">One is taken automatically at the start of each day, and before any bulk restore.</div>
         <button class="btn btn-green" id="snap-take">${icon('plus')} Take one now</button></div>`,
    footer:[{ label:'Take a snapshot', cls:'btn-soft', onClick:()=>{ takeSnapshot('Manual'); NX.closeAllModals(); NX.openSnapshots(); } }]
  });
  const back = q('.modal-backdrop');
  if(!back) return;
  const take = q('#snap-take', back);
  if(take) take.onclick = ()=>{ takeSnapshot('Manual'); NX.closeAllModals(); NX.openSnapshots(); };
  qa('[data-roll]', back).forEach(b=>b.onclick = ()=>{
    const key = b.dataset.roll;
    NX.closeAllModals();
    NX.confirm('Roll back to this snapshot?',
      'Your current workspace is replaced by the copy from ' + new Date(snaps()[key].at).toLocaleString() + '. You can undo this afterwards.',
      ()=>{
        NX.snapshots.restore(key);
        setTimeout(()=>NX.router.go('dashboard'), 120);
      }, { icon:'history', yes:'Roll back', danger:false });
  });
};

/* ============================================================
   3. CSV EXPORT
   ============================================================ */
function csvCell(v){
  const s = String(v == null ? '' : v).replace(/\r?\n/g,' ');
  return /[",]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function csv(rows){
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}
const CSV = {
  notes(){
    const rows = [['id','title','folder','tags','updated','chars']];
    (NX.store.get('notes', []) || []).forEach(n => rows.push([
      n.id, n.title || 'Untitled', n.folder || '',
      Array.isArray(n.tags) ? n.tags.join(' ') : '',
      n.updated ? new Date(n.updated).toISOString() : '',
      String(n.body || '').length
    ]));
    return { name:'pebble-notes.csv', body:csv(rows) };
  },
  tasks(){
    const rows = [['id','name','done','important','myDay','due','list','repeat','estimateMin','actualMin','created']];
    (NX.store.get('tasks', []) || []).forEach(t => rows.push([
      t.id, t.name || '', t.done?'yes':'no', t.important?'yes':'no', t.myDay?'yes':'no',
      t.due || '', t.listId || t.cat || '', t.repeat || 'none', t.estimateMin || 0,
      Math.round((t.timeLinked || 0)/60), t.created ? new Date(t.created).toISOString() : ''
    ]));
    return { name:'pebble-tasks.csv', body:csv(rows) };
  },
  prompts(){
    const rows = [['id','title','tags','favorite','created']];
    (NX.store.get('prompts', []) || []).forEach(p => rows.push([
      p.id, p.title || '', Array.isArray(p.tags) ? p.tags.join(' ') : '',
      p.favorite?'yes':'no', p.created ? new Date(p.created).toISOString() : ''
    ]));
    return { name:'pebble-prompts.csv', body:csv(rows) };
  },
  reminders(){
    const rows = [['id','name','when','repeat','category','fired']];
    (NX.store.get('reminders', []) || []).forEach(r => rows.push([
      r.id, r.name || '', r.when ? new Date(r.when).toISOString() : '',
      r.repeat || 'none', r.cat || '', r.fired?'yes':'no'
    ]));
    return { name:'pebble-reminders.csv', body:csv(rows) };
  },
  timeline(){
    const rows = [['day','app','category','seconds']];
    const tl = NX.store.get('timeless', {}) || {};
    Object.entries(tl).forEach(([day, d])=>{
      if(!d || typeof d !== 'object') return;
      Object.entries(d).forEach(([k, a])=>{
        if(k === '__hours' || !a || !a.sec) return;
        rows.push([day, k, a.cat || '', Math.round(a.sec)]);
      });
    });
    return { name:'pebble-timeline.csv', body:csv(rows) };
  },
  focus(){
    const rows = [['when','seconds','task','note']];
    const log = NX.focusLog ? NX.focusLog.rounds() : [];
    log.forEach(r => rows.push([
      r.at ? new Date(r.at).toISOString() : '', Math.round(r.sec || 0),
      r.task || '', r.note || ''
    ]));
    return { name:'pebble-focus-rounds.csv', body:csv(rows) };
  },
  chat(){
    const rows = [['channel','who','when','text']];
    const msgs = NX.store.get('messages', {}) || {};
    Object.entries(msgs).forEach(([ch, arr])=>{
      (arr || []).forEach(m => rows.push([ch, m.who || '', m.ts ? new Date(m.ts).toISOString() : '', m.text || '']));
    });
    return { name:'pebble-chat.csv', body:csv(rows) };
  }
};
NX.csvExport = CSV;
NX.exportCSV = function(kind){
  const fn = CSV[kind];
  if(!fn){ NX.toastErr('Unknown export', String(kind)); return false; }
  const out = fn();
  const lines = out.body.split('\r\n').length - 1;
  U.download(out.name, out.body);
  NX.toastOk('Exported ' + out.name, lines + (lines === 1 ? ' row' : ' rows'));
  return true;
};

NX.openExport = function(){
  const kinds = [
    ['notes','Notes', (NX.store.get('notes',[])||[]).length],
    ['tasks','Tasks', (NX.store.get('tasks',[])||[]).length],
    ['prompts','Prompts', (NX.store.get('prompts',[])||[]).length],
    ['reminders','Reminders', (NX.store.get('reminders',[])||[]).length],
    ['timeline','Timeless time log', Object.keys(NX.store.get('timeless',{})||{}).length],
    ['focus','Focus rounds', NX.focusLog ? NX.focusLog.rounds().length : 0],
    ['chat','Chat messages', Object.values(NX.store.get('messages',{})||{}).reduce((a,b)=>a+(b||[]).length,0)]
  ];
  NX.modal({
    title:'Export as CSV', icon:'download',
    body:`<div class="ag-list">
      ${kinds.map(([k,n,c])=>`<div class="ag-row">
        <span class="ag-ic">${icon('download')}</span>
        <span class="ag-txt"><b>${n}</b><i>${c} row${c===1?'':'s'}</i></span>
        <button class="btn btn-soft btn-sm" data-csv="${k}">Export</button>
      </div>`).join('')}
    </div>
    <p class="tiny faint" style="margin:14px 0 0">Opens in Excel, Numbers or Google Sheets.</p>`
  });
  const back = q('.modal-backdrop');
  if(back) qa('[data-csv]', back).forEach(b=>b.onclick = ()=>NX.exportCSV(b.dataset.csv));
};

/* ============================================================
   4. SETTINGS SEARCH
   ============================================================ */
NX.openSettingsSearch = function(){
  const sections = [...document.querySelectorAll('.set-nav [data-s]')].map(b => ({
    id:b.dataset.s, label:b.textContent.trim()
  }));
  const back = h(`<div class="qs-backdrop"><div class="gs-panel" role="dialog" aria-label="Search settings">
    <div class="gs-input-row">${icon('sliders')}<input placeholder="Search settings and options…" aria-label="Search settings"></div>
    <div class="gs-results" id="set-results"></div>
    <div class="gs-foot"><span class="tiny faint">↵ jump to section</span><span class="tiny faint">esc close</span></div>
  </div></div>`);
  const input = back.querySelector('input');
  const results = back.querySelector('#set-results');
  let rows = [];
  const ALIASES = {
    themes:['colour','color','dark','light','theme','accent'],
    profile:['name','avatar','picture','photo','plan'],
    customize:['motion','animation','compact','density','goal','widget','ambient','breath','eye','shortcut'],
    sound:['sfx','volume','mute','audio','noise'],
    hotkeys:['keyboard','shortcut','key','ctrl','binding','pin','recent','undo'],
    reliability:['crash','error','bug','diagnostic','repair','health'],
    storage:['size','disk','space','backup','snapshot','clear','reset'],
    about:['version','license','credit','update']
  };
  function run(){
    const qy = input.value.trim().toLowerCase();
    if(!qy){
      rows = sections;
      results.innerHTML = `<div class="ag-list">${rows.map((s,i)=>`
        <div class="ag-row" data-s="${s.id}">
          <span class="ag-ic">${icon('sliders')}</span>
          <span class="ag-txt"><b>${U.esc(s.label)}</b></span>
        </div>`).join('')}</div>`;
    } else {
      rows = sections.filter(s => {
        const hay = (s.label + ' ' + (ALIASES[s.id] || []).join(' ')).toLowerCase();
        return hay.indexOf(qy) > -1;
      });
      results.innerHTML = rows.length ? `<div class="ag-list">${rows.map(s=>`
        <div class="ag-row" data-s="${s.id}">
          <span class="ag-ic">${icon('sliders')}</span>
          <span class="ag-txt"><b>${U.esc(s.label)}</b>
            <i>${U.esc(((ALIASES[s.id]||[]).slice(0,5)).join(' · '))}</i></span>
        </div>`).join('')}</div>`
        : `<div class="gs-empty">Nothing matches “${U.esc(input.value)}”.</div>`;
    }
    qa('[data-s]', results).forEach(r=>r.onclick = ()=>{
      close();
      NX.router.go('settings');
      setTimeout(()=>{
        const btn = document.querySelector('.set-nav [data-s="' + r.dataset.s + '"]');
        if(btn) btn.click();
      }, 160);
    });
  }
  function close(){ back.remove(); document.removeEventListener('keydown', keyH); }
  function keyH(e){
    if(e.key === 'Escape'){ close(); }
    else if(e.key === 'Enter' && rows.length){
      const first = results.querySelector('[data-s]');
      if(first) first.click();
    }
  }
  back.addEventListener('pointerdown', e=>{ if(e.target === back) close(); });
  input.addEventListener('input', run);
  document.addEventListener('keydown', keyH);
  (document.getElementById('nx-overlay-root') || document.body).appendChild(back);
  run();
  setTimeout(()=>input.focus(), 20);
};

/* a search box at the top of the settings nav */
NX.afterRouteRender('settings', function(view){
  const nav = q('.set-nav', view);
  if(!nav || nav.previousElementSibling) return;
  const box = h(`<div class="set-search">
    ${icon('search')}<input id="set-q" placeholder="Filter settings…" aria-label="Filter settings">
    <span class="kbd">/</span>
  </div>`);
  nav.parentNode.insertBefore(box, nav);
  const inp = q('#set-q', box);
  inp.addEventListener('input', ()=>{
    const t = inp.value.trim().toLowerCase();
    qa('.set-nav [data-s]', view).forEach(b=>{
      const label = b.textContent.trim().toLowerCase();
      const hay = (b.dataset.s + ' ' + label).toLowerCase();
      b.style.display = (!t || hay.indexOf(t) > -1) ? '' : 'none';
    });
    /* also hide the body when the filter matches nothing */
    const any = [...nav.querySelectorAll('[data-s]')].some(b => b.style.display !== 'none');
    const body = q('#set-body', view);
    if(body) body.style.display = (t && !any) ? 'none' : '';
  });
  inp.addEventListener('keydown', e=>{
    if(e.key === 'Escape'){ inp.value = ''; inp.dispatchEvent(new Event('input')); inp.blur(); }
    if(e.key === 'Enter'){
      const first = [...nav.querySelectorAll('[data-s]')].find(b => b.style.display !== 'none');
      if(first) first.click();
    }
  });
});
document.addEventListener('keydown', e=>{
  const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  if(e.key === '/' && !inField && NX.router.currentName === 'settings'){
    e.preventDefault();
    const i = q('#set-q');
    if(i) i.focus();
  }
});
})(window.NX);
