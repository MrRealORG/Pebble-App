/* ============================================================
   Pebble — components.js : shared widgets used by every module
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  const PRIORITY_COLORS = { Urgent: 'red', High: 'org', Medium: 'yel', Low: 'blu', None: 'gry' };
  const STATUS_COLORS = { Backlog: 'gry', 'To Do': 'blu', 'In Progress': 'pur', Blocked: 'red', Review: 'org', Done: 'grn' };

  /* ------------------------------ TASK ROW ------------------------------ */
  function taskRow(t, opts) {
    opts = opts || {};
    const progress = sel().taskProgress(t);
    const row = h('div.task-row' + (t.done ? '.done' : ''), {
      dataset: { task: t.id },
      onclick: e => { if (!e.target.closest('button,input,a')) opts.onClick ? opts.onClick(t) : openTask(t.id); }
    });
    NX.ui.bindMenu(row, () => taskMenu(t));

    row.appendChild(h('button.task-check' + (t.done ? '.on' : '') + (!t.done && t.priority === 'High' ? '.p-high' : '') + (!t.done && t.priority === 'Urgent' ? '.p-high' : '') + (!t.done && t.priority === 'Medium' ? '.p-med' : '') + (!t.done && t.priority === 'Low' ? '.p-low' : ''), {
      title: t.done ? 'Mark as not done' : 'Mark done',
      onclick: e => { e.stopPropagation(); toggleTaskDone(t.id); }
    }));

    const main = h('div.tr-main');
    main.appendChild(h('div.tr-title', t.title || '(untitled)'));
    const sub = h('div.tr-sub');
    if (opts.showProject !== false && t.projectId) {
      sub.appendChild(h('span.chip', {
        style: { background: sel().projectColor(t.projectId) + '22', color: sel().projectColor(t.projectId) },
        onclick: e => { e.stopPropagation(); NX.router.go('tasks', { project: t.projectId }); }
      }, sel().projectName(t.projectId)));
    }
    if (opts.showDue !== false && t.due) {
      const days = NX.diffDays(t.due, new Date());
      const cls = days < 0 && !t.done ? 'overdue' : days <= 1 ? 'soon' : '';
      sub.appendChild(h('span.tr-meta', [
        h('span', { html: iconHTML('calendar', 11), style: { display: 'flex' } }),
        h('span.' + cls, NX.dueLabel(t.due) + (new Date(t.due).getHours() || new Date(t.due).getMinutes() ? ' ' + NX.fmtTime(t.due) : ''))
      ]));
    }
    if (t.repeat) sub.appendChild(h('span.tr-meta', [h('span', { html: iconHTML('repeat', 11), style: { display: 'flex' } }), NX.recurrence.label(t.repeat).replace('Every ', '')]));
    if ((t.checklist || []).length) {
      const done = t.checklist.filter(c => c.done).length;
      sub.appendChild(h('span.tr-meta', `${done}/${t.checklist.length}`));
    }
    const subs = sel().subtasksOf(t.id);
    if (subs.length) sub.appendChild(h('span.tr-meta', `${subs.filter(s => s.done).length}/${subs.length} subtasks`));
    if (t.estimate) sub.appendChild(h('span.tr-meta', NX.fmtDuration(t.estimate)));
    if (t.description) sub.appendChild(h('span.tr-meta', { html: iconHTML('note', 11), style: { display: 'flex' }, title: t.description }));
    (t.tags || []).slice(0, 3).forEach(tagId => sub.appendChild(h('span.tag', {
      style: { background: sel().tagColor(tagId) + '22', color: sel().tagColor(tagId) },
      onclick: e => { e.stopPropagation(); NX.router.go('tasks', { tag: tagId }); }
    }, sel().tagName(tagId))));
    if (t.priority && t.priority !== 'None' && opts.showPriority !== false) {
      sub.appendChild(h('span.chip.chip-' + PRIORITY_COLORS[t.priority], t.priority));
    }
    main.appendChild(sub);

    if (opts.showChecklist && (t.checklist || []).length) {
      const cl = h('div.tr-subtasks');
      t.checklist.forEach((c, i) => cl.appendChild(h('label.tr-sub' + (c.done ? '.done' : ''), [
        h('input', { type: 'checkbox', checked: c.done, onchange: () => {
          const list = t.checklist.slice(); list[i] = Object.assign({}, c, { done: !c.done });
          store().tasks.update(t.id, { checklist: list }, true); store().emit('tasks');
        } }),
        h('span', c.text)
      ])));
      main.appendChild(cl);
    }
    row.appendChild(main);

    const right = h('div.tr-right');
    if (!t.done && progress > 0 && progress < 100) {
      right.appendChild(h('div', { style: { width: '44px' } }, h('div.progress.thin', h('i', { style: { width: progress + '%' } }))));
    }
    if (t.status && opts.showStatus !== false) {
      right.appendChild(h('span.chip.chip-' + (STATUS_COLORS[t.status] || 'gry'), {
        onclick: e => {
          e.stopPropagation();
          NX.ui.dropdown(e.currentTarget, ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done'].map(s => ({
            label: s, checked: s === t.status, onClick: () => { store().tasks.update(t.id, { status: s, done: s === 'Done', completed: s === 'Done' ? new Date().toISOString() : null }); NX.router.render(); }
          })), { right: true });
        }
      }, t.status));
    }
    right.appendChild(h('button.icon-btn', {
      html: iconHTML('more', 15), title: 'More',
      onclick: e => { e.stopPropagation(); NX.ui.dropdown(e.currentTarget, taskMenu(t), { right: true }); }
    }));
    row.appendChild(right);
    return row;
  }

  function taskMenu(t) {
    return [
      { icon: 'edit', label: 'Edit task…', onClick: () => editTask(t.id) },
      { icon: 'eye', label: 'Open details', onClick: () => openTask(t.id) },
      { icon: t.done ? 'refresh' : 'check', label: t.done ? 'Mark as not done' : 'Mark done', onClick: () => toggleTaskDone(t.id) },
      '-',
      { header: 'Set status' },
      ...['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done'].map(s => ({
        label: s, checked: t.status === s, keepOpen: false,
        onClick: () => { store().tasks.update(t.id, { status: s, done: s === 'Done', completed: s === 'Done' ? new Date().toISOString() : null }); NX.router.render(); }
      })),
      '-',
      { header: 'Set priority' },
      ...['Urgent', 'High', 'Medium', 'Low', 'None'].map(p => ({
        label: p, checked: t.priority === p, emoji: p === 'Urgent' ? '🔴' : p === 'High' ? '🟠' : p === 'Medium' ? '🟡' : p === 'Low' ? '🔵' : '⚪',
        onClick: () => { store().tasks.update(t.id, { priority: p }); NX.router.render(); }
      })),
      '-',
      { icon: 'calendar', label: 'Due today', onClick: () => { const d = new Date(); d.setHours(17, 0, 0, 0); store().tasks.update(t.id, { due: d.toISOString() }); NX.router.render(); } },
      { icon: 'calendar', label: 'Due tomorrow', onClick: () => { const d = NX.addDays(new Date(), 1); d.setHours(9, 0, 0, 0); store().tasks.update(t.id, { due: d.toISOString() }); NX.router.render(); } },
      { icon: 'calendar', label: 'Next week', onClick: () => { const d = NX.addDays(NX.startOfWeek(new Date()), 7); d.setHours(9, 0, 0, 0); store().tasks.update(t.id, { due: d.toISOString() }); NX.router.render(); } },
      { icon: 'x', label: 'Clear due date', onClick: () => { store().tasks.update(t.id, { due: null }); NX.router.render(); } },
      '-',
      { icon: 'timer', label: 'Start time tracking', onClick: () => NX.timeTracker.start(t.id) },
      { icon: 'bell', label: 'Remind me…', onClick: async () => {
          const mins = await NX.ui.prompt({ title: 'Remind me in', value: '30', message: 'Minutes from now' });
          if (!mins) return;
          store().reminders.create({ title: t.title, body: 'Task reminder', at: NX.addMinutes(new Date(), Number(mins) || 30).toISOString(), done: false, priority: 'normal', deepLink: '#/tasks', linkedId: t.id });
          NX.ui.toast({ type: 'success', message: 'Reminder set' });
        } },
      { icon: 'note', label: 'Create note from task', onClick: () => {
          const n = store().notes.create({ title: t.title, icon: '📝', emoji: '📝', tags: t.tags || [], parentId: null, order: 0, favorite: false, archived: false, properties: [],
            blocks: [NX.md.newBlock('h1', { text: t.title }), NX.md.newBlock('text', { text: t.description || '' })] });
          NX.router.go('notes', { id: n.id });
        } },
      { icon: 'copy', label: 'Duplicate', onClick: () => {
          const c = NX.deepClone(t); delete c.id; delete c.created; delete c.updated;
          c.title = t.title + ' (copy)'; c.done = false; c.completed = null; c.status = 'To Do';
          store().tasks.create(c); NX.ui.toast({ type: 'success', message: 'Duplicated' }); NX.router.render();
        } },
      { icon: 'link', label: 'Copy link to task', onClick: () => NX.copyText(location.origin + location.pathname + '#/tasks?focus=' + t.id).then(() => NX.ui.toast({ message: 'Link copied', duration: 1500 })) },
      '-',
      { icon: 'archive', label: 'Archive', onClick: () => { store().tasks.update(t.id, { archived: true }); NX.ui.toast({ message: 'Archived', duration: 2000 }); NX.router.render(); } },
      { icon: 'trash', label: 'Delete task', danger: true, onClick: async () => {
          if (await NX.ui.confirmDelete('this task', `“${t.title}” will be moved to the trash.`)) {
            sel().subtasksOf(t.id).forEach(s => store().tasks.remove(s.id, true));
            store().tasks.remove(t.id); NX.ui.toast({ type: 'success', message: 'Task deleted' }); NX.router.render();
          }
        } }
    ];
  }

  /* ------------------------------ TASK ACTIONS ------------------------------ */
  function toggleTaskDone(id, force) {
    const t = store().tasks.find(id);
    if (!t) return;
    const done = force === undefined ? !t.done : force;
    if (done) {
      store().tasks.update(id, { done: true, completed: new Date().toISOString(), status: 'Done' });
      // recurring?
      if (t.repeat && t.due) {
        const next = NX.recurrence.advanceTask(t);
        if (next) {
          const clone = NX.deepClone(t);
          delete clone.id; delete clone.created; delete clone.updated;
          clone.done = false; clone.completed = null; clone.status = 'To Do'; clone.due = next;
          clone.actual = 0;
          store().tasks.create(clone, true);
          NX.ui.toast({ type: 'success', title: 'Completed', message: `${t.title} · repeats ${NX.fmtDate(next, 'medium')}`, duration: 4200,
            actions: [{ label: 'Undo', onClick: () => undoTaskDone(id, t) }] });
          store().emit('tasks');
          return;
        }
      }
      // pomodoro / time log nudge
      NX.ui.toast({ type: 'success', title: 'Nice — task complete', message: t.title, duration: 3400,
        actions: [{ label: 'Undo', onClick: () => undoTaskDone(id, t) }] });
    } else {
      undoTaskDone(id, t);
    }
    store().emit('tasks');
  }
  function undoTaskDone(id, prev) {
    store().tasks.update(id, { done: false, completed: null, status: prev.status === 'Done' ? 'To Do' : prev.status });
    // remove the recurrence clone we just made
    const clones = store().tasks.all().filter(t => t.title === prev.title && !t.done && t.created && Date.now() - new Date(t.created).getTime() < 8000 && t.id !== id);
    clones.forEach(c => store().tasks.remove(c.id, true));
    store().emit('tasks');
    NX.ui.toast({ message: 'Undone', duration: 1500 });
  }

  async function editTask(id) {
    const t = store().tasks.find(id);
    if (!t) return;
    const res = await NX.ui.form({
      title: 'Edit task', wide: true, okLabel: 'Save',
      fields: [
        { key: 'title', label: 'Task', type: 'text', value: t.title, required: true, full: true },
        { key: 'description', label: 'Description', type: 'textarea', value: t.description || '', rows: 4, full: true },
        { key: 'projectId', label: 'Project', type: 'select', value: t.projectId || '', options: [{ value: '', label: '— none —' }].concat(store().projects.all().filter(p => !p.archived).map(p => ({ value: p.id, label: p.icon + ' ' + p.name }))) },
        { key: 'status', label: 'Status', type: 'select', value: t.status, options: ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done'] },
        { key: 'priority', label: 'Priority', type: 'select', value: t.priority || 'None', options: ['None', 'Low', 'Medium', 'High', 'Urgent'] },
        { key: 'due', label: 'Due', type: 'datetime', value: t.due ? NX.ymdhm(t.due) : '' },
        { key: 'estimate', label: 'Estimate (min)', type: 'number', value: t.estimate || 0, min: 0 },
        { key: 'actual', label: 'Actual (min)', type: 'number', value: t.actual || 0, min: 0 },
        { key: 'repeat', label: 'Repeats', type: 'select', value: t.repeat || '', options: NX.recurrence.options.map(o => ({ value: o.value, label: o.label })) },
        { key: 'tags', label: 'Tags', type: 'tags', value: t.tags || [] }
      ]
    });
    if (!res) return;
    store().tasks.update(id, {
      title: res.title, description: res.description, projectId: res.projectId || null,
      status: res.status, priority: res.priority, due: res.due ? new Date(res.due).toISOString() : null,
      estimate: Number(res.estimate) || 0, actual: Number(res.actual) || 0, repeat: res.repeat || null, tags: res.tags || []
    });
    NX.ui.toast({ type: 'success', message: 'Task updated' });
    NX.router.render();
  }

  function openTask(id) {
    const t = store().tasks.find(id);
    if (!t) return;
    renderTaskDetail(t);
  }

  function renderTaskDetail(t) {
    const subs = sel().subtasksOf(t.id);
    const logs = store().timeLogs.all().filter(l => l.taskId === t.id);
    const rem = store().reminders.all().filter(r => r.linkedId === t.id);
    const m = NX.ui.modal({
      title: 'Task', size: 'wide',
      body: h('div', { id: 'taskDetail' }),
      footer: [
        h('button.btn.ghost', { onclick: () => { m.close(); editTask(t.id); } }, 'Edit'),
        h('div.grow'),
        h('button.btn.danger', { onclick: async () => { if (await NX.ui.confirmDelete('this task')) { store().tasks.remove(t.id); m.close(); NX.router.render(); } } }, 'Delete'),
        h('button.btn.primary', { onclick: () => { toggleTaskDone(t.id); m.close(); } }, t.done ? 'Reopen' : 'Complete')
      ]
    });
    paint();
    function paint() {
      const t2 = store().tasks.find(t.id);
      const box = document.getElementById('taskDetail');
      if (!box || !t2) return;
      NX.clear(box);
      const progress = sel().taskProgress(t2);
      box.appendChild(h('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start' } }, [
        h('button.task-check' + (t2.done ? '.on' : ''), { style: { width: '24px', height: '24px', marginTop: '3px' }, onclick: () => { toggleTaskDone(t2.id); paint(); } }),
        h('div.grow', [
          h('h2', { style: { fontSize: '20px', letterSpacing: '-.4px', textDecoration: t2.done ? 'line-through' : 'none', opacity: t2.done ? .6 : 1 } }, t2.title),
          h('div.row-wrap', { style: { marginTop: '8px', gap: '6px' } }, [
            t2.projectId ? h('span.chip', { style: { background: sel().projectColor(t2.projectId) + '22', color: sel().projectColor(t2.projectId) } }, sel().projectName(t2.projectId)) : null,
            h('span.chip.chip-' + (STATUS_COLORS[t2.status] || 'gry'), t2.status || 'To Do'),
            t2.priority && t2.priority !== 'None' ? h('span.chip.chip-' + PRIORITY_COLORS[t2.priority], t2.priority + ' priority') : null,
            t2.due ? h('span.chip', { html: iconHTML('calendar', 11) + ' ' + NX.fmtDateTime(t2.due, 'medium') }) : null,
            t2.repeat ? h('span.chip', { html: iconHTML('repeat', 11) + ' ' + NX.recurrence.label(t2.repeat) }) : null,
            (t2.tags || []).map(id => h('span.tag', { style: { background: sel().tagColor(id) + '22', color: sel().tagColor(id) } }, sel().tagName(id)))
          ])
        ])
      ]));

      if (progress > 0 || (t2.checklist || []).length || subs.length) {
        box.appendChild(h('div', { style: { margin: '16px 0' } }, [
          h('div.row', { style: { justifyContent: 'space-between', marginBottom: '5px' } }, [
            h('span.small.muted', 'Progress'), h('b.small', progress + '%')
          ]),
          h('div.progress', h('i', { style: { width: progress + '%' } }))
        ]));
      }

      if (t2.description) box.appendChild(h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)', marginBottom: '14px', fontSize: '13px', lineHeight: '1.65', whiteSpace: 'pre-wrap' } }, t2.description));

      // checklist
      box.appendChild(h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, 'Checklist'), h('span.sh-sub', `${(t2.checklist || []).filter(c => c.done).length}/${(t2.checklist || []).length}`), h('div.grow'),
        h('button.btn.xs.ghost', { onclick: () => addChecklist(t2, paint) }, '+ Add')]));
      if ((t2.checklist || []).length) {
        box.appendChild(h('div', t2.checklist.map((c, i) => h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0' } }, [
          h('input', { type: 'checkbox', checked: c.done, style: { accentColor: 'var(--brand-1)' }, onchange: () => { const l = t2.checklist.slice(); l[i] = Object.assign({}, c, { done: !c.done }); store().tasks.update(t2.id, { checklist: l }, true); paint(); } }),
          h('span.grow', { style: { fontSize: '13px', textDecoration: c.done ? 'line-through' : 'none', opacity: c.done ? .55 : 1 } }, c.text),
          h('button.icon-btn', { html: iconHTML('trash', 13), title: 'Remove', onclick: () => { const l = t2.checklist.slice(); l.splice(i, 1); store().tasks.update(t2.id, { checklist: l }); paint(); } })
        ]))));
      } else box.appendChild(h('p.small.muted', { style: { marginBottom: '12px' } }, 'No checklist items.'));

      // subtasks
      box.appendChild(h('div.section-head', { style: { marginTop: '16px' } }, [h('h2', { style: { fontSize: '13px' } }, 'Subtasks'), h('span.sh-sub', String(subs.length)), h('div.grow'),
        h('button.btn.xs.ghost', { onclick: async () => { const title = await NX.ui.prompt({ title: 'New subtask', placeholder: 'Subtask title' }); if (title) { store().tasks.create({ title, parentId: t2.id, projectId: t2.projectId, status: 'To Do', priority: 'None', tags: [], checklist: [], order: 0, done: false, estimate: 0, archived: false }); paint(); } } }, '+ Add')]));
      if (subs.length) box.appendChild(h('div', subs.map(s => h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0' } }, [
        h('button.task-check' + (s.done ? '.on' : ''), { onclick: () => { toggleTaskDone(s.id); paint(); } }),
        h('span.grow', { style: { fontSize: '13px', textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? .55 : 1, cursor: 'pointer' }, onclick: () => { m.close(); openTask(s.id); } }, s.title)
      ]))));

      // time
      box.appendChild(h('div.section-head', { style: { marginTop: '16px' } }, [h('h2', { style: { fontSize: '13px' } }, 'Time'), h('div.grow'),
        h('button.btn.xs.ghost', { onclick: () => { NX.timeTracker.start(t2.id); m.close(); } }, '▶ Start timer')]));
      box.appendChild(h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)' } }, [
        NX.ui.kv('Estimate', t2.estimate ? NX.fmtDuration(t2.estimate) : '—'),
        NX.ui.kv('Logged manually', t2.actual ? NX.fmtDuration(t2.actual) : '—'),
        NX.ui.kv('Timer logs', logs.length ? `${logs.length} · ${NX.fmtDuration(NX.sum(logs.map(l => l.minutes || 0)))}` : '—')
      ]));

      if (rem.length) {
        box.appendChild(h('div.section-head', { style: { marginTop: '16px' } }, [h('h2', { style: { fontSize: '13px' } }, 'Reminders')]));
        box.appendChild(h('div', rem.map(r => h('div.small', { style: { padding: '3px 0', color: r.done ? 'var(--tx-4)' : 'var(--tx-2)' } }, `${r.done ? '✓' : '⏰'} ${r.title} — ${NX.fmtDateTime(r.at, 'medium')}`))));
      }

      box.appendChild(h('div.section-head', { style: { marginTop: '16px' } }, [h('h2', { style: { fontSize: '13px' } }, 'Meta')]));
      box.appendChild(h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)' } }, [
        NX.ui.kv('Created', NX.fmtDateTime(t2.created, 'medium')),
        NX.ui.kv('Updated', NX.relTime(t2.updated)),
        t2.completed ? NX.ui.kv('Completed', NX.fmtDateTime(t2.completed, 'medium')) : null,
        NX.ui.kv('AI priority score', String(NX.aiEngine.scoreTask(t2)))
      ]));
    }
  }

  async function addChecklist(t, after) {
    const text = await NX.ui.prompt({ title: 'Add checklist item', placeholder: 'e.g. Send the invoice' });
    if (!text) return;
    const list = (t.checklist || []).concat([{ id: NX.uid('c'), text, done: false }]);
    store().tasks.update(t.id, { checklist: list });
    after && after();
  }

  /* ------------------------------ HABIT TOGGLE ------------------------------ */
  function toggleHabit(id, dateKey, force) {
    const hb = store().habits.find(id);
    if (!hb) return;
    dateKey = dateKey || NX.todayStr();
    if (NX.diffDays(dateKey, new Date()) > 0) { NX.ui.toast({ type: 'warn', message: 'You cannot log a future day' }); return; }
    const hist = Object.assign({}, hb.history || {});
    const next = force === undefined ? !hist[dateKey] : force;
    if (next) hist[dateKey] = 1; else delete hist[dateKey];
    store().habits.update(id, { history: hist });
    if (next && dateKey === NX.todayStr()) {
      const streak = sel().habitStreak(hb);
      if (streak > 0 && streak % 7 === 0) NX.ui.toast({ type: 'success', title: `🔥 ${streak}-day streak!`, message: hb.name + ' — a full week. Keep going.', duration: 5000 });
      else NX.ui.toast({ type: 'success', message: `${hb.emoji || '✓'} ${hb.name} logged${streak ? ' · ' + streak + '-day streak' : ''}`, duration: 2200 });
    }
    store().emit('habits');
    return next;
  }

  /* ------------------------------ EVENT ROW ------------------------------ */
  function eventRow(e, opts) {
    opts = opts || {};
    const row = h('div.agenda-item', { onclick: () => opts.onClick ? opts.onClick(e) : openEvent(e.id) });
    NX.ui.bindMenu(row, () => eventMenu(e));
    row.appendChild(h('div.agenda-time', e.allDay ? 'all day' : NX.fmtTime(e.start) + (opts.showEnd === false ? '' : '–' + NX.fmtTime(e.end))));
    row.appendChild(h('div.agenda-bar', { style: { background: e.color || 'var(--brand-1)' } }));
    row.appendChild(h('div.grow', [
      h('div', { style: { fontSize: '13px', fontWeight: '550' } }, e.title),
      h('div.small.muted', [e.location ? e.location + ' · ' : '', NX.fmtDate(e.start, 'medium'), e.attendees && e.attendees.length ? ' · ' + e.attendees.length + ' attending' : ''].join(''))
    ]));
    return row;
  }

  function eventMenu(e) {
    return [
      { icon: 'edit', label: 'Edit event…', onClick: () => editEvent(e.id) },
      { icon: 'copy', label: 'Duplicate', onClick: () => { const c = NX.deepClone(e); delete c.id; store().events.create(c); NX.router.render(); } },
      { icon: 'note', label: 'Create note from event', onClick: () => {
          const n = store().notes.create({ title: e.title, icon: '🗓️', emoji: '🗓️', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [
            { id: NX.uid('p'), name: 'Date', type: 'date', value: String(e.start).slice(0, 10) },
            { id: NX.uid('p'), name: 'Location', type: 'text', value: e.location || '' }
          ], blocks: [NX.md.newBlock('h2', { text: 'Agenda' }), NX.md.newBlock('number'), NX.md.newBlock('h2', { text: 'Notes' }), NX.md.newBlock('text', { text: e.description || '' }), NX.md.newBlock('h2', { text: 'Action items' }), NX.md.newBlock('todo')] });
          NX.router.go('notes', { id: n.id });
        } },
      { icon: 'task', label: 'Create task from event', onClick: () => {
          store().tasks.create({ title: e.title, description: e.description || '', projectId: null, status: 'To Do', priority: 'Medium', due: e.start, repeat: null, tags: [], checklist: [], estimate: Math.max(15, Math.round((new Date(e.end) - new Date(e.start)) / 60000)), order: 0, done: false, archived: false });
          NX.ui.toast({ type: 'success', message: 'Task created' });
        } },
      { icon: 'bell', label: 'Set a reminder', onClick: () => { store().reminders.create({ title: e.title, body: e.location || '', at: e.start, done: false, priority: 'normal', deepLink: '#/calendar', linkedId: e.id }); NX.ui.toast({ type: 'success', message: 'Reminder set' }); } },
      '-',
      { icon: 'trash', label: 'Delete event', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('this event')) { store().events.remove(e.id); NX.ui.toast({ message: 'Event deleted' }); NX.router.render(); } } }
    ];
  }

  function openEvent(id) { editEvent(id); }

  async function editEvent(id) {
    const e = store().events.find(id);
    if (!e) return;
    const res = await NX.ui.form({
      title: 'Edit event', wide: true, okLabel: 'Save',
      fields: [
        { key: 'title', label: 'Title', type: 'text', value: e.title, required: true, full: true },
        { key: 'start', label: 'Starts', type: 'datetime', value: NX.ymdhm(e.start) },
        { key: 'end', label: 'Ends', type: 'datetime', value: NX.ymdhm(e.end || e.start) },
        { key: 'allDay', label: 'All-day', type: 'checkbox', value: !!e.allDay },
        { key: 'location', label: 'Location', type: 'text', value: e.location || '' },
        { key: 'calendar', label: 'Calendar', type: 'select', value: e.calendar || 'Personal', options: NX.unique(store().events.all().map(x => x.calendar).concat(['Personal', 'Work', 'Health', 'Focus', 'Social'])) },
        { key: 'color', label: 'Colour', type: 'color', value: e.color || '#7c6cff' },
        { key: 'reminder', label: 'Remind me', type: 'select', value: e.reminder === null || e.reminder === undefined ? '' : String(e.reminder), options: [
          { value: '', label: 'No reminder' }, { value: '0', label: 'At time of event' }, { value: '5', label: '5 minutes before' },
          { value: '10', label: '10 minutes before' }, { value: '30', label: '30 minutes before' }, { value: '60', label: '1 hour before' },
          { value: '1440', label: '1 day before' }, { value: '4320', label: '3 days before' }] },
        { key: 'repeat', label: 'Repeats', type: 'select', value: e.repeat || '', options: NX.recurrence.options.map(o => ({ value: o.value, label: o.label })) },
        { key: 'busy', label: 'Show as busy', type: 'checkbox', value: e.busy !== false },
        { key: 'description', label: 'Description', type: 'textarea', value: e.description || '', rows: 3, full: true }
      ]
    });
    if (!res) return;
    const start = new Date(res.start), end = res.end ? new Date(res.end) : new Date(start.getTime() + 3600000);
    store().events.update(id, {
      title: res.title, start: start.toISOString(), end: end.toISOString(), allDay: !!res.allDay,
      location: res.location, calendar: res.calendar, color: res.color, description: res.description,
      reminder: res.reminder === '' ? null : Number(res.reminder), repeat: res.repeat || null, busy: !!res.busy
    });
    NX.ui.toast({ type: 'success', message: 'Event updated' });
    NX.router.render();
  }

  /* ------------------------------ MISC SHARED ------------------------------ */
  function tagChip(tagOrId, onClick) {
    const id = typeof tagOrId === 'string' ? tagOrId : tagOrId.id;
    const name = typeof tagOrId === 'string' ? sel().tagName(id) : tagOrId.name;
    const color = typeof tagOrId === 'string' ? sel().tagColor(id) : (tagOrId.color || '#8b8f98');
    return h('span.tag', { style: { background: color + '22', color }, onclick: onClick && (e => { e.stopPropagation(); onClick(id, name); }) }, '#' + name);
  }

  function filterBar(config) {
    const bar = h('div.toolbar');
    config.forEach(c => {
      if (c.type === 'sep') { bar.appendChild(h('div.tb-sep')); return; }
      if (c.type === 'spacer') { bar.appendChild(h('div.grow')); return; }
      if (c.type === 'search') {
        const inp = h('input.input.sm', { placeholder: c.placeholder || 'Filter…', value: c.value || '', style: { width: (c.width || 190) + 'px' } });
        inp.addEventListener('input', NX.debounce(() => c.onInput(inp.value), 180));
        bar.appendChild(inp); return;
      }
      if (c.type === 'select') {
        const s = h('select.select.sm', { style: { width: 'auto' }, onchange: e => c.onChange(e.target.value) },
          c.options.map(o => { const opt = typeof o === 'string' ? { value: o, label: o } : o; return h('option', { value: opt.value, selected: String(opt.value) === String(c.value) }, opt.label); }));
        bar.appendChild(s); return;
      }
      if (c.type === 'seg') {
        const seg = h('div.seg', c.options.map(o => {
          const val = typeof o === 'string' ? o : o.value;
          const label = typeof o === 'string' ? o : o.label;
          return h('button' + (String(val) === String(c.value) ? '.on' : ''), { onclick: () => c.onChange(val) }, label);
        }));
        bar.appendChild(seg); return;
      }
      if (c.type === 'button') {
        bar.appendChild(h('button.btn.sm' + (c.variant ? '.' + c.variant : '.ghost'), { onclick: c.onClick, title: c.title }, [
          c.icon ? h('span', { html: iconHTML(c.icon, 13), style: { display: 'flex' } }) : null, c.label]));
        return;
      }
      if (c.type === 'chip') {
        bar.appendChild(h('span.chip.clickable' + (c.active ? '.on' : ''), { onclick: c.onClick }, c.label));
        return;
      }
      if (c.type === 'text') { bar.appendChild(h('span.small.muted', c.text)); return; }
    });
    return bar;
  }

  function pageHead(opts) {
    return h('div.page-head', [
      opts.icon ? h('div.ph-ico', { html: iconHTML(opts.icon, 21) }) : null,
      h('div.grow', [
        h('h1', opts.title),
        opts.sub ? h('div.ph-sub', opts.sub) : null
      ]),
      opts.actions ? h('div.ph-actions', opts.actions) : null
    ]);
  }

  function emptyBox(iconName, title, msg, btnLabel, btnFn) {
    return NX.ui.emptyState(iconName, title, msg, btnLabel, btnFn);
  }

  function statTile(label, value, sub, iconName, accent, onClick) {
    return h('div.stat' + (accent ? '.accent-' + accent : '') + (onClick ? '.clickable' : ''), onClick ? { onclick: onClick } : null, [
      h('div.st-label', label),
      h('div.st-value', String(value)),
      sub ? h('div.st-sub', sub) : null,
      iconName ? h('div.st-ico', { html: iconHTML(iconName, 30) }) : null
    ]);
  }

  NX.components = {
    taskRow, taskMenu, toggleTaskDone, editTask, openTask, renderTaskDetail,
    toggleHabit, eventRow, eventMenu, editEvent, openEvent,
    tagChip, filterBar, pageHead, emptyBox, statTile,
    PRIORITY_COLORS, STATUS_COLORS
  };
})(window.NX);
