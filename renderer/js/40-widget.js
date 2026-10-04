/* ============================================================
   PebbleX v0.1 — 40-widget.js
   Desktop Widget Island (5-in-1 Switchable Widget):
   1. Tasks: Interactive checklist, inline add, drag & drop reorder, drop capture
   2. Focus: Pomodoro focus timer with presets (25m/5m/15m), countdown & rounds
   3. Notes: Auto-saving scratchpad, quick vault save, recent notes & drop capture
   4. Timeless: Active foreground app tracking, focus vs distraction ratio bar
   5. Glance: Large digital clock, date, greeting, daily goal ring & streak stats
   - Mini / Compact mode capsule (88px)
   - Native window dragging & in-app floating drag
   - Open full PebbleX app safely without shell-inside-widget corruption
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let isMini = NX.store ? NX.store.get('widgetMini', false) : false;
let activeTab = NX.store ? NX.store.get('widgetTab', 'tasks') : 'tasks';

/* Pomodoro widget state */
const pomo = {
  running: false,
  mode: 'focus', // 'focus' (25), 'short' (5), 'long' (15)
  seconds: 25 * 60,
  total: 25 * 60,
  rounds: NX.store ? NX.store.get('widgetPomoRounds', 0) : 0,
  timerId: null
};

function setPomoMode(mode){
  pomo.mode = mode;
  pomo.running = false;
  if(pomo.timerId){ clearInterval(pomo.timerId); pomo.timerId = null; }
  if(mode === 'short') pomo.total = pomo.seconds = 5 * 60;
  else if(mode === 'long') pomo.total = pomo.seconds = 15 * 60;
  else pomo.total = pomo.seconds = 25 * 60;
  refreshPomoUI();
}

function togglePomo(){
  if(pomo.running){
    pomo.running = false;
    if(pomo.timerId){ clearInterval(pomo.timerId); pomo.timerId = null; }
    NX.sfx && NX.sfx.play && NX.sfx.play('toggle');
  } else {
    pomo.running = true;
    NX.sfx && NX.sfx.play && NX.sfx.play('ok');
    pomo.timerId = setInterval(() => {
      if(pomo.seconds > 0){
        pomo.seconds--;
        refreshPomoUI();
      } else {
        pomo.running = false;
        clearInterval(pomo.timerId);
        pomo.timerId = null;
        if(pomo.mode === 'focus'){
          pomo.rounds = (pomo.rounds || 0) + 1;
          NX.store && NX.store.set('widgetPomoRounds', pomo.rounds);
          if(NX.native && NX.native.available){
            NX.native.notify('Focus session complete! 🎉', 'Awesome focus round! Take a quick 5m break.');
          }
          setPomoMode('short');
        } else {
          if(NX.native && NX.native.available){
            NX.native.notify('Break finished! ⚡', 'Ready for your next focus round?');
          }
          setPomoMode('focus');
        }
        NX.sfx && NX.sfx.play && NX.sfx.play('chime');
      }
    }, 1000);
  }
  refreshPomoUI();
}

function resetPomo(){
  pomo.running = false;
  if(pomo.timerId){ clearInterval(pomo.timerId); pomo.timerId = null; }
  pomo.seconds = pomo.total;
  refreshPomoUI();
  NX.sfx && NX.sfx.play && NX.sfx.play('tick');
}

function refreshPomoUI(){
  const box = document.getElementById('pebble-widget-box');
  if(!box) return;
  const timeEl = box.querySelector('#wg-pomo-clock');
  if(timeEl) timeEl.textContent = U.fmtClock(pomo.seconds);
  const toggleBtn = box.querySelector('#wg-pomo-toggle');
  if(toggleBtn){
    toggleBtn.innerHTML = pomo.running ? `${icon('pause',14)} Pause` : `${icon('play',14)} Start Focus`;
    toggleBtn.classList.toggle('btn-green', !pomo.running);
    toggleBtn.classList.toggle('btn-soft', pomo.running);
  }
  const roundEl = box.querySelector('#wg-pomo-rounds');
  if(roundEl) roundEl.textContent = `Round ${pomo.rounds + 1} · ${pomo.rounds} completed`;
  const ring = box.querySelector('#wg-pomo-meter');
  if(ring){
    const pct = Math.max(0, Math.min(100, Math.round(((pomo.total - pomo.seconds) / pomo.total) * 100)));
    ring.style.width = pct + '%';
  }
}

