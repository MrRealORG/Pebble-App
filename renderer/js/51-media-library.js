/* ============================================================
   PebbleX — 48-media-library.js
   Image picker, gallery, and optional cloud sync to the
   pebble-media-api Worker (Cloudflare R2).

   LOCAL-FIRST. An import ALWAYS lands on local disk first and is
   usable immediately with the network unplugged. Sync is opt-in and
   never blocks, never throws into the UI, and never replaces the
   local copy.

   WHY THE CLIENT RESIZES: the Worker cannot resize without an Images
   binding, and asking Cloudflare Images to transform on read has a
   5,000 unique-transformations/month cap on the free plan that would
   fail hard (error 9422) on a popular avatar. So we generate four
   fixed derivatives (32/64/128/512) up front and store each as its
   own object. Immutable keys + long max-age = cached at the edge and
   in the browser forever, and zero transformation requests.
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const SIZES = [32, 64, 128, 512];
const KEY = 'assets';
const SYNC_KEY = 'mediaSync';

/* localStorage quota is ~5MB, so the web fallback is deliberately
   tiny: a handful of small data URLs, oldest evicted. Desktop uses
   real files and is not limited by this. */
const INLINE_MAX = 6;
const INLINE_MAX_BYTES = 1200 * 1024;

/* ============================================================
   LOCAL INDEX
   ============================================================ */
function index(){
  const raw = NX.store.get(KEY, {});
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
}
function putIndex(obj){ NX.store.set(KEY, obj); }
function remember(meta){
  const all = index();
  all[meta.id] = meta;
  putIndex(all);
  return meta;
}
function forget(id){
  const all = index();
  delete all[id];
  putIndex(all);
}
function list(kind){
  const all = Object.values(index());
  const filtered = (kind && kind !== 'all') ? all.filter(m=>m.kind === kind) : all;
  return filtered.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
}

/* ============================================================
   SYNC CONFIG
   ============================================================ */
function syncCfg(){
  const c = NX.store.get(SYNC_KEY, null);
  return (c && typeof c === 'object') ? c : { enabled:false, api:'', token:'', lastPush:0, pending:[] };
}
function setSyncCfg(patch){
  const c = Object.assign(syncCfg(), patch || {});
  NX.store.set(SYNC_KEY, c);
  return c;
}

/* ============================================================
   IMPORT
   ============================================================ */
function readFile(file){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(String(r.result || ''));
    r.onerror = ()=>reject(new Error('could not read that file'));
    r.readAsDataURL(file);
  });
}

/** Downscale to at most `max` on the longest edge via canvas. Returns a
    blob; never upscales. */
function resize(file, max){
  return new Promise((resolve)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      const m = Math.max(w, h);
      if(m <= max){ resolve(null); return; }         /* keep original */
      const scale = max / m;
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const ctx = c.getContext('2d');
      /* white matte: JPEG has no alpha, so without this dark PNGs get
         black backgrounds when re-encoded */
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      c.toBlob(b=>resolve(b), 'image/jpeg', 0.86);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function blobToDataUrl(blob){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = ()=>resolve(String(r.result || ''));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ---------------------------------------------------------- */

/** Import one File. Desktop writes real files via the Rust command;
    the web build falls back to capped inline data URLs. */
async function importFile(file, kind){
  if(!file) return null;
  if(!/^image\//.test(file.type || '')){
    NX.toastErr('Not an image', 'Pick a PNG, JPEG or GIF.');
    return null;
  }
  if(file.size > 12 * 1024 * 1024){
    NX.toastErr('Too large', 'Images must be under 12 MB.');
    return null;
  }

  /* Downscale a monster photo before it ever crosses the IPC boundary —
     a 12MB base64 string through Tauri invoke is slow and pointless. */
  let workFile = file;
  if(file.size > 2 * 1024 * 1024){
    const small = await resize(file, 2000);
    if(small) workFile = new File([small], file.name.replace(/\.\w+$/, '.jpg'), { type:'image/jpeg' });
  }
  const dataUrl = await readFile(workFile);

  if(NX.native && NX.native.available){
    const r = await NX.native.invoke('asset_import', {
      dataUrl,
      name: file.name || 'image',
      kind: kind || 'misc'
    });
    if(r && r.ok && r.data && r.data.ok){
      const meta = {
        id: r.data.id,
        kind: kind || 'misc',
        name: file.name || 'image',
        w: r.data.w, h: r.data.h,
        bytes: r.data.bytes,
        mime: r.data.mime,
        url: r.data.url,
        thumb: r.data.thumb,
        syncUrl: '',
        createdAt: Date.now()
      };
      remember(meta);
      if(syncCfg().enabled) queue(meta.id);
      return meta;
    }
    const msg = (r && r.data && r.data.error) || 'The image could not be imported.';
    NX.toastErr('Import failed', msg);
    return null;
  }

  /* ---- web fallback ---- */
  return importInline(dataUrl, file, kind);
}

async function importInline(dataUrl, file, kind){
  const all = Object.values(index()).filter(m => m.kind === 'avatar' || m.kind === kind);
  let total = all.reduce((a,m)=> a + (m.bytes||0), 0);
  if(total + dataUrl.length > INLINE_MAX_BYTES || all.length >= INLINE_MAX){
    const oldest = all.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))[0];
    if(oldest){ forget(oldest.id); total -= (oldest.bytes||0); }
  }
  const id = 'w_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const meta = {
    id, kind: kind || 'misc', name: file.name || 'image',
    w: 0, h: 0, bytes: dataUrl.length, mime: file.type || 'image/png',
    url: dataUrl, thumb: dataUrl, syncUrl: '', createdAt: Date.now(),
    inline: true
  };
  remember(meta);
  if(syncCfg().enabled) queue(id);
  return meta;
}

