/* ============================================================
   Pebble — mod-settings.js : appearance, AI, data, projects,
   tags, templates, notifications, trash, about
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  let tab = 'appearance';
  const TABS = [
    { id: 'appearance', label: 'Appearance', icon: 'palette' },
    { id: 'customize', label: 'Customize', icon: 'wand' },
    { id: 'modules', label: 'Modules', icon: 'grid' },
    { id: 'ai', label: 'AI', icon: 'ai' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' },
    { id: 'projects', label: 'Projects', icon: 'folder' },
    { id: 'tags', label: 'Tags', icon: 'tag' },
    { id: 'templates', label: 'Templates', icon: 'copy' },
    { id: 'finance', label: 'Finance setup', icon: 'money' },
    { id: 'account', label: 'Account & updates', icon: 'contact' },
    { id: 'data', label: 'Data & backup', icon: 'database' },
    { id: 'shortcuts', label: 'Shortcuts', icon: 'key' },
    { id: 'trash', label: 'Trash', icon: 'trash' },
    { id: 'about', label: 'About', icon: 'info' }
  ];

  function render(params) {
    if (params && params.tab) tab = params.tab;
    const page = h('div.page.narrow');
    page.appendChild(NX.components.pageHead({
      icon: 'settings', title: 'Settings',
      sub: 'Everything is stored locally. Changes apply immediately and save automatically.'
    }));
    page.appendChild(h('div.tabs', TABS.map(t =>
      h('button' + (tab === t.id ? '.on' : ''), { onclick: () => { tab = t.id; NX.router.go('settings', { tab }); } }, t.label))));
    const box = h('div');
    page.appendChild(box);
    const fn = { appearance: appearance, customize: () => NX.shellV2.customPanel(), modules: () => NX.shellV2.modulesPanel(),
      account: () => NX.shellV2.accountPanel(),
      ai: aiSettings, notifications: notifications, projects: projects, tags: tags,
                 templates: templates, finance: finance, data: data, shortcuts: shortcuts, trash: trash, about: about }[tab] || appearance;
    box.appendChild(fn());
    return page;
  }

  const row = (label, hint, control) => h('div.setting-row', [
    h('div.sr-text', [h('b', label), hint ? h('span', hint) : null]),
    h('div.sr-ctl', control)
  ]);
  const toggle = (key, onChange) => {
    const inp = h('input', { type: 'checkbox', checked: !!store().getSetting(key), onchange: e => { store().setSetting(key, e.target.checked); onChange && onChange(e.target.checked); } });
    return h('label.switch', [inp, h('span.track')]);
  };
  const select = (key, options, onChange) => h('select.select.sm', {
    style: { width: 'auto' }, onchange: e => { store().setSetting(key, e.target.value); onChange && onChange(e.target.value); NX.router.render(); }
  }, options.map(o => { const opt = typeof o === 'string' ? { value: o, label: o } : o; return h('option', { value: opt.value, selected: String(opt.value) === String(store().getSetting(key)) }, opt.label); }));
  const card = (title, sub, children) => h('div.card', { style: { marginBottom: 'var(--sp-4)' } }, [
    h('div.card-head', [h('h3', title), sub ? h('span.sh-sub.small.muted', sub) : null]),
    ...children
  ]);

  /* ---------------- APPEARANCE ---------------- */
  function appearance() {
    const wrap = h('div');
    const THEMES = (NX.THEMES || []).map(t => ({ id: t.id, name: t.name, desc: t.desc, bg: t.bg, fg: t.fg }));
    wrap.appendChild(card('Theme', 'Applies instantly', [
      h('div.grid.grid-4', { style: { gap: '10px', marginBottom: '4px' } }, THEMES.map(t =>
        h('button', {
          style: { textAlign: 'left', padding: '11px', borderRadius: '11px', cursor: 'pointer', background: t.bg, color: t.fg, border: '2px solid ' + (store().getSetting('theme') === t.id ? 'var(--brand-1)' : 'var(--bd)') },
          onclick: () => { store().setSetting('theme', t.id); NX.router.render(); }
        }, [
          h('b', { style: { fontSize: '13px', display: 'block' } }, t.name),
          h('span', { style: { fontSize: '11px', opacity: .7 } }, t.desc),
          h('div.row', { style: { gap: '4px', marginTop: '8px' } }, ['#7c6cff', '#33b8a3', '#4aa8e8', '#e86cb0'].map(c =>
            h('span', { style: { width: '15px', height: '15px', borderRadius: '99px', background: c, display: 'inline-block' } })))
        ])))
    ]));

    const accents = ['#7c6cff', '#33b8a3', '#4aa8e8', '#e86cb0', '#f2994a', '#4caf7d', '#eb5757', '#e3c14a', '#9b6cf0', '#2f80ed', '#56ccf2', '#bb6bd9', '#27ae60', '#f2c94c', '#ff7a59', '#8b8f98'];
    wrap.appendChild(card('Accent colour', 'Used for highlights, buttons and the active state', [
      h('div.row-wrap', { style: { gap: '8px' } }, accents.map(c =>
        h('button.color-dot' + (store().getSetting('accent') === c ? '.on' : ''), {
          style: { background: c, width: '30px', height: '30px' }, title: c,
          onclick: () => { store().setSetting('accent', c); NX.router.render(); }
        }))),
      h('div.row', { style: { marginTop: '12px', gap: '8px' } }, [
        h('input.input.sm', { type: 'color', value: store().getSetting('accent', '#7c6cff'), style: { width: '46px', height: '30px', padding: '2px' }, oninput: e => store().setSetting('accent', e.target.value) }),
        h('span.small.muted', 'Or pick any colour')
      ])
    ]));

    wrap.appendChild(card('Interface', '', [
      row('DiceBear avatars', 'fetch generated avatars from dicebear.com (falls back to local SVG offline)', toggle('dicebear', v => { store().setSetting('dicebear', v); NX.shell.updateUserFooter(); })),
      row('Avatar style', 'DiceBear style seed', h('select.select.sm', { style: { width: 'auto' }, onchange: e => { store().setSetting('avatarStyle', e.target.value); NX.shell.updateUserFooter(); NX.ui.toast({ message: 'Avatar style: ' + e.target.value, duration: 1800 }); } }, NX.DICE_STYLES.map(st => h('option', { value: st, selected: st === store().getSetting('avatarStyle', 'bottts-neutral') }, st)))),
      row('Interface font size', 'Affects the base text size across the app', h('div.row', { style: { gap: '8px' } }, [
        h('input.range', { type: 'range', min: 13, max: 19, step: 1, value: store().getSetting('fontSize', 15), oninput: e => { store().setSetting('fontSize', Number(e.target.value)); document.getElementById('fsVal').textContent = e.target.value + 'px'; } }),
        h('b#fsVal', { style: { minWidth: '38px', fontSize: '12px' } }, store().getSetting('fontSize', 15) + 'px')
      ])),
      row('Density', 'Compact fits more on screen', select('density', [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }])),
      row('Reduced motion', 'Disables animations and transitions', toggle('reducedMotion')),
      row('Show the status bar', 'Bottom bar with save state, counts and storage', toggle('showStatusBar', v => { document.getElementById('statusbar').style.display = v ? '' : 'none'; })),
      row('Sidebar collapsed by default', 'More room for content', toggle('sidebarCollapsed', () => { document.getElementById('app').classList.toggle('sb-collapsed', store().getSetting('sidebarCollapsed')); })),
      row('Start page', 'Where Pebble opens', select('startPage', NX.router.visible().map(m => ({ value: '#/' + m.id, label: m.name })))),
      row('Workspace name', 'Shown in the sidebar and window title', h('input.input.sm', { value: store().getSetting('workspaceName', 'My Workspace'), style: { width: '190px' }, onchange: e => { store().setSetting('workspaceName', e.target.value); document.getElementById('workspaceName').textContent = e.target.value; } }))
    ]));

    wrap.appendChild(card('Regional', '', [
      row('Week starts on', 'Affects the calendar and habit week strips', select('weekStartsOn', [{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }, { value: '6', label: 'Saturday' }])),
      row('Currency symbol', 'Used across the finance module', h('input.input.sm', { value: store().getSetting('currencySymbol', '$'), style: { width: '80px' }, onchange: e => { store().setSetting('currencySymbol', e.target.value); store().setSetting('currency', e.target.value === '€' ? 'EUR' : e.target.value === '£' ? 'GBP' : 'USD'); } })),
      row('Your name', 'Used in the profile, chat and AI prompts', h('input.input.sm', { value: store().getSetting('userName', 'You'), style: { width: '170px' }, onchange: e => { store().setSetting('userName', e.target.value); const me = sel().me(); if (me) store().members.update(me.id, { name: e.target.value, displayName: e.target.value }, true); NX.shell.updateUserFooter(); } }))
    ]));

    wrap.appendChild(card('Focus timer', '', [
      row('Focus length (minutes)', '', h('input.input.sm', { type: 'number', min: 1, max: 180, value: store().getSetting('pomodoroFocus', 25), style: { width: '80px' }, onchange: e => store().setSetting('pomodoroFocus', Number(e.target.value) || 25) })),
      row('Short break (minutes)', '', h('input.input.sm', { type: 'number', min: 1, max: 60, value: store().getSetting('pomodoroShort', 5), style: { width: '80px' }, onchange: e => store().setSetting('pomodoroShort', Number(e.target.value) || 5) })),
      row('Long break (minutes)', '', h('input.input.sm', { type: 'number', min: 1, max: 90, value: store().getSetting('pomodoroLong', 15), style: { width: '80px' }, onchange: e => store().setSetting('pomodoroLong', Number(e.target.value) || 15) })),
      row('Rounds before a long break', '', h('input.input.sm', { type: 'number', min: 2, max: 12, value: store().getSetting('pomodoroRounds', 4), style: { width: '80px' }, onchange: e => store().setSetting('pomodoroRounds', Number(e.target.value) || 4) })),
      row('Play a chime', 'A short three-note tone when a phase ends', toggle('pomodoroSound')),
      row('Auto-start breaks', 'Breaks begin without you pressing anything', toggle('pomodoroAutoStart'))
    ]));

    wrap.appendChild(card('Behaviour', '', [
      row('Confirm before deleting', 'Ask for confirmation on destructive actions', toggle('confirmDelete')),
      row('Auto-save', 'Saves ~0.6s after every change', toggle('autoSave')),
      row('Show completed tasks', 'In the default task list view', toggle('showCompletedTasks')),
      row('Default task priority', 'Used when creating tasks', select('defaultTaskPriority', ['None', 'Low', 'Medium', 'High', 'Urgent'])),
      row('Default note icon', '', h('div.row', { style: { gap: '6px' } }, [
        h('input.input.sm', { value: store().getSetting('defaultNoteIcon', '📄'), style: { width: '60px', textAlign: 'center' }, onchange: e => store().setSetting('defaultNoteIcon', e.target.value) }),
        h('button.btn.sm.ghost', { onclick: e => NX.ui.emojiPicker(e.currentTarget, em => { store().setSetting('defaultNoteIcon', em); NX.router.render(); }) }, 'Pick emoji')
      ])),
      row('Close to tray', 'Closing the window keeps Pebble running in the system tray (desktop only)', toggle('closeToTray'))
    ]));
    return wrap;
  }

  /* ---------------- AI ---------------- */
  function aiSettings() {
    const wrap = h('div');
    const cfg = NX.ai.cfg();
    const info = NX.ai.providerInfo();

    wrap.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)', background: NX.ai.isConfigured() ? 'var(--acc-grn-bg)' : 'var(--acc-blu-bg)' } }, [
      h('div.row', { style: { gap: '11px', alignItems: 'flex-start' } }, [
        h('span', { html: iconHTML(NX.ai.isConfigured() ? 'check' : 'info', 19), style: { color: NX.ai.isConfigured() ? 'var(--acc-grn)' : 'var(--acc-blu)', display: 'flex', marginTop: '1px' } }),
        h('div.grow', [
          h('b', NX.ai.isConfigured() ? 'Connected to ' + info.name : 'Offline engine active'),
          h('div.small', { style: { marginTop: '3px', color: 'var(--tx-2)', lineHeight: '1.65' } },
            NX.ai.isConfigured()
              ? `Model: ${NX.ai.activeModel()}. Your key is stored locally in your workspace file and only ever sent to ${info.name}'s API.`
              : 'Every AI feature works without a key using the built-in engine: search, retrieval answers, task extraction, tag suggestions, summarisation, readability, sentiment, spaced repetition, and generated reviews. Adding a key unlocks free-form reasoning, rewriting, translation and tone changes.')
        ])
      ])
    ]));

    wrap.appendChild(card('Provider', '', [
      row('AI provider', 'Where requests are sent', select('aiProvider', NX.ai.PROVIDERS.map(p => ({ value: p.id, label: p.name })))),
      info.needsKey ? row('API key', 'Stored locally in your workspace file only', h('div.row', { style: { gap: '6px' } }, [
        h('input.input.sm', { type: 'password', id: 'aiKey', value: cfg.key, placeholder: 'paste your key…', style: { width: '250px' }, onchange: e => store().setSetting('aiApiKey', e.target.value.trim()) }),
        h('button.btn.sm.ghost', { onclick: () => { const i = document.getElementById('aiKey'); i.type = i.type === 'password' ? 'text' : 'password'; } }, 'Show')
      ])) : null,
      row('Model', 'Leave blank to use the provider default', h('input.input.sm', { value: cfg.model, placeholder: info.models ? info.models[0] : '', style: { width: '230px' }, onchange: e => store().setSetting('aiModel', e.target.value.trim()) })),
      info.models && info.models.length ? h('div.row-wrap', { style: { gap: '5px', padding: '0 0 11px' } }, info.models.map(m =>
        h('button.btn.xs' + (cfg.model === m ? '.primary' : '.subtle'), { onclick: () => { store().setSetting('aiModel', m); NX.router.render(); } }, m))) : null,
      row('Custom API base URL', 'For Ollama, LM Studio, or any OpenAI-compatible server', h('input.input.sm', { value: cfg.base, placeholder: info.base || 'http://localhost:11434/v1', style: { width: '250px' }, onchange: e => store().setSetting('aiApiBase', e.target.value.trim()) })),
      h('div.setting-row', [
        h('div.sr-text', [h('b', 'Test the connection'), h('span', 'Sends a tiny request to verify your key and model')]),
        h('div.sr-ctl', h('button.btn.sm.primary', { id: 'aiTestBtn', onclick: async e => {
          e.target.textContent = 'Testing…';
          const r = await NX.ai.features.testConnection();
          e.target.textContent = 'Test connection';
          NX.ui.toast({ type: r.ok ? 'success' : 'error', title: r.ok ? 'Connected' : 'Connection failed', message: r.message, duration: 8000 });
        } }, 'Test connection'))
      ]),
      h('div.row-wrap', { style: { gap: '6px', padding: '10px 0' } }, [
        h('a.small', { href: 'https://platform.openai.com/api-keys', target: '_blank', rel: 'noopener' }, 'Get an OpenAI key'),
        h('span.muted', '·'),
        h('a.small', { href: 'https://console.anthropic.com/', target: '_blank', rel: 'noopener' }, 'Anthropic'),
        h('span.muted', '·'),
        h('a.small', { href: 'https://aistudio.google.com/app/apikey', target: '_blank', rel: 'noopener' }, 'Google AI Studio'),
        h('span.muted', '·'),
        h('a.small', { href: 'https://console.groq.com/keys', target: '_blank', rel: 'noopener' }, 'Groq (free tier)'),
        h('span.muted', '·'),
        h('a.small', { href: 'https://openrouter.ai/keys', target: '_blank', rel: 'noopener' }, 'OpenRouter')
      ])
    ]));

    wrap.appendChild(card('Context', 'What gets sent to the model', [
      row('Include workspace context', 'Sends a compact snapshot of your tasks, projects, events, habits, goals, recent journal entries, finances and recent notes', toggle('aiSendNotes')),
      row('Max notes in context', 'How many recent notes to include', h('input.input.sm', { type: 'number', min: 0, max: 60, value: store().getSetting('aiMaxContextNotes', 12), style: { width: '80px' }, onchange: e => store().setSetting('aiMaxContextNotes', Number(e.target.value) || 12) })),
      h('div.setting-row', [
        h('div.sr-text', [h('b', 'Preview what would be sent'), h('span', 'Nothing leaves your machine unless you send a request')]),
        h('div.sr-ctl', h('button.btn.sm.subtle', { onclick: () => {
          const ctx = NX.ai.buildContext();
          NX.ui.modal({ title: 'Context preview', size: 'wide', hideFooter: true,
            body: h('div', [h('div.small.muted', { style: { marginBottom: '8px' } }, `${ctx.length.toLocaleString()} characters · ~${Math.round(ctx.length / 4).toLocaleString()} tokens`),
              h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '11.5px', background: 'var(--bg-sunken)', padding: '12px', borderRadius: '8px', border: '1px solid var(--bd)', maxHeight: '54vh', overflow: 'auto' } }, ctx)]) });
        } }, 'Preview'))
      ])
    ]));

    wrap.appendChild(card('Offline engine', 'Always available, no key required', [
      h('div.grid.grid-auto-sm', { style: { gap: '8px' } }, [
        ['Full-text search', 'BM25-style ranking over every item'],
        ['Retrieval answers', 'Quotes the passages that answer your question'],
        ['Task extraction', 'Verb + date pattern matching'],
        ['Tag suggestions', 'Matches your existing tag vocabulary'],
        ['Summarisation', 'Extractive, sentence-scoring'],
        ['Readability', 'Flesch reading ease + grade level'],
        ['Sentiment', 'Polarity with negation handling'],
        ['Spaced repetition', 'SM-2 scheduling for flashcards'],
        ['Priority scoring', 'Ranks tasks by due date, priority, status and effort'],
        ['Weekly review', 'Full report generated from real data'],
        ['Date parsing', '"tomorrow 3pm", "next friday", "in 2 hours"'],
        ['Topic clustering', 'Groups notes by shared vocabulary']
      ].map(([t, d]) => h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)' } }, [h('b.small', '✓ ' + t), h('div.tiny.muted', { style: { marginTop: '2px' } }, d)])))
    ]));
    return wrap;
  }

  /* ---------------- NOTIFICATIONS ---------------- */
  function notifications() {
    const wrap = h('div');
    const supported = store().desktop || ('Notification' in window);
    wrap.appendChild(card('Notifications', supported ? '' : 'Not supported in this browser', [
      row('Enable notifications', 'Master switch', toggle('notificationsEnabled')),
      row('Reminders', 'Fire as native OS notifications, even when minimised to the tray', toggle('notifyOnReminder')),
      row('Task due alerts', 'Notify when a task reaches its due time', toggle('notifyOnTaskDue')),
      row('Play a sound', 'System notification sound', toggle('notifySound')),
      h('div.setting-row', [
        h('div.sr-text', [h('b', 'Browser permission'), h('span', store().desktop ? 'Desktop app — always granted' : ('Notification' in window ? 'Current status: ' + Notification.permission : 'Not supported'))]),
        h('div.sr-ctl', store().desktop ? h('span.chip.chip-grn', 'Granted') : h('button.btn.sm.subtle', { onclick: () => { if ('Notification' in window) Notification.requestPermission().then(() => NX.router.render()); } }, 'Request permission'))
      ]),
      h('div.setting-row', [
        h('div.sr-text', [h('b', 'Send a test notification'), h('span', 'Check that they actually appear')]),
        h('div.sr-ctl', h('button.btn.sm.primary', { onclick: () => { NX.shell.notify('Pebble test 🔔', 'If you see this, notifications are working.'); NX.ui.toast({ type: 'success', message: 'Test notification sent', duration: 2400 }); } }, 'Send test'))
      ]),
      h('div.setting-row', [
        h('div.sr-text', [h('b', 'Global shortcuts'), h('span', store().desktop ? 'Work even when Pebble is not focused' : 'Only work while the browser window is focused')]),
        h('div.sr-ctl', h('span.small.muted', 'Ctrl+Shift+N · Ctrl+Shift+F · Ctrl+Shift+Space'))
      ])
    ]));
    wrap.appendChild(card('Reminder behaviour', '', [
      h('p.small.muted', { style: { lineHeight: '1.7', marginBottom: '10px' } },
        'The desktop app polls your reminders every 15 seconds from the main process, so they fire even when the window is hidden in the tray. The browser build polls every 20 seconds and needs the tab to stay open.'),
      NX.ui.kv('Pending reminders', String(sel().pendingReminders().length)),
      NX.ui.kv('Due right now', String(sel().dueReminders().length)),
      NX.ui.kv('Repeating', String(store().reminders.all().filter(r => r.repeat).length)),
      h('div.row', { style: { marginTop: '11px', gap: '7px' } }, [
        h('button.btn.sm.subtle', { onclick: () => NX.router.navigate('#/reminders') }, 'Open reminders')
      ])
    ]));
    return wrap;
  }

  /* ---------------- PROJECTS ---------------- */
  function projects() {
    const wrap = h('div');
    wrap.appendChild(h('div.row', { style: { marginBottom: '12px' } }, [
      h('div.grow'), h('button.btn.sm.primary', { onclick: () => NX.actions.newProject().then(() => NX.router.render()) }, '+ New project')
    ]));
    const list = store().projects.all().slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!list.length) { wrap.appendChild(NX.ui.emptyState('folder', 'No projects', 'Projects group tasks and give your kanban board its columns.')); return wrap; }
    list.forEach(p => {
      const tasks = sel().projectTasks(p.id);
      const done = tasks.filter(t => t.done).length;
      const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      const mins = sel().projectMinutes(p.id);
      wrap.appendChild(h('div.card', { style: { marginBottom: '10px', borderLeft: '4px solid ' + (p.color || '#7c6cff'), opacity: p.archived ? .6 : 1 } }, [
        h('div.row', { style: { gap: '11px' } }, [
          h('span', { style: { fontSize: '23px' } }, p.icon || '📁'),
          h('div.grow', { style: { minWidth: '0' } }, [
            h('div.row', { style: { gap: '7px' } }, [h('b', p.name), p.archived ? h('span.chip.chip-gry', 'archived') : null]),
            h('div.small.muted', p.description || 'No description'),
            h('div.row-wrap', { style: { gap: '11px', marginTop: '7px' } }, [
              h('span.small', `${done}/${tasks.length} tasks · ${pct}%`),
              h('span.small.muted', NX.fmtDuration(mins) + ' logged'),
              h('span.small.muted', `${NX.sum(tasks.filter(t => !t.done).map(t => t.estimate || 0))} min estimated remaining`)
            ]),
            h('div.progress.thin', { style: { marginTop: '6px', maxWidth: '320px' } }, h('i', { style: { width: pct + '%', background: p.color } }))
          ]),
          h('div.row', { style: { gap: '5px' } }, [
            h('button.btn.sm.ghost', { onclick: () => NX.router.go('tasks', { project: p.id }) }, 'View tasks'),
            h('button.btn.sm.ghost', { onclick: () => NX.router.go('tasks', { project: p.id, view: 'kanban' }) }, 'Kanban'),
            h('button.icon-btn', { html: iconHTML('more', 15), onclick: e => NX.ui.dropdown(e.currentTarget, [
              { icon: 'edit', label: 'Edit project…', onClick: () => editProject(p.id) },
              { icon: 'note', label: 'Create a project note', onClick: () => {
                  const n = store().notes.create({ title: `${p.icon || '📁'} ${p.name}`, icon: p.icon || '📁', emoji: p.icon || '📁', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [
                    { id: NX.uid('p'), name: 'Status', type: 'select', options: ['Planning', 'Active', 'On hold', 'Done'], value: 'Active' }
                  ], blocks: [
                    NX.md.newBlock('h1', { text: p.name }), NX.md.newBlock('text', { text: p.description || '' }),
                    NX.md.newBlock('h2', { text: 'Objective' }), NX.md.newBlock('text'),
                    NX.md.newBlock('h2', { text: 'Tasks' }), NX.md.newBlock('taskRef', { filter: 'open', projectId: p.id }),
                    NX.md.newBlock('h2', { text: 'Notes' }), NX.md.newBlock('text')
                  ]});
                  NX.router.go('notes', { id: n.id });
                } },
              { icon: 'archive', label: p.archived ? 'Unarchive' : 'Archive', onClick: () => { store().projects.update(p.id, { archived: !p.archived }); NX.router.render(); } },
              '-',
              { icon: 'trash', label: 'Delete project', danger: true, onClick: async () => {
                  if (await NX.ui.confirmDelete(`“${p.name}”`, `${tasks.length} tasks will keep existing but lose their project.'`)) {
                    tasks.forEach(t => store().tasks.update(t.id, { projectId: null }, true));
                    store().projects.remove(p.id); store().touch(); store().emit('tasks');
                    NX.router.render();
                  }
                } }
            ], { right: true }) })
          ])
        ])
      ]));
    });
    return wrap;
  }
  async function editProject(id) {
    const p = store().projects.find(id);
    const r = await NX.ui.form({ title: 'Edit project', okLabel: 'Save', fields: [
      { key: 'name', label: 'Name', type: 'text', value: p.name, required: true },
      { key: 'icon', label: 'Icon (emoji)', type: 'text', value: p.icon || '📁' },
      { key: 'color', label: 'Colour', type: 'color', value: p.color },
      { key: 'description', label: 'Description', type: 'textarea', value: p.description || '', rows: 3, full: true }
    ]});
    if (!r) return;
    store().projects.update(id, r);
    NX.router.render();
  }

  /* ---------------- TAGS ---------------- */
  function tags() {
    const wrap = h('div');
    const all = sel().allTags();
    wrap.appendChild(h('div.row', { style: { marginBottom: '12px' } }, [
      h('span.small.muted.grow', `${all.length} tags in use across notes, tasks and journal entries`),
      h('button.btn.sm.primary', { onclick: async () => {
        const name = await NX.ui.prompt({ title: 'New tag', placeholder: 'lowercase-name' });
        if (!name) return;
        store().tags.create({ name: name.trim().toLowerCase(), color: NX.colorFromString(name) });
        NX.router.render();
      } }, '+ New tag'),
      h('button.btn.sm.subtle', { onclick: mergeDuplicates }, 'Merge duplicates')
    ]));
    if (!all.length) { wrap.appendChild(NX.ui.emptyState('tag', 'No tags yet', 'Tags are created automatically when you use #hashtag in quick capture.')); return wrap; }
    all.forEach(t => {
      const notes = store().notes.all().filter(n => (n.tags || []).includes(t.id));
      const tasks = store().tasks.all().filter(x => (x.tags || []).includes(t.id));
      wrap.appendChild(h('div.list-row', [
        h('span.color-dot', { style: { background: t.color, width: '16px', height: '16px', cursor: 'pointer' }, title: 'Click to change colour', onclick: e => NX.ui.emojiPicker && (() => {
          NX.ui.modal({ title: 'Tag colour', size: 'narrow', hideFooter: true, body: h('div.row-wrap', { style: { gap: '8px' } }, NX.ui.COLORS.map(c =>
            h('button.color-dot', { style: { background: c, width: '32px', height: '32px' }, onclick: () => { store().tags.update(t.id, { color: c }); NX.ui.closeTopModal(); NX.router.render(); } }))) });
        })() }),
        h('div.lr-main', [h('div.lr-title', '#' + t.name), h('div.lr-sub', `${notes.length} notes · ${tasks.length} tasks`)]),
        h('button.btn.xs.ghost', { onclick: () => { NX.router.go('notes'); setTimeout(() => NX.ui.toast({ message: 'Filtered to #' + t.name, duration: 2000 }), 200); } }, 'Notes'),
        h('button.btn.xs.ghost', { onclick: () => NX.router.go('tasks', { tag: t.id }) }, 'Tasks'),
        h('button.icon-btn', { html: iconHTML('edit', 14), onclick: async () => { const v = await NX.ui.prompt({ title: 'Rename tag', value: t.name }); if (v) { store().tags.update(t.id, { name: v.trim().toLowerCase() }); NX.router.render(); } } }),
        h('button.icon-btn', { html: iconHTML('trash', 14), onclick: async () => {
          if (!await NX.ui.confirmDelete(`#${t.name}`, 'The tag will be removed from every note and task that uses it.')) return;
          store().notes.all().forEach(n => { if ((n.tags || []).includes(t.id)) store().notes.update(n.id, { tags: n.tags.filter(x => x !== t.id) }, true); });
          store().tasks.all().forEach(x => { if ((x.tags || []).includes(t.id)) store().tasks.update(x.id, { tags: x.tags.filter(y => y !== t.id) }, true); });
          store().tags.remove(t.id); store().touch(); store().emit('tags');
          NX.router.render();
        } })
      ]));
    });
    return wrap;
  }
  function mergeDuplicates() {
    const byName = new Map();
    store().tags.all().forEach(t => { const k = t.name.toLowerCase(); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(t); });
    const dupes = Array.from(byName.entries()).filter(([k, v]) => v.length > 1);
    if (!dupes.length) { NX.ui.toast({ type: 'info', message: 'No duplicate tags found' }); return; }
    dupes.forEach(([name, list]) => {
      const keep = list[0];
      list.slice(1).forEach(dup => {
        store().notes.all().forEach(n => { if ((n.tags || []).includes(dup.id)) store().notes.update(n.id, { tags: NX.unique((n.tags || []).filter(x => x !== dup.id).concat([keep.id])) }, true); });
        store().tasks.all().forEach(t => { if ((t.tags || []).includes(dup.id)) store().tasks.update(t.id, { tags: NX.unique((t.tags || []).filter(x => x !== dup.id).concat([keep.id])) }, true); });
        store().tags.remove(dup.id, true);
      });
    });
    store().touch(); store().emit('tags');
    NX.router.render();
    NX.ui.toast({ type: 'success', message: `Merged ${dupes.length} duplicate tag group(s)` });
  }

  /* ---------------- TEMPLATES ---------------- */
  function templates() {
    const wrap = h('div');
    wrap.appendChild(h('div.row', { style: { marginBottom: '12px' } }, [
      h('span.small.muted.grow', 'Templates appear in the note editor when you type /'),
      h('button.btn.sm.primary', { onclick: () => newTemplate() }, '+ New template')
    ]));
    const cats = NX.unique(store().templates.all().map(t => t.category || 'Other'));
    cats.forEach(c => {
      wrap.appendChild(h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, c)]));
      wrap.appendChild(h('div.grid.grid-auto', store().templates.all().filter(t => (t.category || 'Other') === c).map(t =>
        h('div.card.hoverable.pad-sm', [
          h('div.row', { style: { marginBottom: '7px' } }, [
            h('span', { style: { fontSize: '19px' } }, t.icon || '📄'),
            h('b.small.grow', t.name),
            h('button.icon-btn', { html: iconHTML('edit', 14), onclick: () => editTemplate(t.id) }),
            h('button.icon-btn', { html: iconHTML('trash', 14), onclick: async () => { if (await NX.ui.confirmDelete(`“${t.name}”`)) { store().templates.remove(t.id); NX.router.render(); } } })
          ]),
          t.description ? h('div.small.muted', { style: { marginBottom: '7px' } }, t.description) : null,
          h('div.small.muted', { style: { fontFamily: 'var(--font-mono)', fontSize: '10.5px', background: 'var(--bg-sunken)', padding: '7px 9px', borderRadius: '6px', maxHeight: '96px', overflow: 'auto', whiteSpace: 'pre-wrap' } },
            NX.md.blocksToMarkdown(t.blocks || []).slice(0, 400) || '(empty)')
        ]))));
    });
    return wrap;
  }
  async function newTemplate() {
    const r = await NX.ui.form({
      title: 'New template', wide: true, okLabel: 'Create',
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'icon', label: 'Icon (emoji)', type: 'text', value: '📄' },
        { key: 'category', label: 'Category', type: 'select', options: NX.unique(store().templates.all().map(t => t.category).concat(['Work', 'Personal', 'Reading', 'Engineering', 'Basic'])) },
        { key: 'description', label: 'Description', type: 'text', full: true },
        { key: 'body', label: 'Template body (markdown)', type: 'textarea', rows: 14, full: true, placeholder: '## Agenda\n\n- [ ] First item\n\n## Notes\n' }
      ]
    });
    if (!r) return;
    store().templates.create({ name: r.name, icon: r.icon || '📄', category: r.category, description: r.description || '', blocks: NX.md.markdownToBlocks(r.body || '') });
    NX.router.render();
    NX.ui.toast({ type: 'success', message: 'Template created' });
  }
  async function editTemplate(id) {
    const t = store().templates.find(id);
    const r = await NX.ui.form({
      title: 'Edit template', wide: true, okLabel: 'Save',
      fields: [
        { key: 'name', label: 'Name', type: 'text', value: t.name, required: true },
        { key: 'icon', label: 'Icon', type: 'text', value: t.icon || '📄' },
        { key: 'category', label: 'Category', type: 'text', value: t.category || '' },
        { key: 'description', label: 'Description', type: 'text', value: t.description || '', full: true },
        { key: 'body', label: 'Body (markdown)', type: 'textarea', value: NX.md.blocksToMarkdown(t.blocks || []), rows: 14, full: true }
      ]
    });
    if (!r) return;
    store().templates.update(id, { name: r.name, icon: r.icon, category: r.category, description: r.description, blocks: NX.md.markdownToBlocks(r.body) });
    NX.router.render();
  }

  /* ---------------- FINANCE SETUP ---------------- */
  function finance() {
    const wrap = h('div');
    wrap.appendChild(card('Accounts', `${store().accounts.count()} accounts · net worth ${store().getSetting('currencySymbol', '$')}${NX.fmtNum(sel().netWorth(), 2)}`, [
      ...store().accounts.all().map(a => row(a.name, `${a.institution || ''} · ${a.type}`, h('div.row', { style: { gap: '7px' } }, [
        h('b.small', store().getSetting('currencySymbol', '$') + NX.fmtNum(a.balance, 2)),
        h('button.btn.xs.ghost', { onclick: () => NX.router.go('settings', { tab: 'finance' }) && editAccountPrompt(a.id) }, 'Edit')
      ]))),
      h('button.btn.sm.subtle', { style: { marginTop: '10px' }, onclick: () => addAccountPrompt() }, '+ Add account')
    ]));
    wrap.appendChild(card('Categories', `${store().categories.count()} categories`, [
      h('div', store().categories.all().map(c => row(
        `${c.icon || '•'} ${c.name}`, `${c.type} · budget ${c.budget ? store().getSetting('currencySymbol', '$') + NX.fmtNum(c.budget, 0) : 'none'} · ${store().transactions.all().filter(t => t.categoryId === c.id).length} transactions`,
        h('div.row', { style: { gap: '5px' } }, [
          h('button.btn.xs.ghost', { onclick: () => editCategoryPrompt(c.id) }, 'Edit'),
          h('button.icon-btn', { html: iconHTML('trash', 13), onclick: async () => { if (await NX.ui.confirmDelete(`“${c.name}”`)) { store().categories.remove(c.id); NX.router.render(); } } })
        ])))),
      h('button.btn.sm.subtle', { style: { marginTop: '10px' }, onclick: () => addCategoryPrompt() }, '+ Add category')
    ]));
    return wrap;
  }
  async function addAccountPrompt() {
    const a = await NX.ui.form({ title: 'New account', okLabel: 'Create', fields: [
      { key: 'name', label: 'Name', type: 'text', required: true }, { key: 'institution', label: 'Institution', type: 'text' },
      { key: 'type', label: 'Type', type: 'select', options: ['checking', 'savings', 'credit', 'investment', 'cash', 'other'] },
      { key: 'balance', label: 'Balance', type: 'number', step: '0.01', value: 0 },
      { key: 'color', label: 'Colour', type: 'color', value: NX.colorFromString(String(Math.random())) }
    ]});
    if (!a) return;
    store().accounts.create({ name: a.name, institution: a.institution, type: a.type, balance: Number(a.balance) || 0, currency: store().getSetting('currency'), color: a.color, archived: false });
    NX.router.render();
  }
  async function editAccountPrompt(id) {
    const a = store().accounts.find(id);
    const r = await NX.ui.form({ title: 'Edit account', okLabel: 'Save', fields: [
      { key: 'name', label: 'Name', type: 'text', value: a.name, required: true },
      { key: 'balance', label: 'Balance', type: 'number', step: '0.01', value: a.balance },
      { key: 'color', label: 'Colour', type: 'color', value: a.color }
    ]});
    if (!r) return;
    store().accounts.update(id, { name: r.name, balance: Number(r.balance) || 0, color: r.color });
    NX.router.render();
  }
  async function addCategoryPrompt() {
    const c = await NX.ui.form({ title: 'New category', okLabel: 'Create', fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['expense', 'income'], value: 'expense' },
      { key: 'icon', label: 'Icon (emoji)', type: 'text', value: '📁' },
      { key: 'color', label: 'Colour', type: 'color', value: NX.colorFromString(String(Math.random())) },
      { key: 'budget', label: 'Monthly budget', type: 'number', value: 0 }
    ]});
    if (!c) return;
    store().categories.create({ name: c.name, type: c.type, icon: c.icon, color: c.color, budget: Number(c.budget) || 0, parent: null });
    if (c.type === 'expense' && Number(c.budget)) store().budgets.create({ categoryId: store().categories.all()[0].id, amount: Number(c.budget), period: 'monthly' }, true);
    store().touch(); NX.router.render();
  }
  async function editCategoryPrompt(id) {
    const c = store().categories.find(id);
    const r = await NX.ui.form({ title: 'Edit category', okLabel: 'Save', fields: [
      { key: 'name', label: 'Name', type: 'text', value: c.name, required: true },
      { key: 'icon', label: 'Icon', type: 'text', value: c.icon || '' },
      { key: 'color', label: 'Colour', type: 'color', value: c.color },
      { key: 'budget', label: 'Monthly budget', type: 'number', value: c.budget || 0 }
    ]});
    if (!r) return;
    store().categories.update(id, { name: r.name, icon: r.icon, color: r.color, budget: Number(r.budget) || 0 });
    NX.router.render();
  }

  /* ---------------- DATA ---------------- */
  function data() {
    const wrap = h('div');
    const info = NX.appInfo || {};
    const counts = [
      ['Notes', store().notes.count()], ['Tasks', store().tasks.count()], ['Projects', store().projects.count()],
      ['Tags', store().tags.count()], ['Events', store().events.count()], ['Reminders', store().reminders.count()],
      ['Habits', store().habits.count()], ['Goals', store().goals.count()], ['Journal entries', store().journal.count()],
      ['Focus sessions', store().pomodoro.count()], ['Time logs', store().timeLogs.count()], ['Bookmarks', store().bookmarks.count()],
      ['Contacts', store().contacts.count()], ['Transactions', store().transactions.count()], ['Wiki pages', store().wiki.count()],
      ['Chat messages', store().messages.count()], ['Templates', store().templates.count()], ['Inbox items', store().inbox.count()],
      ['Trash items', store().trash.count()]
    ];
    wrap.appendChild(card('Your data', `${NX.fmtBytes(store().storageBytes())} · saved ${store().lastSavedAt ? NX.fmtTime(store().lastSavedAt) : 'not yet'}`, [
      h('div.grid.grid-auto-sm', { style: { gap: '7px', marginBottom: '6px' } }, counts.map(([k, v]) =>
        h('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '4px 9px', background: 'var(--bg-sunken)', borderRadius: '6px', fontSize: '12px' } }, [
          h('span.muted', k), h('b', NX.fmtNum(v))]))),
      h('div.divider'),
      NX.ui.kv('Storage location', store().desktop ? (info.dataFile || 'userData/nexadesk-data/workspace.json') : 'Browser localStorage (this origin)'),
      NX.ui.kv('Runtime', store().desktop ? `Electron ${info.electron} · Chrome ${info.chrome} · Node ${info.node}` : 'Browser'),
      NX.ui.kv('Auto-save', store().getSetting('autoSave') ? 'On (~0.6s after each change)' : 'Off — use Ctrl+S'),
      NX.ui.kv('Browser cache also holds', NX.fmtBytes(NX.localStore.size()))
    ]));

    wrap.appendChild(card('Export', 'Take your data with you — no lock-in', [
      h('div.grid.grid-2', { style: { gap: '9px' } }, [
        expBtn('database', 'Full backup (JSON)', 'Every module, every field. Restorable.', () => NX.actions.exportJSON()),
        expBtn('note', 'All notes (Markdown)', 'One .md file per note plus an index, bundled.', () => exportNotesAsFiles()),
        expBtn('table', 'Notes as CSV', 'Title, tags, word count, properties.', () => NX.router.navigate('#/notes') && setTimeout(() => NX.ui.toast({ message: 'Use Notes → More → Export CSV', duration: 3000 }), 400)),
        expBtn('task', 'Tasks as CSV', 'Open and completed tasks with all fields.', () => exportTasksCSV()),
        expBtn('calendar', 'Calendar as .ics', 'Importable into Google Calendar, Outlook, Apple.', () => NX.router.go('calendar')),
        expBtn('journal', 'Journal as Markdown', 'Every entry with mood and gratitude.', () => exportJournalMD()),
        expBtn('money', 'Transactions as CSV', 'For your accountant or a spreadsheet.', () => NX.router.go('finance')),
        expBtn('chat', 'All chat as Markdown', 'Every server, channel and message.', () => exportChatMD()),
        expBtn('contact', 'Contacts as CSV', 'vCard-friendly columns.', () => NX.router.go('contacts')),
        expBtn('book', 'Wiki as Markdown', 'Every page with its links intact.', () => exportWikiMD())
      ])
    ]));

    wrap.appendChild(card('Import', '', [
      row('Import a backup or a Markdown file', 'JSON backups can replace or merge; .md files become notes', h('button.btn.sm.primary', { onclick: () => NX.actions.importData() }, 'Choose file…')),
      row('Import browser bookmarks', 'Netscape HTML format, exported from Chrome/Firefox/Edge', h('button.btn.sm.subtle', { onclick: () => NX.router.go('bookmarks') }, 'Bookmarks → Import')),
      row('Import an .ics calendar', 'Google Calendar, Outlook, Apple Calendar exports', h('button.btn.sm.subtle', { onclick: () => NX.router.go('calendar') }, 'Calendar → More'))
    ]));

    wrap.appendChild(card('Danger zone', 'These cannot be undone without a backup', [
      row('Reset to the sample workspace', 'Restores the demo content and deletes everything else', h('button.btn.sm.subtle', { onclick: async () => {
        if (!await NX.ui.confirm({ title: 'Reset to sample data?', message: 'Everything you have created will be replaced by the starter workspace. Export a backup first if you want to keep it.', confirmLabel: 'Reset everything', danger: true })) return;
        store().reset(); await store().save(); NX.router.render(); NX.shell.buildSidebar();
        NX.ui.toast({ type: 'success', message: 'Workspace reset to the sample data' });
      } }, 'Reset…')),
      row('Empty the workspace', 'Keeps projects, tags and categories; deletes all content', h('button.btn.sm.danger', { onclick: async () => {
        if (!await NX.ui.confirm({ title: 'Empty everything?', message: 'All notes, tasks, events, journal entries, messages, transactions and wiki pages will be deleted. Your projects, tags, categories and templates are kept.', confirmLabel: 'Delete everything', danger: true })) return;
        store().wipe(); await store().save(); NX.router.render(); NX.shell.buildSidebar();
        NX.ui.toast({ type: 'success', message: 'Workspace emptied' });
      } }, 'Empty…')),
      row('Clear browser cache copy', 'Removes the localStorage mirror (desktop data file is untouched)', h('button.btn.sm.ghost', { onclick: async () => {
        if (!await NX.ui.confirm({ title: 'Clear the browser cache copy?', message: 'If you are using the desktop app, your real data file is untouched. In the browser build this is your only copy — export first!', confirmLabel: 'Clear cache', danger: true })) return;
        try { Object.keys(localStorage).filter(k => k.startsWith('nexadesk')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
        NX.ui.toast({ type: 'success', message: 'Browser cache cleared' });
      } }, 'Clear')),
      row('Empty the trash permanently', `${store().trash.count()} item(s) currently in the trash`, h('button.btn.sm.danger', { onclick: async () => {
        if (!await NX.ui.confirmDelete(`${store().trash.count()} trashed items`, 'This is permanent.')) return;
        store().trash.clear(); NX.router.render();
        NX.ui.toast({ type: 'success', message: 'Trash emptied' });
      } }, 'Empty trash'))
    ]));
    return wrap;
  }
  function expBtn(icon, title, desc, fn) {
    return h('button.card.hoverable.pad-sm', { style: { textAlign: 'left', cursor: 'pointer' }, onclick: fn }, [
      h('div.row', { style: { gap: '8px' } }, [h('span', { html: iconHTML(icon, 16), style: { color: 'var(--brand-1)', display: 'flex' } }), h('b.small', title)]),
      h('div.tiny.muted', { style: { marginTop: '4px', lineHeight: '1.5' } }, desc)
    ]);
  }
  function exportNotesAsFiles() {
    const files = NX.md.notesToMarkdownBundle();
    const combined = files.map(f => `\n\n${'═'.repeat(60)}\nFILE: ${f.name}\n${'═'.repeat(60)}\n\n${f.content}`).join('\n');
    NX.download(`nexadesk-notes-${NX.todayStr()}.md`, combined, 'text/markdown');
    NX.ui.toast({ type: 'success', title: `${files.length} notes exported`, message: 'Bundled into a single Markdown file with file markers' });
  }
  function exportTasksCSV() {
    const head = ['Title', 'Status', 'Priority', 'Project', 'Due', 'Completed', 'Estimate', 'Actual', 'Repeat', 'Tags', 'Description'];
    const rows = store().tasks.all().map(t => [t.title, t.status, t.priority, t.projectId ? sel().projectName(t.projectId) : '', t.due || '', t.completed || '', t.estimate || '', t.actual || '', t.repeat || '', (t.tags || []).map(id => sel().tagName(id)).join('; '), t.description || '']);
    NX.download(`nexadesk-tasks-${NX.todayStr()}.csv`, NX.md.toCSV([head].concat(rows)), 'text/csv');
    NX.ui.toast({ type: 'success', message: `${rows.length} tasks exported` });
  }
  function exportJournalMD() {
    const L = ['# Journal export', '', `Exported ${new Date().toLocaleString()}`, ''];
    store().journal.all().slice().sort((a, b) => b.date.localeCompare(a.date)).forEach(j => {
      L.push(`## ${NX.fmtDate(j.date, 'long')}`, `_Mood ${j.mood}/5${j.energy ? ' · Energy ' + j.energy + '/5' : ''}_`, '', j.text || '_empty_', '');
      if ((j.gratitude || []).filter(Boolean).length) { L.push('**Grateful for:**'); j.gratitude.filter(Boolean).forEach(g => L.push('- ' + g)); L.push(''); }
    });
    NX.download(`nexadesk-journal-${NX.todayStr()}.md`, L.join('\n'), 'text/markdown');
    NX.ui.toast({ type: 'success', message: 'Journal exported' });
  }
  function exportChatMD() {
    const L = ['# Chat export', '', `Exported ${new Date().toLocaleString()}`, ''];
    store().servers.all().forEach(s => {
      L.push(`## Server: ${s.name}`, '');
      sel().serverChannels(s.id).forEach(c => {
        L.push(`### #${c.name}`, c.topic ? '> ' + c.topic : '', '');
        sel().channelMessages(c.id).forEach(m => L.push(`**${(sel().member(m.authorId).displayName || '?')}** _${NX.fmtDateTime(m.created, 'medium')}_\n${m.text}\n`));
      });
    });
    NX.download(`nexadesk-chat-${NX.todayStr()}.md`, L.join('\n'), 'text/markdown');
    NX.ui.toast({ type: 'success', message: 'Chat exported' });
  }
  function exportWikiMD() {
    const txt = store().wiki.all().map(p => `\n\n# ${p.title}\n\n${p.body}`).join('\n');
    NX.download(`nexadesk-wiki-${NX.todayStr()}.md`, txt, 'text/markdown');
    NX.ui.toast({ type: 'success', message: `${store().wiki.count()} wiki pages exported` });
  }

  /* ---------------- SHORTCUTS ---------------- */
  function shortcuts() {
    const groups = {
      global: ['Ctrl/⌘ + K — Command palette (search everything, run any command)',
        'Ctrl/⌘ + Shift + N — Quick capture (note / task / reminder / journal)',
        'Ctrl/⌘ + Shift + F — Full search page',
        'Ctrl/⌘ + Shift + Space — Command palette (alternative)',
        'Ctrl/⌘ + B — Toggle the sidebar',
        'Ctrl/⌘ + S — Save now',
        'Ctrl/⌘ + , — Settings',
        'Ctrl/⌘ + N — New note',
        'Ctrl/⌘ + T — New task',
        'Ctrl/⌘ + D — Go to the dashboard',
        'Ctrl/⌘ + 1…9 — Jump to module 1–9 in the rail',
        'Ctrl/⌘ + / — Show this list',
        'Alt + ← — Navigate back',
        'Esc — Close any overlay, or clear the selection'],
      notes: ['/ — Open the block menu on an empty line',
        '[[ — Link to another note (autocomplete)',
        '#tag — Inline tag',
        '@name — Mention',
        'Ctrl/⌘ + B / I / E — Bold / italic / inline code',
        'Ctrl/⌘ + Shift + 1 / 2 / 3 — Heading 1 / 2 / 3',
        'Ctrl/⌘ + Shift + 7 / 8 / 9 — Numbered / bulleted / to-do',
        'Ctrl/⌘ + Shift + D — Duplicate the block',
        'Ctrl/⌘ + Shift + M — Turn the block into an equation',
        'Alt + ↑ / ↓ — Move the block',
        'Tab — Nest the block into the toggle above',
        'Enter — Split the block; on an empty list item it exits the list',
        'Backspace on an empty block — revert it to plain text'],
      chat: ['Enter — Send  ·  Shift + Enter — new line',
        '@ — Mention autocomplete (↑ ↓ to choose)',
        '↑ on an empty composer — edit your last message',
        'Ctrl/⌘ + B / I / E — Bold / italic / code in the composer',
        'Esc — cancel a reply or an edit',
        'Ctrl/⌘ + F — search messages'],
      other: ['Space — start or pause the focus timer (on the Focus screen)',
        'R — reset the timer  ·  S — skip the phase',
        'Drag — reorder kanban cards, move calendar events, re-parent notes, reorder blocks']
    };
    const wrap = h('div');
    Object.entries(groups).forEach(([g, items]) => {
      wrap.appendChild(card(g[0].toUpperCase() + g.slice(1), '', items.map(t => {
        const [keys, ...desc] = t.split(' — ');
        return row(keys, desc.join(' — '), null);
      })));
    });
    return wrap;
  }

  /* ---------------- TRASH ---------------- */
  function trash() {
    const wrap = h('div');
    const items = store().trash.all();
    wrap.appendChild(h('div.row', { style: { marginBottom: '12px' } }, [
      h('span.small.muted.grow', `${items.length} item(s) in the trash. Restoring puts them back exactly where they were.`),
      items.length ? h('button.btn.sm.danger', { onclick: async () => { if (await NX.ui.confirmDelete('everything in the trash', 'This is permanent.')) { store().trash.clear(); NX.router.render(); } } }, 'Empty trash') : null
    ]));
    if (!items.length) { wrap.appendChild(NX.ui.emptyState('trash', 'Trash is empty', 'Deleted notes, tasks and other records land here so you can undo a mistake.')); return wrap; }
    items.forEach(it => {
      const r = it.record || {};
      wrap.appendChild(h('div.list-row', [
        h('span.chip', it.collection),
        h('div.lr-main', [
          h('div.lr-title', r.title || r.name || r.text || '(untitled)'),
          h('div.lr-sub', `Deleted ${NX.relTime(it.deletedAt)}`)
        ]),
        h('button.btn.sm.subtle', { onclick: () => {
          const coll = store()[it.collection];
          if (!coll) return;
          const rec = NX.deepClone(r); delete rec.id;
          coll.create(rec, true);
          store().trash.remove(it.id);
          store().touch(); store().emit(it.collection);
          NX.router.render();
          NX.ui.toast({ type: 'success', message: 'Restored' });
        } }, 'Restore'),
        h('button.icon-btn', { html: iconHTML('trash', 14), title: 'Delete permanently', onclick: async () => { if (await NX.ui.confirmDelete('this item', 'Permanently, with no way back.')) { store().trash.remove(it.id); NX.router.render(); } } })
      ]));
    });
    return wrap;
  }

  /* ---------------- ABOUT ---------------- */
  function about() {
    const info = NX.appInfo || {};
    const wrap = h('div');
    wrap.appendChild(h('div.card', { style: { textAlign: 'center', padding: '30px', marginBottom: 'var(--sp-4)' } }, [
      h('div', { html: `<svg viewBox="0 0 64 64" width="72" height="72" style="margin:0 auto"><defs><linearGradient id="ab2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c6cff"/><stop offset="1" stop-color="#33b8a3"/></linearGradient></defs><rect x="4" y="4" width="56" height="56" rx="16" fill="url(#ab2)"/><path d="M20 44V20l24 24V20" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>` }),
      h('h2', { style: { fontSize: '25px', marginTop: '12px', letterSpacing: '-.6px' } }, 'Pebble'),
      h('div.muted.small', 'Version 1.0.0 · Your all-in-one workspace'),
      h('div.row-wrap', { style: { justifyContent: 'center', gap: '6px', marginTop: '14px' } }, [
        h('span.chip', NX.router.visible().length + ' modules'),
        h('span.chip', NX.sel.corpus().length + ' indexed items'),
        h('span.chip', NX.fmtBytes(store().storageBytes()) + ' stored'),
        h('span.chip', NX.ai.isConfigured() ? 'AI: ' + NX.ai.providerInfo().name : 'AI: offline engine')
      ])
    ]));
    wrap.appendChild(card('Feature inventory', `${NX.router.visible().length} modules`, [
      h('div.grid.grid-auto-sm', { style: { gap: '7px' } }, NX.router.all().map(m =>
        h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)', cursor: 'pointer' }, onclick: () => NX.router.navigate('#/' + m.id) }, [
          h('div.row', { style: { gap: '7px' } }, [h('span', { html: iconHTML(m.icon || 'zap', 14), style: { color: 'var(--brand-1)', display: 'flex' } }), h('b.small', m.name)]),
          m.sub ? h('div.tiny.muted', { style: { marginTop: '3px' } }, m.sub) : null
        ])))
    ]));
    wrap.appendChild(card('Technical', '', [
      NX.ui.kv('Runtime', store().desktop ? 'Electron desktop app' : 'Browser'),
      store().desktop ? NX.ui.kv('Electron / Chrome / Node', `${info.electron} / ${info.chrome} / ${info.node}`) : null,
      NX.ui.kv('Platform', `${info.platform || navigator.platform} · ${info.arch || 'web'}`),
      NX.ui.kv('Data file', info.dataFile || 'browser localStorage'),
      NX.ui.kv('Workspace created', store().data.createdAt ? NX.fmtDate(store().data.createdAt, 'long') : '—'),
      NX.ui.kv('Last saved', store().lastSavedAt ? NX.fmtDateTime(store().lastSavedAt, 'medium') : 'not yet'),
      NX.ui.kv('Renderer', 'Vanilla JS, no framework, no build step at runtime'),
      NX.ui.kv('Dependencies', 'Zero runtime dependencies')
    ]));
    wrap.appendChild(card('Privacy', '', [
      h('p.small', { style: { lineHeight: '1.75', color: 'var(--tx-2)' } },
        'Pebble stores everything on this machine. There is no account, no server and no telemetry. The only network requests the app can make are the ones you explicitly configure: an AI provider API call (only when you add a key and use an AI feature), opening an external link, or loading an image you pasted a URL for. Nothing else leaves your device.')
    ]));
    wrap.appendChild(card('Built with', '', [
      h('p.small.muted', { style: { lineHeight: '1.75' } },
        'Designed and written from scratch by Qwen. Roughly 12,000 lines of hand-written JavaScript and CSS, no frameworks, no bundler at runtime. The block editor, force-directed knowledge graph, BM25 search ranking, SM-2 spaced repetition, natural-language date parser and offline text-analysis engine are all implemented from first principles.')
    ]));
    return wrap;
  }

  NX.router.register({
    id: 'settings', name: 'Settings', icon: 'settings', group: 'system', order: 99, rail: false,
    render,
    commands: () => TABS.map(t => ({ label: 'Settings: ' + t.label, icon: t.icon, run: () => NX.router.go('settings', { tab: t.id }) }))
  });
})(window.NX);