function widgetHTML(){
  const profile = NX.store ? NX.store.get('profile', NX.defaults.profile) : { name: 'Master' };
  const s = NX.store ? NX.store.get('settings', {}) : {};
  const t = NX.totals ? NX.totals() : { prod:0, distr:0, total:0 };
  const goalMin = s.focusGoalMin || 240;
  const goalPct = Math.min(100, Math.round((t.prod/60) / goalMin * 100));
  const tasks = NX.store ? NX.store.get('tasks', []) : [];
  const openTasks = tasks.filter(x => !x.done);
  const totalOpenTasks = openTasks.length;
  const draftNote = NX.store ? NX.store.get('widgetNoteDraft', '') : '';
  const recentNotes = (NX.store ? NX.store.get('notes', []) : []).filter(n => !n.trash).slice(0, 3);
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return `<div class="widget ${isMini?'mini-mode':''}" id="pebble-widget-box">
    <!-- Header with drag region -->
    <div class="w-head widget-drag-area" data-tauri-drag-region title="Click and drag to move">
      <div class="brand-mark" data-tauri-drag-region>${NX.brandMark ? NX.brandMark() : 'P'}</div>
      <b data-tauri-drag-region>PebbleX</b>
      <div class="widget-btns">
        <button class="widget-btn-icon" id="wg-mini-toggle" data-tip="${isMini?'Expand widget':'Mini compact mode'}">${isMini?'▼':'▲'}</button>
        <button class="widget-btn-icon" id="wg-open-main" data-tip="Open PebbleX">${icon('rocket',13)}</button>
        <button class="widget-btn-icon" id="wg-close" data-tip="Hide widget">${icon('x',13)}</button>
      </div>
    </div>

    <!-- Mini Mode Capsule Bar -->
    <div class="w-mini-bar" data-tauri-drag-region>
      <div class="w-mini-clock" id="wg-clock-mini" data-tauri-drag-region>${U.esc(U.hhmm(now))}</div>
      <div class="w-mini-badge" data-tauri-drag-region>Focus ${goalPct}%</div>
      <span class="faint tiny" style="margin-left:auto" data-tauri-drag-region>${totalOpenTasks} task${totalOpenTasks===1?'':'s'}</span>
      <button class="btn btn-soft btn-sm" id="wg-mini-pomo-btn" style="padding:2px 8px;font-size:10.5px">${icon('play',10)} Pomo</button>
    </div>

    <!-- 5 Switchable Tabs Pill Bar (Full Mode) -->
    <div class="wg-nav w-hide-mini" role="tablist">
      <button class="wg-tab-btn ${activeTab==='tasks'?'active':''}" data-tab="tasks" title="Tasks">${icon('todo',12)} Tasks</button>
      <button class="wg-tab-btn ${activeTab==='focus'?'active':''}" data-tab="focus" title="Focus">${icon('target',12)} Focus</button>
      <button class="wg-tab-btn ${activeTab==='notes'?'active':''}" data-tab="notes" title="Notes">${icon('notes',12)} Notes</button>
      <button class="wg-tab-btn ${activeTab==='timeless'?'active':''}" data-tab="timeless" title="Screen">${icon('clock',12)} Screen</button>
      <button class="wg-tab-btn ${activeTab==='glance'?'active':''}" data-tab="glance" title="Glance">${icon('dashboard',12)} Glance</button>
    </div>

    <!-- Tab 1: Tasks Widget -->
    <div class="wg-tab-pane w-hide-mini ${activeTab==='tasks'?'active':''}" id="wg-pane-tasks">
      <div class="wg-task-input-wrap">
        <input id="wg-new-task-inp" placeholder="+ Add task… (Enter to save)" maxlength="120">
        <button id="wg-new-task-btn" title="Add task">${icon('plus',12)}</button>
      </div>
      <div class="wg-tasks-header">
        <span class="w-sec">To-Do (${totalOpenTasks})</span>
        <span class="faint tiny link" id="wg-see-all-tasks">Open Tasks</span>
      </div>
      <div class="wg-tasks-list" id="wg-tasks-list">
        ${renderTasksHTML(tasks)}
      </div>
      <div class="wg-drop-hint">💡 Drag tasks to reorder · Drop text to add task</div>
    </div>

    <!-- Tab 2: Focus / Pomodoro Widget -->
    <div class="wg-tab-pane w-hide-mini ${activeTab==='focus'?'active':''}" id="wg-pane-focus">
      <div class="wg-pomo-presets">
        <button class="wg-preset-btn ${pomo.mode==='focus'?'active':''}" data-pomo-mode="focus">25m Focus</button>
        <button class="wg-preset-btn ${pomo.mode==='short'?'active':''}" data-pomo-mode="short">5m Break</button>
        <button class="wg-preset-btn ${pomo.mode==='long'?'active':''}" data-pomo-mode="long">15m Break</button>
      </div>
      <div class="wg-pomo-display">
        <div class="wg-pomo-clock" id="wg-pomo-clock">${U.fmtClock(pomo.seconds)}</div>
        <div class="wg-pomo-round-chip" id="wg-pomo-rounds">Round ${pomo.rounds + 1} · ${pomo.rounds} completed</div>
        <div class="wg-pomo-meter-track"><div class="wg-pomo-meter-fill" id="wg-pomo-meter" style="width:${Math.round(((pomo.total-pomo.seconds)/pomo.total)*100)}%"></div></div>
      </div>
      <div class="wg-pomo-actions">
        <button class="btn ${pomo.running?'btn-soft':'btn-green'}" id="wg-pomo-toggle">${pomo.running ? `${icon('pause',14)} Pause` : `${icon('play',14)} Start Focus`}</button>
        <button class="btn btn-soft" id="wg-pomo-reset">${icon('refresh',12)} Reset</button>
      </div>
    </div>

    <!-- Tab 3: Notes / Quick Scratchpad -->
    <div class="wg-tab-pane w-hide-mini ${activeTab==='notes'?'active':''}" id="wg-pane-notes">
      <div class="wg-notes-card">
        <textarea id="wg-note-scratch" placeholder="Type thoughts or drop text/files here…" rows="5">${U.esc(draftNote)}</textarea>
        <div class="wg-notes-actions">
          <button class="btn btn-green btn-sm" id="wg-note-save-vault">${icon('check',12)} Save to Vault</button>
          <button class="btn btn-soft btn-sm" id="wg-note-clear">Clear</button>
          <span class="faint tiny" id="wg-note-status" style="margin-left:auto">Auto-saving</span>
        </div>
      </div>
      <div class="wg-recent-notes">
        <div class="w-sec" style="margin-bottom:4px">Recent Vault Notes</div>
        ${recentNotes.length ? recentNotes.map(n => `
          <div class="wg-recent-note-row" data-note-id="${n.id}">
            <span class="wg-rn-title">${U.esc(n.title || 'Untitled')}</span>
            <span class="faint tiny">${U.relTime(n.updated || Date.now())}</span>
          </div>
        `).join('') : '<div class="faint tiny">No vault notes yet.</div>'}
      </div>
    </div>

    <!-- Tab 4: Timeless / Screen Time -->
    <div class="wg-tab-pane w-hide-mini ${activeTab==='timeless'?'active':''}" id="wg-pane-timeless">
      <div class="wg-active-app-card">
        <div class="wr-ic" style="background:var(--blue)">${icon('window',14)}</div>
        <div style="flex:1;min-width:0">
          <div class="wr-t">Active Window</div>
          <div class="wr-v" id="wg-fg-name">PebbleX</div>
        </div>
        <span class="pill green sm" id="wg-fg-status">Productive</span>
      </div>
      <div class="wg-time-split">
        <div class="w-sec" style="display:flex;justify-content:space-between">
          <span>Today's Ratio</span>
          <b class="mono-num">${U.fmtTime(t.prod)} / ${U.fmtTime(t.total || t.prod + t.distr)}</b>
        </div>
        <div class="wg-ratio-meter">
          <div class="wg-rm-prod" style="width:${goalPct}%"></div>
          <div class="wg-rm-distr" style="width:${Math.min(100 - goalPct, Math.round((t.distr/60)/goalMin*100))}%"></div>
        </div>
      </div>
      <div class="wg-stat-grid">
        <div class="wg-stat-box">
          <span class="faint tiny">Focus Time</span>
          <b id="wg-time-prod">${U.fmtTime(t.prod)}</b>
        </div>
        <div class="wg-stat-box">
          <span class="faint tiny">Distraction</span>
          <b id="wg-time-distr">${U.fmtTime(t.distr)}</b>
        </div>
      </div>
    </div>

    <!-- Tab 5: Glance / Daily Dashboard -->
    <div class="wg-tab-pane w-hide-mini ${activeTab==='glance'?'active':''}" id="wg-pane-glance">
      <div class="wg-glance-clock-box">
        <div class="wg-glance-clock" id="wg-glance-clock">${U.esc(U.hhmm(now))}</div>
        <div class="wg-glance-date" id="wg-glance-date">${U.esc(now.toLocaleDateString(undefined,{weekday:'long', month:'short', day:'numeric'}))}</div>
        <div class="wg-glance-greeting">${U.esc(greeting)}, ${U.esc(profile.name || 'Friend')} 👋</div>
      </div>
      <div class="wg-glance-meter-wrap">
        <div class="w-sec" style="display:flex;justify-content:space-between">
          <span>Daily Focus Goal</span>
          <b class="mono-num">${goalPct}%</b>
        </div>
        <div class="meter"><i style="width:${goalPct}%"></i></div>
      </div>
      <div class="wg-stat-grid">
        <div class="wg-stat-box">
          <span class="faint tiny">Tasks Due</span>
          <b>${totalOpenTasks}</b>
        </div>
        <div class="wg-stat-box">
          <span class="faint tiny">Streak</span>
          <b>${profile.streak || 1} days 🔥</b>
        </div>
      </div>
    </div>
  </div>`;
}

