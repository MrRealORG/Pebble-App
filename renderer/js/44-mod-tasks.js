/* ============================================================
   Pebble — mod-tasks.js : lists, kanban, table, calendar,
   smart views, filters, bulk actions, Gantt-ish overview
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  const S = {
    view: NX.localStore.get('nexadesk.taskView', 'smart'),   // smart|list|kanban|table|calendar|board
    project: '', status: '', priority: '', tag: '', query: '',
    groupBy: NX.localStore.get('nexadesk.taskGroup', 'status'),
    sortBy: NX.localStore.get('nexadesk.taskSort', 'smart'),
    showDone: false, focus: null, projectTab: '', kanbanProject: ''
  };
  const STATUSES = ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done'];
  const STATUS_META = {
    Backlog:      { color: '#8b8f98', icon: 'archive' },
    'To Do':      { color: '#4aa8e8', icon: 'task' },
    'In Progress':{ color: '#9b6cf0', icon: 'zap' },
    Blocked:      { color: '#eb5757', icon: 'lock' },
    Review:       { color: '#f2994a', icon: 'eye' },
    Done:         { color: '#4caf7d', icon: 'check' }
  };

  function persist() {
    NX.localStore.set('nexadesk.taskView', S.view);
    NX.localStore.set('nexadesk.taskGroup', S.groupBy);
    NX.localStore.set('nexadesk.taskSort', S.sortBy);
  }

  /* =====================================================================
     RENDER
     ===================================================================== */
  function render(params) {
    if (params) {
      if (params.project !== undefined) S.project = params.project;
      if (params.tag) S.tag = params.tag;
      if (params.view) S.view = params.view;
      if (params.focus) S.focus = params.focus;
    }
    const page = h('div.page.wide');
    page.appendChild(head());
    page.appendChild(projectBar());
    page.appendChild(filterBar());

    if (S.focus) {
      const t = store().tasks.find(S.focus);
      if (t) { S.focus = null; setTimeout(() => NX.components.openTask(t.id), 60); }
    }

    const body = h('div');
    page.appendChild(body);
    paint(body);
    return page;
  }

  function paint(body) {
    NX.clear(body);
    const tasks = filtered();
    const info = h('div.row', { style: { marginBottom: '10px', gap: '10px' } }, [
      h('span.small.muted', `${tasks.length} task${tasks.length === 1 ? '' : 's'}`),
      tasks.length ? h('span.small.muted', `· ${NX.fmtDuration(NX.sum(tasks.filter(t => !t.done).map(t => t.estimate || 0)))} estimated`) : null,
      h('div.grow'),
      h('button.btn.xs.ghost', { onclick: () => bulkMenu(body) }, 'Bulk actions')
    ]);
    body.appendChild(info);

    if (!tasks.length && !store().tasks.count()) {
      body.appendChild(NX.ui.emptyState('task', 'No tasks yet', 'Add your first task. Try natural language: “Email Sam tomorrow 3pm !high #work”.', 'Add a task', () => NX.actions.newTask()));
      return;
    }
    if (!tasks.length) {
      body.appendChild(NX.ui.emptyState('filter', 'Nothing matches those filters', 'Loosen a filter, or clear them all.', 'Clear filters', () => { S.project = ''; S.status = ''; S.priority = ''; S.tag = ''; S.query = ''; S.showDone = false; NX.router.render(); }));
      return;
    }
    if (S.view === 'kanban') body.appendChild(kanbanView(tasks));
    else if (S.view === 'table') body.appendChild(tableView(tasks));
    else if (S.view === 'calendar') body.appendChild(calendarView(tasks));
    else if (S.view === 'smart') body.appendChild(smartView(tasks));
    else body.appendChild(listView(tasks));
  }

  /* ---------------- head ---------------- */
  function head() {
    const ts = NX.aiEngine.taskSummary();
    return h('div', [
      NX.components.pageHead({
        icon: 'task', title: 'Tasks',
        sub: `${ts.open} open · ${ts.overdue} overdue · ${ts.today} due today · ${ts.completionRate}% completion rate`,
        actions: [
          h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New task', onclick: () => NX.actions.newTask().then(() => NX.router.render()) }),
          h('button.btn.sm.subtle', { html: iconHTML('sparkle', 13) + ' Plan my day', onclick: planMyDay }),
          h('button.btn.sm.ghost', { onclick: e => NX.ui.dropdown(e.currentTarget, [
            { icon: 'folder', label: 'New project…', onClick: () => NX.actions.newProject() },
            { icon: 'download', label: 'Export tasks as CSV', onClick: exportCSV },
            { icon: 'download', label: 'Export as Markdown', onClick: exportMarkdown },
            { icon: 'archive', label: 'Archive completed tasks', onClick: archiveDone },
            { icon: 'trash', label: 'Delete all completed', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('all completed tasks')) { sel().doneTasks().forEach(t => store().tasks.remove(t.id, true)); store().touch(); store().emit('tasks'); NX.router.render(); } } },
            '-',
            { icon: 'zap', label: 'Re-rank by AI priority', onClick: () => { S.sortBy = 'smart'; S.view = 'list'; persist(); NX.router.render(); } }
          ], { right: true }) }, 'More')
        ]
      }),
      h('div.grid.grid-4', { style: { marginBottom: 'var(--sp-4)' } }, [
        NX.components.statTile('Overdue', ts.overdue, 'needs attention', 'warn', ts.overdue ? 'red' : '', () => { S.view = 'smart'; S.showDone = false; persist(); NX.router.render(); }),
        NX.components.statTile('Due today', ts.today, NX.fmtDuration(NX.sum(sel().tasksDueOn(new Date()).filter(t => !t.done).map(t => t.estimate || 0))) + ' estimated', 'calendar', 'blu'),
        NX.components.statTile('In progress', ts.byStatus['In Progress'] || 0, 'actively being worked', 'zap', 'pur'),
        NX.components.statTile('Completed', ts.done, `${ts.completionRate}% of all tasks`, 'check', 'grn')
      ])
    ]);
  }

  function projectBar() {
    const projects = store().projects.all().filter(p => !p.archived);
    const bar = h('div', { style: { display: 'flex', gap: '7px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '4px' } });
    const chip = (id, label, iconStr, count, color) => h('button.chip.clickable' + (S.project === id ? '.on' : ''), {
      style: S.project === id && color ? { background: color + '26', color, borderColor: color + '55' } : null,
      onclick: () => { S.project = id; NX.router.render(); }
    }, [iconStr ? h('span', iconStr) : null, h('span', label), count !== null && count !== undefined ? h('span.badge-count', { style: { marginLeft: '3px' } }, String(count)) : null]);

    bar.appendChild(chip('', 'All tasks', '🗂️', sel().openTasks().length, null));
    projects.forEach(p => {
      const open = sel().projectTasks(p.id).filter(t => !t.done).length;
      bar.appendChild(chip(p.id, p.name, p.icon || '📁', open, p.color));
    });
    bar.appendChild(h('button.chip.clickable', { onclick: () => NX.actions.newProject() }, '+ Project'));
    bar.appendChild(h('div.grow'));
    bar.appendChild(h('button.chip.clickable', { onclick: () => NX.router.go('settings', { tab: 'projects' }) }, 'Manage projects'));
    return bar;
  }

  function filterBar() {
    return NX.components.filterBar([
      { type: 'seg', value: S.view, onChange: v => { S.view = v; persist(); NX.router.render(); }, options: [
        { value: 'smart', label: '✨ Smart' }, { value: 'list', label: 'List' }, { value: 'kanban', label: 'Kanban' },
        { value: 'table', label: 'Table' }, { value: 'calendar', label: 'Calendar' }
      ] },
      { type: 'sep' },
      { type: 'search', placeholder: 'Search tasks…', value: S.query, width: 200, onInput: v => { S.query = v; paint(document.querySelector('#view .page > div:last-child')); } },
      { type: 'select', value: S.status, onChange: v => { S.status = v; NX.router.render(); }, options: [{ value: '', label: 'Any status' }].concat(STATUSES) },
      { type: 'select', value: S.priority, onChange: v => { S.priority = v; NX.router.render(); }, options: [{ value: '', label: 'Any priority' }, 'Urgent', 'High', 'Medium', 'Low', 'None'] },
      { type: 'select', value: S.tag, onChange: v => { S.tag = v; NX.router.render(); }, options: [{ value: '', label: 'Any tag' }].concat(sel().allTags().map(t => ({ value: t.id, label: '#' + t.name }))) },
      { type: 'chip', label: 'Show completed', active: S.showDone, onClick: () => { S.showDone = !S.showDone; NX.router.render(); } },
      { type: 'spacer' },
      S.view === 'list' || S.view === 'table' ? { type: 'select', value: S.groupBy, onChange: v => { S.groupBy = v; persist(); NX.router.render(); }, options: [
        { value: 'status', label: 'Group: status' }, { value: 'project', label: 'Group: project' }, { value: 'due', label: 'Group: due date' },
        { value: 'priority', label: 'Group: priority' }, { value: 'tag', label: 'Group: tag' }, { value: 'none', label: 'No grouping' }
      ] } : null,
      { type: 'select', value: S.sortBy, onChange: v => { S.sortBy = v; persist(); NX.router.render(); }, options: [
        { value: 'smart', label: 'Sort: AI priority' }, { value: 'due', label: 'Sort: due date' }, { value: 'created', label: 'Sort: newest' },
        { value: 'alpha', label: 'Sort: A→Z' }, { value: 'priority', label: 'Sort: priority' }, { value: 'estimate', label: 'Sort: effort' }, { value: 'manual', label: 'Sort: manual' }
      ] }
    ].filter(Boolean));
  }

  function filtered() {
    let list = store().tasks.all().filter(t => !t.archived && !t.parentId);
    if (S.project) list = list.filter(t => t.projectId === S.project);
    if (S.status) list = list.filter(t => t.status === S.status);
    if (S.priority) list = list.filter(t => (t.priority || 'None') === S.priority);
    if (S.tag) list = list.filter(t => (t.tags || []).includes(S.tag));
    if (!S.showDone) list = list.filter(t => !t.done);
    if (S.query) {
      const q = S.query.toLowerCase();
      list = list.filter(t => (t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    }
    return sortTasks(list);
  }

  function sortTasks(list) {
    const s = S.sortBy;
    const copy = list.slice();
    if (s === 'smart') copy.sort((a, b) => NX.aiEngine.scoreTask(b) - NX.aiEngine.scoreTask(a));
    else if (s === 'due') copy.sort((a, b) => (a.due ? new Date(a.due) : Infinity) - (b.due ? new Date(b.due) : Infinity));
    else if (s === 'created') copy.sort((a, b) => new Date(b.created) - new Date(a.created));
    else if (s === 'alpha') copy.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (s === 'priority') { const w = { Urgent: 0, High: 1, Medium: 2, Low: 3, None: 4 }; copy.sort((a, b) => (w[a.priority] ?? 4) - (w[b.priority] ?? 4)); }
    else if (s === 'estimate') copy.sort((a, b) => (a.estimate || 0) - (b.estimate || 0));
    else copy.sort((a, b) => (a.done - b.done) || (a.order || 0) - (b.order || 0));
    return copy;
  }

  /* =====================================================================
     SMART VIEW
     ===================================================================== */
  function smartView(tasks) {
    const wrap = h('div');
    const now = new Date();
    const buckets = [
      { key: 'overdue', label: 'Overdue', icon: 'warn', color: 'var(--acc-red)', items: tasks.filter(t => !t.done && t.due && new Date(t.due) < NX.startOfDay(now)) },
      { key: 'today', label: 'Today', icon: 'calendar', color: 'var(--brand-1)', items: tasks.filter(t => !t.done && t.due && NX.isToday(t.due)) },
      { key: 'tomorrow', label: 'Tomorrow', icon: 'calendar', color: 'var(--acc-blu)', items: tasks.filter(t => !t.done && t.due && NX.isTomorrow(t.due)) },
      { key: 'week', label: 'Next 7 days', icon: 'clock', color: 'var(--acc-pur)', items: tasks.filter(t => { if (!t.due || t.done) return false; const d = NX.diffDays(t.due, now); return d >= 2 && d <= 7; }) },
      { key: 'later', label: 'Later', icon: 'archive', color: 'var(--tx-4)', items: tasks.filter(t => !t.done && t.due && NX.diffDays(t.due, now) > 7) },
      { key: 'progress', label: 'In progress', icon: 'zap', color: 'var(--acc-pur)', items: tasks.filter(t => !t.done && !t.due && t.status === 'In Progress') },
      { key: 'quick', label: 'Quick wins (≤ 20 min)', icon: 'bolt', color: 'var(--acc-grn)', items: tasks.filter(t => !t.done && t.estimate && t.estimate <= 20) },
      { key: 'blocked', label: 'Blocked', icon: 'lock', color: 'var(--acc-red)', items: tasks.filter(t => !t.done && t.status === 'Blocked') },
      { key: 'nodate', label: 'No date', icon: 'inbox', color: 'var(--tx-4)', items: tasks.filter(t => !t.done && !t.due && t.status !== 'In Progress' && t.status !== 'Blocked') },
      { key: 'done', label: 'Completed', icon: 'check', color: 'var(--acc-grn)', items: tasks.filter(t => t.done) }
    ];
    let shown = 0;
    buckets.forEach(b => {
      if (!b.items.length) return;
      if (b.key === 'done' && !S.showDone) return;
      shown++;
      wrap.appendChild(h('div.task-group-head', [
        h('span', { html: iconHTML(b.icon, 14), style: { color: b.color, display: 'flex' } }),
        h('span', b.label),
        h('span.tgh-count', String(b.items.length)),
        b.key === 'overdue' ? h('button.btn.xs.ghost', { onclick: () => rescheduleAllOverdue(b.items) }, 'Reschedule all → today') : null,
        h('div.grow')
      ]));
      const list = h('div', { style: { marginBottom: '8px' } });
      b.items.slice(0, 40).forEach(t => list.appendChild(NX.components.taskRow(t, { showChecklist: false })));
      wrap.appendChild(list);
    });
    if (!shown) wrap.appendChild(NX.ui.emptyState('check', 'Inbox zero', 'Every task is done, or nothing matches your filters. Enjoy it.'));
    return wrap;
  }

  async function rescheduleAllOverdue(items) {
    if (!await NX.ui.confirm({ title: 'Reschedule overdue tasks', message: `Move ${items.length} overdue task(s) to today at 17:00?`, confirmLabel: 'Move them', danger: false })) return;
    const d = new Date(); d.setHours(17, 0, 0, 0);
    items.forEach(t => store().tasks.update(t.id, { due: d.toISOString() }, true));
    store().touch(); store().emit('tasks');
    NX.router.render();
    NX.ui.toast({ type: 'success', message: `${items.length} tasks rescheduled to today` });
  }

  /* =====================================================================
     LIST VIEW (grouped)
     ===================================================================== */
  function listView(tasks) {
    const wrap = h('div');
    if (S.groupBy === 'none') {
      tasks.forEach(t => wrap.appendChild(NX.components.taskRow(t)));
      wrap.appendChild(quickAddRow());
      return wrap;
    }
    const groups = new Map();
    tasks.forEach(t => {
      const keys = groupKeys(t);
      keys.forEach(k => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    });
    Array.from(groups.entries()).forEach(([k, items]) => {
      const meta = groupMeta(k);
      wrap.appendChild(h('div.task-group-head', [
        h('span', { style: { color: meta.color, display: 'flex' }, html: iconHTML(meta.icon, 14) }),
        h('span', k), h('span.tgh-count', String(items.length)),
        h('div.grow'),
        h('span.small.muted', NX.fmtDuration(NX.sum(items.filter(t => !t.done).map(t => t.estimate || 0)))),
        h('button.icon-btn', { html: iconHTML('plus', 14), title: 'Add task here', onclick: () => NX.actions.newTask({ presetGroup: S.groupBy, presetValue: k }).then(() => NX.router.render()) })
      ]));
      items.forEach(t => wrap.appendChild(NX.components.taskRow(t)));
    });
    wrap.appendChild(quickAddRow());
    return wrap;
  }

  function groupKeys(t) {
    switch (S.groupBy) {
      case 'status': return [t.status || 'To Do'];
      case 'project': return [t.projectId ? sel().projectName(t.projectId) : 'No project'];
      case 'priority': return [t.priority || 'None'];
      case 'tag': return (t.tags || []).length ? t.tags.map(id => sel().tagName(id)) : ['No tag'];
      case 'due': {
        if (!t.due) return ['No date'];
        const d = NX.diffDays(t.due, new Date());
        if (d < 0) return ['Overdue'];
        if (d === 0) return ['Today'];
        if (d === 1) return ['Tomorrow'];
        if (d <= 7) return ['This week'];
        if (d <= 30) return ['This month'];
        return ['Later'];
      }
      default: return ['All'];
    }
  }
  function groupMeta(k) {
    if (STATUS_META[k]) return { color: STATUS_META[k].color, icon: STATUS_META[k].icon };
    const m = {
      Overdue: ['var(--acc-red)', 'warn'], Today: ['var(--brand-1)', 'calendar'], Tomorrow: ['var(--acc-blu)', 'calendar'],
      'This week': ['var(--acc-pur)', 'clock'], 'This month': ['var(--tx-3)', 'calendar'], Later: ['var(--tx-4)', 'archive'],
      'No date': ['var(--tx-4)', 'inbox'], 'No project': ['var(--tx-4)', 'folder'], 'No tag': ['var(--tx-4)', 'tag'],
      Urgent: ['var(--acc-red)', 'flag'], High: ['var(--acc-org)', 'flag'], Medium: ['var(--acc-yel)', 'flag'],
      Low: ['var(--acc-blu)', 'flag'], None: ['var(--tx-4)', 'flag']
    };
    if (m[k]) return { color: m[k][0], icon: m[k][1] };
    const p = store().projects.all().find(x => x.name === k);
    if (p) return { color: p.color, icon: 'folder' };
    return { color: 'var(--tx-3)', icon: 'tag' };
  }

  function quickAddRow() {
    const input = h('input', { placeholder: 'Add a task — try “Call Sam tomorrow 3pm !high #work”' });
    const row = h('div.task-add', [h('span', { html: iconHTML('plus', 14) }), input]);
    const submit = () => {
      const raw = input.value.trim();
      if (!raw) return;
      const parsed = NX.aiEngine.parseQuickCapture(raw);
      const tags = parsed.tags.map(name => {
        const t = store().tags.all().find(x => x.name === name);
        return t ? t.id : store().tags.create({ name, color: NX.colorFromString(name) }, true).id;
      });
      let projectId = S.project || null;
      if (parsed.projectHint) { const p = store().projects.all().find(x => x.name.toLowerCase().includes(parsed.projectHint)); if (p) projectId = p.id; }
      const t = store().tasks.create({
        title: parsed.title, description: '', projectId, status: S.status || 'To Do', priority: parsed.priority,
        due: parsed.due || null, repeat: parsed.repeat || null, tags, checklist: [], estimate: 0,
        order: store().tasks.count(), done: false, archived: false, parentId: null
      });
      input.value = '';
      NX.ui.toast({ type: 'success', message: `Added “${t.title}”${t.due ? ' · due ' + NX.dueLabel(t.due) : ''}`, duration: 2600 });
      paint(document.querySelector('#view .page > div:last-child'));
      NX.shell.updateBadges();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    row.appendChild(h('div.grow'));
    row.appendChild(h('button.btn.xs.primary', { onclick: submit }, 'Add'));
    return row;
  }

  /* =====================================================================
     KANBAN
     ===================================================================== */
  function kanbanView(tasks) {
    const wrap = h('div');
    wrap.appendChild(h('div.row', { style: { marginBottom: '10px', gap: '8px' } }, [
      h('span.small.muted', 'Drag cards between columns. Right-click a card for the full menu.'),
      h('div.grow'),
      h('button.btn.xs.ghost', { onclick: () => { const s = store().settings; s.kanbanColumns = null; NX.router.render(); } }, 'Reset columns'),
      h('button.btn.xs.ghost', { onclick: editColumns }, 'Edit columns')
    ]));
    const cols = store().getSetting('kanbanColumns', null) || STATUSES;
    const board = h('div.kanban');
    cols.forEach(colName => {
      const meta = STATUS_META[colName] || { color: NX.colorFromString(colName), icon: 'columns' };
      const items = tasks.filter(t => (t.status || 'To Do') === colName);
      const col = h('div.kb-col', { dataset: { col: colName } });
      col.appendChild(h('div.kb-col-head', [
        h('span.kch-dot', { style: { background: meta.color } }),
        h('span.kch-name', colName),
        h('span.kch-count', String(items.length)),
        h('div.grow'),
        items.length ? h('span.tiny.muted', NX.fmtDuration(NX.sum(items.filter(t => !t.done).map(t => t.estimate || 0)))) : null,
        h('button.icon-btn', { html: iconHTML('more', 14), onclick: e => NX.ui.dropdown(e.currentTarget, [
          { icon: 'plus', label: 'Add task here', onClick: async () => { const t = await NX.actions.newTask(); if (t) { store().tasks.update(t.id, { status: colName }); NX.router.render(); } } },
          { icon: 'edit', label: 'Rename column', onClick: async () => { const v = await NX.ui.prompt({ title: 'Rename column', value: colName }); if (v) { items.forEach(t => store().tasks.update(t.id, { status: v }, true)); const cs = cols.map(c => c === colName ? v : c); store().setSetting('kanbanColumns', cs); NX.router.render(); } } },
          { icon: 'archive', label: 'Move all to Done', onClick: () => { items.forEach(t => store().tasks.update(t.id, { status: 'Done', done: true, completed: new Date().toISOString() }, true)); store().touch(); store().emit('tasks'); NX.router.render(); } },
          { icon: 'trash', label: 'Remove column', danger: true, onClick: () => { const cs = cols.filter(c => c !== colName); store().setSetting('kanbanColumns', cs); NX.router.render(); } }
        ], { right: true }) })
      ]));
      const body = h('div.kb-col-body');
      items.forEach(t => body.appendChild(kanbanCard(t)));
      body.appendChild(h('button.task-add', { onclick: async () => { const nt = await NX.actions.newTask(); if (nt) { store().tasks.update(nt.id, { status: colName, projectId: S.project || nt.projectId }); NX.router.render(); } } }, [h('span', { html: iconHTML('plus', 13) }), 'Add']));
      col.appendChild(body);

      body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
      body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
      body.addEventListener('drop', e => {
        e.preventDefault(); body.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/nexadesk-task');
        if (!id) return;
        const t = store().tasks.find(id);
        if (!t || t.status === colName) return;
        const patch = { status: colName };
        if (colName === 'Done') { patch.done = true; patch.completed = new Date().toISOString(); }
        else { patch.done = false; patch.completed = null; }
        store().tasks.update(id, patch);
        NX.ui.toast({ type: 'success', message: `“${t.title}” → ${colName}`, duration: 2400,
          actions: [{ label: 'Undo', onClick: () => { store().tasks.update(id, { status: t.status, done: t.done, completed: t.completed }); NX.router.render(); } }] });
        NX.router.render();
      });
      board.appendChild(col);
    });
    wrap.appendChild(board);
    return wrap;
  }

  function kanbanCard(t) {
    const meta = STATUS_META[t.status] || { color: 'var(--tx-4)' };
    const pc = { Urgent: 'var(--acc-red)', High: 'var(--acc-org)', Medium: 'var(--acc-yel)', Low: 'var(--acc-blu)' }[t.priority];
    const card = h('div.kb-card' + (t.done ? '.done' : ''), { draggable: 'true', dataset: { task: t.id } });
    if (pc) card.appendChild(h('div.kbc-strip', { style: { background: pc } }));
    card.appendChild(h('div.row', { style: { alignItems: 'flex-start', gap: '7px' } }, [
      h('button.kbc-check' + (t.done ? '.on' : ''), { onclick: e => { e.stopPropagation(); NX.components.toggleTaskDone(t.id); NX.router.render(); } }),
      h('div.kbc-title.grow', t.title || '(untitled)')
    ]));
    if (t.description) card.appendChild(h('div.kbc-desc', t.description));
    const foot = h('div.kbc-foot');
    if (t.due) {
      const days = NX.diffDays(t.due, new Date());
      foot.appendChild(h('span.chip' + (days < 0 && !t.done ? '.chip-red' : days === 0 ? '.chip-org' : ''), { style: { fontSize: '10px' } },
        [h('span', { html: iconHTML('calendar', 9), style: { display: 'flex' } }), NX.dueLabel(t.due)]));
    }
    if (t.projectId) foot.appendChild(h('span.chip', { style: { fontSize: '10px', background: sel().projectColor(t.projectId) + '22', color: sel().projectColor(t.projectId) } }, sel().projectName(t.projectId)));
    if ((t.checklist || []).length) {
      const done = t.checklist.filter(c => c.done).length;
      foot.appendChild(h('span.chip', { style: { fontSize: '10px' } }, `☑ ${done}/${t.checklist.length}`));
    }
    const subs = sel().subtasksOf(t.id);
    if (subs.length) foot.appendChild(h('span.chip', { style: { fontSize: '10px' } }, `↳ ${subs.filter(s => s.done).length}/${subs.length}`));
    if (t.estimate) foot.appendChild(h('span.chip', { style: { fontSize: '10px' } }, NX.fmtDuration(t.estimate)));
    (t.tags || []).slice(0, 2).forEach(id => foot.appendChild(h('span.chip', { style: { fontSize: '10px', background: sel().tagColor(id) + '20', color: sel().tagColor(id) } }, sel().tagName(id))));
    if (foot.childNodes.length) card.appendChild(foot);

    card.addEventListener('click', e => { if (!e.target.closest('button')) NX.components.openTask(t.id); });
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/nexadesk-task', t.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    NX.ui.bindMenu(card, () => NX.components.taskMenu(t));
    return card;
  }

  function editColumns() {
    const cols = store().getSetting('kanbanColumns', null) || STATUSES;
    const list = h('div');
    const draw = () => {
      NX.clear(list);
      cols.forEach((c, i) => list.appendChild(h('div.row', { style: { padding: '5px 0', borderBottom: '1px solid var(--bd)' } }, [
        h('span', { html: iconHTML('drag', 14), style: { color: 'var(--tx-4)', display: 'flex' } }),
        h('input.input.sm.grow', { value: c, onchange: e => { cols[i] = e.target.value; } }),
        h('button.icon-btn', { html: iconHTML('chevU', 14), onclick: () => { if (i > 0) { cols.splice(i - 1, 0, cols.splice(i, 1)[0]); draw(); } } }),
        h('button.icon-btn', { html: iconHTML('chevD', 14), onclick: () => { if (i < cols.length - 1) { cols.splice(i + 1, 0, cols.splice(i, 1)[0]); draw(); } } }),
        h('button.icon-btn', { html: iconHTML('trash', 14), onclick: () => { cols.splice(i, 1); draw(); } })
      ])));
    };
    draw();
    NX.ui.modal({
      title: 'Kanban columns', body: h('div', [list, h('button.btn.sm.subtle', { style: { marginTop: '10px' }, onclick: () => { cols.push('New column'); draw(); } }, '+ Add column')]),
      footer: [h('button.btn.ghost', { onclick: () => { store().setSetting('kanbanColumns', STATUSES.slice()); NX.ui.closeTopModal(); NX.router.render(); } }, 'Reset to default'),
               h('div.grow'), h('button.btn.primary', { onclick: () => { store().setSetting('kanbanColumns', cols.filter(Boolean)); NX.ui.closeTopModal(); NX.router.render(); } }, 'Save')]
    });
  }

  /* =====================================================================
     TABLE VIEW
     ===================================================================== */
  function tableView(tasks) {
    const cols = [
      { key: 'title', label: 'Task', render: t => h('td', h('div.row', { style: { gap: '7px' } }, [
        h('button.task-check' + (t.done ? '.on' : ''), { onclick: e => { e.stopPropagation(); NX.components.toggleTaskDone(t.id); NX.router.render(); } }),
        h('span', { style: { textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? .6 : 1, fontWeight: '500' } }, t.title)])) },
      { key: 'status', label: 'Status', render: t => h('td', h('span.chip.chip-' + (NX.components.STATUS_COLORS[t.status] || 'gry'), t.status || 'To Do')) },
      { key: 'priority', label: 'Priority', render: t => h('td', t.priority && t.priority !== 'None' ? h('span.chip.chip-' + NX.components.PRIORITY_COLORS[t.priority], t.priority) : h('span.muted', '—')) },
      { key: 'project', label: 'Project', render: t => h('td', t.projectId ? h('span.chip', { style: { background: sel().projectColor(t.projectId) + '22', color: sel().projectColor(t.projectId) } }, sel().projectName(t.projectId)) : h('span.muted', '—')) },
      { key: 'due', label: 'Due', render: t => h('td.c-date', t.due ? h('span', { style: { color: !t.done && NX.isPast(t.due) ? 'var(--acc-red)' : 'inherit' } }, NX.dueLabel(t.due)) : h('span.muted', '—')) },
      { key: 'tags', label: 'Tags', render: t => h('td', h('div.cell-tags', (t.tags || []).map(id => h('span.tag', { style: { background: sel().tagColor(id) + '22', color: sel().tagColor(id) } }, sel().tagName(id))))) },
      { key: 'estimate', label: 'Est.', render: t => h('td.c-num', t.estimate ? NX.fmtDuration(t.estimate) : '—') },
      { key: 'actual', label: 'Actual', render: t => h('td.c-num', t.actual ? NX.fmtDuration(t.actual) : '—') },
      { key: 'progress', label: 'Progress', render: t => { const p = sel().taskProgress(t); return h('td', h('div', { style: { width: '62px' } }, h('div.progress.thin', h('i', { style: { width: p + '%' } })))); } },
      { key: 'repeat', label: 'Repeats', render: t => h('td', t.repeat ? NX.recurrence.label(t.repeat).replace('Every ', '') : h('span.muted', '—')) },
      { key: 'created', label: 'Created', render: t => h('td.c-date', NX.fmtDate(t.created, 'short')) },
      { key: 'score', label: 'AI score', render: t => h('td.c-num', h('b', { style: { color: NX.aiEngine.scoreTask(t) > 100 ? 'var(--acc-red)' : NX.aiEngine.scoreTask(t) > 50 ? 'var(--acc-org)' : 'var(--tx-3)' } }, String(NX.aiEngine.scoreTask(t)))) }
    ];
    const table = h('table.db');
    table.appendChild(h('thead', h('tr', cols.map(c => h('th', {
      onclick: () => { S.sortBy = c.key === 'score' ? 'smart' : c.key === 'due' ? 'due' : c.key === 'title' ? 'alpha' : c.key === 'priority' ? 'priority' : c.key === 'estimate' ? 'estimate' : S.sortBy; persist(); NX.router.render(); }
    }, c.label)))));
    const tbody = h('tbody');
    tasks.forEach(t => {
      const tr = h('tr', { onclick: () => NX.components.openTask(t.id) });
      NX.ui.bindMenu(tr, () => NX.components.taskMenu(t));
      cols.forEach(c => tr.appendChild(c.render(t)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return h('div.db-wrap', [h('div.db-scroll', table), h('div.db-foot', [
      h('span', `${tasks.length} rows`),
      h('span', `${NX.fmtDuration(NX.sum(tasks.map(t => t.estimate || 0)))} estimated`),
      h('span', `${NX.fmtDuration(NX.sum(tasks.map(t => t.actual || 0)))} logged`),
      h('div.grow'),
      h('button.btn.xs.ghost', { onclick: exportCSV }, 'Export CSV')
    ])]);
  }

  /* =====================================================================
     CALENDAR VIEW (tasks only, month grid)
     ===================================================================== */
  function calendarView(tasks) {
    const wrap = h('div');
    let cursor = NX.startOfMonth(new Date());
    const label = h('b');
    const nav = h('div.toolbar', [
      h('button.btn.sm.ghost', { html: iconHTML('chevL', 14), onclick: () => { cursor = NX.addMonths(cursor, -1); paintBody(); } }),
      label,
      h('button.btn.sm.ghost', { html: iconHTML('chevR', 14), onclick: () => { cursor = NX.addMonths(cursor, 1); paintBody(); } }),
      h('button.btn.sm.ghost', { onclick: () => { cursor = NX.startOfMonth(new Date()); paintBody(); } }, 'Today'),
      h('div.grow'),
      h('span.small.muted', 'Click a day to add a task there')
    ]);
    const body = h('div');
    wrap.append(nav, body);
    paintBody();
    function paintBody() {
      label.textContent = NX.MONTHS[cursor.getMonth()] + ' ' + cursor.getFullYear();
      NX.clear(body);
      const grid = h('div.cal-wrap', [
        h('div.cal-head-row', ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => h('div.cal-head-cell', d))),
      ]);
      const cells = h('div.cal-grid');
      const start = NX.startOfWeek(cursor, 1);
      for (let i = 0; i < 42; i++) {
        const d = NX.addDays(start, i);
        const dayTasks = tasks.filter(t => t.due && NX.isSameDay(t.due, d));
        const cell = h('div.cal-cell' + (NX.isSameDay(d, cursor) ? '' : '.other') + (NX.isToday(d) ? '.today' : '') + (NX.isWeekend(d) ? '.weekend' : ''), {
          onclick: async () => { const dd = new Date(d); dd.setHours(17, 0, 0, 0); const t = await NX.actions.newTask(); if (t) { store().tasks.update(t.id, { due: dd.toISOString() }); NX.router.render(); } }
        });
        cell.appendChild(h('div.cal-day', String(d.getDate())));
        dayTasks.slice(0, 3).forEach(t => {
          const pc = { Urgent: 'var(--acc-red)', High: 'var(--acc-org)', Medium: 'var(--acc-blu)', Low: 'var(--acc-grn)', None: 'var(--tx-4)' }[t.priority || 'None'];
          cell.appendChild(h('div.cal-ev', {
            style: { background: (pc || 'var(--tx-4)') + '22', borderLeftColor: pc, textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? .6 : 1 },
            onclick: e => { e.stopPropagation(); NX.components.openTask(t.id); }
          }, (t.done ? '✓ ' : '') + t.title));
        });
        if (dayTasks.length > 3) cell.appendChild(h('div.cal-more', `+${dayTasks.length - 3} more`));
        cells.appendChild(cell);
      }
      grid.appendChild(cells);
      body.appendChild(grid);
      // unscheduled
      const unscheduled = tasks.filter(t => !t.due && !t.done);
      if (unscheduled.length) {
        body.appendChild(h('div.task-group-head', { style: { marginTop: '16px' } }, [h('span', { html: iconHTML('inbox', 14), style: { display: 'flex' } }), 'Unscheduled', h('span.tgh-count', String(unscheduled.length))]));
        unscheduled.slice(0, 20).forEach(t => body.appendChild(NX.components.taskRow(t, { showDue: false })));
      }
    }
    return wrap;
  }

  /* =====================================================================
     BULK / EXPORT / PLAN
     ===================================================================== */
  function bulkMenu(body) {
    const tasks = filtered();
    NX.ui.contextMenu(innerWidth - 200, 200, [
      { header: `${tasks.length} tasks in view` },
      { icon: 'check', label: 'Mark all done', onClick: async () => { if (await NX.ui.confirm({ title: 'Complete all visible tasks?', message: `${tasks.length} tasks will be marked done.`, confirmLabel: 'Complete all', danger: false })) { tasks.forEach(t => store().tasks.update(t.id, { done: true, completed: new Date().toISOString(), status: 'Done' }, true)); store().touch(); store().emit('tasks'); NX.router.render(); } } },
      { icon: 'archive', label: 'Archive all visible', onClick: async () => { if (await NX.ui.confirmDelete(`${tasks.length} tasks`)) { tasks.forEach(t => store().tasks.update(t.id, { archived: true }, true)); store().touch(); store().emit('tasks'); NX.router.render(); } } },
      '-',
      { header: 'Set status for all' },
      ...STATUSES.map(s => ({ label: s, onClick: () => { tasks.forEach(t => store().tasks.update(t.id, { status: s, done: s === 'Done', completed: s === 'Done' ? new Date().toISOString() : null }, true)); store().touch(); store().emit('tasks'); NX.router.render(); } })),
      '-',
      { header: 'Set priority for all' },
      ...['Urgent', 'High', 'Medium', 'Low', 'None'].map(p => ({ label: p, onClick: () => { tasks.forEach(t => store().tasks.update(t.id, { priority: p }, true)); store().touch(); store().emit('tasks'); NX.router.render(); } })),
      '-',
      { icon: 'folder', label: 'Move all to project…', onClick: async () => {
          const projects = store().projects.all().filter(p => !p.archived);
          const pick = await NX.ui.prompt({ title: 'Project name', message: projects.map(p => p.name).join(', ') });
          const p = projects.find(x => x.name.toLowerCase() === String(pick || '').toLowerCase());
          if (p) { tasks.forEach(t => store().tasks.update(t.id, { projectId: p.id }, true)); store().touch(); store().emit('tasks'); NX.router.render(); }
        } },
      { icon: 'calendar', label: 'Spread across next 7 days', onClick: () => { tasks.forEach((t, i) => { const d = NX.addDays(new Date(), i % 7); d.setHours(17, 0, 0, 0); store().tasks.update(t.id, { due: d.toISOString() }, true); }); store().touch(); store().emit('tasks'); NX.router.render(); NX.ui.toast({ message: 'Due dates spread over 7 days' }); } }
    ]);
  }

  function exportCSV() {
    const tasks = filtered();
    const head = ['Title', 'Status', 'Priority', 'Project', 'Due', 'Completed', 'Estimate', 'Actual', 'Repeat', 'Tags', 'Description', 'Created'];
    const rows = tasks.map(t => [t.title, t.status, t.priority, t.projectId ? sel().projectName(t.projectId) : '', t.due ? NX.fmtDateTime(t.due, 'medium') : '', t.completed ? NX.fmtDate(t.completed, 'medium') : '', t.estimate || '', t.actual || '', t.repeat || '', (t.tags || []).map(id => sel().tagName(id)).join('; '), t.description || '', NX.fmtDate(t.created, 'medium')]);
    NX.download(`nexadesk-tasks-${NX.todayStr()}.csv`, NX.md.toCSV([head].concat(rows)), 'text/csv');
    NX.ui.toast({ type: 'success', message: `${rows.length} tasks exported` });
  }
  function exportMarkdown() {
    const tasks = filtered();
    const L = [`# Tasks — ${NX.fmtDate(new Date(), 'long')}`, ''];
    const byStatus = new Map();
    tasks.forEach(t => { const k = t.status || 'To Do'; if (!byStatus.has(k)) byStatus.set(k, []); byStatus.get(k).push(t); });
    STATUSES.forEach(s => {
      const items = byStatus.get(s); if (!items || !items.length) return;
      L.push(`## ${s} (${items.length})`);
      items.forEach(t => L.push(`- [${t.done ? 'x' : ' '}] ${t.title}${t.due ? ` — due ${NX.fmtDate(t.due, 'medium')}` : ''}${t.priority && t.priority !== 'None' ? ` _(${t.priority})_` : ''}${t.projectId ? ` [${sel().projectName(t.projectId)}]` : ''}`));
      L.push('');
    });
    NX.download(`nexadesk-tasks-${NX.todayStr()}.md`, L.join('\n'), 'text/markdown');
    NX.ui.toast({ type: 'success', message: 'Markdown exported' });
  }
  function archiveDone() {
    const done = sel().doneTasks().filter(t => !t.archived);
    if (!done.length) { NX.ui.toast({ type: 'info', message: 'No completed tasks to archive' }); return; }
    done.forEach(t => store().tasks.update(t.id, { archived: true }, true));
    store().touch(); store().emit('tasks');
    NX.router.render();
    NX.ui.toast({ type: 'success', message: `${done.length} completed tasks archived` });
  }

  async function planMyDay() {
    const t = NX.ui.toast({ type: 'info', message: 'Planning your day…', duration: 0 });
    const next = sel().nextUp(14);
    t.close();
    if (!next.length) { NX.ui.toast({ type: 'info', message: 'No open tasks to plan' }); return; }
    // capacity: remaining hours today, assume 60% productive
    const remainingHours = Math.max(1, 22 - new Date().getHours());
    const capacity = Math.round(remainingHours * 60 * 0.6);
    const plan = [];
    let used = 0;
    next.forEach(x => {
      const est = x.task.estimate || 30;
      if (used + est <= capacity) { plan.push({ task: x.task, est, score: x.score }); used += est; }
    });
    const deferred = next.filter(x => !plan.some(p => p.task.id === x.task.id));

    const body = h('div');
    body.appendChild(h('div.card.pad-sm', { style: { background: 'var(--sel)', marginBottom: '14px' } }, [
      h('b.small', 'Suggested plan'),
      h('div.small', { style: { marginTop: '4px', color: 'var(--tx-2)' } },
        `${plan.length} tasks · ${NX.fmtDuration(used)} of ~${NX.fmtDuration(capacity)} realistic capacity left today (${remainingHours}h remaining × 60% focus).`)
    ]));
    const chosen = new Set(plan.map(p => p.task.id));
    const drawList = (title, items) => {
      body.appendChild(h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, title), h('span.sh-sub', `${items.length} · ${NX.fmtDuration(NX.sum(items.map(i => i.task.estimate || 30)))}`)]));
      items.forEach(x => body.appendChild(h('label', { style: { display: 'flex', gap: '9px', alignItems: 'center', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer' } }, [
        h('input', { type: 'checkbox', checked: chosen.has(x.task.id), onchange: e => e.target.checked ? chosen.add(x.task.id) : chosen.delete(x.task.id), style: { accentColor: 'var(--brand-1)' } }),
        h('div.grow', [
          h('div', { style: { fontSize: '13px' } }, x.task.title),
          h('div.small.muted', [x.task.priority !== 'None' ? x.task.priority + ' · ' : '', x.task.due ? NX.dueLabel(x.task.due) + ' · ' : '', '~' + NX.fmtDuration(x.task.estimate || 30), ' · score ' + x.score].join(''))
        ])
      ])));
    };
    drawList('Scheduled for today', plan);
    if (deferred.length) { body.appendChild(h('div.divider')); drawList('Deferred (no capacity)', deferred); }

    NX.ui.modal({
      title: 'Plan my day', size: 'wide', body,
      footer: [
        h('span.small.muted.grow', `${chosen.size} selected`),
        h('button.btn.ghost', { onclick: () => { NX.ui.closeTopModal(); NX.router.navigate('#/calendar'); } }, 'Open calendar'),
        h('button.btn.primary', { onclick: () => {
            const d = new Date();
            let hour = Math.max(d.getHours() + 1, 9);
            let count = 0;
            next.forEach(x => {
              if (!chosen.has(x.task.id)) return;
              const start = new Date(d); start.setHours(hour, 0, 0, 0);
              const dur = x.task.estimate || 30;
              const end = new Date(start.getTime() + dur * 60000);
              if (!NX.isSameDay(start, d) || hour > 22) return;
              store().events.create({ title: '⏱ ' + x.task.title, start: start.toISOString(), end: end.toISOString(), allDay: false, color: '#7c6cff', calendar: 'Focus', description: 'Auto time-blocked by Plan my day', reminder: 5, repeat: null, linkedTaskId: x.task.id, busy: true }, true);
              store().tasks.update(x.task.id, { due: start.toISOString() }, true);
              hour += Math.ceil(dur / 30) * 0.5;
              count++;
            });
            store().touch(); store().emit('events'); store().emit('tasks');
            NX.ui.closeTopModal();
            NX.ui.toast({ type: 'success', title: `${count} tasks time-blocked`, message: 'Added to today\'s calendar with due dates', duration: 5000,
              actions: [{ label: 'View calendar', onClick: () => NX.router.navigate('#/calendar') }] });
          } }, 'Time-block in calendar')
      ]
    });
  }

  NX.router.register({
    id: 'tasks', name: 'Tasks', icon: 'task', group: 'plan', order: 10,
    badge: () => sel().overdueTasks().length,
    render,
    sidebarItems: () => [
      { label: 'Due today', icon: 'calendar', count: sel().tasksDueOn(new Date()).filter(t => !t.done).length, go: () => { S.view = 'smart'; persist(); NX.router.navigate('#/tasks'); } },
      { label: 'Overdue', icon: 'warn', count: sel().overdueTasks().length, go: () => { S.view = 'smart'; persist(); NX.router.navigate('#/tasks'); } },
      { label: 'Kanban board', icon: 'kanban', count: null, go: () => { S.view = 'kanban'; persist(); NX.router.navigate('#/tasks'); } },
      { label: 'Completed', icon: 'check', count: sel().doneTasks().length, go: () => { S.view = 'list'; S.showDone = true; S.sortBy = 'created'; persist(); NX.router.navigate('#/tasks'); } }
    ],
    commands: () => [
      { label: 'Tasks: plan my day', icon: 'sparkle', run: planMyDay },
      { label: 'Tasks: kanban board', icon: 'kanban', run: () => { S.view = 'kanban'; persist(); NX.router.render(); } },
      { label: 'Tasks: mark all visible done', icon: 'check', run: () => { filtered().forEach(t => store().tasks.update(t.id, { done: true, completed: new Date().toISOString(), status: 'Done' }, true)); store().touch(); store().emit('tasks'); NX.router.render(); } },
      { label: 'Tasks: export CSV', icon: 'download', run: exportCSV },
      { label: 'Tasks: archive completed', icon: 'archive', run: archiveDone }
    ]
  });
})(window.NX);