/* ============================================================
   PICKER
   ============================================================ */
function pick(opts){
  opts = opts || {};
  return new Promise((resolve)=>{
    const inp = h(`<input type="file" accept="image/*" style="display:none">`);
    document.body.appendChild(inp);
    inp.onchange = async ()=>{
      const f = inp.files && inp.files[0];
      inp.remove();
      if(!f){ resolve(null); return; }
      resolve(await importFile(f, opts.kind || 'misc'));
    };
    inp.click();
  });
}

/* ============================================================
   CLOUD SYNC
   ============================================================ */
function queue(id){
  const c = syncCfg();
  if(!c.enabled || !c.api) return;
  if(!Array.isArray(c.pending)) c.pending = [];
  if(c.pending.indexOf(id) === -1) c.pending.push(id);
  setSyncCfg({ pending: c.pending });
}

async function apiHeaders(){
  const c = syncCfg();
  return c.token ? { Authorization:'Bearer ' + c.token } : {};
}

/** Push one asset's derivatives. Best-effort: a failure leaves the
    asset local-only and retries on the next push. */
async function pushOne(meta){
  const c = syncCfg();
  if(!c.api || !meta || meta.inline) return false;

  /* Local PNG derivatives are already the right sizes; re-encoding to
     JPEG here halves the bytes for the same visual result at these
     dimensions, and the Worker accepts both. */
  for(const size of SIZES){
    const localUrl = meta.url.replace(/\/full\.png$/, '/' + size + '.png');
    let blob;
    try{
      const res = await fetch(localUrl);
      if(!res.ok) throw new Error('read failed');
      const raw = await res.blob();
      if(raw.size > 200 * 1024){
        blob = await shrink(raw, size);
      } else {
        blob = raw;
      }
    }catch(e){ return false; }

    const headers = Object.assign({}, await apiHeaders(), {
      'Content-Type': blob.type || 'image/png',
      'X-Pebble-Asset': meta.id,
      'X-Pebble-Size': String(size),
      'X-Pebble-Kind': meta.kind || 'misc',
      'X-Pebble-Width': String(meta.w || 0),
      'X-Pebble-Height': String(meta.h || 0)
    });

    try{
      const res = await fetch(c.api.replace(/\/+$/,'') + '/upload', {
        method:'POST', headers, body: blob
      });
      if(!res.ok) return false;
      const j = await res.json();
      if(j && j.ok && j.size === size && meta.syncUrl === ''){
        meta.syncUrl = c.api.replace(/\/+$/,'') + '/i/' + meta.id + '/128';
      }
    }catch(e){ return false; }
  }
  remember(meta);
  return true;
}