function renderTasksHTML(tasks){
  const open = (tasks || []).filter(x => !x.done).slice(0, 5);
  if(!open.length){
    return '<div class="faint tiny" style="padding:10px 0;text-align:center">All tasks completed! 🎉</div>';
  }
  return open.map(t => `
    <div class="widget-task-item" draggable="true" data-id="${t.id}">
      <span class="wg-drag-grip" title="Drag to reorder">⋮⋮</span>
      <input type="checkbox" data-task-id="${t.id}" ${t.done?'checked':''}>
      <span class="wg-task-text ${t.done?'done':''}">${U.esc(t.name || t.title || 'Untitled')}</span>
    </div>
  `).join('');
}

function attachWidgetEvents(root){
  if(!root) return;

  // Tab switching
  root.querySelectorAll('.wg-tab-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const tab = btn.dataset.tab;
      activeTab = tab;
      NX.store && NX.store.set('widgetTab', tab);
      root.querySelectorAll('.wg-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      root.querySelectorAll('.wg-tab-pane').forEach(p => p.classList.toggle('active', p.id === 'wg-pane-' + tab));
      NX.sfx && NX.sfx.play && NX.sfx.play('nav');
    };
  });

  // Mini mode toggle
  const miniBtn = root.querySelector('#wg-mini-toggle');
  if(miniBtn){
    miniBtn.onclick = async (e) => {
      e.stopPropagation();
      isMini = !isMini;
      NX.store && NX.store.set('widgetMini', isMini);
      const box = root.querySelector('#pebble-widget-box');
      if(box){
        box.classList.toggle('mini-mode', isMini);
        miniBtn.textContent = isMini ? '▼' : '▲';
        miniBtn.dataset.tip = isMini ? 'Expand widget' : 'Mini compact mode';
        miniBtn.setAttribute('title', isMini ? 'Expand widget' : 'Mini compact mode');
        miniBtn.setAttribute('aria-label', isMini ? 'Expand widget' : 'Mini compact mode');
      }
      try{
        if(NX.native && NX.native.available && typeof NX.native.widgetSize === 'function'){
          await NX.native.widgetSize(isMini);
        }
      }catch(err){}
    };
  }

  // Mini Pomo button
  const miniPomo = root.querySelector('#wg-mini-pomo-btn');
  if(miniPomo){
    miniPomo.onclick = (e) => {
      e.stopPropagation();
      togglePomo();
    };
  }

  // Open full app window safely
  const openMain = () => {
    try{
      if(NX.native && NX.native.available && typeof NX.native.showMain === 'function'){
        NX.native.showMain('#/dashboard');
      }
    }catch(e){}
  };

  const openBtn = root.querySelector('#wg-open-main');
  if(openBtn) openBtn.onclick = (e) => { e.stopPropagation(); openMain(); };

  // Close widget
  const closeBtn = root.querySelector('#wg-close');
  if(closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); NX.widget.apply(false); };

  // Jump to tasks
  const seeAll = root.querySelector('#wg-see-all-tasks');
  if(seeAll){
    seeAll.onclick = () => {
      if(NX.native && NX.native.available && typeof NX.native.showMain === 'function'){
        NX.native.showMain('#/todo');
      }
    };
  }

  // Tasks Add
  const taskInp = root.querySelector('#wg-new-task-inp');
  const taskAddBtn = root.querySelector('#wg-new-task-btn');
  const handleAddTask = () => {
    if(!taskInp) return;
    const txt = taskInp.value.trim();
    if(!txt) return;
    const tasks = NX.store ? NX.store.get('tasks', []) : [];
    const t = {
      id: U.uid('tk'),
      name: txt,
      cat: 'all',
      col: 'today',
      created: Date.now(),
      done: false
    };
    tasks.unshift(t);
    NX.store && NX.store.set('tasks', tasks);
    taskInp.value = '';
    NX.sfx && NX.sfx.play && NX.sfx.play('ok');
    refreshTasksList(root);
  };
  if(taskAddBtn) taskAddBtn.onclick = handleAddTask;
  if(taskInp) taskInp.onkeydown = (e) => { if(e.key === 'Enter') handleAddTask(); };

  // Task checkoff & Task Drag and Drop
  wireTaskCheckboxes(root);
  wireTaskDragReorder(root);

  // Focus / Pomodoro events
  root.querySelectorAll('[data-pomo-mode]').forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      root.querySelectorAll('[data-pomo-mode]').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      setPomoMode(b.dataset.pomoMode);
    };
  });
  const pomoToggle = root.querySelector('#wg-pomo-toggle');
  if(pomoToggle) pomoToggle.onclick = () => togglePomo();
  const pomoReset = root.querySelector('#wg-pomo-reset');
  if(pomoReset) pomoReset.onclick = () => resetPomo();

  // Notes scratchpad autosave & vault save
  const scratch = root.querySelector('#wg-note-scratch');
  const saveVault = root.querySelector('#wg-note-save-vault');
  const clearNote = root.querySelector('#wg-note-clear');
  const noteStatus = root.querySelector('#wg-note-status');

  if(scratch){
    scratch.oninput = () => {
      NX.store && NX.store.set('widgetNoteDraft', scratch.value);
      if(noteStatus){
        noteStatus.textContent = 'Draft auto-saved';
        setTimeout(() => { if(noteStatus) noteStatus.textContent = 'Auto-saving'; }, 1500);
      }
    };
  }

  if(saveVault){
    saveVault.onclick = () => {
      if(!scratch) return;
      const val = scratch.value.trim();
      if(!val) return;
      const notes = NX.store ? NX.store.get('notes', []) : [];
      const lines = val.split('\n');
      const title = lines[0].replace(/^[#\s]+/, '').slice(0, 50) || 'Quick Note';
      const n = {
        id: U.uid('nt'),
        title,
        body: val,
        tags: ['quick-capture', 'widget'],
        updated: Date.now(),
        pinned: false,
        folder: 'Quick'
      };
      notes.unshift(n);
      NX.store && NX.store.set('notes', notes);
      scratch.value = '';
      NX.store && NX.store.set('widgetNoteDraft', '');
      NX.toastOk('Note saved to vault', title);
      NX.sfx && NX.sfx.play && NX.sfx.play('ok');
      refreshRecentNotes(root);
    };
  }

  if(clearNote){
    clearNote.onclick = () => {
      if(scratch){
        scratch.value = '';
        NX.store && NX.store.set('widgetNoteDraft', '');
        NX.sfx && NX.sfx.play && NX.sfx.play('tick');
      }
    };
  }

  // External Drag & Drop capture onto widget
  const box = root.querySelector('#pebble-widget-box') || root;
  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.classList.add('drag-hover');
  });
  box.addEventListener('dragleave', () => {
    box.classList.remove('drag-hover');
  });
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('drag-hover');
    const text = e.dataTransfer.getData('text/plain');
    if(text && text.trim()){
      if(activeTab === 'notes'){
        if(scratch){
          scratch.value = (scratch.value ? scratch.value + '\n\n' : '') + text.trim();
          NX.store && NX.store.set('widgetNoteDraft', scratch.value);
          NX.toastOk('Snippet dropped into scratchpad');
          NX.sfx && NX.sfx.play && NX.sfx.play('ok');
        }
      } else {
        const tasks = NX.store ? NX.store.get('tasks', []) : [];
        const t = { id: U.uid('tk'), name: text.trim().slice(0, 100), created: Date.now(), done: false };
        tasks.unshift(t);
        NX.store && NX.store.set('tasks', tasks);
        NX.toastOk('Task added from drop', t.name);
        NX.sfx && NX.sfx.play && NX.sfx.play('ok');
        refreshTasksList(root);
      }
    }
  });

  // Desktop Dragging (Native Tauri / Electron)
  root.querySelectorAll('.widget-drag-area').forEach(el => {
    el.onmousedown = (e) => {
      if(e.button !== 0 || e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if(NX.native && NX.native.available && typeof NX.native.startDragging === 'function'){
        NX.native.startDragging();
      }
    };
  });
}

