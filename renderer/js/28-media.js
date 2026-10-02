/* ============================================================
   Pebble 3.0 — 28-media.js
   Screenshot capture + editor (GIF recording removed by design)
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let canvas = null, ctx2d = null, tool = 'pen', color = '#E25C4A', size = 4, undoStack = [], drawing = false, last = null;
let origData = null;

const TOOLS = [
  { id:'pen',    n:'Pen',      ic:'edit' },
  { id:'marker', n:'Marker',   ic:'edit' },
  { id:'erase',  n:'Eraser',   ic:'x' },
  { id:'rect',   n:'Rectangle',ic:'square' },
  { id:'circle', n:'Circle',   ic:'target' },
  { id:'arrow',  n:'Arrow',    ic:'rocket' },
  { id:'blur',   n:'Pixelate', ic:'eye' }
];
const COLORS = ['#E25C4A','#E8853D','#E9C46A','#7CD56E','#5EB8FF','#8B5CF6','#E05C9C','#121212','#FFFFFF'];

NX.routeInShell('media', 'Screenshot', 'camera', function(view){
  view.innerHTML = `
  <div class="page" style="height:100%">
    <div class="row gap-8" style="flex-wrap:wrap">
      <button class="btn btn-green" id="sh-capture">${icon('camera')} Capture screen</button>
      <button class="btn btn-outline" id="sh-paste">${icon('copy')} From clipboard</button>
      <span class="faint small" id="sh-info">GIF recording has been removed — capture & annotate only.</span>
      <span style="flex:1"></span>
      <button class="btn btn-soft" id="sh-undo" disabled>${icon('refresh')} Undo</button>
      <button class="btn btn-soft" id="sh-clear" disabled>Clear marks</button>
      <button class="btn btn-dark" id="sh-save" disabled>${icon('download')} Save PNG</button>
    </div>
    <div class="tool-rail" id="sh-tools" style="display:none"></div>
    <div class="shot-canvas-wrap anim-in" id="sh-wrap">
      <div class="empty" id="sh-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="${NX.ICON_PATHS.camera}"/></svg>
        <div class="e-title">No capture yet</div>
        <div class="e-sub">Capture hides Pebble for a moment, grabs your screen, then brings it back for annotating.</div>
        <button class="btn btn-green" id="sh-capture2">${icon('camera')} Capture now</button>
      </div>
      <canvas id="sh-canvas" class="hidden"></canvas>
    </div>
  </div>`;

  canvas = q('#sh-canvas', view);
  ctx2d = canvas.getContext('2d');

  function hasImg(){ return !canvas.classList.contains('hidden'); }
  function refreshBtns(){
    q('#sh-undo', view).disabled = !hasImg() || !undoStack.length;
    q('#sh-clear', view).disabled = !hasImg();
    q('#sh-save', view).disabled = !hasImg();
  }
  function pushUndo(){ if(hasImg()){ undoStack.push(ctx2d.getImageData(0,0,canvas.width,canvas.height)); if(undoStack.length>12) undoStack.shift(); refreshBtns(); } }

  async function doCapture(){
    NX.toastInfo('Capturing…','Pebble hides for a moment');
    await new Promise(r=>setTimeout(r, 120));
    const res = await NX.native.capture(true);
    if(res && res.dataUrl){
      const img = new Image();
      img.onload = ()=>{
        const maxW = Math.min(1280, img.width);
        const scale = maxW / img.width;
        canvas.width = Math.round(img.width*scale);
        canvas.height = Math.round(img.height*scale);
        ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
        origData = ctx2d.getImageData(0,0,canvas.width,canvas.height);
        undoStack = [];
        canvas.classList.remove('hidden');
        q('#sh-empty', view).style.display = 'none';
        q('#sh-tools', view).style.display = 'flex';
        q('#sh-info', view).textContent = `Captured ${img.width}×${img.height} — annotate below`;
        refreshBtns(); NX.sfx.play('ok');
      };
      img.src = res.dataUrl;
    } else {
      // graceful demo canvas (web mode)
      canvas.width = 960; canvas.height = 600;
      const g = ctx2d.createLinearGradient(0,0,960,600);
      g.addColorStop(0,'#7CD56E'); g.addColorStop(1,'#5EB8FF');
      ctx2d.fillStyle = g; ctx2d.fillRect(0,0,960,600);
      ctx2d.fillStyle = 'rgba(255,255,255,.92)';
      ctx2d.beginPath(); ctx2d.roundRect(60,60,840,480,18); ctx2d.fill();
      ctx2d.fillStyle = '#121212'; ctx2d.font = '700 26px Inter, sans-serif';
      ctx2d.fillText('Demo capture (desktop builds grab your real screen)', 90, 120);
      ctx2d.font = '14px Inter, sans-serif'; ctx2d.fillStyle = '#5C5E63';
      ctx2d.fillText('Run Pebble as the Windows app for native captures via xcap.', 90, 152);
      origData = ctx2d.getImageData(0,0,960,600);
      undoStack = [];
      canvas.classList.remove('hidden');
      q('#sh-empty', view).style.display = 'none';
      q('#sh-tools', view).style.display = 'flex';
      q('#sh-info', view).textContent = 'Demo canvas — annotate freely';
      refreshBtns();
    }
  }

  q('#sh-capture', view).onclick = doCapture;
  q('#sh-capture2', view).onclick = doCapture;
  q('#sh-paste', view).onclick = async ()=>{
    try{
      const txt = await NX.native.clipboardRead();
      if(txt && txt.startsWith('data:image')){
        const img = new Image();
        img.onload = ()=>{ canvas.width=img.width; canvas.height=img.height; ctx2d.drawImage(img,0,0);
          origData = ctx2d.getImageData(0,0,canvas.width,canvas.height); undoStack=[];
          canvas.classList.remove('hidden'); q('#sh-empty',view).style.display='none';
          q('#sh-tools',view).style.display='flex'; refreshBtns(); };
        img.src = txt;
      } else NX.toastInfo('Clipboard', 'No image found in clipboard.');
    }catch(e){ NX.toastInfo('Clipboard', 'Clipboard read is available in desktop builds.'); }
  };
  q('#sh-undo', view).onclick = ()=>{
    const st = undoStack.pop();
    if(st){ ctx2d.putImageData(st, 0, 0); }
    refreshBtns();
  };
  q('#sh-clear', view).onclick = ()=>{
    if(origData){ ctx2d.putImageData(origData, 0, 0); undoStack = []; refreshBtns(); }
  };
  q('#sh-save', view).onclick = async ()=>{
    const dataUrl = canvas.toDataURL('image/png');
    const saved = await NX.native.saveImage(dataUrl);
    if(saved && saved.path) NX.toastOk('Saved', saved.path);
    else {
      const a = document.createElement('a');
      a.href = dataUrl; a.download = 'pebble-shot-' + Date.now() + '.png'; a.click();
      NX.toastOk('Saved', 'PNG downloaded.');
    }
    NX.sfx.play('ok');
  };

  /* tools rail */
  function renderTools(){
    const rail = q('#sh-tools', view);
    rail.innerHTML = TOOLS.map(t=>`<button class="chip ${tool===t.id?'active':''}" data-tool="${t.id}">${icon(t.ic)} ${t.n}</button>`).join('')
      + `<span style="width:1px;background:var(--line);margin:0 6px"></span>`
      + COLORS.map(c=>`<button data-color="${c}" data-tip="Color" style="width:26px;height:26px;border-radius:8px;background:${c};border:2px solid ${color===c?'var(--ink)':'transparent'};flex:none"></button>`).join('')
      + `<input type="range" min="2" max="18" value="${size}" id="sh-size" style="width:90px" data-tip="Brush size">`;
    qa('[data-tool]', rail).forEach(b=>b.onclick = ()=>{ tool = b.dataset.tool; renderTools(); });
    qa('[data-color]', rail).forEach(b=>b.onclick = ()=>{ color = b.dataset.color; renderTools(); });
    q('#sh-size', rail).oninput = e=>{ size = +e.target.value; };
  }
  renderTools();

  /* drawing */
  function pos(e){
    const r = canvas.getBoundingClientRect();
    return { x:(e.clientX-r.left)*(canvas.width/r.width), y:(e.clientY-r.top)*(canvas.height/r.height) };
  }
  canvas.addEventListener('pointerdown', e=>{
    if(!hasImg()) return;
    drawing = true; last = pos(e);
    pushUndo();
    if(tool==='pen'||tool==='marker'||tool==='erase'){
      ctx2d.beginPath(); ctx2d.moveTo(last.x, last.y);
    }
  });
  canvas.addEventListener('pointermove', e=>{
    if(!drawing) return;
    const p = pos(e);
    ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round';
    if(tool==='pen'||tool==='marker'){
      ctx2d.strokeStyle = color; ctx2d.globalAlpha = tool==='marker'?0.45:1; ctx2d.lineWidth = tool==='marker'? size*3 : size;
      ctx2d.lineTo(p.x,p.y); ctx2d.stroke();
    } else if(tool==='erase'){
      ctx2d.globalAlpha = 1; ctx2d.strokeStyle = 'rgba(0,0,0,1)'; ctx2d.lineWidth = size*4;
      ctx2d.save(); ctx2d.globalCompositeOperation = 'destination-out';
      ctx2d.lineTo(p.x,p.y); ctx2d.stroke(); ctx2d.restore();
    } else if(tool==='blur'){
      pixelate(p, Math.max(24, size*8));
    }
  });
  canvas.addEventListener('pointerup', e=>{
    if(!drawing) return;
    drawing = false; ctx2d.globalAlpha = 1;
    const p = pos(e);
    if(tool==='rect'){ ctx2d.strokeStyle=color; ctx2d.lineWidth=size; ctx2d.strokeRect(last.x,last.y,p.x-last.x,p.y-last.y); }
    if(tool==='circle'){ ctx2d.strokeStyle=color; ctx2d.lineWidth=size;
      ctx2d.beginPath(); ctx2d.ellipse((last.x+p.x)/2,(last.y+p.y)/2,Math.abs(p.x-last.x)/2,Math.abs(p.y-last.y)/2,0,0,Math.PI*2); ctx2d.stroke(); }
    if(tool==='arrow'){ ctx2d.strokeStyle=color; ctx2d.lineWidth=Math.max(2.5,size);
      ctx2d.beginPath(); ctx2d.moveTo(last.x,last.y); ctx2d.lineTo(p.x,p.y); ctx2d.stroke();
      const ang = Math.atan2(p.y-last.y, p.x-last.x), head = 12+size*1.5;
      ctx2d.beginPath();
      ctx2d.moveTo(p.x,p.y); ctx2d.lineTo(p.x-head*Math.cos(ang-0.45), p.y-head*Math.sin(ang-0.45));
      ctx2d.moveTo(p.x,p.y); ctx2d.lineTo(p.x-head*Math.cos(ang+0.45), p.y-head*Math.sin(ang+0.45));
      ctx2d.stroke(); }
    last = null;
  });

  function pixelate(p, block){
    const x0 = U.clamp(p.x-block/2, 0, canvas.width-block), y0 = U.clamp(p.y-block/2, 0, canvas.height-block);
    const data = ctx2d.getImageData(x0, y0, block, block);
    let r=0,g=0,b=0;
    const d = data.data, n = d.length/4;
    for(let i=0;i<d.length;i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; }
    r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
    ctx2d.fillStyle = `rgb(${r},${g},${b})`;
    ctx2d.fillRect(x0, y0, block, block);
  }
});
})(window.NX);