/** shrink a PNG blob to a small JPEG using canvas */
function shrink(blob, size){
  return new Promise((resolve)=>{
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      /* cover-fit so a square derivative is never letterboxed */
      const s = Math.max(size / img.naturalWidth, size / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (size - w)/2, (size - h)/2, w, h);
      c.toBlob(b=>resolve(b || blob), 'image/jpeg', 0.85);
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

/** Push everything pending. Safe to call often; never throws. */
async function pushAll(opts){
  const c = syncCfg();
  if(!c.enabled || !c.api) return { ok:0, fail:0 };
  if(!opts || !opts.force){
    if(Date.now() - (c.lastPush || 0) < 30000) return { ok:0, fail:0, skipped:true };
  }
  const ids = (c.pending && c.pending.length) ? c.pending.slice() : list('avatar').map(m=>m.id);
  const all = index();
  let ok = 0, fail = 0;
  const failed = [];
  for(const id of ids){
    const done = await pushOne(all[id]);
    if(done) ok++; else { fail++; failed.push(id); }
  }
  setSyncCfg({ pending: failed, lastPush: Date.now() });
  NX.events.emit('media:synced', { ok, fail });
  return { ok, fail };
}

async function health(){
  const c = syncCfg();
  if(!c.api) return { ok:false, error:'No sync address set.' };
  try{
    const res = await fetch(c.api.replace(/\/+$/,'') + '/health');
    if(!res.ok) return { ok:false, error:'The sync service did not respond.' };
    const j = await res.json();
    return { ok: !!j.ok, auth: !!j.auth };
  }catch(e){ return { ok:false, error:'Could not reach the sync service.' }; }
}

async function remoteDelete(id){
  const c = syncCfg();
  if(!c.enabled || !c.api) return false;
  try{
    const res = await fetch(c.api.replace(/\/+$/,'') + '/i/' + encodeURIComponent(id), {
      method:'DELETE', headers: await apiHeaders()
    });
    return !!(res && res.ok);
  }catch(e){ return false; }
}

/* ============================================================
   GALLERY
   ============================================================ */
function gallery(host, kind, onPick){
  const items = list(kind || 'all');
  if(!items.length){
    host.innerHTML = `<div class="empty"><div class="e-title">No images yet</div>
      <div class="e-sub">Drop one here, paste one, or upload.</div></div>`;
    return;
  }
  host.innerHTML = `<div class="media-grid">${items.map(m=>`
    <div class="media-cell" data-asset="${m.id}" data-tip="${U.esc(m.name || m.id)}">
      <img src="${U.esc(m.thumb || m.url)}" alt="" loading="lazy">
      <div class="media-meta">
        <b class="ellipsis">${U.esc(m.name || 'image')}</b>
        <i>${m.w? m.w+'×'+m.h : U.esc(m.kind)}${m.syncUrl?' · synced':''}</i>
      </div>
      <div class="media-acts">
        <button class="icon-btn sm" data-use="${m.id}" data-tip="Use this">${icon('check',13)}</button>
        <button class="icon-btn sm" data-del="${m.id}" data-tip="Delete">${icon('trash',13)}</button>
      </div>
    </div>`).join('')}</div>`;

  qa('[data-use]', host).forEach(b=>b.onclick = ()=>{
    const m = index()[b.dataset.use];
    if(m && onPick) onPick(m);
  });
  qa('[data-del]', host).forEach(b=>b.onclick = ()=>{
    const id = b.dataset.del;
    NX.confirm('Delete this image?', 'It moves to the trash folder so you can recover it.', ()=>{
      remoteDelete(id);
      forget(id);
      if(NX.native && NX.native.available) NX.native.invoke('asset_delete', { id });
      gallery(host, kind, onPick);
      NX.toastInfo('Deleted', 'Recoverable from .trash in your Pebble folder.');
    }, { icon:'trash', yes:'Delete' });
  });
}

/* ============================================================
   DROP ZONE + PASTE
   ============================================================ */
function dropZone(el, kind, onDone){
  if(!el) return;
  const stop = e =>{ e.preventDefault(); e.stopPropagation(); };
  ['dragenter','dragover'].forEach(ev=>el.addEventListener(ev, e=>{ stop(e); el.classList.add('drop'); }));
  ['dragleave','drop'].forEach(ev=>el.addEventListener(ev, e=>{ stop(e); el.classList.remove('drop'); }));
  el.addEventListener('drop', async e=>{
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(!f) return;
    const m = await importFile(f, kind || 'misc');
    if(m && onDone) onDone(m);
  });
}

function pasteHandler(target, kind, onDone){
  const onPaste = async e=>{
    const items = e.clipboardData && e.clipboardData.items;
    if(!items) return;
    for(const it of items){
      if(it.type && it.type.indexOf('image/') === 0){
        const f = it.getAsFile();
        if(f){
          e.preventDefault();
          const m = await importFile(f, kind || 'misc');
          if(m && onDone) onDone(m);
          return;
        }
      }
    }
  };
  if(target) target.addEventListener('paste', onPaste);
  return onPaste;
}

/* ============================================================
   PUBLIC
   ============================================================ */
NX.media = {
  import: importFile,
  pick,
  gallery,
  dropZone,
  paste: pasteHandler,
  list,
  index,
  forget,

  remove(url){
    const all = index();
    const hit = Object.values(all).find(m => m.url === url || m.thumb === url);
    if(hit){ remoteDelete(hit.id); forget(hit.id); }
  },

  /* sync */
  cfg: syncCfg,
  setCfg: setSyncCfg,
  health,
  pushAll,
  queue,

  /** preferred source for rendering: cloud copy when synced, else local */
  src(m, size){
    if(!m) return '';
    if(m.syncUrl) return m.syncUrl;
    if(size && m.url && /\.png$/.test(m.url)) return m.url.replace(/\/full\.png$/, '/' + size + '.png');
    return m.thumb || m.url || '';
  }
};

/* Opportunistic sync: piggyback on the existing 30s-ish cadence rather
   than adding a new timer, and never on boot-critical paths. */
document.addEventListener('DOMContentLoaded', ()=>{
  setTimeout(()=>{
    const c = syncCfg();
    if(c.enabled && c.api && (c.pending || []).length){
      pushAll();
    }
  }, 9000);
});

} )(window.NX);