function wireTaskCheckboxes(root){
  root.querySelectorAll('[data-task-id]').forEach(cb => {
    cb.onchange = () => {
      const id = cb.dataset.taskId;
      const tasks = NX.store ? NX.store.get('tasks', []) : [];
      const t = tasks.find(x => x.id === id);
      if(t){
        t.done = cb.checked;
        if(t.done) t.doneAt = Date.now();
        else delete t.doneAt;
        NX.store && NX.store.set('tasks', tasks);
        NX.sfx && NX.sfx.play && NX.sfx.play('ok');
        refreshWidget();
      }
    };
  });
}

function wireTaskDragReorder(root){
  const list = root.querySelector('#wg-tasks-list');
  if(!list) return;
  let draggedId = null;

  list.querySelectorAll('.widget-task-item').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      draggedId = item.dataset.id;
      window.__draggedWidgetTaskId = draggedId;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', draggedId); } catch(err){}
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      window.__draggedWidgetTaskId = null;
      list.querySelectorAll('.widget-task-item').forEach(i => i.classList.remove('drag-over'));
    });
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch(err){}
      item.classList.add('drag-over');
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      const targetId = item.dataset.id;
      const actualId = draggedId || window.__draggedWidgetTaskId || e.dataTransfer.getData('text/plain');
      if(!actualId || actualId === targetId) return;
      const tasks = NX.store ? NX.store.get('tasks', []) : [];
      const fromIdx = tasks.findIndex(x => x.id === actualId);
      const toIdx = tasks.findIndex(x => x.id === targetId);
      if(fromIdx !== -1 && toIdx !== -1){
        const [moved] = tasks.splice(fromIdx, 1);
        tasks.splice(toIdx, 0, moved);
        NX.store && NX.store.set('tasks', tasks);
        NX.sfx && NX.sfx.play && NX.sfx.play('tick');
        refreshTasksList(root);
      }
    });
  });
}

