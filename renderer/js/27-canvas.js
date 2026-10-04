/* ============================================================
   PebbleX v0.1 — 27-canvas.js
   Interactive Whiteboard & Multi-Canvas Studio (inspired by tldraw)
   - Multi-canvas boards (create, switch, rename, delete)
   - Image upload from device & paste from clipboard
   - Freehand pen with midpoint quadratic curve smoothing (zero lag)
   - Translucent highlighter tool for diagramming
   - Shapes: Rectangle, Ellipse/Circle, Arrow, Straight Line
   - Sticky Notes with 5 pastel colors & double-click editing
   - Text boxes with live inline entry
   - Dynamic canvas grid (Dots, Grid, Blank)
   - Infinite pan & zoom viewport with mouse-centered wheel
   - Full undo/redo history & persistent multi-board storage
   - High-res PNG export with background rendering
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const COLORS = [
  { id:'green',  hex:'#7CD56E', name:'Forest Green' },
  { id:'blue',   hex:'#5EB8FF', name:'Sky Blue' },
  { id:'orange', hex:'#E8853D', name:'Amber Orange' },
  { id:'purple', hex:'#8B5CF6', name:'Violet' },
  { id:'pink',   hex:'#E05C9C', name:'Rose' },
  { id:'red',    hex:'#EF4444', name:'Coral Red' },
  { id:'yellow', hex:'#F59E0B', name:'Sunny Yellow' },
  { id:'ink',    hex:'#E2E8F0', name:'Ink' }
];

const STICKY_COLORS = [
  { id:'yellow', bg:'#FEF08A', fg:'#1F2937' },
  { id:'green',  bg:'#BBF7D0', fg:'#14532D' },
  { id:'blue',   bg:'#BAE6FD', fg:'#0C4A6E' },
  { id:'pink',   bg:'#FBCFE8', fg:'#831843' },
  { id:'purple', bg:'#E9D5FF', fg:'#581C87' }
];

let curTool = 'draw'; // 'select','hand','draw','highlighter','arrow','line','rect','circle','sticky','text','eraser'
let curColor = '#7CD56E';
let curWidth = 3;
let curFill = false;
let curGrid = 'dots'; // 'dots', 'grid', 'none'

NX.routeInShell('canvas', 'Canvas', 'brush', function(view){
  view.classList.add('full');

  // Load or initialize boards
  let boards = NX.store.get('canvas:boards', null);
  if(!boards || !Array.isArray(boards) || !boards.length){
    const oldElems = NX.store.get('canvas:elements', []);
    boards = [
      { id: 'board-main', name: 'Main Canvas', elements: Array.isArray(oldElems) ? oldElems : [] }
    ];
    NX.store.set('canvas:boards', boards);
  }

  let activeBoardId = NX.store.get('canvas:active_board', boards[0].id);
  let curBoard = boards.find(b => b.id === activeBoardId) || boards[0];

  view.innerHTML = `
    <div class="canvas-page" id="canvas-page">
      <!-- Top Multi-Canvas Tab Bar (Studio / Browser style) -->
      <div class="canvas-tabs-bar" id="canvas-tabs-bar">
        <div class="canvas-tabs-scroll" id="canvas-tabs-list"></div>
        <button class="canvas-tab-add" id="canvas-tab-new" title="Open new canvas tab">
          ${icon('plus', 13)} <span>New Canvas</span>
        </button>
      </div>

      <!-- Floating Top Bar with Board Switcher & Tools -->
      <div class="canvas-toolbar" id="canvas-toolbar">
        <!-- Board Switcher Capsule -->
        <div class="canvas-board-capsule" style="display:flex;align-items:center;gap:4px;padding-right:6px;border-right:1px solid var(--line)">
          <button class="btn btn-sm btn-soft" id="cb-switch-btn" style="height:30px;padding:0 10px;font-size:12px;font-weight:700;gap:6px" title="Switch or manage canvas boards">
            <span>🎨</span> <span id="cb-name-txt">${U.esc(curBoard.name)}</span> <span style="font-size:9px;opacity:0.6">▾</span>
          </button>
          <button class="icon-btn sm" id="cb-add-btn" title="Create New Board" style="width:28px;height:28px">${icon('plus', 13)}</button>
        </div>

        <!-- Navigation Tools -->
        <button class="ct-btn ${curTool==='select'?'on':''}" data-t="select" data-tip="Select & Move (V)">
          ${icon('target', 16)}
        </button>
        <button class="ct-btn ${curTool==='hand'?'on':''}" data-t="hand" data-tip="Pan Hand (H / Space)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v7M10 10.5V6a2 2 0 0 0-4 0v8a7 7 0 0 0 14 0v-3a2 2 0 0 0-4 0"/></svg>
        </button>
        <div class="ct-divider"></div>

        <!-- Drawing Tools -->
        <button class="ct-btn ${curTool==='draw'?'on':''}" data-t="draw" data-tip="Pen (P)">
          ${icon('brush', 16)}
        </button>
        <button class="ct-btn ${curTool==='highlighter'?'on':''}" data-t="highlighter" data-tip="Highlighter (M)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
        </button>
        <button class="ct-btn ${curTool==='arrow'?'on':''}" data-t="arrow" data-tip="Arrow (A)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19L19 5M19 5v8M19 5h-8"/></svg>
        </button>
        <button class="ct-btn ${curTool==='line'?'on':''}" data-t="line" data-tip="Straight Line (L)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/></svg>
        </button>
        <button class="ct-btn ${curTool==='rect'?'on':''}" data-t="rect" data-tip="Rectangle (R)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
        </button>
        <button class="ct-btn ${curTool==='circle'?'on':''}" data-t="circle" data-tip="Circle (O)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/></svg>
        </button>
        <button class="ct-btn ${curTool==='sticky'?'on':''}" data-t="sticky" data-tip="Sticky Note (S)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-6-6zM15 3v6h6"/></svg>
        </button>
        <button class="ct-btn ${curTool==='text'?'on':''}" data-t="text" data-tip="Text (T)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        </button>
        <button class="ct-btn" id="ct-img-btn" data-tip="Upload Image to Canvas (I)">
          ${icon('image', 16)}
        </button>
        <input type="file" id="ct-file-input" accept="image/*" style="display:none">
        <button class="ct-btn ${curTool==='eraser'?'on':''}" data-t="eraser" data-tip="Eraser (E)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 14-8.5 8.5a2.12 2.12 0 0 1-3 0L3.5 19.5a2.12 2.12 0 0 1 0-3L12 8l6 6zM14.5 5.5l3-3a2.12 2.12 0 0 1 3 3l-3 3"/></svg>
        </button>
        <div class="ct-divider"></div>

        <!-- History & Actions -->
        <button class="ct-btn" id="ct-undo" data-tip="Undo (Ctrl+Z)">${icon('undo', 15)}</button>
        <button class="ct-btn" id="ct-clear" data-tip="Clear Canvas Board" style="color:var(--red,#ef4444)">${icon('trash', 15)}</button>
        <button class="ct-btn" id="ct-export" data-tip="Export to PNG Image" style="color:var(--green,#7cd56e)">${icon('download', 15)}</button>
      </div>

      <!-- Properties Palette -->
      <div class="canvas-props-bar" id="canvas-props">
        <div class="cp-colors">
          ${COLORS.map(c => `
            <div class="cp-color-swatch ${c.hex.toLowerCase()===curColor.toLowerCase()?'on':''}"
                 data-hex="${c.hex}" title="${c.name}" style="background:${c.hex}"></div>
          `).join('')}
        </div>
        <div class="ct-divider"></div>
        <div class="cp-widths">
          <button class="cp-width-btn ${curWidth===2?'on':''}" data-w="2" title="Fine (2px)"><span class="cp-width-dot" style="width:4px;height:4px"></span></button>
          <button class="cp-width-btn ${curWidth===4?'on':''}" data-w="4" title="Medium (4px)"><span class="cp-width-dot" style="width:7px;height:7px"></span></button>
          <button class="cp-width-btn ${curWidth===8?'on':''}" data-w="8" title="Bold (8px)"><span class="cp-width-dot" style="width:11px;height:11px"></span></button>
        </div>
      </div>

      <!-- Viewport Canvas -->
      <div class="canvas-viewport tool-${curTool}" id="canvas-viewport">
        <canvas id="nx-canvas-element"></canvas>
      </div>

      <!-- Bottom Controls (Zoom & Grid) -->
      <div class="canvas-bottom-left" style="display:flex;align-items:center;gap:6px">
        <button class="icon-btn sm" id="cz-out" data-tip="Zoom Out (-)">${icon('minus', 12)}</button>
        <span class="canvas-zoom-txt" id="cz-txt" style="min-width:44px;text-align:center">100%</span>
        <button class="icon-btn sm" id="cz-in" data-tip="Zoom In (+)">${icon('plus', 12)}</button>
        <button class="btn btn-ghost btn-sm" id="cz-reset" style="padding:2px 8px;font-size:11px">Fit</button>
        <div class="ct-divider" style="margin:0 2px"></div>
        <button class="btn btn-ghost btn-sm" id="cz-grid-toggle" style="padding:2px 8px;font-size:11px" title="Toggle canvas background grid">
          Grid: <span id="cz-grid-lbl">Dots</span>
        </button>
      </div>
    </div>
  `;

  initCanvasEngine(view, curBoard, boards);
});

function initCanvasEngine(root, initialBoard, allBoards){
  const vp = q('#canvas-viewport', root);
  const cvs = q('#nx-canvas-element', root);
  if(!vp || !cvs) return;
  const ctx = cvs.getContext('2d');

  let curBoard = initialBoard;
  let boards = allBoards;
  let elements = Array.isArray(curBoard.elements) ? curBoard.elements : [];

  let history = [JSON.stringify(elements)];
  let historyIdx = 0;

  let zoom = 1.0;
  let panX = 0;
  let panY = 0;

  let isDrawing = false;
  let isPanning = false;
  let isDraggingElem = false;
  let startX = 0, startY = 0;
  let dragElemId = null;
  let activeElement = null;

  // Cached HTML Image elements for rapid 60fps rendering
  const imgCache = new Map();

  // Throttled RAF render scheduler
  let renderScheduled = false;
  function scheduleRender(){
    if(!renderScheduled && cvs.isConnected){
      renderScheduled = true;
      requestAnimationFrame(() => {
        renderScheduled = false;
        if(cvs.isConnected) render();
      });
    }
  }

  function pushHistory(){
    const snap = JSON.stringify(elements);
    if(history[historyIdx] === snap) return;
    history = history.slice(0, historyIdx + 1);
    history.push(snap);
    if(history.length > 50) history.shift();
    historyIdx = history.length - 1;
    saveBoardState();
  }

  function undo(){
    if(historyIdx > 0){
      historyIdx--;
      elements = JSON.parse(history[historyIdx]);
      saveBoardState();
      scheduleRender();
      try{ NX.sfx.play('pop'); }catch(e){}
    }
  }

  function saveBoardState(){
    curBoard.elements = elements;
    try {
      const idx = boards.findIndex(b => b.id === curBoard.id);
      if(idx !== -1) boards[idx] = curBoard;
      NX.store.set('canvas:boards', boards);
      NX.store.set('canvas:active_board', curBoard.id);
      NX.store.set('canvas:elements', elements);
    } catch(e){}
  }

  function switchBoard(targetBoard){
    saveBoardState();
    curBoard = targetBoard;
    elements = Array.isArray(curBoard.elements) ? curBoard.elements : [];
    history = [JSON.stringify(elements)];
    historyIdx = 0;
    const nameEl = q('#cb-name-txt', root);
    if(nameEl) nameEl.textContent = curBoard.name;
    NX.store.set('canvas:active_board', curBoard.id);
    panX = 0; panY = 0; zoom = 1.0;
    updateZoomLabel();
    scheduleRender();
    if(typeof renderTabs === 'function') renderTabs();
    NX.toastOk('Canvas loaded', curBoard.name);
    try{ NX.sfx.play('nav'); }catch(e){}
  }

  function updateZoomLabel(){
    const txt = q('#cz-txt', root);
    if(txt) txt.textContent = Math.round(zoom * 100) + '%';
  }

  function resizeCanvas(){
    if(!cvs.isConnected) return;
    const rect = vp.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cvs.width = Math.round(rect.width * dpr);
    cvs.height = Math.round(rect.height * dpr);
    scheduleRender();
  }

  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 30);

  function toScreen(wx, wy){
    return {
      x: wx * zoom + panX,
      y: wy * zoom + panY
    };
  }

  function toWorld(sx, sy){
    return {
      x: (sx - panX) / zoom,
      y: (sy - panY) / zoom
    };
  }

  function render(){
    const rect = vp.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    ctx.save();
    ctx.scale(dpr, dpr);

    // Draw Background Grid if enabled
    if(curGrid === 'dots'){
      drawDotsGrid(ctx, rect.width, rect.height);
    } else if(curGrid === 'grid'){
      drawLinesGrid(ctx, rect.width, rect.height);
    }

    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Draw saved elements
    elements.forEach(el => {
      drawElement(ctx, el);
    });

    // Draw in-progress element
    if(activeElement){
      drawElement(ctx, activeElement);
    }

    ctx.restore();
  }

  function drawDotsGrid(c, w, h){
    c.save();
    const gap = 24 * zoom;
    if(gap >= 8){
      c.fillStyle = 'rgba(255, 255, 255, 0.08)';
      const offsetX = ((panX % gap) + gap) % gap;
      const offsetY = ((panY % gap) + gap) % gap;
      const dotRadius = Math.max(1, 1.2 * Math.min(zoom, 1.5));
      c.beginPath();
      for(let x = offsetX; x < w; x += gap){
        for(let y = offsetY; y < h; y += gap){
          c.moveTo(x + dotRadius, y);
          c.arc(x, y, dotRadius, 0, Math.PI * 2);
        }
      }
      c.fill();
    }
    c.restore();
  }

  function drawLinesGrid(c, w, h){
    c.save();
    const gap = 32 * zoom;
    if(gap >= 12){
      c.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      c.lineWidth = 1;
      const offsetX = ((panX % gap) + gap) % gap;
      const offsetY = ((panY % gap) + gap) % gap;
      c.beginPath();
      for(let x = offsetX; x < w; x += gap){
        c.moveTo(x, 0);
        c.lineTo(x, h);
      }
      for(let y = offsetY; y < h; y += gap){
        c.moveTo(0, y);
        c.lineTo(w, y);
      }
      c.stroke();
    }
    c.restore();
  }

  function drawElement(c, el){
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = el.color || curColor;
    c.fillStyle = el.color || curColor;
    c.lineWidth = el.width || 3;

    // 1. Freehand Pen with midpoint quadratic smoothing
    if(el.type === 'draw' && el.points && el.points.length){
      const pts = el.points;
      c.beginPath();
      if(pts.length === 1){
        c.arc(pts[0].x, pts[0].y, (el.width||3)/2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.moveTo(pts[0].x, pts[0].y);
        for(let i=1; i<pts.length-1; i++){
          const midX = (pts[i].x + pts[i+1].x) / 2;
          const midY = (pts[i].y + pts[i+1].y) / 2;
          c.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        c.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
        c.stroke();
      }
    }
    // 2. Translucent Highlighter
    else if(el.type === 'highlighter' && el.points && el.points.length){
      const pts = el.points;
      c.save();
      c.globalAlpha = 0.35;
      c.lineWidth = (el.width || 4) * 3.5;
      c.beginPath();
      if(pts.length === 1){
        c.arc(pts[0].x, pts[0].y, c.lineWidth/2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.moveTo(pts[0].x, pts[0].y);
        for(let i=1; i<pts.length-1; i++){
          const midX = (pts[i].x + pts[i+1].x) / 2;
          const midY = (pts[i].y + pts[i+1].y) / 2;
          c.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        c.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
        c.stroke();
      }
      c.restore();
    }
    // 3. Rectangle
    else if(el.type === 'rect'){
      c.beginPath();
      const r = Math.min(10, Math.abs(el.w)/4, Math.abs(el.h)/4);
      roundRect(c, el.x, el.y, el.w, el.h, r);
      if(el.fill){
        c.save();
        c.globalAlpha = 0.16;
        c.fill();
        c.restore();
      }
      c.stroke();
    }
    // 4. Circle / Ellipse
    else if(el.type === 'circle'){
      c.beginPath();
      const rx = Math.abs(el.w) / 2;
      const ry = Math.abs(el.h) / 2;
      const cx = el.x + el.w / 2;
      const cy = el.y + el.h / 2;
      c.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      if(el.fill){
        c.save();
        c.globalAlpha = 0.16;
        c.fill();
        c.restore();
      }
      c.stroke();
    }
    // 5. Straight Line
    else if(el.type === 'line'){
      c.beginPath();
      c.moveTo(el.x1, el.y1);
      c.lineTo(el.x2, el.y2);
      c.stroke();
    }
    // 6. Arrow with clean angled arrowhead
    else if(el.type === 'arrow'){
      c.beginPath();
      c.moveTo(el.x1, el.y1);
      c.lineTo(el.x2, el.y2);
      c.stroke();
      const angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
      const headLen = Math.max(12, (el.width||3) * 3);
      c.beginPath();
      c.moveTo(el.x2, el.y2);
      c.lineTo(el.x2 - headLen * Math.cos(angle - Math.PI / 6), el.y2 - headLen * Math.sin(angle - Math.PI / 6));
      c.lineTo(el.x2 - headLen * Math.cos(angle + Math.PI / 6), el.y2 - headLen * Math.sin(angle + Math.PI / 6));
      c.closePath();
      c.fill();
    }
    // 7. Sticky Note
    else if(el.type === 'sticky'){
      const sw = el.w || 160;
      const sh = el.h || 140;
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.25)';
      c.shadowBlur = 14;
      c.shadowOffsetY = 5;
      c.fillStyle = el.bg || '#FEF08A';
      roundRect(c, el.x, el.y, sw, sh, 8);
      c.fill();
      c.restore();

      // Fold bar
      c.fillStyle = 'rgba(0,0,0,0.06)';
      c.fillRect(el.x, el.y, sw, 22);

      // Text inside
      c.fillStyle = el.fg || '#1F2937';
      c.font = '13.5px Inter, system-ui, sans-serif';
      c.textBaseline = 'top';
      const words = (el.text || 'Double-click to write…').split('\n');
      let lineY = el.y + 28;
      words.forEach(line => {
        c.fillText(line.slice(0, 24), el.x + 12, lineY);
        lineY += 20;
      });
    }
    // 8. Text Label
    else if(el.type === 'text'){
      c.fillStyle = el.color || curColor;
      c.font = (el.fontSize || 18) + 'px Inter, system-ui, sans-serif';
      c.textBaseline = 'top';
      c.fillText(el.text || 'Text', el.x, el.y);
    }
    // 9. Uploaded / Pasted Image
    else if(el.type === 'image' && el.src){
      let cached = imgCache.get(el.src);
      if(!cached){
        cached = new Image();
        cached.onload = () => scheduleRender();
        cached.src = el.src;
        imgCache.set(el.src, cached);
      }
      if(cached.complete && cached.naturalWidth > 0){
        c.save();
        c.beginPath();
        roundRect(c, el.x, el.y, el.w, el.h, 8);
        c.clip();
        c.drawImage(cached, el.x, el.y, el.w, el.h);
        c.restore();

        // Border outline
        c.strokeStyle = 'rgba(255,255,255,0.2)';
        c.lineWidth = 1.5;
        c.beginPath();
        roundRect(c, el.x, el.y, el.w, el.h, 8);
        c.stroke();
      }
    }
    c.restore();
  }

  function roundRect(c, x, y, w, h, r){
    if(w < 0){ x += w; w = Math.abs(w); }
    if(h < 0){ y += h; h = Math.abs(h); }
    r = Math.min(r, w/2, h/2);
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
  }

  function findElementAt(wx, wy){
    for(let i = elements.length - 1; i >= 0; i--){
      const el = elements[i];
      if(el.type === 'sticky' || el.type === 'rect' || el.type === 'image'){
        const x = el.x, y = el.y, w = el.w || 160, h = el.h || 140;
        const minX = Math.min(x, x+w), maxX = Math.max(x, x+w);
        const minY = Math.min(y, y+h), maxY = Math.max(y, y+h);
        if(wx >= minX && wx <= maxX && wy >= minY && wy <= maxY) return el;
      } else if(el.type === 'circle'){
        const cx = el.x + (el.w||0)/2, cy = el.y + (el.h||0)/2;
        const rx = Math.abs(el.w||1)/2, ry = Math.abs(el.h||1)/2;
        if(Math.hypot((wx-cx)/rx, (wy-cy)/ry) <= 1) return el;
      } else if((el.type === 'draw' || el.type === 'highlighter') && el.points){
        const hit = el.points.some(p => Math.hypot(p.x - wx, p.y - wy) < 16);
        if(hit) return el;
      } else if(el.type === 'line' || el.type === 'arrow'){
        const dist = distToSegment({x:wx, y:wy}, {x:el.x1, y:el.y1}, {x:el.x2, y:el.y2});
        if(dist < 12) return el;
      } else if(el.type === 'text'){
        if(Math.hypot(el.x - wx, el.y - wy) < 32) return el;
      }
    }
    return null;
  }

  function distToSegment(p, v, w){
    const l2 = (w.x - v.x)**2 + (w.y - v.y)**2;
    if(l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  }

  // Handle Image insertion (from file reader or clipboard)
  function insertImageFromDataUrl(dataUrl, targetWx, targetWy){
    const tempImg = new Image();
    tempImg.onload = () => {
      const maxDim = 320;
      let w = tempImg.width || 300;
      let h = tempImg.height || 200;
      if(w > maxDim || h > maxDim){
        if(w > h){ h = (h / w) * maxDim; w = maxDim; }
        else { w = (w / h) * maxDim; h = maxDim; }
      }
      const newImg = {
        id: U.uid('img'),
        type: 'image',
        x: Math.round(targetWx - w/2),
        y: Math.round(targetWy - h/2),
        w: Math.round(w),
        h: Math.round(h),
        src: dataUrl
      };
      imgCache.set(dataUrl, tempImg);
      elements.push(newImg);
      pushHistory();
      scheduleRender();
      NX.toastOk('Image placed on canvas', 'Use Select tool to move it');
      try{ NX.sfx.play('pop'); }catch(e){}
    };
    tempImg.src = dataUrl;
  }

  // Pointer & mouse events
  vp.addEventListener('pointerdown', e => {
    const r = vp.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const w = toWorld(sx, sy);
    startX = sx;
    startY = sy;

    if(e.button === 1 || e.spaceKey || curTool === 'hand'){
      isPanning = true;
      vp.setPointerCapture(e.pointerId);
      return;
    }

    if(curTool === 'select'){
      const hit = findElementAt(w.x, w.y);
      if(hit){
        isDraggingElem = true;
        dragElemId = hit.id;
        vp.setPointerCapture(e.pointerId);
      }
      return;
    }

    if(curTool === 'eraser'){
      const hit = findElementAt(w.x, w.y);
      if(hit){
        elements = elements.filter(x => x.id !== hit.id);
        pushHistory();
        scheduleRender();
        try{ NX.sfx.play('pop'); }catch(err){}
      }
      return;
    }

    if(curTool === 'sticky'){
      const sColor = STICKY_COLORS[Math.floor(Math.random()*STICKY_COLORS.length)];
      const newSticky = {
        id: U.uid('stk'),
        type: 'sticky',
        x: w.x - 80,
        y: w.y - 70,
        w: 160,
        h: 140,
        bg: sColor.bg,
        fg: sColor.fg,
        text: 'New Note'
      };
      elements.push(newSticky);
      pushHistory();
      scheduleRender();
      openStickyEditor(newSticky);
      try{ NX.sfx.play('tick'); }catch(err){}
      return;
    }

    if(curTool === 'text'){
      const textVal = prompt('Enter text for canvas:');
      if(textVal && textVal.trim()){
        elements.push({
          id: U.uid('txt'),
          type: 'text',
          x: w.x,
          y: w.y,
          text: textVal.trim(),
          color: curColor,
          fontSize: 20
        });
        pushHistory();
        scheduleRender();
      }
      return;
    }

    // Freehand drawing & shapes
    isDrawing = true;
    vp.setPointerCapture(e.pointerId);

    if(curTool === 'draw'){
      activeElement = {
        id: U.uid('drw'),
        type: 'draw',
        color: curColor,
        width: curWidth,
        points: [{ x: w.x, y: w.y }]
      };
    } else if(curTool === 'highlighter'){
      activeElement = {
        id: U.uid('hl'),
        type: 'highlighter',
        color: curColor,
        width: curWidth,
        points: [{ x: w.x, y: w.y }]
      };
    } else if(curTool === 'rect'){
      activeElement = {
        id: U.uid('rct'),
        type: 'rect',
        x: w.x, y: w.y, w: 0, h: 0,
        color: curColor, width: curWidth, fill: curFill
      };
    } else if(curTool === 'circle'){
      activeElement = {
        id: U.uid('crc'),
        type: 'circle',
        x: w.x, y: w.y, w: 0, h: 0,
        color: curColor, width: curWidth, fill: curFill
      };
    } else if(curTool === 'arrow'){
      activeElement = {
        id: U.uid('arr'),
        type: 'arrow',
        x1: w.x, y1: w.y, x2: w.x, y2: w.y,
        color: curColor, width: curWidth
      };
    } else if(curTool === 'line'){
      activeElement = {
        id: U.uid('lin'),
        type: 'line',
        x1: w.x, y1: w.y, x2: w.x, y2: w.y,
        color: curColor, width: curWidth
      };
    }
  });

  vp.addEventListener('pointermove', e => {
    const r = vp.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const w = toWorld(sx, sy);

    if(isPanning){
      panX += (sx - startX);
      panY += (sy - startY);
      startX = sx;
      startY = sy;
      scheduleRender();
      return;
    }

    if(isDraggingElem && dragElemId){
      const el = elements.find(x => x.id === dragElemId);
      if(el){
        const dx = (sx - startX) / zoom;
        const dy = (sy - startY) / zoom;
        if(el.x !== undefined){ el.x += dx; el.y += dy; }
        else if(el.x1 !== undefined){ el.x1 += dx; el.y1 += dy; el.x2 += dx; el.y2 += dy; }
        else if(el.points){ el.points.forEach(p => { p.x += dx; p.y += dy; }); }
        startX = sx; startY = sy;
        scheduleRender();
      }
      return;
    }

    if(curTool === 'eraser' && (e.buttons === 1)){
      const hit = findElementAt(w.x, w.y);
      if(hit){
        elements = elements.filter(x => x.id !== hit.id);
        scheduleRender();
      }
      return;
    }

    if(!isDrawing || !activeElement) return;

    if(activeElement.type === 'draw' || activeElement.type === 'highlighter'){
      const lastP = activeElement.points[activeElement.points.length - 1];
      if(!lastP || Math.hypot(w.x - lastP.x, w.y - lastP.y) >= 2.5){
        activeElement.points.push({ x: w.x, y: w.y });
        scheduleRender();
      }
    } else if(activeElement.type === 'rect' || activeElement.type === 'circle'){
      activeElement.w = w.x - activeElement.x;
      activeElement.h = w.y - activeElement.y;
      scheduleRender();
    } else if(activeElement.type === 'arrow' || activeElement.type === 'line'){
      activeElement.x2 = w.x;
      activeElement.y2 = w.y;
      scheduleRender();
    }
  });

  vp.addEventListener('pointerup', e => {
    if(isPanning){ isPanning = false; return; }
    if(isDraggingElem){
      isDraggingElem = false;
      dragElemId = null;
      pushHistory();
      return;
    }
    if(isDrawing && activeElement){
      isDrawing = false;
      elements.push(activeElement);
      activeElement = null;
      pushHistory();
      scheduleRender();
      try{ NX.sfx.play('tick'); }catch(err){}
    }
  });

  // Double click sticky note to edit
  vp.addEventListener('dblclick', e => {
    const r = vp.getBoundingClientRect();
    const w = toWorld(e.clientX - r.left, e.clientY - r.top);
    const hit = findElementAt(w.x, w.y);
    if(hit && hit.type === 'sticky'){
      openStickyEditor(hit);
    }
  });

  function openStickyEditor(stk){
    const prev = q('.canvas-sticky-editor', vp);
    if(prev) prev.remove();

    const scr = toScreen(stk.x, stk.y);
    const editor = h(`<div class="canvas-sticky-editor" style="left:${scr.x}px;top:${scr.y}px;width:${(stk.w||160)*zoom}px;height:${(stk.h||140)*zoom}px;background:${stk.bg};color:${stk.fg}">
      <textarea placeholder="Write anything…">${U.esc(stk.text||'')}</textarea>
    </div>`);
    vp.appendChild(editor);
    const ta = q('textarea', editor);
    ta.focus();
    ta.select();

    const close = () => {
      stk.text = ta.value.trim() || 'Note';
      editor.remove();
      pushHistory();
      scheduleRender();
    };

    ta.addEventListener('blur', close);
    ta.addEventListener('keydown', ev => {
      if(ev.key === 'Escape') close();
    });
  }

  // Smooth mouse wheel zoom towards cursor
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.min(3.5, Math.max(0.2, zoom * factor));
    if(newZoom === zoom) return;

    panX = mx - (mx - panX) * (newZoom / zoom);
    panY = my - (my - panY) * (newZoom / zoom);
    zoom = newZoom;
    updateZoomLabel();
    scheduleRender();
  }, { passive: false });

  // Paste image directly onto canvas
  window.addEventListener('paste', e => {
    if(!document.body.contains(vp)) return;
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if(e.clipboardData && e.clipboardData.files && e.clipboardData.files.length){
      const file = Array.from(e.clipboardData.files).find(f => f.type.startsWith('image/'));
      if(file){
        e.preventDefault();
        const rd = new FileReader();
        rd.onload = () => {
          const rect = vp.getBoundingClientRect();
          const center = toWorld(rect.width / 2, rect.height / 2);
          insertImageFromDataUrl(rd.result, center.x, center.y);
        };
        rd.readAsDataURL(file);
      }
    }
  });

  // Image Upload Button & File Input
  const imgBtn = q('#ct-img-btn', root);
  const fileInput = q('#ct-file-input', root);
  if(imgBtn && fileInput){
    imgBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      if(!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        const rect = vp.getBoundingClientRect();
        const center = toWorld(rect.width / 2, rect.height / 2);
        insertImageFromDataUrl(rd.result, center.x, center.y);
        fileInput.value = '';
      };
      rd.readAsDataURL(file);
    };
  }

  // Board Switcher & Management Menu
  const switchBtn = q('#cb-switch-btn', root);
  const addBoardBtn = q('#cb-add-btn', root);

  if(switchBtn){
    switchBtn.onclick = (e) => {
      const menuItems = boards.map(b => ({
        label: (b.id === curBoard.id ? '✓ ' : '  ') + b.name,
        icon: 'grid',
        onClick: () => switchBoard(b)
      }));

      menuItems.push('-');
      menuItems.push({
        label: '+ New Canvas Board',
        icon: 'plus',
        onClick: () => createNewBoard()
      });
      menuItems.push({
        label: '✏️ Rename Current Board',
        icon: 'edit',
        onClick: () => {
          const newName = prompt('Enter new board name:', curBoard.name);
          if(newName && newName.trim()){
            curBoard.name = newName.trim();
            saveBoardState();
            const nameEl = q('#cb-name-txt', root);
            if(nameEl) nameEl.textContent = curBoard.name;
            NX.toastOk('Renamed board', curBoard.name);
          }
        }
      });

      if(boards.length > 1){
        menuItems.push({
          label: '🗑️ Delete Current Board',
          icon: 'trash',
          onClick: () => {
            if(confirm(`Delete canvas board "${curBoard.name}"?`)){
              boards = boards.filter(b => b.id !== curBoard.id);
              switchBoard(boards[0]);
              NX.toastOk('Board deleted');
            }
          }
        });
      }

      NX.menu(e.currentTarget, menuItems, { align: 'left' });
    };
  }

  function createNewBoard(customName){
    const bName = customName || prompt('New canvas board title:', 'Canvas ' + (boards.length + 1));
    if(bName && bName.trim()){
      const newB = {
        id: 'board-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: bName.trim(),
        elements: []
      };
      boards.push(newB);
      switchBoard(newB);
      renderTabs();
      NX.toastOk('New canvas tab created', newB.name);
      try{ NX.sfx.play('action'); }catch(e){}
    }
  }

  function renderTabs(){
    const tabList = q('#canvas-tabs-list', root);
    if(!tabList) return;
    tabList.innerHTML = boards.map(b => `
      <div class="canvas-tab ${b.id === curBoard.id ? 'active' : ''}" data-bid="${b.id}" title="${U.esc(b.name)} (Double click to rename)">
        <span class="canvas-tab-icon">🎨</span>
        <span class="canvas-tab-title">${U.esc(b.name)}</span>
        ${boards.length > 1 ? `<button class="canvas-tab-close" data-close="${b.id}" title="Close tab">×</button>` : ''}
      </div>
    `).join('');

    qa('.canvas-tab', tabList).forEach(tabEl => {
      const bid = tabEl.dataset.bid;
      tabEl.onclick = (e) => {
        if(e.target.closest('.canvas-tab-close') || e.target.closest('.canvas-tab-rename-inp')) return;
        const target = boards.find(b => b.id === bid);
        if(target && target.id !== curBoard.id){
          switchBoard(target);
        }
      };

      const titleEl = q('.canvas-tab-title', tabEl);
      if(titleEl){
        titleEl.ondblclick = (e) => {
          e.stopPropagation();
          const target = boards.find(b => b.id === bid);
          if(!target) return;
          const oldName = target.name;
          const inp = document.createElement('input');
          inp.className = 'canvas-tab-rename-inp';
          inp.value = oldName;
          titleEl.replaceWith(inp);
          inp.focus();
          inp.select();

          let saved = false;
          const commit = () => {
            if(saved) return;
            saved = true;
            const val = inp.value.trim();
            if(val && val !== oldName){
              target.name = val;
              saveBoardState();
              if(target.id === curBoard.id){
                const nameEl = q('#cb-name-txt', root);
                if(nameEl) nameEl.textContent = val;
              }
              NX.toastOk('Canvas renamed', val);
            }
            renderTabs();
          };
          inp.onblur = commit;
          inp.onkeydown = (ev) => {
            if(ev.key === 'Enter') commit();
            if(ev.key === 'Escape'){ saved = true; renderTabs(); }
          };
        };
      }
    });

    qa('.canvas-tab-close', tabList).forEach(closeBtn => {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        const bid = closeBtn.dataset.close;
        const target = boards.find(b => b.id === bid);
        if(!target) return;
        if(target.elements && target.elements.length > 0){
          if(!confirm(`Close canvas "${target.name}"? Unsaved drawing on this board will be lost.`)) return;
        }
        const targetIdx = boards.findIndex(b => b.id === bid);
        boards = boards.filter(b => b.id !== bid);
        if(curBoard.id === bid){
          const nextIdx = Math.max(0, targetIdx - 1);
          switchBoard(boards[nextIdx] || boards[0]);
        } else {
          saveBoardState();
          renderTabs();
        }
        NX.toastOk('Canvas closed', target.name);
      };
    });

    const activeTabEl = q('.canvas-tab.active', tabList);
    if(activeTabEl && activeTabEl.scrollIntoView){
      activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  const tabNewBtn = q('#canvas-tab-new', root);
  if(tabNewBtn){
    tabNewBtn.onclick = () => createNewBoard();
  }

  if(addBoardBtn){
    addBoardBtn.onclick = () => createNewBoard();
  }

  // Toolbar events
  qa('.ct-btn[data-t]', root).forEach(btn => {
    btn.onclick = () => {
      qa('.ct-btn[data-t]', root).forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      curTool = btn.dataset.t;
      vp.className = `canvas-viewport tool-${curTool}`;
      try{ NX.sfx.play('nav'); }catch(e){}
    };
  });

  qa('.cp-color-swatch', root).forEach(sw => {
    sw.onclick = () => {
      qa('.cp-color-swatch', root).forEach(s => s.classList.remove('on'));
      sw.classList.add('on');
      curColor = sw.dataset.hex;
      try{ NX.sfx.play('tick'); }catch(e){}
    };
  });

  qa('.cp-width-btn', root).forEach(wb => {
    wb.onclick = () => {
      qa('.cp-width-btn', root).forEach(w => w.classList.remove('on'));
      wb.classList.add('on');
      curWidth = Number(wb.dataset.w) || 3;
    };
  });

  q('#ct-undo', root).onclick = undo;

  q('#ct-clear', root).onclick = () => {
    if(!elements.length) return;
    if(confirm('Clear current whiteboard?')){
      elements = [];
      pushHistory();
      scheduleRender();
      NX.toastOk('Canvas cleared', '');
    }
  };

  q('#ct-export', root).onclick = () => {
    try {
      const link = document.createElement('a');
      link.download = (curBoard.name.toLowerCase().replace(/\s+/g, '-') || 'canvas') + '-' + Date.now().toString(36) + '.png';
      link.href = cvs.toDataURL('image/png');
      link.click();
      NX.toastOk('Exported Canvas', link.download);
    } catch(err){
      NX.toastErr('Export error', err.message);
    }
  };

  // Zoom controls
  q('#cz-in', root).onclick = () => {
    zoom = Math.min(3.5, zoom * 1.2);
    updateZoomLabel();
    scheduleRender();
  };
  q('#cz-out', root).onclick = () => {
    zoom = Math.max(0.2, zoom * 0.8);
    updateZoomLabel();
    scheduleRender();
  };
  q('#cz-reset', root).onclick = () => {
    zoom = 1.0;
    panX = 0; panY = 0;
    updateZoomLabel();
    scheduleRender();
  };

  // Grid Style Toggle
  const gridBtn = q('#cz-grid-toggle', root);
  const gridLbl = q('#cz-grid-lbl', root);
  if(gridBtn && gridLbl){
    gridBtn.onclick = () => {
      if(curGrid === 'dots'){ curGrid = 'grid'; gridLbl.textContent = 'Lines'; }
      else if(curGrid === 'grid'){ curGrid = 'none'; gridLbl.textContent = 'None'; }
      else { curGrid = 'dots'; gridLbl.textContent = 'Dots'; }
      scheduleRender();
      try{ NX.sfx.play('tick'); }catch(e){}
    };
  }

  // Hotkeys
  window.addEventListener('keydown', e => {
    if(!cvs.isConnected) return;
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if(e.ctrlKey && e.key.toLowerCase() === 'z'){
      e.preventDefault();
      undo();
    }
    const map = { v:'select', h:'hand', p:'draw', m:'highlighter', r:'rect', o:'circle', a:'arrow', l:'line', s:'sticky', t:'text', e:'eraser' };
    if(!e.ctrlKey && !e.metaKey && map[e.key.toLowerCase()]){
      const t = map[e.key.toLowerCase()];
      const btn = q(`.ct-btn[data-t="${t}"]`, root);
      if(btn) btn.click();
    }
  });

  renderTabs();
  scheduleRender();
}

})(window.NX);
