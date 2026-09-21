/* ============================================================
   Pebble — store.js : data layer, persistence, derived views
   ============================================================ */
(function (NX) {
  'use strict';

  const LS_KEY = 'nexadesk.workspace.v1';
  const LS_SET = 'nexadesk.settings.v1';
  const listeners = new Map();   // collection -> Set(fn)
  const globalListeners = new Set();
  let data = null;
  let settings = null;
  let dirty = false;
  let saveTimer = null;
  let lastSavedAt = null;

  /* --------------------------- defaults --------------------------- */
  const DEFAULT_SETTINGS = {
    theme: 'dark',
    accent: '#7c6cff',
    density: 'comfortable',
    fontSize: 15,
    sidebarCollapsed: false,
    weekStartsOn: 1,
    timeFormat: '12h',
    dateFormat: 'medium',
    currency: 'USD',
    currencySymbol: '$',
    userName: 'You',
    userStatus: 'online',
    workspaceName: 'My Workspace',
    notificationsEnabled: true,
    notifyOnReminder: true,
    notifyOnTaskDue: true,
    notifySound: true,
    closeToTray: true,
    startPage: '#/dashboard',
    autoSave: true,
    confirmDelete: true,
    showCompletedTasks: true,
    defaultTaskPriority: 'Medium',
    defaultNoteIcon: '📄',
    pomodoroFocus: 25,
    pomodoroShort: 5,
    pomodoroLong: 15,
    pomodoroRounds: 4,
    pomodoroSound: true,
    pomodoroAutoStart: false,
    aiProvider: 'offline',
    aiApiKey: '',
    aiModel: '',
    aiApiBase: '',
    aiSendNotes: true,
    aiMaxContextNotes: 12,
    language: 'en',
    markdownExportStyle: 'github',
    showStatusBar: true,
    reducedMotion: false,
    hotkeys: {}
  };

  /* --------------------------- events --------------------------- */
  function on(collection, fn) {
    if (typeof collection === 'function') { globalListeners.add(collection); return () => globalListeners.delete(collection); }
    if (!listeners.has(collection)) listeners.set(collection, new Set());
    listeners.get(collection).add(fn);
    return () => listeners.get(collection)?.delete(fn);
  }
  function emit(collection) {
    (listeners.get(collection) || []).forEach(fn => { try { fn(collection); } catch (e) { console.error(e); } });
    (listeners.get(collection + ':*') || []).forEach(fn => { try { fn(collection); } catch (e) { console.error(e); } });
    globalListeners.forEach(fn => { try { fn(collection); } catch (e) { console.error(e); } });
  }

  /* --------------------------- persistence --------------------------- */
  // Tauri (Rust) bridge when present, else Electron preload, else browser
  const tauriCore = () => (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke) ? window.__TAURI_INTERNALS__ : null;
  const tInvoke = (cmd, args) => tauriCore().invoke(cmd, args || {});
  const desktop = () => !!(window.nex && window.nex.isDesktop) || !!tauriCore();

  async function load() {
    // settings
    let s = null;
    if (tauriCore()) { /* settings live in localStorage on Tauri */ }
    else if (desktop()) { try { s = await window.nex.loadSettings(); } catch (e) {} }
    if (!s) s = NX.localStore.get(LS_SET, null);
    settings = Object.assign({}, DEFAULT_SETTINGS, s || {});

    // data
    let d = null;
    if (tauriCore()) {
      try { const raw = await tInvoke('load_workspace'); d = raw ? JSON.parse(raw) : null; } catch (e) {}
    } else if (desktop()) { try { d = await window.nex.loadData(); } catch (e) {} }
    if (!d) d = NX.localStore.get(LS_KEY, null);

    if (!d || !d.notes) {
      d = NX.seedWorkspace(NX.uid);
      data = d;
      await save(true);
    } else {
      data = migrate(d);
    }
    applyTheme();
    return data;
  }

  function migrate(d) {
    // fill in any collections a newer version expects
    const base = NX.seedWorkspace(NX.uid);
    for (const k of Object.keys(base)) {
      if (d[k] === undefined) d[k] = base[k];
    }
    d.meta = Object.assign({ workspaceName: 'My Workspace', owner: 'You' }, d.meta || {});
    if (!d.chat) d.chat = base.chat;
    ['servers', 'channels', 'messages', 'members', 'roles'].forEach(k => { if (!d.chat[k]) d.chat[k] = base.chat[k]; });
    if (!Array.isArray(d.templates)) d.templates = base.templates;
    if (!Array.isArray(d.activity)) d.activity = [];
    if (!Array.isArray(d.trash)) d.trash = [];
    d.version = 1;
    return d;
  }

  async function save(force) {
    if (!data) return;
    dirty = false;
    lastSavedAt = new Date();
    if (tauriCore()) {
      try {
        await tInvoke('save_workspace', { data: JSON.stringify(data) });
      } catch (e) { console.error('tauri save failed', e); }
      try { NX.localStore.set(LS_SET, settings); } catch (e) {}
    } else if (desktop()) {
      try {
        await window.nex.saveData(data);
        await window.nex.saveSettings(settings);
      } catch (e) { console.error('desktop save failed', e); }
    }
    // always mirror to localStorage so the web build and crash-recovery work
    try {
      NX.localStore.set(LS_KEY, data);
      NX.localStore.set(LS_SET, settings);
    } catch (e) {
      // quota exceeded — trim the biggest non-essential parts and retry once
      try {
        const slim = JSON.parse(JSON.stringify(data));
        if (slim.chat && slim.chat.messages) slim.chat.messages = slim.chat.messages.slice(-400);
        NX.localStore.set(LS_KEY, slim);
      } catch (e2) { console.warn('localStorage quota exceeded', e2); }
    }
    emit('__saved');
  }

  const scheduleSave = NX.debounce(() => { if (settings.autoSave !== false) save(); }, 600);
  function touch() { dirty = true; if (settings.autoSave !== false) scheduleSave(); }

  function applyTheme() {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme || 'dark');
    root.style.setProperty('--brand-1', settings.accent || '#7c6cff');
    if (settings.fontSize) root.style.setProperty('--fs-md', settings.fontSize + 'px');
    root.classList.toggle('dense', settings.density === 'compact');
    if (settings.reducedMotion) root.classList.add('no-motion');
  }

  /* --------------------------- generic CRUD --------------------------- */
  /**
   * Store exposes collections by name. Arrays are the source of truth.
   *   NX.store.notes.all() / find(id) / create(obj) / update(id, patch) / remove(id)
   */
  function collection(name, opts) {
    opts = opts || {};
    const root = opts.root;            // e.g. 'chat' for chat.messages
    const key = opts.key || name;
    const prefix = opts.prefix || name.slice(0, 3);

    function arr() {
      const base = root ? (data[root] || {}) : data;
      if (!Array.isArray(base[key])) base[key] = [];
      return base[key];
    }
    const api = {
      name,
      all: () => arr(),
      count: () => arr().length,
      find: id => arr().find(x => x.id === id) || null,
      where: pred => arr().filter(pred),
      first: pred => arr().find(pred) || null,
      byIds: ids => { const s = new Set(ids || []); return arr().filter(x => s.has(x.id)); },
      create(obj, quiet) {
        const rec = Object.assign({ id: NX.uid(prefix), created: new Date().toISOString(), updated: new Date().toISOString() }, obj);
        arr().unshift(rec);
        if (!quiet) { logActivity(opts.createLog ? opts.createLog(rec) : null); touch(); emit(name); }
        return rec;
      },
      insert(rec, index) {
        if (index === undefined || index < 0) arr().unshift(rec); else arr().splice(index, 0, rec);
        touch(); emit(name); return rec;
      },
      update(id, patch, quiet) {
        const rec = api.find(id);
        if (!rec) return null;
        Object.assign(rec, patch, { updated: new Date().toISOString() });
        if (!quiet) { touch(); emit(name); }
        return rec;
      },
      patchSilent(id, patch) { const r = api.find(id); if (r) Object.assign(r, patch); return r; },
      remove(id, quiet) {
        const a = arr(); const i = a.findIndex(x => x.id === id);
        if (i < 0) return null;
        const [rec] = a.splice(i, 1);
        if (!quiet) {
          if (opts.soft !== false) {
            data.trash.unshift({ collection: name, record: rec, deletedAt: new Date().toISOString() });
          }
          logActivity(opts.removeLog ? opts.removeLog(rec) : null);
          touch(); emit(name);
        }
        return rec;
      },
      reorder(ids) {
        const map = new Map(arr().map(x => [x.id, x]));
        const next = [];
        ids.forEach((id, i) => { const r = map.get(id); if (r) { r.order = i; next.push(r); } });
        arr().forEach(r => { if (!next.includes(r)) next.push(r); });
        const base = root ? (data[root] || {}) : data;
        base[key] = next;
        touch(); emit(name);
      },
      sort(comparator) {
        const base = root ? (data[root] || {}) : data;
        base[key] = arr().slice().sort(comparator);
        touch(); emit(name);
      },
      clear() { const base = root ? data[root] : data; base[key] = []; touch(); emit(name); },
      replaceAll(list) { const base = root ? data[root] : data; base[key] = list; touch(); emit(name); }
    };
    return api;
  }

  function logActivity(text) {
    if (!text) return;
    data.activity.unshift({ id: NX.uid('act'), text, at: new Date().toISOString(), icon: 'zap' });
    if (data.activity.length > 300) data.activity.length = 300;
  }

  /* --------------------------- collections --------------------------- */
  const store = {
    get data() { return data; },
    get settings() { return settings; },
    get dirty() { return dirty; },
    get lastSavedAt() { return lastSavedAt; },
    get desktop() { return desktop(); },

    notes:      collection('notes', { prefix: 'note', createLog: n => `Created note “${n.title}”` }),
    tasks:      collection('tasks', { prefix: 'task', createLog: t => `Added task “${t.title}”` }),
    projects:   collection('projects', { prefix: 'prj' }),
    tags:       collection('tags', { prefix: 'tag' }),
    events:     collection('events', { prefix: 'ev' }),
    reminders:  collection('reminders', { prefix: 'rem' }),
    habits:     collection('habits', { prefix: 'hab' }),
    goals:      collection('goals', { prefix: 'goal' }),
    journal:    collection('journal', { prefix: 'j' }),
    pomodoro:   collection('pomodoro', { prefix: 'pomo' }),
    timeLogs:   collection('timeLogs', { prefix: 'tl' }),
    bookmarks:  collection('bookmarks', { prefix: 'bm' }),
    contacts:   collection('contacts', { prefix: 'ct' }),
    accounts:   collection('accounts', { prefix: 'acc' }),
    categories: collection('categories', { prefix: 'cat' }),
    transactions: collection('transactions', { prefix: 'tx' }),
    budgets:    collection('budgets', { prefix: 'bg' }),
    wiki:       collection('wiki', { prefix: 'wk' }),
    inbox:      collection('inbox', { prefix: 'ib' }),
    templates:  collection('templates', { prefix: 'tpl' }),
    activity:   collection('activity', { prefix: 'act', soft: false }),
    trash:      collection('trash', { prefix: 'tr', soft: false }),

    servers:    collection('servers', { root: 'chat', prefix: 'srv', soft: false }),
    channels:   collection('channels', { root: 'chat', prefix: 'ch', soft: false }),
    messages:   collection('messages', { root: 'chat', prefix: 'msg', soft: false }),
    members:    collection('members', { root: 'chat', prefix: 'u', soft: false }),
    roles:      collection('roles', { root: 'chat', prefix: 'role', soft: false }),

    /* ---------------- settings ---------------- */
    getSetting(k, dflt) { return settings[k] === undefined ? dflt : settings[k]; },
    setSetting(k, v) { settings[k] = v; if (k === 'theme' || k === 'accent' || k === 'density' || k === 'fontSize' || k === 'reducedMotion') applyTheme(); touch(); emit('settings'); },
    setSettings(obj) { Object.assign(settings, obj); applyTheme(); touch(); emit('settings'); },
    applyTheme,

    /* ---------------- lifecycle ---------------- */
    load, save: () => save(true), on, emit, touch, logActivity,

    /* ---------------- bulk ---------------- */
    exportJSON() {
      return JSON.stringify({ app: 'Pebble', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
    },
    importJSON(text, mode) {
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { throw new Error('That file is not valid JSON.'); }
      const incoming = parsed && parsed.data ? parsed.data : parsed;
      if (!incoming || !Array.isArray(incoming.notes)) throw new Error('That file does not look like a Pebble export.');
      if (mode === 'merge') {
        ['notes','tasks','projects','tags','events','reminders','habits','goals','journal','pomodoro',
         'timeLogs','bookmarks','contacts','accounts','categories','transactions','budgets','wiki','inbox','templates']
          .forEach(k => { if (Array.isArray(incoming[k])) data[k] = (data[k] || []).concat(incoming[k]); });
        if (incoming.chat) {
          ['servers','channels','messages','members','roles'].forEach(k => {
            if (Array.isArray(incoming.chat[k])) data.chat[k] = (data.chat[k] || []).concat(incoming.chat[k]);
          });
        }
      } else {
        data = migrate(incoming);
      }
      touch();
      Object.keys(listeners).forEach(emit);
      return data;
    },
    reset() {
      data = NX.seedWorkspace(NX.uid);
      touch();
      Object.keys(listeners).forEach(emit);
      return data;
    },
    wipe() {
      data = NX.seedWorkspace(NX.uid);
      data.notes = []; data.tasks = []; data.events = []; data.reminders = []; data.journal = [];
      data.pomodoro = []; data.timeLogs = []; data.bookmarks = []; data.contacts = [];
      data.transactions = []; data.wiki = []; data.inbox = []; data.activity = []; data.trash = [];
      data.chat.messages = [];
      touch(); Object.keys(listeners).forEach(emit);
      return data;
    },
    storageBytes() {
      try { return new Blob([JSON.stringify(data)]).size; } catch (e) { return JSON.stringify(data).length; }
    }
  };

  /* =====================================================================
     Derived selectors — the "smart" layer other modules rely on
     ===================================================================== */
  const sel = {
    /* ---- notes ---- */
    noteTree() {
      const notes = store.notes.all().filter(n => !n.archived);
      const byParent = new Map();
      notes.forEach(n => {
        const p = n.parentId || null;
        if (!byParent.has(p)) byParent.set(p, []);
        byParent.get(p).push(n);
      });
      byParent.forEach(list => list.sort((a, b) => (a.order || 0) - (b.order || 0) || a.title.localeCompare(b.title)));
      return byParent;
    },
    childNotes(id) { return (sel.noteTree().get(id || null) || []); },
    notePlain(note) {
      if (!note) return '';
      const parts = [note.title || ''];
      const walk = (blocks) => (blocks || []).forEach(b => {
        if (b.text) parts.push(b.text);
        if (b.rows) b.rows.forEach(r => parts.push(r.join(' ')));
        if (b.children) walk(b.children);
      });
      walk(note.blocks);
      return parts.join('\n');
    },
    noteWordCount(note) {
      const t = sel.notePlain(note).trim();
      return t ? t.split(/\s+/).length : 0;
    },
    noteReadMinutes(note) { return Math.max(1, Math.round(sel.noteWordCount(note) / 220)); },
    recentNotes(n) {
      return store.notes.all().filter(x => !x.archived)
        .slice().sort((a, b) => new Date(b.updated) - new Date(a.updated)).slice(0, n || 8);
    },
    favoriteNotes() { return store.notes.all().filter(n => n.favorite && !n.archived); },
    noteTemplates() { return store.notes.all().filter(n => (n.properties || []).some(p => p.name === 'Template' && p.value)); },

    /** Every [[wiki link]] target across all notes, plus backlinks per note */
    noteLinks() {
      const byTitle = new Map();
      store.notes.all().forEach(n => byTitle.set((n.title || '').trim().toLowerCase(), n));
      store.wiki.all().forEach(p => byTitle.set((p.title || '').trim().toLowerCase(), p));
      const links = [];      // { fromId, fromTitle, toTitle, toId, kind }
      const scan = (id, title, text, kind) => {
        const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g; let m;
        while ((m = re.exec(text || ''))) {
          const target = m[1].trim();
          const rec = byTitle.get(target.toLowerCase());
          links.push({ fromId: id, fromTitle: title, toTitle: target, toId: rec ? rec.id : null, kind, alias: m[2] || null });
        }
      };
      store.notes.all().forEach(n => scan(n.id, n.title, sel.notePlain(n), 'note'));
      store.wiki.all().forEach(p => scan(p.id, p.title, p.body, 'wiki'));
      return links;
    },
    backlinksTo(id) {
      const target = store.notes.find(id) || store.wiki.find(id);
      if (!target) return [];
      const title = (target.title || '').toLowerCase();
      return sel.noteLinks().filter(l => l.toTitle.toLowerCase() === title && l.fromId !== id);
    },
    unlinkedMentions(id) {
      const n = store.notes.find(id); if (!n) return [];
      const t = (n.title || '').trim(); if (t.length < 4) return [];
      const re = new RegExp('(^|[^\\[])\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      return store.notes.all().filter(o => o.id !== id && re.test(sel.notePlain(o)));
    },
    allTags() {
      const map = new Map(store.tags.all().map(t => [t.id, Object.assign({ count: 0 }, t)]));
      const bump = (ids) => (ids || []).forEach(id => { const t = map.get(id); if (t) t.count++; });
      store.notes.all().forEach(n => bump(n.tags));
      store.tasks.all().forEach(t => bump(t.tags));
      store.journal.all().forEach(j => bump(j.tags));
      return Array.from(map.values()).sort((a, b) => b.count - a.count);
    },
    tagName(id) { const t = store.tags.find(id); return t ? t.name : ''; },
    tagColor(id) { const t = store.tags.find(id); return t ? t.color : '#8b8f98'; },

    /* ---- tasks ---- */
    openTasks() { return store.tasks.all().filter(t => !t.done && !t.archived); },
    doneTasks() { return store.tasks.all().filter(t => t.done); },
    overdueTasks() {
      const today = NX.startOfDay(new Date());
      return sel.openTasks().filter(t => t.due && new Date(t.due) < today);
    },
    tasksDueOn(date) {
      return store.tasks.all().filter(t => t.due && NX.isSameDay(t.due, date) && !t.archived);
    },
    tasksForToday() {
      const today = NX.startOfDay(new Date());
      return store.tasks.all().filter(t => !t.archived && t.due && new Date(t.due) <= NX.endOfDay(new Date()))
        .sort((a, b) => (a.done - b.done) || (new Date(a.due) - new Date(b.due)));
    },
    subtasksOf(id) { return store.tasks.all().filter(t => t.parentId === id); },
    taskProgress(t) {
      const subs = sel.subtasksOf(t.id);
      const checks = t.checklist || [];
      const total = subs.length + checks.length;
      if (!total) return t.done ? 100 : 0;
      const done = subs.filter(s => s.done).length + checks.filter(c => c.done).length;
      return Math.round(done / total * 100);
    },
    projectTasks(pid) { return store.tasks.all().filter(t => t.projectId === pid && !t.archived); },
    projectName(pid) { const p = store.projects.find(pid); return p ? p.name : 'No project'; },
    projectColor(pid) { const p = store.projects.find(pid); return p ? p.color : '#8b8f98'; },

    /* ---- events ---- */
    eventsOn(date) {
      return store.events.all().filter(e => {
        if (e.allDay) return NX.isSameDay(e.start, date);
        return NX.isSameDay(e.start, date) || NX.isSameDay(e.end, date) ||
               (new Date(e.start) < NX.startOfDay(date) && new Date(e.end) > NX.endOfDay(date));
      }).sort((a, b) => (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || new Date(a.start) - new Date(b.start));
    },
    upcomingEvents(n) {
      const now = Date.now();
      return store.events.all().filter(e => new Date(e.end || e.start).getTime() >= now)
        .sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, n || 5);
    },
    busyRanges(date) {
      return sel.eventsOn(date).filter(e => e.busy !== false).map(e => [new Date(e.start).getTime(), new Date(e.end || e.start).getTime()]);
    },

    /* ---- reminders ---- */
    pendingReminders() {
      return store.reminders.all().filter(r => !r.done).sort((a, b) => new Date(a.at) - new Date(b.at));
    },
    dueReminders() {
      const now = Date.now();
      return sel.pendingReminders().filter(r => new Date(r.snoozedUntil || r.at).getTime() <= now);
    },

    /* ---- habits ---- */
    habitDoneOn(h, dateKey) { return !!(h.history && h.history[dateKey]); },
    habitStreak(h) {
      let streak = 0;
      const d = new Date();
      // if today is not logged, start counting from yesterday (streak not broken yet)
      if (!sel.habitDoneOn(h, NX.ymd(d))) d.setDate(d.getDate() - 1);
      for (let i = 0; i < 400; i++) {
        if (sel.habitDoneOn(h, NX.ymd(d))) { streak++; d.setDate(d.getDate() - 1); }
        else break;
      }
      return streak;
    },
    habitBestStreak(h) {
      const keys = Object.keys(h.history || {}).filter(k => h.history[k]).sort();
      let best = 0, run = 0, prev = null;
      keys.forEach(k => {
        if (prev && NX.diffDays(k, prev) === 1) run++; else run = 1;
        best = Math.max(best, run); prev = k;
      });
      return Math.max(best, h.bestStreak || 0);
    },
    habitRate(h, days) {
      days = days || 30;
      let done = 0;
      for (let i = 0; i < days; i++) if (sel.habitDoneOn(h, NX.ymd(NX.addDays(new Date(), -i)))) done++;
      return Math.round(done / days * 100);
    },
    habitsCompletedToday() {
      const k = NX.todayStr();
      const active = store.habits.all().filter(h => h.active !== false);
      return { done: active.filter(h => h.history && h.history[k]).length, total: active.length };
    },

    /* ---- goals ---- */
    goalProgress(g) {
      if (!g.keyResults || !g.keyResults.length) return g.progress || 0;
      const ps = g.keyResults.map(kr => NX.clamp(Math.round((kr.current / (kr.target || 1)) * 100), 0, 100));
      return Math.round(NX.sum(ps) / ps.length);
    },

    /* ---- journal ---- */
    journalFor(dateKey) { return store.journal.all().find(j => j.date === dateKey) || null; },
    moodTrend(days) {
      days = days || 30;
      const out = [];
      for (let i = days - 1; i >= 0; i--) {
        const k = NX.ymd(NX.addDays(new Date(), -i));
        const j = sel.journalFor(k);
        out.push({ date: k, mood: j ? j.mood : null, energy: j ? j.energy : null });
      }
      return out;
    },

    /* ---- time ---- */
    focusMinutesToday() {
      const k = NX.todayStr();
      return NX.sum(store.pomodoro.all().filter(p => p.completed && String(p.startedAt).slice(0, 10) === k && p.mode === 'focus')
        .map(p => p.actualMinutes || p.plannedMinutes || 0));
    },
    timeLoggedOn(date) {
      const d = NX.toDate(date);
      return NX.sum(store.timeLogs.all().filter(t => NX.isSameDay(t.start, d)).map(t => t.minutes || 0));
    },
    projectMinutes(pid, since) {
      return NX.sum(store.timeLogs.all()
        .filter(t => t.projectId === pid && (!since || new Date(t.start) >= since))
        .map(t => t.minutes || 0));
    },

    /* ---- finance ---- */
    netWorth() { return NX.sum(store.accounts.all().filter(a => !a.archived).map(a => a.balance)); },
    monthTransactions(offset) {
      const d = NX.addMonths(new Date(), offset || 0);
      const from = NX.startOfMonth(d), to = NX.addMonths(from, 1);
      return store.transactions.all().filter(t => { const x = new Date(t.date); return x >= from && x < to; });
    },
    monthTotals(offset) {
      const tx = sel.monthTransactions(offset);
      const income = NX.sum(tx.filter(t => t.amount > 0).map(t => t.amount));
      const expense = NX.sum(tx.filter(t => t.amount < 0).map(t => -t.amount));
      return { income, expense, net: income - expense, count: tx.length };
    },
    spendByCategory(offset) {
      const tx = sel.monthTransactions(offset).filter(t => t.amount < 0);
      const map = new Map();
      tx.forEach(t => map.set(t.categoryId, (map.get(t.categoryId) || 0) + (-t.amount)));
      return Array.from(map.entries()).map(([categoryId, amount]) => {
        const c = store.categories.find(categoryId) || { name: 'Uncategorised', color: '#8b8f98', icon: '•' };
        const b = store.budgets.all().find(x => x.categoryId === categoryId);
        return { categoryId, name: c.name, color: c.color, icon: c.icon, amount, budget: b ? b.amount : 0 };
      }).sort((a, b) => b.amount - a.amount);
    },

    /* ---- chat ---- */
    channelMessages(channelId, limit) {
      const all = store.messages.all().filter(m => m.channelId === channelId)
        .sort((a, b) => new Date(a.created) - new Date(b.created));
      return limit ? all.slice(-limit) : all;
    },
    unreadCount(channelId) {
      const ch = store.channels.find(channelId); if (!ch) return 0;
      const since = ch.lastRead || 0;
      const me = sel.me();
      return store.messages.all().filter(m => m.channelId === channelId && new Date(m.created).getTime() > since && m.authorId !== me.id).length;
    },
    totalUnread() {
      const me = sel.me();
      return store.messages.all().filter(m => {
        const ch = store.channels.find(m.channelId);
        return ch && m.authorId !== me.id && new Date(m.created).getTime() > (ch.lastRead || 0);
      }).length;
    },
    me() { return store.members.all().find(m => m.name === 'You') || store.members.all()[0] || { id: 'me', name: 'You', color: '#7c6cff' }; },
    member(id) { return store.members.find(id) || { id, name: 'Unknown', color: '#8b8f98' }; },
    roleOf(memberId) { const m = sel.member(memberId); return store.roles.find(m.roleId) || { name: '', color: '#8b8f98' }; },
    serverChannels(serverId) {
      return store.channels.all().filter(c => c.serverId === serverId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    /* ---- inbox ---- */
    unreadInbox() { return store.inbox.all().filter(i => !i.read); },

    /* ---- AI-engine passthroughs used by module UIs ---- */
    relatedNotes: (id, n) => NX.aiEngine.relatedNotes(id, n),
    suggestTitle: t => NX.aiEngine.suggestTitle(t),
    nextUp: n => NX.aiEngine.nextUp(n),
    taskSummary: t => NX.aiEngine.taskSummary(t),

    /* ---- search corpus (built lazily, invalidated on change) ---- */
    _corpus: null,
    corpus() {
      if (sel._corpus) return sel._corpus;
      const c = [];
      store.notes.all().forEach(n => c.push({ kind: 'note', id: n.id, title: n.title, text: sel.notePlain(n), updated: n.updated, tags: n.tags, extra: n.icon }));
      store.tasks.all().forEach(t => c.push({ kind: 'task', id: t.id, title: t.title, text: (t.description || '') + ' ' + (t.checklist || []).map(x => x.text).join(' '), updated: t.updated, tags: t.tags, extra: t.done ? '✓' : '' }));
      store.events.all().forEach(e => c.push({ kind: 'event', id: e.id, title: e.title, text: (e.description || '') + ' ' + (e.location || ''), updated: e.start, tags: [], extra: '📅' }));
      store.wiki.all().forEach(p => c.push({ kind: 'wiki', id: p.id, title: p.title, text: p.body, updated: p.updated, tags: p.tags, extra: '📖' }));
      store.bookmarks.all().forEach(b => c.push({ kind: 'bookmark', id: b.id, title: b.title, text: (b.description || '') + ' ' + (b.url || '') + ' ' + (b.note || ''), updated: b.created, tags: b.tags, extra: '🔖' }));
      store.contacts.all().forEach(ct => c.push({ kind: 'contact', id: ct.id, title: ct.name, text: [ct.role, ct.company, ct.email, ct.notes, ct.phone].filter(Boolean).join(' '), updated: ct.lastContact || ct.created, tags: ct.tags, extra: '👤' }));
      store.journal.all().forEach(j => c.push({ kind: 'journal', id: j.id, title: 'Journal — ' + NX.fmtDate(j.date, 'long'), text: j.text, updated: j.created, tags: j.tags, extra: '📔' }));
      store.transactions.all().forEach(t => c.push({ kind: 'transaction', id: t.id, title: t.description, text: String(t.amount), updated: t.date, tags: t.tags, extra: '💰' }));
      store.messages.all().forEach(m => {
        const ch = store.channels.find(m.channelId);
        c.push({ kind: 'message', id: m.id, title: (sel.member(m.authorId).name || '') + ' in #' + (ch ? ch.name : ''), text: m.text, updated: m.created, tags: [], extra: '💬' });
      });
      store.goals.all().forEach(g => c.push({ kind: 'goal', id: g.id, title: g.title, text: (g.description || '') + ' ' + (g.keyResults || []).map(k => k.text).join(' '), updated: g.created, tags: [], extra: '🎯' }));
      store.habits.all().forEach(hb => c.push({ kind: 'habit', id: hb.id, title: hb.name, text: hb.note || '', updated: hb.created, tags: [], extra: hb.emoji || '🔥' }));
      store.reminders.all().forEach(r => c.push({ kind: 'reminder', id: r.id, title: r.title, text: r.body || '', updated: r.at, tags: [], extra: '⏰' }));
      store.projects.all().forEach(p => c.push({ kind: 'project', id: p.id, title: p.name, text: p.description || '', updated: p.created, tags: [], extra: p.icon || '📁' }));
      sel._corpus = c;
      return c;
    },
    invalidateCorpus() { sel._corpus = null; }
  };

  NX.store = store;
  NX.sel = sel;

  // keep the search corpus fresh
  ['notes', 'tasks', 'events', 'wiki', 'bookmarks', 'contacts', 'journal', 'messages', 'goals', 'habits', 'reminders', 'projects', 'transactions']
    .forEach(c => on(c, () => sel.invalidateCorpus()));

  /* =====================================================================
     Reminder polling — called by the Electron main process every 15s,
     and by an in-page timer as a fallback for the web build.
     ===================================================================== */
  NX.reminders = {
    pollDue() {
      const fired = [];
      const now = Date.now();
      sel.pendingReminders().forEach(r => {
        const when = new Date(r.snoozedUntil || r.at).getTime();
        if (when <= now && !r.fired) {
          NX.store.reminders.patchSilent(r.id, { fired: true, lastFiredAt: new Date().toISOString() });
          // reschedule repeats
          const next = NX.recurrence.nextAfter(r.at, r.repeat, new Date(now));
          if (next) {
            NX.store.reminders.patchSilent(r.id, { at: next, fired: false, snoozedUntil: null });
          } else {
            NX.store.inbox.create({
              type: 'reminder', title: r.title, body: r.body || '', icon: 'bell',
              read: false, deepLink: '#/reminders', priority: r.priority === 'high' ? 'high' : 'normal'
            }, true);
          }
          fired.push({ id: r.id, title: r.title, body: r.body || '', urgent: r.priority === 'high', deepLink: '#/reminders' });
        }
      });
      if (fired.length) { NX.store.touch(); NX.store.emit('reminders'); NX.store.emit('inbox'); }
      return fired;
    },
    snooze(id, minutes) {
      const r = NX.store.reminders.find(id); if (!r) return;
      NX.store.reminders.update(id, { snoozedUntil: NX.addMinutes(new Date(), minutes).toISOString(), fired: false });
    },
    complete(id) { NX.store.reminders.update(id, { done: true, completedAt: new Date().toISOString(), fired: true }); },
    dismiss(id) { NX.store.reminders.update(id, { fired: true }); }
  };

  /* =====================================================================
     Recurrence helper — daily / weekly / weekdays / monthly / yearly /
     custom intervals, with a next-occurrence calculator
     ===================================================================== */
  NX.recurrence = {
    options: [
      { value: '', label: 'Does not repeat' },
      { value: 'daily', label: 'Every day' },
      { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
      { value: 'weekly', label: 'Every week' },
      { value: 'biweekly', label: 'Every 2 weeks' },
      { value: 'monthly', label: 'Every month' },
      { value: 'yearly', label: 'Every year' }
    ],
    label(v) { const o = this.options.find(x => x.value === v); return o ? o.label : (v ? 'Custom' : 'Once'); },
    nextAfter(fromISO, rule, after) {
      if (!rule) return null;
      const base = new Date(fromISO);
      after = after || new Date();
      for (let i = 1; i < 400; i++) {
        let d;
        switch (rule) {
          case 'daily':    d = NX.addDays(base, i); break;
          case 'weekly':   d = NX.addDays(base, i * 7); break;
          case 'biweekly': d = NX.addDays(base, i * 14); break;
          case 'monthly':  d = NX.addMonths(base, i); break;
          case 'yearly':   d = NX.addMonths(base, i * 12); break;
          case 'weekdays': {
            d = NX.addDays(base, i);
            const wd = d.getDay();
            if (wd === 0 || wd === 6) continue;
            break;
          }
          default: return null;
        }
        if (d > after) return d.toISOString();
      }
      return null;
    },
    /** Advance a repeating task's due date after completion */
    advanceTask(task) {
      if (!task.repeat || !task.due) return null;
      return NX.recurrence.nextAfter(task.due, task.repeat, new Date());
    }
  };
})(window.NX);