function refreshTasksList(root){
  const list = root.querySelector('#wg-tasks-list');
  if(!list) return;
  const tasks = NX.store ? NX.store.get('tasks', []) : [];
  list.innerHTML = renderTasksHTML(tasks);
  wireTaskCheckboxes(root);
  wireTaskDragReorder(root);
  const openCount = tasks.filter(x => !x.done).length;
  const sec = root.querySelector('#wg-pane-tasks .w-sec');
  if(sec) sec.textContent = `To-Do (${openCount})`;
}

function refreshRecentNotes(root){
  const wrap = root.querySelector('.wg-recent-notes');
  if(!wrap) return;
  const notes = (NX.store ? NX.store.get('notes', []) : []).filter(n => !n.trash).slice(0, 3);
  wrap.innerHTML = `<div class="w-sec" style="margin-bottom:4px">Recent Vault Notes</div>` +
    (notes.length ? notes.map(n => `
      <div class="wg-recent-note-row" data-note-id="${n.id}">
        <span class="wg-rn-title">${U.esc(n.title || 'Untitled')}</span>
        <span class="faint tiny">${U.relTime(n.updated || Date.now())}</span>
      </div>
    `).join('') : '<div class="faint tiny">No vault notes yet.</div>');
}

function refreshWidget(){
  const box = document.getElementById('pebble-widget-box');
  if(!box) return;
  const now = new Date();
  const s = NX.store ? NX.store.get('settings', {}) : {};
  const t = NX.totals ? NX.totals() : { prod:0, distr:0, total:0 };
  const goalMin = s.focusGoalMin || 240;
  const goalPct = Math.min(100, Math.round((t.prod/60) / goalMin * 100));

  const setTxt = (id, txt) => { const el = box.querySelector('#'+id); if(el) el.textContent = txt; };
  setTxt('wg-clock-mini', U.hhmm(now));
  setTxt('wg-glance-clock', U.hhmm(now));
  setTxt('wg-time-prod', U.fmtTime(t.prod));
  setTxt('wg-time-distr', U.fmtTime(t.distr));

  const meter = box.querySelector('.wg-glance-meter-wrap .meter i');
  if(meter) meter.style.width = goalPct + '%';

  // Read active window if native bridge is present
  if(NX.native && NX.native.available && typeof NX.native.activeWindow === 'function'){
    NX.native.activeWindow().then(w => {
      if(w && w.name){
        const nameEl = box.querySelector('#wg-fg-name');
        if(nameEl) nameEl.textContent = w.name;
      }
    }).catch(()=>{});
  }
}

