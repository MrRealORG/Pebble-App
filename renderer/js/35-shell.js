/* ============================================================
   Pebble — shell.js : app chrome, palette, quick capture,
   keyboard shortcuts, status bar, boot
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML, icon } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  let railEl, sidebarEl, sidebarBody, viewEl, crumbsEl, statusEl;
  let paletteOpen = false, paletteSel = 0, paletteItems = [], paletteTypeFilter = null;
  let qcOpen = false, qcType = 'note';

  /* =====================================================================
     BOOT
     ===================================================================== */
  async function boot() {
    const hint = document.getElementById('bootHint');
    const setHint = t => { if (hint) hint.textContent = t; };

    setHint('Loading workspace data…');
    await store().load();

    setHint('Building interface…');
    await new Promise(r => requestAnimationFrame(r));

    railEl = document.getElementById('rail');
    sidebarEl = document.getElementById('sidebar');
    sidebarBody = document.getElementById('sidebarBody');
    viewEl = document.getElementById('view');
    crumbsEl = document.getElementById('crumbs');
    statusEl = document.getElementById('statusbar');

    applyChromeSettings();
    buildRail();
    buildSidebar();
    buildTopbarActions();
    initPalette();
    initQuickCapture();
    initShortcuts();
    initDragDrop();
    NX.ui.initTooltips();

    document.getElementById('app').hidden = false;
    document.getElementById('workspaceName').textContent = store().getSetting('workspaceName', 'Pebble');
    document.getElementById('workspaceSub').textContent = store().getSetting('userName', 'You') + ' · ' + (store().desktop ? 'Desktop' : 'Browser');

    NX.router.start();
    startTimers();
    updateUserFooter();
    updateBadges();

    store().on(() => { updateBadges(); updateUserFooter(); });
    store().on('notes', () => buildSidebar());
    store().on('projects', () => buildSidebar());
    store().on('tags', () => buildSidebar());

    // desktop bridge
    if (store().desktop) {
      window.nex.onNavigate(hash => NX.router.navigate(hash));
      window.nex.onReminderFired(r => NX.ui.toast({ type: 'warn', title: r.title, message: r.body, duration: 8000 }));
      try {
        const p = await window.nex.paths();
        NX.appInfo = p;
      } catch (e) {}
    } else {
      // browser fallback: request Notification permission lazily
      if ('Notification' in window && Notification.permission === 'default') {
        // ask on first reminder creation rather than at boot
      }
    }

    // hide splash
    setTimeout(() => {
      const b = document.getElementById('boot');
      if (b) { b.classList.add('done'); setTimeout(() => b.remove(), 400); }
    }, 380);

    // welcome toast on very first run
    if (!NX.localStore.get('nexadesk.welcomed', false)) {
      NX.localStore.set('nexadesk.welcomed', true);
      setTimeout(() => NX.ui.toast({
        type: 'success', title: 'Welcome to Pebble', duration: 9000,
        message: 'Press Ctrl+K for the command palette, or Ctrl+Shift+N to capture anything instantly.',
        actions: [{ label: 'Take the tour', primary: true, onClick: () => NX.router.navigate('#/notes/' + (store().notes.all().find(n => /Welcome/.test(n.title)) || {}).id) }]
      }), 1200);
    }
  }

  function applyChromeSettings() {
    const app = document.getElementById('app');
    app.classList.toggle('sb-collapsed', !!store().getSetting('sidebarCollapsed', false));
    if (!store().getSetting('showStatusBar', true)) statusEl && (statusEl.style.display = 'none');
  }

  /* =====================================================================
     RAIL
     ===================================================================== */
  function buildRail() {
    NX.clear(railEl);
    railEl.appendChild(h('div.rail-logo', {
      title: 'Pebble — Dashboard',
      html: `<svg viewBox="0 0 64 64" width="20" height="20"><path d="M20 44V20l24 24V20" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      onclick: () => NX.router.navigate('#/dashboard')
    }));
    NX.router.visible().forEach(m => {
      if (m.rail === false) return;
      const btn = h('button.rail-btn', {
        dataset: { module: m.id },
        title: `${m.name}${m.shortcut ? ' (' + m.shortcut + ')' : ''}`,
        onclick: () => NX.router.navigate('#/' + m.id)
      }, [
        h('span', { html: iconHTML(m.icon || 'dashboard', 19) }),
        m.badge ? h('span.rail-badge', { dataset: { badge: m.id }, hidden: true }) : null
      ]);
      railEl.appendChild(btn);
    });
    railEl.appendChild(h('div.rail-spacer'));
    railEl.appendChild(h('div.rail-sep'));
    railEl.appendChild(h('button.rail-btn', { title: 'Settings', onclick: () => NX.router.navigate('#/settings') },
      h('span', { html: iconHTML('settings', 19) })));
    syncRailActive();
  }

  function syncRailActive() {
    const id = NX.router.currentId();
    NX.$$('.rail-btn', railEl).forEach(b => b.classList.toggle('active', b.dataset.module === id));
  }

  function updateBadges() {
    const counts = {};
    NX.router.visible().forEach(m => { if (m.badge) { try { counts[m.id] = m.badge(); } catch (e) { counts[m.id] = 0; } } });
    NX.$$('[data-badge]', railEl).forEach(el => {
      const n = counts[el.dataset.badge] || 0;
      el.textContent = n > 99 ? '99+' : n;
      el.hidden = !n;
    });
    const ib = document.getElementById('inboxBadge');
    if (ib) { const n = sel().unreadInbox().length; ib.textContent = n > 99 ? '99+' : n; ib.hidden = !n; }
    // tray badge (desktop)
    if (store().desktop && window.nex.setBadge) {
      const due = sel().dueReminders().length;
      window.nex.setBadge(due).catch(() => {});
    }
    // sidebar counts
    NX.$$('[data-count]', sidebarBody).forEach(el => {
      const fn = el.dataset.count;
      let n = 0;
      try { n = SIDEBAR_COUNTS[fn] ? SIDEBAR_COUNTS[fn]() : 0; } catch (e) {}
      el.textContent = n; el.hidden = !n;
    });
    updateStatus();
  }

  const SIDEBAR_COUNTS = {
    overdue: () => sel().overdueTasks().length,
    today: () => sel().tasksDueOn(new Date()).filter(t => !t.done).length,
    openTasks: () => sel().openTasks().length,
    unreadInbox: () => sel().unreadInbox().length,
    pendingReminders: () => sel().pendingReminders().length,
    notes: () => store().notes.all().filter(n => !n.archived).length,
    favorites: () => sel().favoriteNotes().length,
    unreadChat: () => sel().totalUnread(),
    habitsToday: () => { const x = sel().habitsCompletedToday(); return x.total - x.done; }
  };

  /* =====================================================================
     SIDEBAR
     ===================================================================== */
  function buildSidebar() {
    if (!sidebarBody) return;
    NX.clear(sidebarBody);
    const collapsedGroups = NX.localStore.get('nexadesk.sbGroups', {});

    NX.router.grouped().forEach(({ group, modules }) => {
      const g = h('div.sb-group' + (collapsedGroups[group.id] ? '.collapsed' : ''));
      g.appendChild(h('button.sb-group-head', {
        onclick: () => {
          g.classList.toggle('collapsed');
          collapsedGroups[group.id] = g.classList.contains('collapsed');
          NX.localStore.set('nexadesk.sbGroups', collapsedGroups);
        }
      }, [
        h('span.chev', { html: iconHTML('chevD', 13) }),
        h('span', group.name)
      ]));
      const items = h('div.sb-items');
      modules.forEach(m => {
        const badgeFn = m.badgeCount || m.badgeKey;
        items.appendChild(h('button.sb-item', {
          dataset: { module: m.id },
          onclick: () => NX.router.navigate('#/' + m.id)
        }, [
          h('span.ico', { html: iconHTML(m.icon || 'dashboard', 15) }),
          h('span.lbl', m.name),
          m.count ? h('span.pill', { dataset: { count: m.count }, hidden: true }) : null,
          h('span.row-actions', m.actions ? m.actions.map(a =>
            h('button', { title: a.title, html: iconHTML(a.icon, 13), onclick: e => { e.stopPropagation(); a.run(); } })) : null)
        ]));
        // module-specific sub-navigation
        if (m.sidebarItems) {
          try {
            m.sidebarItems().forEach(sub => {
              items.appendChild(h('button.sb-item.nested', { onclick: () => sub.go() }, [
                sub.emoji ? h('span.ico', sub.emoji) : h('span.ico', { html: iconHTML(sub.icon || 'chevR', 13) }),
                h('span.lbl', sub.label),
                sub.count !== undefined && sub.count !== null ? h('span.meta', String(sub.count)) : null
              ]));
            });
          } catch (e) {}
        }
      });
      g.appendChild(items);
      sidebarBody.appendChild(g);
    });

    // favourites
    const favs = sel().favoriteNotes().slice(0, 8);
    if (favs.length) {
      const g = h('div.sb-group');
      g.appendChild(h('div.sb-group-head', [h('span', { html: iconHTML('star', 12), style: { marginRight: '4px' } }), h('span', 'Favourites')]));
      const items = h('div.sb-items');
      favs.forEach(n => items.appendChild(h('button.sb-item', { onclick: () => NX.router.go('notes', { id: n.id }) }, [
        h('span.ico', n.icon || '📄'),
        h('span.lbl', n.title)
      ])));
      g.appendChild(items);
      sidebarBody.appendChild(g);
    }

    syncSidebarActive();
  }

  function syncSidebarActive() {
    const id = NX.router.currentId();
    NX.$$('.sb-item', sidebarBody).forEach(b => b.classList.toggle('active', b.dataset.module === id));
    syncRailActive();
  }

  function updateUserFooter() {
    const u = document.getElementById('sbUser');
    const st = document.getElementById('sbStats');
    if (!u || !st) return;
    const name = store().getSetting('userName', 'You');
    const status = store().getSetting('userStatus', 'online');
    NX.clear(u);
    u.appendChild(NX.ui.avatar(name, store().getSetting('accent', '#7c6cff'), 'sm', status));
    u.appendChild(h('div.grow', [
      h('div', { style: { fontSize: '12.5px', fontWeight: '600', lineHeight: '1.25' } }, name),
      h('div', { style: { fontSize: '10.5px', color: 'var(--tx-4)', textTransform: 'capitalize' } }, status)
    ]));
    u.appendChild(h('button.icon-btn', {
      html: iconHTML('more', 15), title: 'Account',
      onclick: e => NX.ui.dropdown(e.currentTarget, [
        { header: 'Status' },
        ...['online', 'idle', 'dnd', 'offline'].map(s => ({
          label: s === 'dnd' ? 'Do not disturb' : s[0].toUpperCase() + s.slice(1),
          checked: store().getSetting('userStatus') === s,
          onClick: () => { store().setSetting('userStatus', s); updateUserFooter(); NX.ui.toast({ type: 'info', message: 'Status set to ' + s, duration: 1800 }); }
        })),
        '-',
        { icon: 'edit', label: 'Rename workspace…', onClick: renameWorkspace },
        { icon: 'settings', label: 'Settings', key: 'Ctrl+,', onClick: () => NX.router.navigate('#/settings') },
        { icon: 'key', label: 'Keyboard shortcuts', key: 'Ctrl+/', onClick: () => showShortcuts() },
        '-',
        { icon: 'download', label: 'Export all data…', onClick: () => NX.router.go('settings', { tab: 'data' }) },
        { icon: 'info', label: 'About Pebble', onClick: () => showAbout() }
      ], { right: true, up: true })
    }));

    NX.clear(st);
    const notes = store().notes.all().filter(n => !n.archived).length;
    const tasks = sel().openTasks().length;
    const habits = sel().habitsCompletedToday();
    [['Notes', notes], ['Open', tasks], ['Habits', `${habits.done}/${habits.total}`]].forEach(([k, v]) =>
      st.appendChild(h('div.sb-stat', [h('b', String(v)), h('span', k)])));
  }

  async function renameWorkspace() {
    const name = await NX.ui.prompt({ title: 'Rename workspace', value: store().getSetting('workspaceName', 'My Workspace'), placeholder: 'Workspace name' });
    if (name) {
      store().setSetting('workspaceName', name);
      document.getElementById('workspaceName').textContent = name;
      document.title = name + ' — Pebble';
      NX.ui.toast({ type: 'success', message: 'Workspace renamed' });
    }
  }

  /* =====================================================================
     TOPBAR / CRUMBS / STATUS
     ===================================================================== */
  function buildTopbarActions() {
    document.getElementById('btnTheme').onclick = toggleTheme;
    document.getElementById('btnQuick').onclick = () => openQuickCapture();
    document.getElementById('btnInbox').onclick = () => NX.router.navigate('#/inbox');
    document.getElementById('btnAI').onclick = () => NX.router.navigate('#/ai');
    document.getElementById('openPalette').onclick = () => openPalette();
    document.getElementById('sbCollapse').onclick = toggleSidebar;
    document.getElementById('sbExpand').onclick = toggleSidebar;
    document.title = 'Pebble';
  }

  function toggleTheme() {
    const order = ['dark', 'light', 'sepia', 'midnight'];
    const cur = store().getSetting('theme', 'dark');
    const next = order[(order.indexOf(cur) + 1) % order.length];
    store().setSetting('theme', next);
    NX.ui.toast({ type: 'info', message: next[0].toUpperCase() + next.slice(1) + ' theme', duration: 1400 });
  }

  function toggleSidebar() {
    const app = document.getElementById('app');
    app.classList.toggle('sb-collapsed');
    store().setSetting('sidebarCollapsed', app.classList.contains('sb-collapsed'));
  }

  function updateCrumbs(mod, route) {
    NX.clear(crumbsEl);
    if (!mod) return;
    const parts = [{ label: mod.emoji ? mod.emoji + ' ' : '', html: iconHTML(mod.icon || 'dashboard', 14), name: mod.name, hash: '#/' + mod.id }];
    if (mod.crumbs) { try { (mod.crumbs(route.params) || []).forEach(p => parts.push(p)); } catch (e) {} }
    parts.forEach((p, i) => {
      if (i) crumbsEl.appendChild(h('span.sep', '/'));
      const isLast = i === parts.length - 1;
      crumbsEl.appendChild(h('span.crumb' + (isLast ? '.last' : ''), {
        onclick: isLast ? null : () => NX.router.navigate(p.hash || '#/' + mod.id)
      }, [p.icon ? h('span', { html: iconHTML(p.icon, 14), style: { display: 'flex' } }) : null, p.name || p.label]));
    });
  }

  function updateStatus() {
    if (!statusEl) return;
    NX.clear(statusEl);
    const s = store();
    const saved = s.lastSavedAt;
    statusEl.appendChild(h('span.sb-chip', [
      h('span.dot' + (s.dirty ? '.off' : '')),
      s.dirty ? 'Saving…' : (saved ? 'Saved ' + NX.fmtTime(saved) : 'Ready')
    ]));
    statusEl.appendChild(h('span.sb-chip', `${s.notes.count()} notes`));
    statusEl.appendChild(h('span.sb-chip', `${sel().openTasks().length} open tasks`));
    const due = sel().dueReminders().length;
    if (due) statusEl.appendChild(h('span.sb-chip', { style: { color: 'var(--acc-org)' } }, `⏰ ${due} due`));
    statusEl.appendChild(h('span.spacer'));
    statusEl.appendChild(h('span.sb-chip', NX.ai.mode === 'api' ? `🤖 AI: ${NX.ai.providerInfo().name}` : '🤖 AI: offline engine'));
    statusEl.appendChild(h('span.sb-chip', NX.fmtBytes(s.storageBytes())));
    statusEl.appendChild(h('span.sb-chip', s.desktop ? 'Desktop' : 'Browser'));
  }

  /* =====================================================================
     SHELL UPDATE (called by router after each render)
     ===================================================================== */
  function shellUpdate(route, mod) {
    syncRailActive(); syncSidebarActive();
    updateCrumbs(mod, route);
    updateStatus();
  }

  /* =====================================================================
     COMMAND PALETTE
     ===================================================================== */
  function initPalette() {
    const backdrop = document.getElementById('palette');
    const input = document.getElementById('paletteInput');
    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) closePalette(); });
    input.addEventListener('input', () => { paletteSel = 0; renderPalette(input.value); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteItems.length - 1, paletteSel + 1); renderPalette(input.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(0, paletteSel - 1); renderPalette(input.value); }
      else if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(paletteItems[paletteSel]); }
      else if (e.key === 'Tab') { e.preventDefault(); cycleTypeFilter(input.value); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
  }

  function cycleTypeFilter(q) {
    const types = [null, 'note', 'task', 'wiki', 'command', 'event', 'bookmark', 'contact', 'message'];
    const i = types.indexOf(paletteTypeFilter);
    paletteTypeFilter = types[(i + 1) % types.length];
    paletteSel = 0;
    const input = document.getElementById('paletteInput');
    input.placeholder = paletteTypeFilter ? `Filtering: ${paletteTypeFilter} — press Tab to change` : 'Search everything or run a command…';
    renderPalette(input.value);
  }

  function openPalette(prefill) {
    paletteOpen = true; paletteSel = 0;
    const backdrop = document.getElementById('palette');
    const input = document.getElementById('paletteInput');
    backdrop.hidden = false;
    input.value = prefill || '';
    renderPalette(input.value);
    setTimeout(() => input.focus(), 20);
  }
  function closePalette() {
    paletteOpen = false;
    document.getElementById('palette').hidden = true;
    paletteTypeFilter = null;
    document.getElementById('paletteInput').placeholder = 'Search everything or run a command…';
  }

  function commands() {
    const list = [];
    NX.router.visible().forEach(m => list.push({
      type: 'command', title: 'Go to ' + m.name, sub: 'Module', icon: m.icon || 'dashboard',
      run: () => NX.router.navigate('#/' + m.id)
    }));
    // module-declared commands
    NX.router.all().forEach(m => {
      if (!m.commands) return;
      try { m.commands().forEach(c => list.push({ type: 'command', title: c.label, sub: c.hint || m.name, icon: c.icon || m.icon || 'zap', run: c.run })); } catch (e) {}
    });
    // universal commands
    const U = [
      { title: 'New note', icon: 'plus', run: () => NX.actions.newNote() },
      { title: 'New task', icon: 'plus', run: () => NX.actions.newTask() },
      { title: 'New event', icon: 'plus', run: () => NX.actions.newEvent() },
      { title: 'New reminder', icon: 'bell', run: () => NX.actions.newReminder() },
      { title: 'New habit', icon: 'flame', run: () => NX.actions.newHabit() },
      { title: 'New goal', icon: 'target', run: () => NX.actions.newGoal() },
      { title: 'New project', icon: 'folder', run: () => NX.actions.newProject() },
      { title: 'New wiki page', icon: 'book', run: () => NX.actions.newWikiPage() },
      { title: 'New bookmark', icon: 'bookmark', run: () => NX.actions.newBookmark() },
      { title: 'New contact', icon: 'contact', run: () => NX.actions.newContact() },
      { title: 'New transaction', icon: 'money', run: () => NX.actions.newTransaction() },
      { title: 'Write today\'s journal entry', icon: 'journal', run: () => NX.router.go('journal', { date: NX.todayStr() }) },
      { title: 'Start a focus session', icon: 'timer', run: () => NX.router.navigate('#/pomodoro') },
      { title: 'Start tracking time', icon: 'clock', run: () => NX.actions.startTimer() },
      { title: 'Toggle theme', icon: 'palette', run: toggleTheme },
      { title: 'Toggle sidebar', icon: 'columns', run: toggleSidebar },
      { title: 'Generate weekly review', icon: 'sparkle', run: () => NX.actions.weeklyReview() },
      { title: 'Show AI insights', icon: 'brain', run: () => NX.router.go('ai', { tab: 'insights' }) },
      { title: 'Export all data as JSON', icon: 'download', run: () => NX.actions.exportJSON() },
      { title: 'Export notes as Markdown', icon: 'download', run: () => NX.actions.exportMarkdown() },
      { title: 'Import data…', icon: 'upload', run: () => NX.actions.importData() },
      { title: 'Show keyboard shortcuts', icon: 'key', run: showShortcuts },
      { title: 'Open settings', icon: 'settings', run: () => NX.router.navigate('#/settings') },
      { title: 'Save now', icon: 'save', run: async () => { await store().save(); NX.ui.toast({ type: 'success', message: 'Workspace saved', duration: 1600 }); } }
    ];
    U.forEach(c => list.push(Object.assign({ type: 'command', sub: 'Command' }, c)));
    return list;
  }

  function renderPalette(query) {
    const box = document.getElementById('paletteResults');
    NX.clear(box);
    const q = String(query || '').trim();
    const items = [];

    if (paletteTypeFilter === 'command' || !paletteTypeFilter) {
      const cmds = commands();
      const matched = q
        ? cmds.filter(c => c.title.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
        : cmds.filter(c => c.type === 'command' && /^Go to/.test(c.title)).slice(0, 10);
      matched.forEach(c => items.push(Object.assign({}, c, { type: 'command' })));
    }

    if (q && paletteTypeFilter !== 'command') {
      const kinds = paletteTypeFilter && paletteTypeFilter !== 'command' ? [paletteTypeFilter] : null;
      try {
        NX.aiEngine.search(q, { limit: 22, kinds }).forEach(res => {
          const d = res.doc;
          items.push({
            type: d.kind, title: d.title || '(untitled)', sub: d.text ? NX.aiEngine.snippetFor(d.text, [], '').slice(0, 90) : '',
            icon: null, emoji: d.extra || '', score: res.score,
            run: () => NX.actions.openResult(d)
          });
        });
      } catch (e) { console.error(e); }
    }
    if (!q) {
      // recents
      sel().recentNotes(6).forEach(n => items.push({
        type: 'note', title: n.title, sub: 'Recent · ' + NX.relTime(n.updated), emoji: n.icon || '📄',
        run: () => NX.router.go('notes', { id: n.id })
      }));
      sel().nextUp(4).forEach(x => items.push({
        type: 'task', title: x.task.title, sub: 'Priority score ' + x.score, emoji: '✅',
        run: () => NX.actions.openResult({ kind: 'task', id: x.task.id })
      }));
    }

    paletteItems = items.slice(0, 40);
    if (!paletteItems.length) {
      box.appendChild(h('div.empty', [
        h('h4', 'No matches'),
        h('p', q ? `Nothing found for “${q}”.` : 'Type to search notes, tasks, wiki pages, messages and commands.'),
        q ? h('button.btn.primary', { onclick: () => NX.actions.quickCreate(q, () => closePalette()) }, `Create “${q}”`) : null
      ]));
      return;
    }

    let lastType = null;
    paletteItems.forEach((it, i) => {
      if (it.type !== lastType) {
        box.appendChild(h('div.pal-group', it.type === 'command' ? 'Commands' : it.type + 's'));
        lastType = it.type;
      }
      box.appendChild(h('button.pal-item' + (i === paletteSel ? '.sel' : ''), {
        onclick: () => runPaletteItem(it),
        onmousemove: () => { paletteSel = i; NX.$$('.pal-item', box).forEach((n, j) => n.classList.toggle('sel', j === i)); }
      }, [
        h('span.pi-ico', it.emoji ? it.emoji : h('span', { html: iconHTML(it.icon || 'zap', 14) })),
        h('span.pi-main', [
          h('span.pi-title', { html: q && it.type !== 'command' ? NX.aiEngine.highlight(it.title, q) : esc(it.title) }),
          it.sub ? h('span.pi-sub', it.sub) : null
        ]),
        h('span.pi-type', it.type)
      ]));
    });
    const active = box.querySelector('.pal-item.sel');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function runPaletteItem(it) {
    if (!it) return;
    closePalette();
    try { it.run(); } catch (e) { console.error(e); NX.ui.toast({ type: 'error', message: String(e.message || e) }); }
  }

  /* =====================================================================
     QUICK CAPTURE
     ===================================================================== */
  function initQuickCapture() {
    const backdrop = document.getElementById('quickcap');
    const text = document.getElementById('qcText');
    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop) closeQuickCapture(); });
    NX.$$('[data-qc]').forEach(b => b.onclick = () => {
      qcType = b.dataset.qc;
      NX.$$('[data-qc]').forEach(x => x.classList.toggle('on', x === b));
      text.placeholder = {
        note: 'Capture a thought… (markdown works)',
        task: 'Task title — try "email Sam tomorrow 3pm !high #work"',
        reminder: 'What should I remind you about, and when?',
        journal: 'How is the day going?'
      }[qcType];
      document.getElementById('qcWhen').style.display = (qcType === 'note' || qcType === 'journal') ? 'none' : '';
      text.focus();
    });
    document.getElementById('qcCancel').onclick = closeQuickCapture;
    document.getElementById('qcSave').onclick = submitQuickCapture;
    text.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitQuickCapture(); }
      if (e.key === 'Escape') closeQuickCapture();
    });
    refreshQcTags();
  }

  function refreshQcTags() {
    const s = document.getElementById('qcTag');
    if (!s) return;
    NX.clear(s);
    s.appendChild(h('option', { value: '' }, 'no tag'));
    sel().allTags().slice(0, 40).forEach(t => s.appendChild(h('option', { value: t.id }, '#' + t.name)));
  }

  function openQuickCapture(type) {
    qcOpen = true;
    document.getElementById('quickcap').hidden = false;
    const text = document.getElementById('qcText');
    text.value = '';
    document.getElementById('qcWhen').value = '';
    document.getElementById('qcTag').value = '';
    refreshQcTags();
    if (type) { const b = NX.$('[data-qc="' + type + '"]'); if (b) b.click(); }
    setTimeout(() => text.focus(), 20);
  }
  function closeQuickCapture() { qcOpen = false; document.getElementById('quickcap').hidden = true; }

  function submitQuickCapture() {
    const text = document.getElementById('qcText').value.trim();
    if (!text) { closeQuickCapture(); return; }
    const whenVal = document.getElementById('qcWhen').value;
    const tagVal = document.getElementById('qcTag').value;
    const tags = tagVal ? [tagVal] : [];

    if (qcType === 'note') {
      const parsed = NX.aiEngine.parseQuickCapture(text);
      const allTags = parsed.tags.map(name => {
        const t = store().tags.all().find(x => x.name === name);
        return t ? t.id : store().tags.create({ name, color: NX.colorFromString(name) }, true).id;
      }).concat(tags);
      const blocks = NX.md.markdownToBlocks(parsed.title.includes('\n') ? parsed.title : text);
      const note = store().notes.create({
        title: blocks.length ? NX.md.stripInline(blocks[0].text || '').slice(0, 90) || 'Untitled' : 'Untitled',
        icon: store().getSetting('defaultNoteIcon', '📄'), emoji: store().getSetting('defaultNoteIcon', '📄'),
        blocks, tags: allTags, parentId: null, order: 0, favorite: false, archived: false, properties: []
      });
      closeQuickCapture();
      NX.ui.toast({ type: 'success', title: 'Note captured', message: note.title, duration: 4000,
        actions: [{ label: 'Open', primary: true, onClick: () => NX.router.go('notes', { id: note.id }) }] });
      return;
    }

    if (qcType === 'task') {
      const parsed = NX.aiEngine.parseQuickCapture(text);
      const parsedTags = parsed.tags.map(name => {
        const t = store().tags.all().find(x => x.name === name);
        return t ? t.id : store().tags.create({ name, color: NX.colorFromString(name) }, true).id;
      }).concat(tags);
      let projectId = null;
      if (parsed.projectHint) {
        const p = store().projects.all().find(x => x.name.toLowerCase().includes(parsed.projectHint));
        if (p) projectId = p.id;
      }
      const due = parsed.due || (whenVal ? new Date(whenVal).toISOString() : null);
      const task = store().tasks.create({
        title: parsed.title, description: '', projectId, status: 'To Do', priority: parsed.priority,
        due, repeat: parsed.repeat, tags: parsedTags, estimate: 0, checklist: [], order: 0,
        done: false, completed: null, parentId: null, archived: false
      });
      if (due) {
        store().reminders.create({
          title: task.title, body: 'Task due', at: due, repeat: null, done: false,
          priority: task.priority === 'Urgent' || task.priority === 'High' ? 'high' : 'normal',
          deepLink: '#/tasks', linkedId: task.id
        }, true);
      }
      closeQuickCapture();
      NX.ui.toast({ type: 'success', title: 'Task added', message: task.title + (due ? ' · due ' + NX.dueLabel(due) : ''), duration: 4000,
        actions: [{ label: 'View', onClick: () => NX.router.navigate('#/tasks') }] });
      return;
    }

    if (qcType === 'reminder') {
      const parsed = NX.aiEngine.parseWhen(text);
      let at = parsed.date;
      if (whenVal) at = new Date(whenVal);
      if (!at) at = NX.addMinutes(new Date(), 30);
      const title = whenVal ? text : (parsed.cleaned || text);
      store().reminders.create({
        title: title.slice(0, 120), body: '', at: at.toISOString(), repeat: parsed.repeat, done: false,
        priority: /!high|urgent|important/i.test(text) ? 'high' : 'normal', deepLink: '#/reminders'
      });
      closeQuickCapture();
      NX.ui.toast({ type: 'success', title: 'Reminder set', message: `${title} · ${NX.fmtDateTime(at, 'medium')}`, duration: 5000 });
      return;
    }

    if (qcType === 'journal') {
      const key = NX.todayStr();
      let entry = sel().journalFor(key);
      if (entry) store().journal.update(entry.id, { text: (entry.text ? entry.text + '\n\n' : '') + text });
      else store().journal.create({ date: key, mood: 3, text, tags, gratitude: [], prompts: {}, energy: 3 });
      closeQuickCapture();
      NX.ui.toast({ type: 'success', title: 'Journal saved', message: 'Added to today\'s entry', duration: 3200,
        actions: [{ label: 'Open', onClick: () => NX.router.go('journal', { date: key }) }] });
    }
  }

  /* =====================================================================
     GLOBAL SHORTCUTS
     ===================================================================== */
  const SHORTCUTS = [
    { keys: 'Ctrl+K', desc: 'Command palette', scope: 'global' },
    { keys: 'Ctrl+Shift+N', desc: 'Quick capture', scope: 'global' },
    { keys: 'Ctrl+Shift+F', desc: 'Global search', scope: 'global' },
    { keys: 'Ctrl+B', desc: 'Toggle sidebar', scope: 'global' },
    { keys: 'Ctrl+S', desc: 'Save now', scope: 'global' },
    { keys: 'Ctrl+/', desc: 'Show all shortcuts', scope: 'global' },
    { keys: 'Ctrl+,', desc: 'Settings', scope: 'global' },
    { keys: 'Ctrl+N', desc: 'New note', scope: 'global' },
    { keys: 'Ctrl+T', desc: 'New task', scope: 'global' },
    { keys: 'Ctrl+D', desc: 'Today / dashboard', scope: 'global' },
    { keys: 'Ctrl+1…9', desc: 'Jump to module 1–9', scope: 'global' },
    { keys: 'Alt+←', desc: 'Navigate back', scope: 'global' },
    { keys: 'Esc', desc: 'Close overlay / clear selection', scope: 'global' },
    { keys: '/', desc: 'Block menu (in note editor)', scope: 'notes' },
    { keys: 'Ctrl+E', desc: 'Inline code', scope: 'notes' },
    { keys: 'Ctrl+Shift+1/2/3', desc: 'Heading 1 / 2 / 3', scope: 'notes' },
    { keys: 'Ctrl+Shift+7', desc: 'Numbered list', scope: 'notes' },
    { keys: 'Ctrl+Shift+8', desc: 'Bulleted list', scope: 'notes' },
    { keys: 'Ctrl+Shift+9', desc: 'To-do', scope: 'notes' },
    { keys: 'Alt+↑ / Alt+↓', desc: 'Move block', scope: 'notes' },
    { keys: 'Ctrl+Enter', desc: 'Save (in dialogs & quick capture)', scope: 'global' },
    { keys: 'Ctrl+Shift+D', desc: 'Duplicate current item', scope: 'notes' },
    { keys: 'Space', desc: 'Start / pause pomodoro', scope: 'pomodoro' }
  ];

  function showShortcuts() {
    NX.ui.modal({
      title: 'Keyboard shortcuts', size: 'wide', hideFooter: true,
      body: h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '20px' } },
        ['global', 'notes', 'pomodoro'].map(scope => h('div', [
          h('h4', { style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--tx-4)', marginBottom: '8px' } }, scope === 'global' ? 'Everywhere' : scope),
          h('div', SHORTCUTS.filter(s => s.scope === scope).map(s =>
            h('div.row', { style: { justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--bd)', fontSize: '12.5px' } }, [
              h('span.muted', s.desc), h('span', [h('kbd.key', s.keys)])
            ])))
        ])))
    });
  }

  function showAbout() {
    const info = NX.appInfo || {};
    NX.ui.modal({
      title: 'About Pebble', size: '', hideFooter: true,
      body: h('div', [
        h('div', { style: { textAlign: 'center', padding: '10px 0 18px' } }, [
          h('div', { html: `<svg viewBox="0 0 64 64" width="66" height="66" style="margin:0 auto"><defs><linearGradient id="ab" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c6cff"/><stop offset="1" stop-color="#33b8a3"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="16" fill="url(#ab)"/><path d="M20 44V20l24 24V20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>` }),
          h('h2', { style: { fontSize: '24px', marginTop: '10px', letterSpacing: '-.5px' } }, 'Pebble'),
          h('div.muted', { style: { fontSize: '12.5px' } }, 'Version 1.0.0 · Your all-in-one workspace')
        ]),
        h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)' } }, [
          NX.ui.kv('Modules', String(NX.router.visible().length)),
          NX.ui.kv('Notes', String(store().notes.count())),
          NX.ui.kv('Tasks', String(store().tasks.count())),
          NX.ui.kv('Wiki pages', String(store().wiki.count())),
          NX.ui.kv('Messages', String(store().messages.count())),
          NX.ui.kv('Stored data', NX.fmtBytes(store().storageBytes())),
          NX.ui.kv('AI mode', NX.ai.mode === 'api' ? NX.ai.providerInfo().name + ' · ' + NX.ai.activeModel() : 'Offline engine'),
          NX.ui.kv('Runtime', store().desktop ? `Electron ${info.electron || ''} · Chrome ${info.chrome || ''}` : 'Browser · Chrome ' + (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1])
        ]),
        h('p.small.muted', { style: { marginTop: '14px', lineHeight: '1.65' } },
          'All data is stored locally on this machine. Nothing leaves your device unless you add an AI provider API key, in which case only the context you send is transmitted to that provider.')
      ])
    });
  }

  function initShortcuts() {
    document.addEventListener('keydown', e => {
      const mod = e.metaKey || e.ctrlKey;
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;

      if (e.key === 'Escape') {
        if (NX.ui.isModalOpen()) { NX.ui.closeTopModal(); e.preventDefault(); return; }
        if (paletteOpen) { closePalette(); e.preventDefault(); return; }
        if (qcOpen) { closeQuickCapture(); e.preventDefault(); return; }
        NX.ui.closeMenu();
        document.dispatchEvent(new CustomEvent('nx:escape'));
        return;
      }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen ? closePalette() : openPalette(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openQuickCapture(); return; }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); NX.router.navigate('#/search'); return; }
      if (mod && e.key.toLowerCase() === 'b' && !e.shiftKey) { e.preventDefault(); toggleSidebar(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); store().save().then(() => NX.ui.toast({ type: 'success', message: 'Saved', duration: 1300 })); return; }
      if (mod && e.key === '/') { e.preventDefault(); showShortcuts(); return; }
      if (mod && e.key === ',') { e.preventDefault(); NX.router.navigate('#/settings'); return; }
      if (mod && e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); NX.router.back(); return; }
      if (!inField) {
        if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey) { e.preventDefault(); NX.actions.newNote(); return; }
        if (mod && e.key.toLowerCase() === 't' && !e.shiftKey) { e.preventDefault(); NX.actions.newTask(); return; }
        if (mod && e.key.toLowerCase() === 'd' && !e.shiftKey) { e.preventDefault(); NX.router.navigate('#/dashboard'); return; }
        if (mod && /^[1-9]$/.test(e.key)) {
          e.preventDefault();
          const mods = NX.router.visible();
          const m = mods[+e.key - 1];
          if (m) NX.router.navigate('#/' + m.id);
          return;
        }
      }
      document.dispatchEvent(new CustomEvent('nx:key', { detail: e }));
    });
  }

  /* =====================================================================
     GLOBAL DRAG & DROP (files -> attachments)
     ===================================================================== */
  function initDragDrop() {
    let depth = 0;
    let overlay = null;
    document.addEventListener('dragenter', e => {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
      e.preventDefault(); depth++;
      if (!overlay) {
        overlay = h('div', {
          style: { position: 'fixed', inset: '0', zIndex: '9000', background: 'var(--bg-overlay)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', pointerEvents: 'none' }
        }, h('div.card', { style: { padding: '34px 52px', textAlign: 'center', boxShadow: 'var(--sh-3)' } }, [
          h('div', { style: { fontSize: '40px', marginBottom: '8px' } }, '📥'),
          h('div', { style: { fontSize: '16px', fontWeight: '650' } }, 'Drop to attach'),
          h('div.small.muted', 'Files are added to the currently open note, or saved as bookmarks')
        ]));
        document.body.appendChild(overlay);
      }
    });
    document.addEventListener('dragover', e => { if (overlay) e.preventDefault(); });
    document.addEventListener('dragleave', e => { e.preventDefault(); depth--; if (depth <= 0 && overlay) { overlay.remove(); overlay = null; depth = 0; } });
    document.addEventListener('drop', async e => {
      if (!e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault();
      if (overlay) { overlay.remove(); overlay = null; depth = 0; }
      const files = Array.from(e.dataTransfer.files);
      await NX.actions.handleDroppedFiles(files);
    });
  }

  /* =====================================================================
     TIMERS — clock, reminder poll, status refresh
     ===================================================================== */
  function startTimers() {
    setInterval(updateStatus, 20000);
    setInterval(() => { syncRailActive(); syncSidebarActive(); }, 4000);
    // in-page reminder poll (the Electron main process also polls, but this
    // covers the browser build and keeps the tray badge fresh)
    setInterval(() => {
      try {
        const fired = NX.reminders.pollDue();
        fired.forEach(r => {
          if (store().getSetting('notifyOnReminder', true)) notify(r.title, r.body);
          NX.ui.toast({ type: 'warn', title: '⏰ ' + r.title, message: r.body, duration: 12000,
            actions: [
              { label: 'Snooze 10m', onClick: () => { NX.reminders.snooze(r.id, 10); NX.ui.toast({ message: 'Snoozed 10 minutes', duration: 1600 }); } },
              { label: 'Done', primary: true, onClick: () => NX.reminders.complete(r.id) }
            ] });
        });
      } catch (e) {}
      // task-due notifications
      try {
        if (store().getSetting('notifyOnTaskDue', true)) {
          const now = Date.now();
          sel().openTasks().forEach(t => {
            if (!t.due || t._notified) return;
            const dt = new Date(t.due).getTime();
            if (dt <= now && dt > now - 60000) {
              t._notified = true;
              notify('Task due: ' + t.title, 'Due ' + NX.dueLabel(t.due));
              store().inbox.create({ type: 'task', title: 'Task due: ' + t.title, body: 'Was due ' + NX.dueLabel(t.due), icon: 'task', read: false, deepLink: '#/tasks', priority: 'high' }, true);
            }
          });
        }
      } catch (e) {}
    }, 20000);
  }

  function notify(title, body) {
    if (!store().getSetting('notificationsEnabled', true)) return;
    if (store().desktop && window.nex.notify) { window.nex.notify(title, body, !store().getSetting('notifySound', true)).catch(() => {}); return; }
    if ('Notification' in window) {
      if (Notification.permission === 'granted') { try { new Notification(title, { body }); } catch (e) {} }
      else if (Notification.permission !== 'denied') Notification.requestPermission();
    }
  }

  /* =====================================================================
     ACTIONS — used by palette, empty states, context menus
     ===================================================================== */
  NX.actions = {
    async newNote(parentId) {
      const icon = store().getSetting('defaultNoteIcon', '📄');
      const n = store().notes.create({
        title: '', icon, emoji: icon, parentId: parentId || null, order: 0,
        favorite: false, archived: false, tags: [], cover: '', coverColor: '',
        properties: [], blocks: [NX.md.newBlock('text')]
      });
      NX.router.go('notes', { id: n.id });
      setTimeout(() => { const t = document.querySelector('.note-title-input'); if (t) t.focus(); }, 120);
      return n;
    },
    async newTask(opts) {
      const t = await NX.ui.form({
        title: 'New task', wide: true, okLabel: 'Create task',
        fields: [
          { key: 'title', label: 'Task', type: 'text', required: true, placeholder: 'What needs doing?', full: true },
          { key: 'projectId', label: 'Project', type: 'select', options: [{ value: '', label: '— none —' }].concat(store().projects.all().filter(p => !p.archived).map(p => ({ value: p.id, label: p.icon + ' ' + p.name }))) },
          { key: 'status', label: 'Status', type: 'select', options: ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'], value: 'To Do' },
          { key: 'priority', label: 'Priority', type: 'select', options: ['None', 'Low', 'Medium', 'High', 'Urgent'], value: store().getSetting('defaultTaskPriority', 'Medium') },
          { key: 'due', label: 'Due', type: 'datetime' },
          { key: 'estimate', label: 'Estimate (min)', type: 'number', value: 30, min: 0 },
          { key: 'repeat', label: 'Repeats', type: 'select', options: NX.recurrence.options.map(o => ({ value: o.value, label: o.label })) },
          { key: 'description', label: 'Notes', type: 'textarea', rows: 3, full: true }
        ]
      });
      if (!t) return null;
      const due = t.due ? new Date(t.due).toISOString() : null;
      const task = store().tasks.create({
        title: t.title, description: t.description || '', projectId: t.projectId || null,
        status: t.status, priority: t.priority, due, repeat: t.repeat || null,
        estimate: Number(t.estimate) || 0, tags: [], checklist: [], order: 0,
        done: t.status === 'Done', completed: t.status === 'Done' ? new Date().toISOString() : null,
        parentId: (opts && opts.parentId) || null, archived: false
      });
      if (due) store().reminders.create({ title: task.title, body: 'Task due', at: due, done: false, priority: task.priority === 'Urgent' ? 'high' : 'normal', deepLink: '#/tasks', linkedId: task.id }, true);
      NX.ui.toast({ type: 'success', title: 'Task created', message: task.title + (due ? ' · ' + NX.dueLabel(due) : '') });
      store().emit('tasks');
      return task;
    },
    async newEvent() {
      const start = new Date(); start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
      const end = new Date(start.getTime() + 3600000);
      const e = await NX.ui.form({
        title: 'New event', wide: true, okLabel: 'Create event',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true, full: true },
          { key: 'start', label: 'Starts', type: 'datetime', value: NX.ymdhm(start), required: true },
          { key: 'end', label: 'Ends', type: 'datetime', value: NX.ymdhm(end) },
          { key: 'allDay', label: 'All-day event', type: 'checkbox' },
          { key: 'location', label: 'Location', type: 'text' },
          { key: 'calendar', label: 'Calendar', type: 'select', options: NX.unique(store().events.all().map(x => x.calendar).concat(['Personal', 'Work'])), value: 'Personal' },
          { key: 'color', label: 'Colour', type: 'color', value: '#7c6cff' },
          { key: 'reminder', label: 'Remind me', type: 'select', options: [
            { value: '', label: 'No reminder' }, { value: '0', label: 'At time of event' }, { value: '5', label: '5 minutes before' },
            { value: '10', label: '10 minutes before' }, { value: '30', label: '30 minutes before' }, { value: '60', label: '1 hour before' },
            { value: '1440', label: '1 day before' }, { value: '4320', label: '3 days before' }], value: '10' },
          { key: 'repeat', label: 'Repeats', type: 'select', options: NX.recurrence.options.map(o => ({ value: o.value, label: o.label })) },
          { key: 'description', label: 'Description', type: 'textarea', rows: 3, full: true }
        ]
      });
      if (!e) return null;
      const startD = new Date(e.start);
      const endD = e.end ? new Date(e.end) : new Date(startD.getTime() + 3600000);
      const ev = store().events.create({
        title: e.title, start: startD.toISOString(), end: endD.toISOString(), allDay: !!e.allDay,
        location: e.location || '', description: e.description || '', color: e.color || '#7c6cff',
        calendar: e.calendar || 'Personal', reminder: e.reminder ? Number(e.reminder) : null,
        repeat: e.repeat || null, attendees: [], linkedNoteId: null, busy: true
      });
      if (ev.reminder !== null && ev.reminder !== undefined) {
        const at = new Date(startD.getTime() - ev.reminder * 60000);
        store().reminders.create({ title: ev.title, body: (ev.location ? ev.location + ' · ' : '') + NX.fmtTime(startD), at: at.toISOString(), done: false, priority: 'normal', deepLink: '#/calendar', linkedId: ev.id }, true);
      }
      NX.ui.toast({ type: 'success', title: 'Event created', message: ev.title + ' · ' + NX.fmtDateTime(ev.start, 'medium') });
      store().emit('events');
      return ev;
    },
    async newReminder() {
      const soon = NX.ymdhm(NX.addMinutes(new Date(), 30));
      const r = await NX.ui.form({
        title: 'New reminder', okLabel: 'Set reminder',
        fields: [
          { key: 'title', label: 'Remind me to…', type: 'text', required: true, placeholder: 'e.g. Call the bank', full: true },
          { key: 'at', label: 'When', type: 'datetime', value: soon, required: true },
          { key: 'repeat', label: 'Repeat', type: 'select', options: NX.recurrence.options.map(o => ({ value: o.value, label: o.label })) },
          { key: 'priority', label: 'Priority', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'Urgent' }], value: 'normal' },
          { key: 'body', label: 'Note', type: 'textarea', rows: 2, full: true }
        ]
      });
      if (!r) return null;
      const rem = store().reminders.create({
        title: r.title, body: r.body || '', at: new Date(r.at).toISOString(),
        repeat: r.repeat || null, done: false, priority: r.priority, deepLink: '#/reminders'
      });
      if (store().desktop === false && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      NX.ui.toast({ type: 'success', title: 'Reminder set', message: rem.title + ' · ' + NX.fmtDateTime(rem.at, 'medium') });
      store().emit('reminders');
      return rem;
    },
    async newHabit() {
      const hb = await NX.ui.form({
        title: 'New habit', okLabel: 'Create habit',
        fields: [
          { key: 'name', label: 'Habit', type: 'text', required: true, placeholder: 'e.g. Read 20 pages' },
          { key: 'emoji', label: 'Icon', type: 'text', value: '🔥', hint: 'Any emoji' },
          { key: 'color', label: 'Colour', type: 'color', value: '#4caf7d' },
          { key: 'cadence', label: 'Cadence', type: 'select', options: [{ value: 'daily', label: 'Daily' }, { value: 'weekdays', label: 'Weekdays' }, { value: 'weekly', label: 'Weekly' }], value: 'daily' },
          { key: 'targetPerWeek', label: 'Target / week', type: 'number', value: 7, min: 1, max: 7 },
          { key: 'note', label: 'Why this matters', type: 'textarea', rows: 2, full: true }
        ]
      });
      if (!hb) return null;
      store().habits.create({ name: hb.name, emoji: hb.emoji || '🔥', icon: hb.emoji || '🔥', color: hb.color, cadence: hb.cadence, targetPerWeek: Number(hb.targetPerWeek) || 7, active: true, history: {}, note: hb.note || '', reminders: [], order: store().habits.count() });
      NX.ui.toast({ type: 'success', title: 'Habit created', message: hb.name });
      store().emit('habits');
    },
    async newGoal() {
      const g = await NX.ui.form({
        title: 'New goal', wide: true, okLabel: 'Create goal',
        fields: [
          { key: 'title', label: 'Goal', type: 'text', required: true, full: true, placeholder: 'What outcome are you chasing?' },
          { key: 'category', label: 'Category', type: 'select', options: ['Career', 'Health', 'Learning', 'Finance', 'Personal', 'Creative', 'Other'], value: 'Personal' },
          { key: 'color', label: 'Colour', type: 'color', value: '#7c6cff' },
          { key: 'targetDate', label: 'Target date', type: 'date' },
          { key: 'description', label: 'Why it matters', type: 'textarea', rows: 2, full: true }
        ]
      });
      if (!g) return null;
      store().goals.create({ title: g.title, description: g.description || '', category: g.category, color: g.color, targetDate: g.targetDate || null, progress: 0, status: 'on-track', keyResults: [], archived: false });
      NX.ui.toast({ type: 'success', title: 'Goal created', message: g.title + ' — add key results to track progress' });
      store().emit('goals');
    },
    async newProject() {
      const p = await NX.ui.form({
        title: 'New project', okLabel: 'Create project',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'icon', label: 'Icon', type: 'text', value: '📁' },
          { key: 'color', label: 'Colour', type: 'color', value: '#7c6cff' },
          { key: 'description', label: 'Description', type: 'textarea', rows: 2, full: true }
        ]
      });
      if (!p) return null;
      store().projects.create({ name: p.name, icon: p.icon || '📁', color: p.color, description: p.description || '', archived: false, order: store().projects.count() });
      NX.ui.toast({ type: 'success', title: 'Project created', message: p.name });
      store().emit('projects');
    },
    async newWikiPage() {
      const p = await NX.ui.form({
        title: 'New wiki page', wide: true, okLabel: 'Create page',
        fields: [
          { key: 'title', label: 'Title', type: 'text', required: true, full: true },
          { key: 'tags', label: 'Tags', type: 'text', placeholder: 'comma separated', full: true },
          { key: 'body', label: 'Content (markdown)', type: 'textarea', rows: 10, full: true, placeholder: '## Heading\n\nWrite in markdown. Link pages with [[Page Title]].' }
        ]
      });
      if (!p) return null;
      const page = store().wiki.create({
        title: p.title, slug: NX.slug(p.title), body: p.body || '', tags: (p.tags || '').split(',').map(x => x.trim()).filter(Boolean),
        parentId: null, order: store().wiki.count(), views: 0, links: [], public: false, archived: false
      });
      NX.ui.toast({ type: 'success', title: 'Page created', message: page.title });
      NX.router.go('wiki', { id: page.id });
    },
    async newBookmark() {
      const b = await NX.ui.form({
        title: 'New bookmark', wide: true, okLabel: 'Save bookmark',
        fields: [
          { key: 'url', label: 'URL', type: 'url', required: true, full: true, placeholder: 'https://…' },
          { key: 'title', label: 'Title', type: 'text', full: true, placeholder: 'Auto-filled from URL if blank' },
          { key: 'folder', label: 'Folder', type: 'select', options: NX.unique(store().bookmarks.all().map(x => x.folder).filter(Boolean)).map(f => ({ value: f, label: f })).concat([{ value: '', label: '— none —' }]) },
          { key: 'status', label: 'Status', type: 'select', options: ['unread', 'reading', 'read', 'archived'], value: 'unread' },
          { key: 'tags', label: 'Tags', type: 'text', placeholder: 'comma separated', full: true },
          { key: 'description', label: 'Why you saved it', type: 'textarea', rows: 2, full: true }
        ]
      });
      if (!b) return null;
      const title = (b.title || '').trim() || (() => { try { return new URL(b.url).hostname.replace(/^www\./, ''); } catch (e) { return b.url; } })();
      store().bookmarks.create({
        url: b.url, title, folder: b.folder || '', status: b.status,
        tags: (b.tags || '').split(',').map(x => x.trim()).filter(Boolean), description: b.description || '', rating: 0, note: ''
      });
      NX.ui.toast({ type: 'success', title: 'Bookmark saved', message: title });
      store().emit('bookmarks');
    },
    async newContact() {
      const c = await NX.ui.form({
        title: 'New contact', wide: true, okLabel: 'Save contact',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'role', label: 'Role', type: 'text' },
          { key: 'company', label: 'Company', type: 'text' },
          { key: 'email', label: 'Email', type: 'email' },
          { key: 'phone', label: 'Phone', type: 'text' },
          { key: 'color', label: 'Colour', type: 'color', value: '#7c6cff' },
          { key: 'tags', label: 'Tags', type: 'text', placeholder: 'team, vendor, friend…' },
          { key: 'birthday', label: 'Birthday', type: 'date' },
          { key: 'notes', label: 'Notes', type: 'textarea', rows: 3, full: true, placeholder: 'How you met, preferences, things to remember…' }
        ]
      });
      if (!c) return null;
      store().contacts.create({
        name: c.name, role: c.role || '', company: c.company || '', email: c.email || '', phone: c.phone || '',
        color: c.color, tags: (c.tags || '').split(',').map(x => x.trim()).filter(Boolean), birthday: c.birthday || '',
        notes: c.notes || '', avatar: '', lastContact: null, social: {}, interactions: [], nextFollowUp: null
      });
      NX.ui.toast({ type: 'success', title: 'Contact saved', message: c.name });
      store().emit('contacts');
    },
    async newTransaction() {
      const t = await NX.ui.form({
        title: 'New transaction', wide: true, okLabel: 'Add transaction',
        fields: [
          { key: 'description', label: 'Description', type: 'text', required: true, full: true },
          { key: 'amount', label: 'Amount', type: 'number', step: '0.01', required: true, hint: 'Negative = money out' },
          { key: 'date', label: 'Date', type: 'date', value: NX.todayStr() },
          { key: 'categoryId', label: 'Category', type: 'select', options: store().categories.all().map(c => ({ value: c.id, label: `${c.icon || '•'} ${c.name}` })) },
          { key: 'accountId', label: 'Account', type: 'select', options: store().accounts.all().map(a => ({ value: a.id, label: a.name })) },
          { key: 'recurring', label: 'Recurring', type: 'checkbox' },
          { key: 'note', label: 'Note', type: 'textarea', rows: 2, full: true }
        ]
      });
      if (!t) return null;
      const amt = Number(t.amount);
      store().transactions.create({
        description: t.description, amount: amt, date: t.date, categoryId: t.categoryId || null,
        accountId: t.accountId || null, type: amt >= 0 ? 'income' : 'expense', tags: [], note: t.note || '', recurring: !!t.recurring
      });
      const acc = store().accounts.find(t.accountId);
      if (acc) store().accounts.update(acc.id, { balance: (acc.balance || 0) + amt }, true);
      NX.ui.toast({ type: 'success', title: 'Transaction added', message: `${t.description} · ${store().getSetting('currencySymbol', '$')}${Math.abs(amt).toFixed(2)}` });
      store().emit('transactions');
    },
    startTimer() {
      NX.router.go('time', { tab: 'tracker' });
      setTimeout(() => document.dispatchEvent(new CustomEvent('nx:starttimer')), 200);
    },
    weeklyReview() {
      const text = NX.aiEngine.weeklyReview();
      NX.ui.modal({
        title: 'Weekly review', size: 'wide',
        body: h('div', [
          h('div.row', { style: { marginBottom: '10px', gap: '6px' } }, [
            h('button.btn.sm.subtle', { onclick: async e => { e.target.textContent = 'Generating…'; const r = await NX.ai.features.weeklyReview(); e.target.textContent = 'Done'; const ta = document.getElementById('wrText'); if (ta) ta.value = r.text; } }, '✨ Enhance with AI'),
            h('button.btn.sm.ghost', { onclick: () => NX.copyText(document.getElementById('wrText').value).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) }, 'Copy')
          ]),
          h('textarea.textarea#wrText', { rows: 24, style: { fontFamily: 'var(--font-mono)', fontSize: '12px', whiteSpace: 'pre' } })
        ]),
        footer: [
          h('button.btn.ghost', { onclick: () => NX.copyText(document.getElementById('wrText').value).then(() => NX.ui.toast({ message: 'Copied to clipboard', duration: 1600 })) }, 'Copy markdown'),
          h('button.btn.primary', { onclick: () => {
            const text = document.getElementById('wrText').value;
            const n = store().notes.create({
              title: 'Weekly Review — ' + NX.fmtDate(NX.startOfWeek(new Date()), 'medium'),
              icon: '🔁', emoji: '🔁', blocks: NX.md.markdownToBlocks(text), tags: [], parentId: null,
              order: 0, favorite: false, archived: false, properties: []
            });
            NX.ui.closeAllModals();
            NX.router.go('notes', { id: n.id });
            NX.ui.toast({ type: 'success', message: 'Saved as a note' });
          } }, 'Save as note')
        ],
        onMount: () => { document.getElementById('wrText').value = text; }
      });
    },
    exportJSON() {
      const json = store().exportJSON();
      const name = `nexadesk-backup-${NX.todayStr()}.json`;
      if (store().desktop && window.nex.saveDialog) {
        window.nex.saveDialog({ defaultPath: name, filters: [{ name: 'JSON', extensions: ['json'] }], content: json })
          .then(r => { if (r.ok) NX.ui.toast({ type: 'success', title: 'Exported', message: r.path, duration: 5000 }); else if (!r.canceled) NX.ui.toast({ type: 'error', message: 'Export failed' }); });
      } else {
        NX.download(name, json, 'application/json');
        NX.ui.toast({ type: 'success', title: 'Backup downloaded', message: NX.fmtBytes(json.length) });
      }
    },
    exportMarkdown() {
      const files = NX.md.notesToMarkdownBundle();
      const combined = files.map(f => `\n\n<!-- ═══ ${f.name} ═══ -->\n\n${f.content}`).join('\n');
      NX.download(`nexadesk-notes-${NX.todayStr()}.md`, combined, 'text/markdown');
      NX.ui.toast({ type: 'success', title: 'Markdown exported', message: `${files.length} notes bundled into one file` });
    },
    async importData() {
      const pick = async () => {
        if (store().desktop && window.nex.openDialog) {
          const r = await window.nex.openDialog({ filters: [{ name: 'JSON or Markdown', extensions: ['json', 'md', 'markdown', 'txt'] }] });
          if (!r.ok) return null;
          const f = r.files[0];
          return { name: f.name, text: Buffer_from_b64(f.data) };
        }
        return new Promise(res => {
          const inp = h('input', { type: 'file', accept: '.json,.md,.markdown,.txt', style: { display: 'none' } });
          inp.onchange = () => {
            const file = inp.files[0]; if (!file) return res(null);
            const rd = new FileReader();
            rd.onload = () => res({ name: file.name, text: String(rd.result) });
            rd.readAsText(file);
          };
          document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000);
        });
      };
      const f = await pick();
      if (!f) return;
      try {
        if (/\.json$/i.test(f.name)) {
          const replace = await NX.ui.confirm({ title: 'Import backup', message: 'Replace everything with this backup?\n\nChoose "Merge" to add its contents alongside your current data.', confirmLabel: 'Replace', cancelLabel: 'Merge', danger: true });
          store().importJSON(f.text, replace ? 'replace' : 'merge');
          await store().save();
          NX.router.render();
          buildSidebar();
          NX.ui.toast({ type: 'success', title: 'Import complete', message: replace ? 'Workspace replaced' : 'Data merged' });
        } else {
          const blocks = NX.md.markdownToBlocks(f.text);
          const n = store().notes.create({
            title: f.name.replace(/\.(md|markdown|txt)$/i, ''), icon: '📄', emoji: '📄', blocks,
            tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: []
          });
          NX.router.go('notes', { id: n.id });
          NX.ui.toast({ type: 'success', title: 'Imported as a note', message: n.title });
        }
      } catch (e) {
        NX.ui.toast({ type: 'error', title: 'Import failed', message: String(e.message || e), duration: 6000 });
      }
    },
    async handleDroppedFiles(files) {
      const route = NX.router.parseHash();
      const noteId = route.id === 'notes' ? route.params.id : null;
      let target = noteId ? store().notes.find(noteId) : null;
      if (!target) {
        const n = await NX.actions.newNote();
        target = store().notes.find(n.id);
        if (!target) return;
      }
      for (const file of files) {
        const isImage = /^image\//.test(file.type);
        const dataUrl = await new Promise(res => {
          const rd = new FileReader();
          rd.onload = () => res(String(rd.result));
          rd.onerror = () => res(null);
          if (isImage || file.size < 2.5 * 1024 * 1024) rd.readAsDataURL(file); else rd.readAsDataURL(file);
        });
        if (!dataUrl) continue;
        const blocks = target.blocks || [];
        blocks.push(isImage
          ? NX.md.newBlock('image', { src: dataUrl, caption: file.name })
          : NX.md.newBlock('file', { name: file.name, size: file.size, src: dataUrl, mime: file.type }));
        store().notes.update(target.id, { blocks }, true);
      }
      store().touch(); store().emit('notes');
      NX.ui.toast({ type: 'success', title: `${files.length} file${files.length > 1 ? 's' : ''} attached`, message: 'Added to “' + target.title + '”', duration: 4000 });
    },
    openResult(doc) {
      const map = {
        note: () => NX.router.go('notes', { id: doc.id }),
        wiki: () => NX.router.go('wiki', { id: doc.id }),
        task: () => NX.router.go('tasks', { focus: doc.id }),
        event: () => NX.router.go('calendar', { focus: doc.id }),
        reminder: () => NX.router.go('reminders', { focus: doc.id }),
        habit: () => NX.router.go('habits', { focus: doc.id }),
        goal: () => NX.router.go('goals', { focus: doc.id }),
        journal: () => NX.router.go('journal', { focus: doc.id }),
        bookmark: () => NX.router.go('bookmarks', { focus: doc.id }),
        contact: () => NX.router.go('contacts', { id: doc.id }),
        message: () => { const m = store().messages.find(doc.id); if (m) NX.router.go('chat', { channel: m.channelId, focus: doc.id }); },
        transaction: () => NX.router.go('finance', { tab: 'transactions', focus: doc.id }),
        project: () => NX.router.go('tasks', { project: doc.id }),
        timeLog: () => NX.router.go('time', { focus: doc.id })
      };
      const fn = map[doc.kind];
      if (fn) fn(); else NX.router.navigate('#/search?q=' + encodeURIComponent(doc.title || ''));
    },
    quickCreate(q, after) {
      NX.actions.newNote().then(n => {
        store().notes.update(n.id, { title: q, blocks: [NX.md.newBlock('h1', { text: q }), NX.md.newBlock('text')] }, true);
        store().emit('notes');
        after && after();
      });
    }
  };

  function Buffer_from_b64(b64) {
    try { return decodeURIComponent(escape(atob(b64))); } catch (e) { return atob(b64); }
  }

  NX.shell = {
    boot, buildRail, buildSidebar, update: shellUpdate, updateBadges, updateUserFooter,
    openPalette, closePalette, openQuickCapture, closeQuickCapture,
    showShortcuts, showAbout, toggleSidebar, toggleTheme, notify, updateStatus
  };

  // boot when the DOM is ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.NX);
