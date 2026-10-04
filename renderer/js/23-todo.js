/* ============================================================
   Pebble 3.3 — 23-todo.js
   Microsoft To Do style Tasks Manager:
   - Smart lists: ☀️ My Day, ⭐ Important, 📅 Planned, 📋 All Tasks, ✅ Completed
   - Custom Lists / Categories: Create, Rename, Delete, Color picker
   - Top Quick "+ Add a task" bar with Enter to create
   - Microsoft To Do Slide-over Detail Flyout Panel:
     • Subtask steps checklist with checkboxes & add step
     • My Day toggle (☀️ Add to My Day)
     • Due date presets (Today, Tomorrow, Next Week, Pick Date)
     • Remind Me (presets & custom)
     • Repeat (Daily, Weekdays, Weekly, Monthly)
     • List / Category picker
     • 📝 Mention / Link Note from Notes Tracker (with preview & 1-click jump to Note)
     • Multi-line Notes textarea (autosaving)
     • Created date & Delete button
   - List View & Kanban Board View toggle
   - Drag & drop on Kanban board & drag between lists
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const SMART_LISTS = [
  { id:'my-day',    name:'My Day',    ic:'sun',    color:'var(--orange)', target:'focus today' },
  { id:'important', name:'Important', ic:'star',   color:'var(--orange)', target:'high priority' },
  { id:'planned',   name:'Planned',   ic:'calendar', color:'var(--blue)',  target:'scheduled' },
  { id:'all',       name:'Tasks',     ic:'check',  color:'var(--green)', target:'all items' },
  { id:'completed', name:'Completed', ic:'check',  color:'var(--ink-3)', target:'finished' }
];

const DEFAULT_CUSTOM_LISTS = [
  { id:'work',     name:'Work',     color:'#5EB8FF', ic:'layers' },
  { id:'personal', name:'Personal', color:'#7CD56E', ic:'user' },
  { id:'shopping', name:'Shopping', color:'#FFB84D', ic:'grid' },
  { id:'learn',    name:'Learning', color:'#A78BFA', ic:'book' }
];

let curList = 'my-day';
let activeTaskId = null;
let quickDue = '';
let quickImportant = false;

/* ---------------- Store helpers ---------------- */
function tasks(){ return NX.store.get('tasks', []); }
function saveTasks(t){ NX.store.set('tasks', t); NX.refreshBadges(); }

function customLists(){
  let l = NX.store.get('todo_lists', null);
  if(!l || !Array.isArray(l) || !l.length){
    l = DEFAULT_CUSTOM_LISTS;
    NX.store.set('todo_lists', l);
  }
  return l;
}
function saveCustomLists(l){ NX.store.set('todo_lists', l); }

function linkedTime(taskId){
  const sess = NX.store.get('sessions', []).filter(s=>s.taskId===taskId);
  return sess.reduce((n,s)=>n+s.sec, 0);
}

function dueChip(t){
  if(!t.due || t.done) return '';
  const today = U.todayKey();
  const overdue = t.due < today;
  const isToday = t.due === today;
  const isTomorrow = t.due === U.todayKey(new Date(Date.now()+86400e3));
  let label = t.due;
  if(isToday) label = 'Today';
  else if(isTomorrow) label = 'Tomorrow';

  if(overdue) return `<span class="tc-time overdue">${icon('bell',12)} Overdue · ${U.esc(label)}</span>`;
  if(isToday) return `<span class="tc-time soon" style="color:var(--blue)">${icon('calendar',12)} Due today</span>`;
  if(isTomorrow) return `<span class="tc-time" style="color:var(--purple)">${icon('calendar',12)} Due tomorrow</span>`;
  return `<span class="tc-time">${icon('calendar',12)} ${U.esc(label)}</span>`;
}

function categoryBadge(t){
  const lists = customLists();
  const found = lists.find(x => x.id === t.cat || x.id === t.listId);
  if(!found) return '';
  return `<span class="pill sm" style="background:${found.color}22;color:${found.color};font-weight:700">${U.esc(found.name)}</span>`;
}

function notesList(){
  return NX.store.get('notes', []).filter(n => !n.trash);
}