function makeInAppDraggable(el){
  let isDown = false, startX, startY, startLeft, startTop;
  el.addEventListener('mousedown', (e) => {
    if(e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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
      NX.store && NX.store.set('widgetFloatingPos', pos);
    }
  });
}

const widget = {
  open: false,
  floating: null,

  async toggle(){
    await this.apply(!this.open);
  },

  async apply(forceOpen){
    const s = NX.store ? NX.store.get('settings', {}) : {};
    const want = forceOpen !== undefined ? !!forceOpen : !!s.widgetEnabled;
    this.open = want;
    if(forceOpen !== undefined && NX.store){
      s.widgetEnabled = want;
      NX.store.set('settings', s);
    }

    if(NX.native && NX.native.available && (NX.native.mode === 'tauri' || NX.native.mode === 'electron')){
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
    const savedPos = NX.store ? NX.store.get('widgetFloatingPos', { left: '', top: '' }) : {};
    const posStyle = savedPos.left ? `left:${savedPos.left};top:${savedPos.top};right:auto;` : `right:18px;top:70px;`;

    const el = h(`<div id="nx-float-widget" style="position:fixed;${posStyle}width:320px;z-index:9000">${widgetHTML()}</div>`);
    let root = document.getElementById('nx-widget-root');
    if(!root){
      root = document.createElement('div');
      root.id = 'nx-widget-root';
      document.body.appendChild(root);
    }
    root.appendChild(el);
    this.floating = el;
    attachWidgetEvents(el);
    makeInAppDraggable(el);
    refreshWidget();
    ensureWidgetTicker();
  },

  hideFloating(){
    if(this.floating){
      this.floating.remove();
      this.floating = null;
    }
    ensureWidgetTicker();
  }
};

NX.widget = widget;

/* Router registration for dedicated widget window */
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
    ensureWidgetTicker();

    if(isMini){
      try{
        if(NX.native && NX.native.available && typeof NX.native.widgetSize === 'function'){
          NX.native.widgetSize(true);
        }
      }catch(e){}
    }
  }
});

const widgetIsMounted = () => !!(document.getElementById('pebble-widget-box') || (widget && widget.floating));
let widgetTicker = null;
function ensureWidgetTicker(){
  if(widgetIsMounted()){
    if(!widgetTicker){
      widgetTicker = setInterval(() => {
        if(widgetIsMounted()) refreshWidget();
        else { clearInterval(widgetTicker); widgetTicker = null; }
      }, 1000);
    }
  } else if(widgetTicker){
    clearInterval(widgetTicker);
    widgetTicker = null;
  }
}
NX.events && NX.events.on && NX.events.on('notifs:changed', () => { if(widgetIsMounted()) refreshWidget(); });

})(window.NX);
