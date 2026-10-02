/* ============================================================
   PebbleX v0.1 — 40-widget.js
   Desktop Widget:
   - Draggable: native data-tauri-drag-region + in-app drag
   - Mini / Compact mode: toggle between full card & mini pill
   - Quick Note: capture thoughts directly into Notes vault
   - Quick Tasks: check off tasks right from desktop
   - Focus session / Pomodoro control
   - One-click launch to bring full PebbleX app to front
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let isMini = NX.store ? NX.store.get('widgetMini', false) : false;

function widgetHTML(){
  const profile = NX.store.get('profile', NX.defaults.profile);
  const s = NX.store.get('settings', {});
  const t = NX.totals ? NX.totals() : { prod:0, distr:0, total:0 };
  const goalPct = Math.min(100, Math.round((t.prod/60)/(s.focusGoalMin||240)*100));
  const openTasks = NX.store.get('tasks', []).filter(x=>!x.done).slice(0, 2);
  const totalOpenTasks = NX.store.get('tasks', []).filter(x=>!x.done).length;
  const now = new Date();

  return `<div class="widget ${isMini?'mini-mode':''}" id="pebble-widget-box">
    <!-- Header with drag region -->
    <div class="w-head widget-drag-area" data-tauri-drag-region title="Click and drag to move">
      <div class="brand-mark" data-tauri-drag-region>${NX.brandMark()}</div>
      <b data-tauri-drag-region>PebbleX</b>
      <div class="widget-btns">
        <button class="widget-btn-icon" id="wg-mini-toggle" data-tip="${isMini?'Expand widget':'Mini compact mode'}">${isMini?'▼':'▲'}</button>
        <button class="widget-btn-icon" id="wg-open-main" data-tip="Open PebbleX">${icon('rocket',13)}</button>
        <button class="widget-btn-icon" id="wg-close" data-tip="Hide widget">${icon('x',13)}</button>
      </div>
    </div>

    <!-- Mini Mode Content -->
    <div class="w-mini-bar ${isMini?'':'w-hide-mini'}" data-tauri-drag-region>
      <div class="w-mini-clock" id="wg-clock-mini" data-tauri-drag-region>${U.esc(U.hhmm(now))}</div>
      <div class="w-mini-badge" data-tauri-drag-region>Focus ${goalPct}%</div>
      <span class="faint tiny" style="margin-left:auto" data-tauri-drag-region>${totalOpenTasks} task${totalOpenTasks===1?'':'s'}</span>
    </div>

    <!-- Full Mode Content -->
    <div class="w-hide-mini widget-drag-area" data-tauri-drag-region>
      <div class="w-clock" id="wg-clock" data-tauri-drag-region>${U.esc(U.hhmm(now))}</div>
      <div class="w-date" data-tauri-drag-region>${U.esc(now.toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'}))}</div>
    </div>

    <div class="w-score w-hide-mini">
      <span class="w-sec">Focus Goal</span>
      <div class="meter"><i style="width:${goalPct}%"></i></div>
      <b class="small mono-num">${goalPct}%</b>
    </div>

    <div class="w-row w-hide-mini">
      <div class="wr-ic" style="background:var(--green)">${icon('clock')}</div>
      <div style="min-width:0;flex:1"><div class="wr-t">Focus time today</div><div class="wr-v" id="wg-prod">${U.fmtTime(t.prod)}</div></div>
      <button class="btn btn-soft btn-sm" id="wg-pomo-btn" style="padding:4px 8px;font-size:11px">${icon('play',11)} Pomo</button>
    </div>

    <!-- Quick Note Capture -->
    <div class="widget-quick-note w-hide-mini">
      <input id="wg-note-input" placeholder="Quick note… (Enter to save)" maxlength="140">
      <button id="wg-note-save">Save</button>
    </div>

    <!-- Quick Tasks Section -->
    <div class="w-hide-mini" style="display:flex;flex-direction:column;gap:5px">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span class="w-sec">Tasks (${totalOpenTasks})</span>
        <span class="faint tiny" style="cursor:pointer" id="wg-see-all-tasks">view all</span>
      </div>
      <div class="widget-tasks-list" id="wg-tasks-box">
        ${openTasks.length ? openTasks.map(tk => `
          <div class="widget-task-item">
            <input type="checkbox" data-task-id="${tk.id}">
            <span>${U.esc(tk.name || tk.title || 'Untitled')}</span>
          </div>
        `).join('') : '<div class="faint tiny">All tasks complete! 🎉</div>'}
      </div>
    </div>
  </div>`;
}

function attachWidgetEvents(root){
  if(!root) return;

  // Mini mode toggle
  const miniBtn = root.querySelector('#wg-mini-toggle');
  if(miniBtn){
    miniBtn.onclick = (e) => {
      e.stopPropagation();
      isMini = !isMini;
      NX.store.set('widgetMini', isMini);
      const box = root.querySelector('#pebble-widget-box');
      if(box){
        box.classList.toggle('mini-mode', isMini);
        root.querySelectorAll('.w-hide-mini').forEach(el => el.classList.toggle('w-hide-mini', isMini));
        const miniBar = root.querySelector('.w-mini-bar');
        if(miniBar) miniBar.classList.toggle('w-hide-mini', !isMini);
        miniBtn.textContent = isMini ? '▼' : '▲';
      }
    };
  }

  // Open full app
  const openBtn = root.querySelector('#wg-open-main');
  if(openBtn){
    openBtn.onclick = (e) => {
      e.stopPropagation();
      if(NX.native.available){
        NX.native.showMain();
      } else {
        NX.router.go('dashboard');
      }
    };
  }

  // Close widget
  const closeBtn = root.querySelector('#wg-close');
  if(closeBtn){
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      NX.widget.apply(false);
    };
  }

  // Pomodoro quick action
  const pomoBtn = root.querySelector('#wg-pomo-btn');
  if(pomoBtn){
    pomoBtn.onclick = (e) => {
      e.stopPropagation();
      NX.router.go('timeless');
      if(NX.native.available) NX.native.showMain();
      setTimeout(()=>{ if(NX.pomo && NX.pomo.start) NX.pomo.start(); }, 120);
    };
  }

  // Quick note save
  const noteInput = root.querySelector('#wg-note-input');
  const noteSave = root.querySelector('#wg-note-save');
  const handleSaveNote = () => {
    if(!noteInput) return;
    const txt = noteInput.value.trim();
    if(!txt) return;
    const notes = NX.store.get('notes', []);
    const n = {
      id: U.uid('nt'),
      title: txt.slice(0, 40),
      body: txt,
      tags: ['quick-capture'],
      pinned: false,
      updated: Date.now(),
      folder: 'Quick'
    };
    notes.unshift(n);
    NX.store.set('notes', notes);
    noteInput.value = '';
    NX.toastOk('Note saved to vault', n.title);
    NX.sfx.play('ok');
  };
  if(noteSave) noteSave.onclick = handleSaveNote;
  if(noteInput) noteInput.onkeydown = (e) => { if(e.key === 'Enter') handleSaveNote(); };

  // Task checkoff directly in widget
  root.querySelectorAll('[data-task-id]').forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.taskId;
      const tasks = NX.store.get('tasks', []);
      const t = tasks.find(x => x.id === id);
      if(t){
        t.done = true;
        t.doneAt = Date.now();
        NX.store.set('tasks', tasks);
        NX.sfx.play('ok');
        refreshWidget();
      }
    };
  });

  const seeAll = root.querySelector('#wg-see-all-tasks');
  if(seeAll){
    seeAll.onclick = () => {
      NX.router.go('todo');
      if(NX.native.available) NX.native.showMain();
    };
  }

  // Desktop Dragging (Native Tauri startDragging on drag areas)
  root.querySelectorAll('.widget-drag-area').forEach(el => {
    el.onmousedown = (e) => {
      if(e.button !== 0 || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
      if(NX.native.available && NX.native.mode === 'tauri'){
        NX.native.startDragging();
      }
    };
  });
}

function makeInAppDraggable(el){
  let isDown = false, startX, startY, startLeft, startTop;
  el.addEventListener('mousedown', (e) => {
    if(e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
    isDown = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if(!isDown) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = Math.max(10, Math.min(window.innerWidth - el.offsetWidth - 10, startLeft + dx)) + 'px';
    el.style.top = Math.max(10, Math.min(window.innerHeight - el.offsetHeight - 10, startTop + dy)) + 'px';
    el.style.right = 'auto';
  });

  window.addEventListener('mouseup', () => {
    if(isDown){
      isDown = false;
      const pos = { left: el.style.left, top: el.style.top };
      NX.store.set('widgetFloatingPos', pos);
    }
  });
}

function refreshWidget(){
  const box = q('#pebble-widget-box');
  if(!box) return;
  const now = new Date();
  const s = NX.store.get('settings', {});
  const t = NX.totals ? NX.totals() : { prod:0, distr:0 };
  const goalPct = Math.min(100, Math.round((t.prod/60)/(s.focusGoalMin||240)*100));

  const setTxt = (id, txt) => { const el = box.querySelector('#'+id); if(el) el.textContent = txt; };
  setTxt('wg-clock', U.hhmm(now));
  setTxt('wg-clock-mini', U.hhmm(now));
  setTxt('wg-prod', U.fmtTime(t.prod));
  const meter = box.querySelector('.meter i');
  if(meter) meter.style.width = goalPct + '%';
}

const widget = {
  open: false,
  floating: null,

  async toggle(){
    await this.apply(!this.open);
  },

  async apply(forceOpen){
    const s = NX.store.get('settings', {});
    const want = forceOpen !== undefined ? !!forceOpen : !!s.widgetEnabled;
    this.open = want;
    if(forceOpen !== undefined){
      s.widgetEnabled = want;
      NX.store.set('settings', s);
    }

    if(NX.native.available && NX.native.mode === 'tauri'){
      await NX.native.widgetToggle(want);
    } else {
      if(want) this.showFloating();
      else this.hideFloating();
    }
  },

  showFloating(){
    if(this.floating){
      this.floating.style.display = '';
      return;
    }
    const savedPos = NX.store.get('widgetFloatingPos', { left: '', top: '' });
    const posStyle = savedPos.left ? `left:${savedPos.left};top:${savedPos.top};right:auto;` : `right:18px;top:70px;`;

    const el = h(`<div id="nx-float-widget" style="position:fixed;${posStyle}width:290px;z-index:9000">${widgetHTML()}</div>`);
    document.getElementById('nx-widget-root').appendChild(el);
    this.floating = el;
    attachWidgetEvents(el);
    makeInAppDraggable(el);
    refreshWidget();
  },

  hideFloating(){
    if(this.floating){
      this.floating.remove();
      this.floating = null;
    }
  }
};

NX.widget = widget;

/* Router registration for dedicated Tauri widget window */
NX.router.register('widget', {
  title: 'Pebble Widget',
  layout: 'widget',
  icon: 'widget',
  render(app){
    document.documentElement.classList.add('widget-mode');
    document.body.classList.add('widget-mode');
    const splash = document.getElementById('nx-splash');
    if(splash) try{ splash.remove(); }catch(e){}
    app.innerHTML = '';
    let root = document.getElementById('nx-widget-root');
    if(!root){
      root = document.createElement('div');
      root.id = 'nx-widget-root';
      document.body.appendChild(root);
    }
    root.innerHTML = widgetHTML();
    attachWidgetEvents(root);
    setInterval(refreshWidget, 1000);
  }
});

setInterval(() => { if(widget.floating) refreshWidget(); }, 1000);
NX.events.on('notifs:changed', () => { if(widget.floating) refreshWidget(); });
})(window.NX);
