/* ============================================================
   PebbleX 3.0 — 36-planner.js
   Day Planner & Time Blocking:
   - Interactive daily timeline (06:00 to 23:00) with 30-min slots
   - Live Current-Time indicator bar
   - Direct integration with Microsoft To-Do tasks
   - Drag & drop tasks to schedule into time slots
   - 1-click "Start Focus" launching Timeless focus session
   - Smart AI Auto-Plan: automatically fills open day slots
   - Day progress tracking, completion metrics, and category themes
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const CATEGORIES = [
  { id:'deep',     name:'Deep Work',    color:'#7CD56E', bg:'rgba(124, 213, 110, 0.18)' },
  { id:'meeting',  name:'Meeting',      color:'#5EB8FF', bg:'rgba(94, 184, 255, 0.18)' },
  { id:'admin',    name:'Admin & Email',color:'#F5A623', bg:'rgba(245, 166, 35, 0.18)' },
  { id:'learning', name:'Study/Reading',color:'#B37FEB', bg:'rgba(179, 127, 235, 0.18)' },
  { id:'personal', name:'Health/Break', color:'#2EB5A0', bg:'rgba(46, 181, 160, 0.18)' }
];

function getCategory(catId){
  return CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
}

function plannerBlocks(){
  return NX.store.get('planner_blocks', []);
}

function savePlannerBlocks(blocks){
  NX.store.set('planner_blocks', blocks);
}

function formatMinutes(min){
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m < 10 ? '0' : ''}${m} ${ampm}`;
}

function parseTimeString(timeStr){
  if(!timeStr) return 9 * 60;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function toInputTime(min){
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}`;
}

NX.routeInShell('planner', 'Day Planner', 'calendar', function(view){
  let curDate = new Date();
  let dateKey = curDate.toISOString().slice(0, 10);
  let timerInterval = null;

  function setDate(d){
    curDate = d;
    dateKey = curDate.toISOString().slice(0, 10);
    renderHeader();
    renderTimeline();
    renderSidebar();
  }

  view.innerHTML = `
    <div class="page planner-root">
      <!-- Planner Top Header -->
      <div class="planner-head card p-12">
        <div class="row gap-8">
          <button class="icon-btn sm" id="pl-prev-day" data-tip="Previous day">${icon('chevL')}</button>
          <button class="btn btn-soft btn-sm" id="pl-today-btn">Today</button>
          <button class="icon-btn sm" id="pl-next-day" data-tip="Next day">${icon('chevR')}</button>
          <b style="font-size:16px;margin-left:4px" id="pl-date-title">Date</b>
        </div>
        <div class="row gap-10">
          <div class="row gap-8" id="pl-metrics-bar"></div>
          <button class="btn btn-green btn-sm" id="pl-add-block-btn">${icon('plus')} Add Block</button>
          <button class="btn btn-soft btn-sm" id="pl-autoplan-btn" data-tip="Auto-schedule pending To-Do tasks into free slots">${icon('ai')} Auto-Plan Day</button>
        </div>
      </div>

      <!-- Main Planner Body: Timeline (Left) + Tasks Backlog (Right) -->
      <div class="planner-main">
        <!-- Daily Timeline -->
        <div class="planner-timeline-wrap" id="pl-timeline-wrap">
          <div id="pl-time-indicator" class="planner-time-indicator"></div>
          <div id="pl-slots-container"></div>
        </div>

        <!-- Sidebar: Unscheduled Tasks -->
        <div class="planner-sidebar card">
          <div class="row gap-8" style="padding:12px 14px 8px;border-bottom:1px solid var(--line);justify-content:space-between">
            <span class="faint tiny bold" style="text-transform:uppercase;letter-spacing:.05em">${icon('todo',12)} Tasks to Schedule</span>
            <button class="btn btn-soft btn-sm" id="pl-go-todo" style="height:22px;font-size:10.5px">Open Tasks</button>
          </div>
          <div class="planner-unscheduled-list" id="pl-unscheduled-list"></div>
        </div>
      </div>
    </div>
  `;

  function renderHeader(){
    const isToday = new Date().toISOString().slice(0, 10) === dateKey;
    const titleEl = q('#pl-date-title', view);
    if(titleEl){
      titleEl.innerHTML = `${isToday ? '<span class="pill green" style="margin-right:6px">Today</span>' : ''}${curDate.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric', year:'numeric' })}`;
    }

    const blocks = plannerBlocks().filter(b => b.date === dateKey);
    let totalMin = 0, doneMin = 0;
    blocks.forEach(b => {
      const dur = Math.max(15, (b.endMin || 0) - (b.startMin || 0));
      totalMin += dur;
      if(b.done) doneMin += dur;
    });

    const metricsEl = q('#pl-metrics-bar', view);
    if(metricsEl){
      const totalHours = (totalMin / 60).toFixed(1);
      const doneHours = (doneMin / 60).toFixed(1);
      const pct = totalMin > 0 ? Math.round((doneMin / totalMin) * 100) : 0;
      metricsEl.innerHTML = `
        <div class="row gap-6 faint tiny">
          <span>Scheduled: <b>${totalHours}h</b></span> ·
          <span>Completed: <b style="color:var(--green)">${doneHours}h</b></span>
        </div>
        <div style="width:70px;height:6px;background:var(--surface-3);border-radius:99px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--green);border-radius:99px;transition:width .3s"></div>
        </div>
      `;
    }
  }

  function renderTimeline(){
    const container = q('#pl-slots-container', view);
    if(!container) return;
    container.innerHTML = '';

    // Timeline runs from 06:00 (360 min) to 23:00 (1380 min)
    const START_HOUR = 6;
    const END_HOUR = 23;
    const HOUR_HEIGHT = 60; // 60px per hour = 1px per minute

    for(let h = START_HOUR; h <= END_HOUR; h++){
      const hourRow = h(`<div class="planner-hour-row" style="height:${HOUR_HEIGHT}px" data-hour="${h}">
        <div class="planner-hour-label">${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}</div>
        <div class="planner-hour-slot" data-hour="${h}"></div>
      </div>`);

      const slot = q('.planner-hour-slot', hourRow);
      slot.onclick = (e) => {
        if(e.target !== slot) return;
        const rect = slot.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const addMin = y > 30 ? 30 : 0;
        promptNewBlock(h * 60 + addMin);
      };

      // Drag and drop task into slot
      slot.ondragover = (e) => {
        e.preventDefault();
        slot.style.background = 'var(--surface-3)';
      };
      slot.ondragleave = () => { slot.style.background = ''; };
      slot.ondrop = (e) => {
        e.preventDefault();
        slot.style.background = '';
        const taskId = e.dataTransfer.getData('text/plain') || window.__draggedTaskId;
        if(taskId){
          const tasks = NX.store.get('tasks', []);
          const t = tasks.find(x => x.id === taskId);
          if(t){
            scheduleTaskAt(t, h * 60);
          }
        }
      };

      container.appendChild(hourRow);
    }

    // Render Blocks
    const blocks = plannerBlocks().filter(b => b.date === dateKey);
    const timelineWrap = q('#pl-timeline-wrap', view);

    blocks.forEach(b => {
      const topOffset = (b.startMin - START_HOUR * 60); // 1px per min
      const duration = Math.max(20, b.endMin - b.startMin);
      const cat = getCategory(b.category);

      const blockEl = h(`<div class="planner-block ${b.done ? 'done' : ''}" style="top:${topOffset}px;height:${duration - 4}px;--p-color:${cat.color};--p-bg:${cat.bg};opacity:${b.done ? 0.6 : 1}" data-id="${b.id}">
        <div class="planner-block-top">
          <span class="planner-block-title ${b.done ? 'line-through' : ''}">
            ${b.done ? '✓ ' : ''}${U.esc(b.title)}
          </span>
          <span class="planner-block-time">${formatMinutes(b.startMin)} – ${formatMinutes(b.endMin)}</span>
        </div>
        <div class="row gap-4" style="margin-top:auto;justify-content:flex-end">
          <button class="btn btn-sm btn-soft pl-focus-btn" data-tip="Start Focus" style="height:20px;font-size:10px;padding:0 6px">${icon('target',11)} Focus</button>
          <button class="icon-btn sm pl-check-btn" data-tip="${b.done ? 'Mark incomplete' : 'Mark complete'}" style="width:20px;height:20px">${icon('check',11)}</button>
          <button class="icon-btn sm pl-del-btn" data-tip="Delete block" style="width:20px;height:20px;color:var(--red)">${icon('trash',11)}</button>
        </div>
      </div>`);

      q('.pl-focus-btn', blockEl).onclick = (e) => {
        e.stopPropagation();
        startFocusBlock(b);
      };

      q('.pl-check-btn', blockEl).onclick = (e) => {
        e.stopPropagation();
        b.done = !b.done;
        savePlannerBlocks(plannerBlocks());
        renderHeader();
        renderTimeline();
        NX.sfx.play('tick');
        // If linked to a To-Do task, update it as well
        if(b.taskId){
          const allTasks = NX.store.get('tasks', []);
          const t = allTasks.find(x => x.id === b.taskId);
          if(t){
            t.done = b.done;
            NX.store.set('tasks', allTasks);
          }
        }
      };

      q('.pl-del-btn', blockEl).onclick = (e) => {
        e.stopPropagation();
        NX.confirm('Delete Block?', `Remove "${b.title}" from your schedule?`, () => {
          const all = plannerBlocks().filter(x => x.id !== b.id);
          savePlannerBlocks(all);
          renderHeader();
          renderTimeline();
          NX.toastOk('Block removed');
        });
      };

      blockEl.onclick = () => editBlock(b);

      container.appendChild(blockEl);
    });

    updateTimeIndicator();
  }

  function updateTimeIndicator(){
    const ind = q('#pl-time-indicator', view);
    if(!ind) return;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    if(todayStr !== dateKey){
      ind.style.display = 'none';
      return;
    }
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const START_MIN = 6 * 60;
    const END_MIN = 23 * 60;
    if(currentMin < START_MIN || currentMin > END_MIN){
      ind.style.display = 'none';
      return;
    }
    ind.style.display = 'block';
    ind.style.top = `${currentMin - START_MIN}px`;
  }

  function renderSidebar(){
    const listEl = q('#pl-unscheduled-list', view);
    if(!listEl) return;
    const allTasks = NX.store.get('tasks', []).filter(t => !t.done);
    const scheduledTaskIds = new Set(plannerBlocks().filter(b => b.date === dateKey).map(b => b.taskId).filter(Boolean));
    const unscheduled = allTasks.filter(t => !scheduledTaskIds.has(t.id));

    if(!unscheduled.length){
      listEl.innerHTML = `<div class="empty faint tiny" style="padding:20px;text-align:center">All tasks are scheduled! 🎉</div>`;
      return;
    }

    listEl.innerHTML = unscheduled.map(t => `
      <div class="planner-task-item" draggable="true" data-id="${t.id}">
        <span style="font-size:12px">${t.priority==='high'?'🔴':'📋'}</span>
        <span class="ellipsis" style="flex:1">${U.esc(t.title)}</span>
        <button class="btn btn-sm btn-soft pl-quick-sched" data-id="${t.id}" style="height:22px;font-size:10px;padding:0 6px">+ Slot</button>
      </div>
    `).join('');

    qa('.planner-task-item', listEl).forEach(el => {
      el.ondragstart = (e) => {
        window.__draggedTaskId = el.dataset.id;
        e.dataTransfer.setData('text/plain', el.dataset.id);
      };
      el.ondragend = () => { window.__draggedTaskId = null; };
    });

    qa('.pl-quick-sched', listEl).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const taskId = btn.dataset.id;
        const task = allTasks.find(x => x.id === taskId);
        if(task) promptScheduleTask(task);
      };
    });
  }

  function promptNewBlock(startMinutes){
    const defaultStart = startMinutes !== undefined ? startMinutes : 9 * 60;
    const defaultEnd = defaultStart + 60;

    const body = h(`<div>
      <div class="field"><label>Block Title</label><input class="input" id="pb-title" placeholder="e.g. Deep Work on API, Team Standup"></div>
      <div class="row gap-8" style="margin-top:10px">
        <div class="field" style="flex:1"><label>Start Time</label><input type="time" class="input" id="pb-start" value="${toInputTime(defaultStart)}"></div>
        <div class="field" style="flex:1"><label>End Time</label><input type="time" class="input" id="pb-end" value="${toInputTime(defaultEnd)}"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Category</label>
        <select class="select" id="pb-cat">
          ${CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
    </div>`);

    NX.modal({
      title: 'New Time Block',
      icon: 'calendar',
      body,
      footer: [
        { label: 'Cancel', cls: 'btn-soft' },
        { label: 'Create Block', cls: 'btn-green', onClick: () => {
          const title = (q('#pb-title', body).value || '').trim() || 'Focus Session';
          const startMin = parseTimeString(q('#pb-start', body).value);
          const endMin = Math.max(startMin + 15, parseTimeString(q('#pb-end', body).value));
          const cat = q('#pb-cat', body).value;

          const newB = {
            id: U.uid('pb'),
            date: dateKey,
            title,
            startMin,
            endMin,
            category: cat,
            done: false
          };
          const all = plannerBlocks();
          all.push(newB);
          savePlannerBlocks(all);
          NX.closeAllModals();
          renderHeader();
          renderTimeline();
          NX.toastOk('Block scheduled', `${formatMinutes(startMin)} - ${formatMinutes(endMin)}`);
          NX.sfx.play('pop');
        }}
      ]
    });
    setTimeout(() => q('#pb-title', body)?.focus(), 50);
  }

  function editBlock(b){
    const body = h(`<div>
      <div class="field"><label>Block Title</label><input class="input" id="pb-edit-title" value="${U.esc(b.title)}"></div>
      <div class="row gap-8" style="margin-top:10px">
        <div class="field" style="flex:1"><label>Start Time</label><input type="time" class="input" id="pb-edit-start" value="${toInputTime(b.startMin)}"></div>
        <div class="field" style="flex:1"><label>End Time</label><input type="time" class="input" id="pb-edit-end" value="${toInputTime(b.endMin)}"></div>
      </div>
      <div class="field" style="margin-top:10px"><label>Category</label>
        <select class="select" id="pb-edit-cat">
          ${CATEGORIES.map(c => `<option value="${c.id}" ${b.category===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
    </div>`);

    NX.modal({
      title: 'Edit Time Block',
      icon: 'calendar',
      body,
      footer: [
        { label: 'Cancel', cls: 'btn-soft' },
        { label: 'Save Changes', cls: 'btn-green', onClick: () => {
          b.title = (q('#pb-edit-title', body).value || '').trim() || b.title;
          b.startMin = parseTimeString(q('#pb-edit-start', body).value);
          b.endMin = Math.max(b.startMin + 15, parseTimeString(q('#pb-edit-end', body).value));
          b.category = q('#pb-edit-cat', body).value;
          savePlannerBlocks(plannerBlocks());
          NX.closeAllModals();
          renderHeader();
          renderTimeline();
          NX.toastOk('Block updated');
        }}
      ]
    });
  }

  function promptScheduleTask(task){
    // Find next available free 60-min slot starting from 9 AM
    const blocks = plannerBlocks().filter(b => b.date === dateKey).sort((a,b) => a.startMin - b.startMin);
    let startMin = 9 * 60;
    for(const b of blocks){
      if(startMin + 45 <= b.startMin) break;
      if(b.endMin > startMin) startMin = b.endMin;
    }
    promptNewBlock(startMin);
    setTimeout(() => {
      const titleInp = q('#pb-title');
      if(titleInp) titleInp.value = task.title;
    }, 60);
  }

  function scheduleTaskAt(task, startMin){
    const newB = {
      id: U.uid('pb'),
      date: dateKey,
      title: task.title,
      startMin: startMin,
      endMin: startMin + 60,
      category: task.priority === 'high' ? 'deep' : 'admin',
      done: task.done,
      taskId: task.id
    };
    const all = plannerBlocks();
    all.push(newB);
    savePlannerBlocks(all);
    renderHeader();
    renderTimeline();
    renderSidebar();
    NX.toastOk('Task scheduled', task.title);
    NX.sfx.play('pop');
  }

  function startFocusBlock(b){
    NX.router.go('timeless');
    setTimeout(() => {
      if(NX.setTimelessTarget){
        NX.setTimelessTarget(b.title);
      }
      NX.toastOk('Target set to Focus Block', b.title);
    }, 100);
  }

  function autoPlanDay(){
    const tasks = NX.store.get('tasks', []).filter(t => !t.done);
    if(!tasks.length){
      NX.toastInfo('No pending tasks', 'All tasks are completed!');
      return;
    }

    const blocks = plannerBlocks().filter(b => b.date === dateKey).sort((a,b) => a.startMin - b.startMin);
    const scheduledTaskIds = new Set(blocks.map(b => b.taskId).filter(Boolean));
    const toSchedule = tasks.filter(t => !scheduledTaskIds.has(t.id));

    if(!toSchedule.length){
      NX.toastInfo('All tasks scheduled', 'All active tasks are already in your day plan.');
      return;
    }

    let cursor = 9 * 60; // 09:00 AM
    let addedCount = 0;
    const allBlocks = plannerBlocks();

    toSchedule.slice(0, 5).forEach(task => {
      // Find gap of 45-60 min
      while(cursor < 18 * 60){
        const conflict = blocks.find(b => cursor < b.endMin && (cursor + 45) > b.startMin);
        if(!conflict) break;
        cursor = conflict.endMin + 15; // 15 min buffer
      }

      if(cursor + 45 <= 19 * 60){
        const duration = task.priority === 'high' ? 60 : 45;
        const newB = {
          id: U.uid('pb'),
          date: dateKey,
          title: task.title,
          startMin: cursor,
          endMin: cursor + duration,
          category: task.priority === 'high' ? 'deep' : 'admin',
          done: false,
          taskId: task.id
        };
        allBlocks.push(newB);
        blocks.push(newB);
        cursor += duration + 15;
        addedCount++;
      }
    });

    if(addedCount > 0){
      savePlannerBlocks(allBlocks);
      renderHeader();
      renderTimeline();
      renderSidebar();
      NX.toastOk(`✨ Auto-Planned ${addedCount} Tasks!`, 'Check out your optimized schedule.');
      NX.sfx.play('ok');
    } else {
      NX.toastInfo('Schedule full', 'Not enough free time slots between 09:00 and 19:00.');
    }
  }

  // Event wiring
  q('#pl-prev-day', view).onclick = () => {
    const d = new Date(curDate);
    d.setDate(d.getDate() - 1);
    setDate(d);
  };
  q('#pl-next-day', view).onclick = () => {
    const d = new Date(curDate);
    d.setDate(d.getDate() + 1);
    setDate(d);
  };
  q('#pl-today-btn', view).onclick = () => setDate(new Date());
  q('#pl-add-block-btn', view).onclick = () => promptNewBlock();
  q('#pl-autoplan-btn', view).onclick = autoPlanDay;
  q('#pl-go-todo', view).onclick = () => NX.router.go('todo');

  setDate(new Date());

  timerInterval = setInterval(updateTimeIndicator, 30000);
  view.addEventListener('cleanup', () => clearInterval(timerInterval));
});

})(window.NX);