/* ---------------- New Task Modal (Legacy & Global shortcut) ---------------- */
NX.newTask = function(defaultCat){
  const lists = customLists();
  const body = h(`<div>
    <div class="field" style="margin-bottom:12px"><label>Task title</label><input class="input" id="ntk-name" placeholder="What needs doing?"></div>
    <div class="row gap-10" style="margin-bottom:12px">
      <div class="field grow"><label>List / Category</label>
        <select class="select" id="ntk-cat">
          <option value="all">Default Tasks</option>
          ${lists.map(c=>`<option value="${c.id}" ${c.id===defaultCat?'selected':''}>${U.esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field grow"><label>Due date</label><input class="input" id="ntk-due" type="date"></div>
    </div>
    <div class="row gap-10" style="margin-bottom:12px">
      <label class="row gap-8 small bold" style="cursor:pointer">
        <input type="checkbox" id="ntk-myday"> ☀️ Add to My Day
      </label>
      <label class="row gap-8 small bold" style="cursor:pointer">
        <input type="checkbox" id="ntk-imp"> ⭐ Mark as Important
      </label>
    </div>
    <div class="field" style="margin-bottom:12px"><label>Note (optional)</label><textarea class="textarea" id="ntk-note" rows="2" placeholder="Extra context or details…"></textarea></div>
  </div>`);

  NX.modal({
    title: 'New Task',
    icon: 'todo',
    body,
    footer: [
      { label:'Cancel', cls:'btn-soft' },
      { label:'Add Task', cls:'btn-green', onClick: () => {
        const name = q('#ntk-name', body).value.trim();
        if(!name){ q('#ntk-name', body).focus(); return; }
        const list = tasks();
        const newTask = {
          id: U.uid('tk'),
          name,
          cat: q('#ntk-cat', body).value,
          col: 'today',
          due: q('#ntk-due', body).value || '',
          note: q('#ntk-note', body).value.trim(),
          myDay: q('#ntk-myday', body).checked,
          myDayDate: q('#ntk-myday', body).checked ? U.todayKey() : '',
          important: q('#ntk-imp', body).checked,
          steps: [],
          created: Date.now(),
          timeLinked: 0,
          done: false
        };
        list.unshift(newTask);
        saveTasks(list);
        NX.closeAllModals();
        NX.sfx.play('ok');
        if(NX.router.currentName === 'todo' && window.__nx_refreshTodoView){
          window.__nx_refreshTodoView();
        } else {
          NX.router.go('todo');
        }
      }}
    ]
  });
  setTimeout(()=>q('#ntk-name', body) && q('#ntk-name', body).focus(), 40);
};

/* ---------------- Module View ---------------- */
NX.routeInShell('todo', 'Tasks', 'todo', function(view){
  const viewMode = NX.store.get('ui:todoView', 'list') === 'board' ? 'board' : 'list';
  /* declared before the template — the header reads selectMode */
  let picked = new Set();
  let selectMode = false;

  view.innerHTML = `
  <div class="page" style="height:100%;padding-bottom:0">
    <div class="mstodo-container">
      <!-- Left Microsoft To Do Sidebar -->
      <div class="mstodo-sidebar">
        <div class="mstodo-smart-lists" id="mstodo-smart-lists"></div>
        <div class="mstodo-divider"></div>
        <div class="mstodo-custom-header">
          <span>Custom Lists</span>
          <button class="icon-btn sm" id="mstodo-add-list-btn" data-tip="New list" style="width:22px;height:22px">${icon('plus',12)}</button>
        </div>
        <div class="mstodo-smart-lists" id="mstodo-custom-lists"></div>
      </div>

      <!-- Main Tasks Content -->
      <div class="mstodo-main">
        <div class="mstodo-header">
          <div class="mstodo-title" id="mstodo-cur-title">
            <span id="mstodo-title-ic">☀️</span>
            <span id="mstodo-title-text">My Day</span>
          </div>
          <span style="flex:1"></span>
          <div class="seg sm" id="td-view-seg" role="tablist">
            <button role="tab" class="${viewMode==='list'?'on':''}" data-v="list">List</button>
            <button role="tab" class="${viewMode==='board'?'on':''}" data-v="board">Board</button>
          </div>
          <button class="icon-btn sm" id="td-select-toggle" data-tip="Select multiple tasks for bulk actions" style="color:${selectMode?'var(--green-deep)':'var(--ink-3)'}">${icon('check',15)}</button>
          <button class="btn btn-dark btn-sm" id="td-new">${icon('plus')} Add Task</button>
        </div>

        <!-- Quick Add Task Bar -->
        <div class="mstodo-quick-add" id="mstodo-quick-bar">
          <button class="mstodo-check-btn" type="button" tabindex="-1" style="cursor:default">${icon('plus',14)}</button>
          <input id="mstodo-quick-input" placeholder="Add a task (press Enter)">
          <button class="icon-btn sm" id="mstodo-quick-mic" data-tip="Dictate task by voice" style="color:var(--red,#ef4444)">${icon('mic',14)}</button>
          <button class="icon-btn sm" id="mstodo-quick-due" data-tip="Add due date">${icon('calendar',14)}</button>
          <button class="icon-btn sm" id="mstodo-quick-star" data-tip="Mark important">${icon('star',14)}</button>
          <button class="btn btn-green btn-sm" id="mstodo-quick-submit">Add</button>
        </div>

        <!-- Scrollable Tasks or Kanban -->
        <div class="mstodo-tasks-scroll" id="td-content"></div>
      </div>
      <div id="td-bulk"></div>

      <!-- Right Detail Flyout Panel -->
      <div class="mstodo-detail-panel" id="mstodo-detail" style="display:none"></div>
    </div>
  </div>`;

  const inputEl = q('#mstodo-quick-input', view);
  const detailPanel = q('#mstodo-detail', view);

  function getFilteredTasks(){
    const list = tasks();
    const today = U.todayKey();

    if(curList === 'my-day'){
      return list.filter(t => !t.done && (t.myDay || t.myDayDate === today || t.due === today));
    }
    if(curList === 'important'){
      return list.filter(t => !t.done && t.important);
    }
    if(curList === 'planned'){
      return list.filter(t => !t.done && t.due);
    }
    if(curList === 'completed'){
      return list.filter(t => t.done);
    }
    if(curList === 'all'){
      return list.filter(t => !t.done);
    }
    // Custom list
    return list.filter(t => (t.cat === curList || t.listId === curList));
  }

  function renderSidebar(){
    const all = tasks();
    const today = U.todayKey();
    const smartCounts = {
      'my-day': all.filter(t => !t.done && (t.myDay || t.myDayDate === today || t.due === today)).length,
      'important': all.filter(t => !t.done && t.important).length,
      'planned': all.filter(t => !t.done && t.due).length,
      'all': all.filter(t => !t.done).length,
      'completed': all.filter(t => t.done).length
    };

    const smartHost = q('#mstodo-smart-lists', view);
    smartHost.innerHTML = SMART_LISTS.map(l => `
      <button class="mstodo-nav-item ${curList===l.id?'active':''}" data-list="${l.id}">
        <span class="nav-ic" style="color:${l.color}">
          ${l.ic==='sun'?'☀️':l.ic==='star'?'⭐':l.ic==='calendar'?'📅':l.id==='completed'?'✅':'📋'}
        </span>
        <span>${U.esc(l.name)}</span>
        <span class="nav-count">${smartCounts[l.id] || 0}</span>
      </button>
    `).join('');

    function wireSidebarDrop(item){
      item.addEventListener('dragover', e => {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch(err){}
        item.classList.add('dragover');
      });
      item.addEventListener('dragleave', e => {
        if(e.relatedTarget && item.contains(e.relatedTarget)) return;
        item.classList.remove('dragover');
      });
      item.addEventListener('drop', e => {
        e.preventDefault();
        item.classList.remove('dragover');
        const id = window.__draggedTaskId || e.dataTransfer.getData('text/plain');
        if(!id) return;
        const list = tasks();
        const t = list.find(x => x.id === id);
        if(!t) return;
        const targetList = item.dataset.list;
        if(targetList === 'my-day'){
          t.myDay = true; t.myDayDate = U.todayKey();
          NX.toastOk('Added to My Day', t.name);
        } else if(targetList === 'important'){
          t.important = true;
          NX.toastOk('Marked Important', t.name);
        } else if(targetList === 'planned'){
          if(!t.due) t.due = U.todayKey();
          NX.toastOk('Scheduled in Planned', t.name);
        } else if(targetList === 'completed'){
          t.done = true; t.col = 'done';
          NX.toastOk('Marked Complete', t.name);
        } else if(targetList === 'all'){
          t.done = false;
          NX.toastOk('Moved to Tasks', t.name);
        } else {
          t.cat = targetList;
          t.listId = targetList;
          const foundCl = customLists().find(x => x.id === targetList);
          NX.toastOk('Moved to ' + (foundCl ? foundCl.name : 'List'), t.name);
        }
        saveTasks(list);
        renderSidebar();
        renderMain();
        NX.sfx.play('pop');
      });
    }

    qa('.mstodo-nav-item', smartHost).forEach(b => {
      b.onclick = () => {
        curList = b.dataset.list;
        renderSidebar();
        renderHeader();
        renderMain();
      };
      wireSidebarDrop(b);
    });

    const cLists = customLists();
    const customHost = q('#mstodo-custom-lists', view);
    customHost.innerHTML = cLists.map(cl => {
      const cnt = all.filter(t => !t.done && (t.cat === cl.id || t.listId === cl.id)).length;
      return `
        <button class="mstodo-nav-item ${curList===cl.id?'active':''}" data-list="${cl.id}">
          <span class="nav-ic"><i style="width:10px;height:10px;border-radius:50%;background:${cl.color};display:inline-block"></i></span>
          <span class="ellipsis" style="flex:1">${U.esc(cl.name)}</span>
          <span class="nav-count">${cnt}</span>
        </button>
      `;
    }).join('');

    qa('.mstodo-nav-item', customHost).forEach(b => {
      b.onclick = () => {
        curList = b.dataset.list;
        renderSidebar();
        renderHeader();
        renderMain();
      };
      wireSidebarDrop(b);
      b.oncontextmenu = (e) => {
        e.preventDefault();
        const cl = cLists.find(x => x.id === b.dataset.list);
        if(!cl) return;
        NX.menu(e, [
          { label: 'Rename List…', icon: 'edit', onClick: () => promptRenameList(cl) },
          { label: 'Change Color…', icon: 'star', onClick: () => promptListColor(cl) },
          '-',
          { label: 'Delete List', icon: 'trash', danger: true, onClick: () => promptDeleteList(cl) }
        ]);
      };
    });

    q('#mstodo-add-list-btn', view).onclick = promptAddList;
  }

  function renderHeader(){
    const smart = SMART_LISTS.find(l => l.id === curList);
    const custom = customLists().find(l => l.id === curList);
    const icEl = q('#mstodo-title-ic', view);
    const textEl = q('#mstodo-title-text', view);

    if(smart){
      icEl.textContent = smart.ic==='sun'?'☀️':smart.ic==='star'?'⭐':smart.ic==='calendar'?'📅':smart.id==='completed'?'✅':'📋';
      textEl.textContent = smart.name;
    } else if(custom){
      icEl.innerHTML = `<i style="width:14px;height:14px;border-radius:50%;background:${custom.color};display:inline-block"></i>`;
      textEl.textContent = custom.name;
    } else {
      icEl.textContent = '📋';
      textEl.textContent = 'Tasks';
    }
  }

  function promptAddList(){
    const body = h(`<div>
      <div class="field" style="margin-bottom:12px"><label>List Name</label><input class="input" id="new-lst-name" placeholder="e.g. Work, Project X, Groceries"></div>
      <div class="field"><label>List Color</label>
        <div class="row gap-8" id="new-lst-colors" style="margin-top:6px">
          ${['#5EB8FF','#7CD56E','#FFB84D','#A78BFA','#FF6B6B','#20C997','#F06595','#4DABF7'].map(c=>`
            <span class="color-dot" data-c="${c}" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;display:inline-block;box-shadow:0 1px 3px rgba(0,0,0,.2)"></span>
          `).join('')}
        </div>
      </div>
    </div>`);

    let chosenColor = '#5EB8FF';
    qa('.color-dot', body).forEach(dot => {
      dot.onclick = () => {
        chosenColor = dot.dataset.c;
        qa('.color-dot', body).forEach(d => d.style.outline = '');
        dot.style.outline = '2px solid var(--ink)';
      };
    });

    NX.modal({
      title: 'New List',
      icon: 'layers',
      body,
      footer: [
        { label: 'Cancel', cls: 'btn-soft' },
        { label: 'Create', cls: 'btn-green', onClick: () => {
          const name = q('#new-lst-name', body).value.trim();
          if(!name) return;
          const lists = customLists();
          const id = 'list_' + Date.now();
          lists.push({ id, name, color: chosenColor, ic: 'layers' });
          saveCustomLists(lists);
          curList = id;
          NX.closeAllModals();
          renderSidebar(); renderHeader(); renderMain();
          NX.toastOk('List created', name);
        }}
      ]
    });
    setTimeout(() => q('#new-lst-name', body) && q('#new-lst-name', body).focus(), 40);
  }

  function promptRenameList(cl){
    const body = h(`<div>
      <div class="field"><label>Rename List</label><input class="input" id="ren-lst-name" value="${U.esc(cl.name)}"></div>
    </div>`);
    NX.modal({
      title: 'Rename List',
      icon: 'edit',
      body,
      footer: [
        { label: 'Cancel', cls: 'btn-soft' },
        { label: 'Save', cls: 'btn-green', onClick: () => {
          const name = q('#ren-lst-name', body).value.trim();
          if(!name) return;
          cl.name = name;
          saveCustomLists(customLists());
          NX.closeAllModals();
          renderSidebar(); renderHeader();
        }}
      ]
    });
  }

  function promptListColor(cl){
    const body = h(`<div>
      <div class="field"><label>Choose Color</label>
        <div class="row gap-8" style="margin-top:8px">
          ${['#5EB8FF','#7CD56E','#FFB84D','#A78BFA','#FF6B6B','#20C997','#F06595','#4DABF7'].map(c=>`
            <span class="color-dot" data-c="${c}" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;display:inline-block"></span>
          `).join('')}
        </div>
      </div>
    </div>`);
    qa('.color-dot', body).forEach(dot => {
      dot.onclick = () => {
        cl.color = dot.dataset.c;
        saveCustomLists(customLists());
        NX.closeAllModals();
        renderSidebar(); renderHeader(); renderMain();
      };
    });
    NX.modal({ title: 'List Color', icon: 'star', body, footer: [{ label: 'Cancel', cls: 'btn-soft' }] });
  }

  function promptDeleteList(cl){
    NX.confirm('Delete List?', `Delete list "${cl.name}"? Tasks in this list will be kept in All Tasks.`, () => {
      const lists = customLists().filter(x => x.id !== cl.id);
      saveCustomLists(lists);
      if(curList === cl.id) curList = 'my-day';
      renderSidebar(); renderHeader(); renderMain();
      NX.toastOk('List deleted');
    });
  }

  /* ---------------- multi-select + bulk actions ---------------- */
  function renderBulkBar(){
    const bar = q('#td-bulk', view);
    if(!bar) return;
    if(!picked.size){
      if(bar._built){ bar.innerHTML = ''; bar._built = false; }
      return;
    }
    bar._built = true;
    bar.innerHTML = `<div class="bulk-bar">
      <span class="bulk-n">${picked.size} selected</span>
      <button class="btn" data-bulk="done">${icon('check')} Complete</button>
      <button class="btn" data-bulk="today">${icon('sun')} My Day</button>
      <button class="btn" data-bulk="week">${icon('calendar')} Planned</button>
      <button class="btn" data-bulk="important">${icon('star')} Star</button>
      <button class="btn" data-bulk="delete">${icon('trash')} Delete</button>
      <button class="icon-btn" id="bulk-x" data-tip="Clear selection">${icon('x')}</button>
    </div>`;
    qa('[data-bulk]', bar).forEach(b=>b.onclick = ()=>bulk(b.dataset.bulk));
    q('#bulk-x', bar).onclick = ()=>{ picked.clear(); syncPicks(); renderBulkBar(); };
  }

  function syncPicks(){
    qa('[data-pick]', view).forEach(el=>{
      const on = picked.has(el.dataset.pick);
      el.classList.toggle('on', on);
      const row = el.closest('.mstodo-task-item, .task-card, .mstodo-row, li');
      row && row.classList.toggle('picked', on);
    });
  }

  function bulk(kind){
    const ids = Array.from(picked);
    if(!ids.length) return;
    const list = tasks();
    const snapshot = JSON.parse(JSON.stringify(list));
    const hit = list.filter(t=>ids.includes(t.id));

    if(kind === 'delete'){
      NX.store.set('tasks', list.filter(t=>!ids.includes(t.id)));
    } else if(kind === 'done'){
      hit.forEach(t=>{ t.done = !t.done; if(t.done){ t.doneAt = Date.now(); t.col='done'; } else { delete t.doneAt; t.col='today'; } });
      NX.store.set('tasks', list);
      NX.sfx.play('ok');
    } else if(kind === 'important'){
      hit.forEach(t=> t.important = !t.important);
      NX.store.set('tasks', list);
    } else {
      hit.forEach(t=>{ t.col = kind; });
      NX.store.set('tasks', list);
      NX.sfx.play('tick');
    }

    picked.clear();
    saveTasks(NX.store.get('tasks', []));
    renderSidebar();
    renderMain();
    renderBulkBar();

    const label = { delete:'deleted', done:'updated', important:'updated', today:'moved to My Day', week:'moved to Planned' }[kind] || 'updated';
    NX.undoable(`${ids.length} task${ids.length===1?'':'s'} ${label}`, hit.map(t=>t.name).slice(0,2).join(', '), ()=>{
      NX.store.set('tasks', snapshot);
      saveTasks(snapshot);
      renderSidebar();
      renderMain();
      renderBulkBar();
      NX.toastOk('Restored', ids.length + ' task' + (ids.length===1?'':'s'));
    }, { life:7000 });
  }

  function togglePick(id){
    if(picked.has(id)) picked.delete(id); else picked.add(id);
    if(!picked.size && !selectMode){ /* keep selectMode sticky until toggled off */ }
    syncPicks();
    renderBulkBar();
  }

  function setSelectMode(on){
    selectMode = on !== undefined ? on : !selectMode;
    const host = q('#td-select-toggle', view);
    if(host) host.classList.toggle('active', selectMode);
    if(!selectMode){ picked.clear(); }
    renderSidebar();
    renderMain();
    syncPicks();
    renderBulkBar();
  }

  function renderMain(){
    const content = q('#td-content', view);
    const v = NX.store.get('ui:todoView', 'list');

    if(v === 'board'){
      renderKanban(content);
    } else {
      renderListView(content);
    }
    if(selectMode || picked.size){
      qa('.mstodo-task-item .mstodo-check-btn', content).forEach(btn=>{
        btn.style.display = 'none';
      });
    } else {
      qa('.mstodo-task-item .mstodo-check-btn', content).forEach(btn=>{
        btn.style.display = '';
      });
    }
    /* inject pick checkboxes + wire selection without touching the row markup */
    if(selectMode || picked.size){
      qa('.mstodo-task-item, .task-card, .mstodo-row', content).forEach(row=>{
        const id = row.dataset.id ||
                   ((row.querySelector('[data-check]') || {}).dataset || {}).check;
        if(!id || row.querySelector('[data-pick]')) return;
        const box = h(`<span class="task-pick ${picked.has(id)?'on':''}" data-pick="${id}" role="checkbox" aria-label="Select task">${icon('check')}</span>`);
        box.onclick = (e)=>{ e.stopPropagation(); togglePick(id); };
        row.insertBefore(box, row.firstChild);
      });
    }
    renderBulkBar();
  }

  function renderListView(container){
    const items = getFilteredTasks();
    if(!items.length){
      container.innerHTML = `
        <div class="card empty" style="padding:48px 24px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">${curList==='my-day'?'☀️':curList==='important'?'⭐':curList==='planned'?'📅':curList==='completed'?'✅':'📋'}</div>
          <div class="e-title">No tasks in ${U.esc(q('#mstodo-title-text', view).textContent)}</div>
          <div class="e-sub">Type a task name above and hit Enter to add it right here.</div>
        </div>`;
      return;
    }

    container.innerHTML = items.map(t => {
      const stepCount = (t.steps||[]).length;
      const stepDone = (t.steps||[]).filter(s => s.done).length;
      const isSelected = t.id === activeTaskId;

      return `
        <div class="mstodo-task-item ${isSelected?'selected':''}" draggable="true" data-id="${t.id}">
          <button class="mstodo-check-btn ${t.done?'checked':''}" data-check="${t.id}" data-tip="${t.done?'Mark incomplete':'Mark complete'}">
            ${icon('check',12)}
          </button>
          <div class="mstodo-task-info">
            <div class="mstodo-task-title ${t.done?'done':''}">${U.esc(t.name)}</div>
            <div class="mstodo-task-sub">
              ${curList !== 'my-day' && t.myDay ? '<span style="color:var(--orange)">☀️ My Day</span>' : ''}
              ${stepCount > 0 ? `<span>${stepDone} of ${stepCount} steps</span>` : ''}
              ${dueChip(t)}
              ${categoryBadge(t)}
              ${t.linkedNoteId ? `<span class="mstodo-note-link-chip" data-open-note="${t.linkedNoteId}">${icon('notes',11)} ${U.esc(t.linkedNoteTitle || 'Linked Note')}</span>` : ''}
              ${t.note ? `<span class="faint tiny ellipsis" style="max-width:140px">💬 ${U.esc(t.note)}</span>` : ''}
            </div>
          </div>
          <button class="mstodo-star-btn ${t.important?'starred':''}" data-star="${t.id}" data-tip="${t.important?'Remove importance':'Mark important'}">
            ${t.important ? '★' : '☆'}
          </button>
        </div>`;
    }).join('');

    let listDragging = false;
    qa('.mstodo-task-item', container).forEach(item => {
      item.onclick = (e) => {
        if(listDragging) return;
        if(e.target.closest('[data-check]') || e.target.closest('[data-star]') || e.target.closest('[data-open-note]')) return;
        openDetailPanel(item.dataset.id);
      };
      item.addEventListener('dragstart', (e) => {
        listDragging = true;
        item.classList.add('dragging');
        window.__draggedTaskId = item.dataset.id;
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.dataset.id);
        } catch(err){}
      });
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        setTimeout(() => { listDragging = false; }, 80);
        window.__draggedTaskId = null;
        qa('.mstodo-nav-item', view).forEach(n => n.classList.remove('dragover'));
        qa('.mstodo-task-item', container).forEach(i => i.classList.remove('drag-target'));
      });
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch(err){}
        item.classList.add('drag-target');
      });
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-target');
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.classList.remove('drag-target');
        const targetId = item.dataset.id;
        const sourceId = window.__draggedTaskId || e.dataTransfer.getData('text/plain');
        if(!sourceId || sourceId === targetId) return;
        const list = tasks();
        const fromIdx = list.findIndex(x => x.id === sourceId);
        const toIdx = list.findIndex(x => x.id === targetId);
        if(fromIdx !== -1 && toIdx !== -1){
          const [moved] = list.splice(fromIdx, 1);
          list.splice(toIdx, 0, moved);
          saveTasks(list);
          renderSidebar();
          renderMain();
          NX.sfx.play('tick');
        }
      });
    });

    qa('[data-check]', container).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        toggleTaskDone(btn.dataset.check, e);
      };
    });

    qa('[data-star]', container).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        toggleTaskImportant(btn.dataset.star);
      };
    });

    qa('[data-open-note]', container).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const noteId = btn.dataset.openNote;
        NX.router.go('notes');
        setTimeout(() => { if(window.__nx_selectNote) window.__nx_selectNote(noteId); }, 60);
      };
    });
  }

  function renderKanban(container){
    const COLS = [
      { id:'today', name:'Today', kc:'#7CD56E' },
      { id:'week', name:'This Week', kc:'#5EB8FF' },
      { id:'doing', name:'In Progress', kc:'#E8853D' },
      { id:'done', name:'Done', kc:'#8B8D93' }
    ];
    const all = tasks();

    container.innerHTML = `<div class="kanban">${COLS.map(c => {
      const items = all.filter(t => c.id === 'done' ? t.done : !t.done && (t.col || 'today') === c.id);
      return `
        <div class="kcol" data-col="${c.id}" style="--kc:${c.kc}">
          <div class="kcol-h">
            <div class="kc-name"><i></i>${c.name}</div>
            <span class="count-chip">${items.length}</span>
          </div>
          <div class="kcol-body">
            ${items.map(t => `
              <div class="task-card ${t.id===activeTaskId?'on':''}" draggable="true" data-id="${t.id}">
                <div class="tc-top">
                  <span class="check ${t.done?'checked':''}" data-check="${t.id}">${icon('check')}</span>
                  <span class="tc-name ${t.done?'done':''} ellipsis">${U.esc(t.name)}</span>
                  <button class="mstodo-star-btn ${t.important?'starred':''}" data-star="${t.id}" style="margin-left:auto">${t.important?'★':'☆'}</button>
                </div>
                ${t.note ? `<div class="tc-sub">${U.esc(t.note)}</div>` : ''}
                <div class="tc-meta">
                  ${categoryBadge(t)}
                  ${dueChip(t)}
                  ${t.linkedNoteId ? `<span class="mstodo-note-link-chip" data-open-note="${t.linkedNoteId}">${icon('notes',11)} ${U.esc(t.linkedNoteTitle||'Note')}</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
          <button class="kadd" data-add="${c.id}">+ Add task</button>
        </div>`;
    }).join('')}</div>`;

    let justDragged = false;
    qa('.task-card', container).forEach(card => {
      card.onclick = (e) => {
        if(justDragged) return;
        if(e.target.closest('[data-check]') || e.target.closest('[data-star]') || e.target.closest('[data-open-note]')) return;
        openDetailPanel(card.dataset.id);
      };
      card.addEventListener('dragstart', e => {
        justDragged = true;
        card.classList.add('dragging');
        window.__draggedTaskId = card.dataset.id;
        try {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', card.dataset.id);
        } catch(err){}
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        setTimeout(() => { justDragged = false; }, 80);
        window.__draggedTaskId = null;
        qa('.kcol', container).forEach(c => c.classList.remove('dragover'));
        qa('.mstodo-nav-item', view).forEach(n => n.classList.remove('dragover'));
      });
    });

    qa('.kcol', container).forEach(col => {
      col.addEventListener('dragover', e => {
        e.preventDefault();
        try { e.dataTransfer.dropEffect = 'move'; } catch(err){}
        col.classList.add('dragover');
      });
      col.addEventListener('dragleave', e => {
        if(e.relatedTarget && col.contains(e.relatedTarget)) return;
        col.classList.remove('dragover');
      });
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('dragover');
        const id = window.__draggedTaskId || e.dataTransfer.getData('text/plain');
        if(!id) return;
        const list = tasks(); const t = list.find(x => x.id === id); if(!t) return;
        if(col.dataset.col === 'done'){
          t.done = true; t.col = 'done'; NX.confetti(e.clientX, e.clientY); NX.sfx.play('ok');
        } else {
          t.done = false; t.col = col.dataset.col; NX.sfx.play('pop');
        }
        saveTasks(list); renderSidebar(); renderMain();
        if(activeTaskId === id) openDetailPanel(id);
      });
    });

    qa('[data-check]', container).forEach(btn => btn.onclick = (e) => { e.stopPropagation(); toggleTaskDone(btn.dataset.check, e); });
    qa('[data-star]', container).forEach(btn => btn.onclick = (e) => { e.stopPropagation(); toggleTaskImportant(btn.dataset.star); });
    qa('[data-open-note]', container).forEach(btn => btn.onclick = (e) => {
      e.stopPropagation();
      NX.router.go('notes');
      setTimeout(() => { if(window.__nx_selectNote) window.__nx_selectNote(btn.dataset.openNote); }, 60);
    });
    qa('[data-add]', container).forEach(btn => btn.onclick = () => NX.newTask(btn.dataset.add));
  }

  function toggleTaskDone(id, e){
    const list = tasks();
    const t = list.find(x => x.id === id);
    if(!t) return;
    const wasDone = !!t.done;
    const wasCol = t.col;
    const wasAt = t.doneAt;
    t.done = !t.done;
    if(t.done){
      t.doneAt = Date.now();
      t.col = 'done';
      NX.confetti(e ? (e.clientX || innerWidth/2) : innerWidth/2, e ? (e.clientY || innerHeight/2) : innerHeight/2);
      NX.sfx.play('ok');
    } else {
      delete t.doneAt;
      t.col = 'today';
      NX.sfx.play('pop');
    }
    saveTasks(list);
    renderSidebar();
    renderMain();
    if(activeTaskId === id) openDetailPanel(id);
    const name = t.name || 'Task';
    NX.undoable(
      wasDone ? 'Task reopened' : 'Task completed',
      name,
      ()=>{
        const l2 = tasks();
        const x = l2.find(y => y.id === id);
        if(!x) return;
        x.done = wasDone;
        if(wasDone){ x.doneAt = wasAt; x.col = wasCol; } else { delete x.doneAt; x.col = wasCol || 'today'; }
        saveTasks(l2);
        renderSidebar();
        renderMain();
        if(activeTaskId === id) openDetailPanel(id);
        NX.sfx.play('pop');
      }
    );
  }

  function toggleTaskImportant(id){
    const list = tasks();
    const t = list.find(x => x.id === id);
    if(!t) return;
    t.important = !t.important;
    saveTasks(list);
    NX.sfx.play('pop');
    renderSidebar();
    renderMain();
    if(activeTaskId === id) openDetailPanel(id);
  }

  /* ---------------- Slide-over Detail Flyout Panel ---------------- */
  function openDetailPanel(id){
    activeTaskId = id;
    const t = tasks().find(x => x.id === id);
    if(!t){
      detailPanel.style.display = 'none';
      return;
    }

    detailPanel.style.display = 'flex';
    const cLists = customLists();
    const notes = notesList();

    detailPanel.innerHTML = `
      <div class="mstodo-detail-head">
        <button class="mstodo-check-btn ${t.done?'checked':''}" id="dt-check">${icon('check',12)}</button>
        <input class="input" id="dt-title" value="${U.esc(t.name)}" style="font-weight:700;font-size:14px;border:none;background:none;padding:0">
        <button class="mstodo-star-btn ${t.important?'starred':''}" id="dt-star" style="font-size:18px">${t.important?'★':'☆'}</button>
        <button class="icon-btn sm" id="dt-close">&times;</button>
      </div>

      <div class="mstodo-detail-body">
        <!-- Steps / Subtasks -->
        <div class="mstodo-section-card">
          <span class="faint tiny bold" style="text-transform:uppercase;letter-spacing:.05em">Steps</span>
          <div id="dt-steps-list" style="display:flex;flex-direction:column;gap:4px">
            ${(t.steps||[]).map((s, idx) => `
              <div class="mstodo-step-row" data-sidx="${idx}">
                <button class="mstodo-check-btn ${s.done?'checked':''}" data-step-cb="${idx}" style="width:16px;height:16px">${icon('check',10)}</button>
                <input value="${U.esc(s.text)}" data-step-text="${idx}" style="${s.done?'text-decoration:line-through;color:var(--ink-3)':''}">
                <button class="icon-btn sm" data-step-del="${idx}" style="width:18px;height:18px">&times;</button>
              </div>
            `).join('')}
          </div>
          <div class="row gap-6" style="margin-top:4px">
            <input class="input sm" id="dt-new-step" placeholder="+ Next step (Enter)" style="font-size:12px">
          </div>
        </div>

        <!-- My Day Toggle -->
        <button class="mstodo-nav-item" id="dt-myday-toggle" style="background:var(--surface-2)">
          <span class="nav-ic">☀️</span>
          <span>${t.myDay ? 'Added to My Day' : 'Add to My Day'}</span>
          ${t.myDay ? '<span style="margin-left:auto;color:var(--green);font-size:12px">✓</span>' : ''}
        </button>

        <!-- Due Date Preset -->
        <div class="mstodo-section-card">
          <div class="row gap-8" style="justify-content:space-between">
            <span class="row gap-6 small bold">${icon('calendar',14)} Due Date</span>
            <input type="date" class="input sm" id="dt-due-input" value="${t.due||''}" style="width:130px;height:26px;font-size:11.5px">
          </div>
          <div class="row gap-4" style="flex-wrap:wrap;margin-top:4px">
            <button class="chip sm" id="dt-due-today">Today</button>
            <button class="chip sm" id="dt-due-tomorrow">Tomorrow</button>
            <button class="chip sm" id="dt-due-nextweek">Next Week</button>
            ${t.due ? '<button class="chip sm" id="dt-due-clear" style="color:var(--red)">Clear</button>' : ''}
          </div>
        </div>

        <!-- Remind Me & Repeat -->
        <div class="mstodo-section-card">
          <div class="row gap-8" style="justify-content:space-between">
            <span class="row gap-6 small bold">${icon('bell',14)} Remind Me</span>
            <input type="datetime-local" class="input sm" id="dt-remind-input" value="${t.remind||''}" style="width:150px;height:26px;font-size:11px">
          </div>
          <div class="row gap-8" style="justify-content:space-between;margin-top:6px">
            <span class="row gap-6 small bold">${icon('refresh',14)} Repeat</span>
            <select class="select sm" id="dt-repeat" style="width:120px;height:26px;font-size:11.5px">
              <option value="" ${!t.repeat?'selected':''}>Never</option>
              <option value="daily" ${t.repeat==='daily'?'selected':''}>Daily</option>
              <option value="weekdays" ${t.repeat==='weekdays'?'selected':''}>Weekdays</option>
              <option value="weekly" ${t.repeat==='weekly'?'selected':''}>Weekly</option>
              <option value="monthly" ${t.repeat==='monthly'?'selected':''}>Monthly</option>
            </select>
          </div>
        </div>

        <!-- Category / List Selector -->
        <div class="mstodo-section-card">
          <span class="row gap-6 small bold">${icon('layers',14)} List / Category</span>
          <select class="select sm" id="dt-category" style="margin-top:4px">
            <option value="all">Default Tasks</option>
            ${cLists.map(cl => `<option value="${cl.id}" ${(t.cat===cl.id||t.listId===cl.id)?'selected':''}>${U.esc(cl.name)}</option>`).join('')}
          </select>
        </div>

        <!-- Mention / Link Note from Notes Tracker -->
        <div class="mstodo-section-card">
          <div class="row gap-6" style="justify-content:space-between">
            <span class="row gap-6 small bold">${icon('notes',14)} Mention / Link Note</span>
            ${t.linkedNoteId ? '<button class="icon-btn sm" id="dt-unlink-note" data-tip="Unlink note" style="color:var(--red)">&times;</button>' : ''}
          </div>
          ${t.linkedNoteId ? `
            <div class="card" style="padding:8px 10px;margin-top:6px;background:var(--purple-soft);border:1px solid var(--purple)">
              <div style="font-weight:700;font-size:12.5px;color:var(--purple)">📝 ${U.esc(t.linkedNoteTitle || 'Linked Note')}</div>
              <div class="row gap-6" style="margin-top:6px">
                <button class="btn btn-sm btn-soft" id="dt-jump-note" style="height:22px;font-size:10.5px">Open in Notes</button>
              </div>
            </div>
          ` : `
            <div style="margin-top:6px">
              <select class="select sm" id="dt-pick-note">
                <option value="">+ Choose a Note to link…</option>
                ${notes.map(n => `<option value="${n.id}">${U.esc(n.title || 'Untitled Note')}</option>`).join('')}
              </select>
            </div>
          `}
        </div>

        <!-- Task Notes / Comments Textarea -->
        <div class="mstodo-section-card">
          <span class="faint tiny bold" style="text-transform:uppercase;letter-spacing:.05em">Notes</span>
          <textarea class="textarea" id="dt-note-body" rows="3" placeholder="Add detailed notes or context…" style="font-size:12.5px;line-height:1.45">${U.esc(t.note||'')}</textarea>
        </div>
      </div>

      <div class="mstodo-detail-foot">
        <span>Created ${U.relTime(t.created)}</span>
        <button class="icon-btn sm" id="dt-delete-task" data-tip="Delete task" style="color:var(--red)">${icon('trash',14)}</button>
      </div>`;

    // Wire Detail Events
    q('#dt-close', detailPanel).onclick = () => {
      activeTaskId = null;
      detailPanel.style.display = 'none';
      renderMain();
    };

    q('#dt-check', detailPanel).onclick = (e) => toggleTaskDone(t.id, e);
    q('#dt-star', detailPanel).onclick = () => toggleTaskImportant(t.id);

    q('#dt-title', detailPanel).oninput = (e) => {
      t.name = e.target.value.trim() || 'Untitled Task';
      saveTasks(tasks());
      renderMain();
    };

    q('#dt-myday-toggle', detailPanel).onclick = () => {
      t.myDay = !t.myDay;
      t.myDayDate = t.myDay ? U.todayKey() : '';
      saveTasks(tasks());
      openDetailPanel(t.id);
      renderSidebar();
      renderMain();
      NX.sfx.play('pop');
    };

    // Subtask steps
    qa('[data-step-cb]', detailPanel).forEach(cb => {
      cb.onclick = () => {
        const idx = +cb.dataset.stepCb;
        t.steps = t.steps || [];
        if(t.steps[idx]){
          t.steps[idx].done = !t.steps[idx].done;
          saveTasks(tasks());
          openDetailPanel(t.id);
          renderMain();
          NX.sfx.play('tick');
        }
      };
    });

    qa('[data-step-text]', detailPanel).forEach(inp => {
      inp.oninput = () => {
        const idx = +inp.dataset.stepText;
        if(t.steps && t.steps[idx]){
          t.steps[idx].text = inp.value;
          saveTasks(tasks());
        }
      };
    });

    qa('[data-step-del]', detailPanel).forEach(btn => {
      btn.onclick = () => {
        const idx = +btn.dataset.stepDel;
        if(t.steps){
          t.steps.splice(idx, 1);
          saveTasks(tasks());
          openDetailPanel(t.id);
          renderMain();
        }
      };
    });

    const newStepInp = q('#dt-new-step', detailPanel);
    if(newStepInp){
      newStepInp.onkeydown = (e) => {
        if(e.key === 'Enter'){
          const val = newStepInp.value.trim();
          if(!val) return;
          t.steps = t.steps || [];
          t.steps.push({ id: U.uid('st'), text: val, done: false });
          saveTasks(tasks());
          openDetailPanel(t.id);
          renderMain();
          NX.sfx.play('pop');
        }
      };
    }

    // Due date controls
    const dueInp = q('#dt-due-input', detailPanel);
    if(dueInp){
      dueInp.onchange = () => {
        t.due = dueInp.value;
        saveTasks(tasks());
        openDetailPanel(t.id);
        renderMain();
      };
    }
    const dueTodayBtn = q('#dt-due-today', detailPanel);
    if(dueTodayBtn){
      dueTodayBtn.onclick = () => {
        t.due = U.todayKey();
        saveTasks(tasks());
        openDetailPanel(t.id);
        renderMain();
      };
    }
    const dueTomorrowBtn = q('#dt-due-tomorrow', detailPanel);
    if(dueTomorrowBtn){
      dueTomorrowBtn.onclick = () => {
        t.due = U.todayKey(new Date(Date.now() + 86400e3));
        saveTasks(tasks());
        openDetailPanel(t.id);
        renderMain();
      };
    }
    const dueNextWeekBtn = q('#dt-due-nextweek', detailPanel);
    if(dueNextWeekBtn){
      dueNextWeekBtn.onclick = () => {
        t.due = U.todayKey(new Date(Date.now() + 7 * 86400e3));
        saveTasks(tasks());
        openDetailPanel(t.id);
        renderMain();
      };
    }
    const dueClearBtn = q('#dt-due-clear', detailPanel);
    if(dueClearBtn){
      dueClearBtn.onclick = () => {
        t.due = '';
        saveTasks(tasks());
        openDetailPanel(t.id);
        renderMain();
      };
    }

    // Remind me & Repeat
    const remindInp = q('#dt-remind-input', detailPanel);
    if(remindInp){
      remindInp.onchange = () => {
        t.remind = remindInp.value;
        saveTasks(tasks());
      };
    }
    const repeatSel = q('#dt-repeat', detailPanel);
    if(repeatSel){
      repeatSel.onchange = () => {
        t.repeat = repeatSel.value;
        saveTasks(tasks());
      };
    }

    // Category / List
    const catSel = q('#dt-category', detailPanel);
    if(catSel){
      catSel.onchange = () => {
        t.cat = catSel.value;
        t.listId = catSel.value;
        saveTasks(tasks());
        renderSidebar();
        renderMain();
      };
    }

    // Linked Note
    const pickNote = q('#dt-pick-note', detailPanel);
    if(pickNote){
      pickNote.onchange = () => {
        const nId = pickNote.value;
        if(!nId) return;
        const matched = notes.find(x => x.id === nId);
        if(matched){
          t.linkedNoteId = matched.id;
          t.linkedNoteTitle = matched.title || 'Untitled Note';
          saveTasks(tasks());
          openDetailPanel(t.id);
          renderMain();
          NX.toastOk('Note linked to task', matched.title);
        }
      };
    }
    const unlinkBtn = q('#dt-unlink-note', detailPanel);
    if(unlinkBtn){
      unlinkBtn.onclick = () => {
        delete t.linkedNoteId;
        delete t.linkedNoteTitle;
        saveTasks(tasks());
        openDetailPanel(t.id);
        renderMain();
        NX.toastOk('Note unlinked');
      };
    }
    const jumpBtn = q('#dt-jump-note', detailPanel);
    if(jumpBtn){
      jumpBtn.onclick = () => {
        NX.router.go('notes');
        setTimeout(() => { if(window.__nx_selectNote) window.__nx_selectNote(t.linkedNoteId); }, 60);
      };
    }

    // Notes body
    const noteBody = q('#dt-note-body', detailPanel);
    if(noteBody){
      noteBody.oninput = () => {
        t.note = noteBody.value;
        saveTasks(tasks());
      };
    }

    // Delete task — soft delete with an Undo toast instead of a blocking confirm
    q('#dt-delete-task', detailPanel).onclick = () => {
      const gone = tasks().find(x => x.id === t.id);
      if(!gone) return;
      saveTasks(tasks().filter(x => x.id !== t.id));
      activeTaskId = null;
      detailPanel.style.display = 'none';
      renderSidebar();
      renderMain();
      NX.sfx.play('err');
      NX.undoable('Task deleted', gone.name || 'Task', () => {
        const cur = tasks();
        if(cur.some(x => x.id === t.id)) return;
        saveTasks(cur.concat([gone]));
        renderSidebar();
        renderMain();
        NX.toastOk('Task restored', gone.name || '');
      });
    };
  }

  /* ---------------- Quick Add Task ---------------- */
  function submitQuickAdd(){
    const name = inputEl.value.trim();
    if(!name) return;
    const list = tasks();
    const today = U.todayKey();

    const isMyDay = curList === 'my-day';
    const isImportant = curList === 'important' || quickImportant;
    const category = (!['my-day','important','planned','all','completed'].includes(curList)) ? curList : 'all';

    const newTask = {
      id: U.uid('tk'),
      name,
      cat: category,
      listId: category,
      col: 'today',
      due: quickDue || (curList === 'planned' ? today : (isMyDay ? today : '')),
      note: '',
      myDay: isMyDay,
      myDayDate: isMyDay ? today : '',
      important: isImportant,
      steps: [],
      created: Date.now(),
      timeLinked: 0,
      done: false
    };

    list.unshift(newTask);
    saveTasks(list);
    inputEl.value = '';
    quickDue = '';
    quickImportant = false;
    q('#mstodo-quick-star', view).style.color = '';
    renderSidebar();
    renderMain();
    NX.sfx.play('ok');
    openDetailPanel(newTask.id);
  }

  inputEl.onkeydown = (e) => {
    if(e.key === 'Enter') submitQuickAdd();
  };
  q('#mstodo-quick-submit', view).onclick = submitQuickAdd;

  const quickMicBtn = q('#mstodo-quick-mic', view);
  if(quickMicBtn){
    quickMicBtn.onclick = async () => {
      const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if(SpeechClass){
        try {
          const rec = new SpeechClass();
          rec.lang = navigator.language || 'en-US';
          quickMicBtn.style.color = '#fff';
          quickMicBtn.style.background = 'var(--red,#ef4444)';
          NX.sfx.play('pop');
          NX.toastInfo('🎙️ Listening…', 'Speak your task name.');
          rec.onresult = (e) => {
            const val = e.results[0][0].transcript;
            if(val && val.trim()){
              inputEl.value = val.trim();
              submitQuickAdd();
            }
          };
          rec.onerror = () => { fallbackNativeTaskMic(); };
          rec.onend = () => {
            quickMicBtn.style.color = 'var(--red,#ef4444)';
            quickMicBtn.style.background = '';
          };
          rec.start();
          return;
        } catch(e){}
      }
      fallbackNativeTaskMic();
    };

    async function fallbackNativeTaskMic(){
      quickMicBtn.style.color = '#fff';
      quickMicBtn.style.background = 'var(--red,#ef4444)';
      NX.sfx.play('pop');
      NX.toastInfo('🎙️ Listening via Windows Speech…', 'Speak your task.');
      try {
        const text = await NX.native.asrRecord(8000);
        quickMicBtn.style.color = 'var(--red,#ef4444)';
        quickMicBtn.style.background = '';
        if(text && text.trim()){
          inputEl.value = text.trim();
          submitQuickAdd();
        }
      } catch(e){
        quickMicBtn.style.color = 'var(--red,#ef4444)';
        quickMicBtn.style.background = '';
      }
    }
  }

  q('#mstodo-quick-due', view).onclick = () => {
    const today = U.todayKey();
    if(!quickDue) quickDue = today;
    else if(quickDue === today) quickDue = U.todayKey(new Date(Date.now() + 86400e3));
    else quickDue = '';
    NX.toastInfo('Quick Due Date', quickDue ? quickDue : 'Cleared');
  };

  q('#mstodo-quick-star', view).onclick = () => {
    quickImportant = !quickImportant;
    q('#mstodo-quick-star', view).style.color = quickImportant ? 'var(--orange)' : '';
  };

  // View seg: list / board
  qa('#td-view-seg button', view).forEach(b => {
    b.onclick = () => {
      const mode = b.dataset.v;
      NX.store.set('ui:todoView', mode);
      qa('#td-view-seg button', view).forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      renderMain();
    };
  });

  q('#td-new', view).onclick = () => NX.newTask(curList);
  q('#td-select-toggle', view).onclick = () => setSelectMode();

  window.__nx_refreshTodoView = () => {
    renderSidebar();
    renderHeader();
    renderMain();
    if(activeTaskId) openDetailPanel(activeTaskId);
  };

  renderSidebar();
  renderHeader();
  renderMain();
});

NX.events.on('todo:changed', () => { if(typeof window.__nx_refreshTodoView === 'function') window.__nx_refreshTodoView(); });
NX.events.on('tasks:changed', () => { if(typeof window.__nx_refreshTodoView === 'function') window.__nx_refreshTodoView(); });
})(window.NX);
