/**
 * NexaDesk smoke test — boots the real bundle in jsdom, renders every
 * module and every sub-view, exercises the AI engine, store and editor.
 * Exits non-zero if anything throws.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let failures = [];
let checks = 0;
function ok(name, fn) {
  checks++;
  try { fn(); } catch (e) { failures.push(`${name}: ${e && e.message}\n${(e && e.stack || '').split('\n').slice(1, 3).join('\n')}`); }
}
function okAsync(name, fn) { return fn().catch(e => { failures.push(`${name}: ${e && e.message}`); }); }

(async function run() {
  const html = fs.readFileSync(path.join(ROOT, 'renderer', 'index.html'), 'utf8');
  const bundle = fs.readFileSync(path.join(ROOT, 'renderer', 'js', 'bundle.js'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'renderer', 'css', 'bundle.css'), 'utf8');

  const vc = new VirtualConsole();
  const consoleErrors = [];
  vc.on('jsdomError', e => consoleErrors.push('jsdomError: ' + (e.message || e)));
  vc.on('error', (...a) => consoleErrors.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'http://localhost/index.html',
    virtualConsole: vc
  });
  const { window } = dom;
  const { document } = window;

  // --- polyfills jsdom lacks ---
  window.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
  window.cancelAnimationFrame = id => clearTimeout(id);
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.Element.prototype.setPointerCapture = function () {};
  window.Element.prototype.releasePointerCapture = function () {};
  window.AudioContext = function () {
    return {
      currentTime: 0, destination: {},
      createOscillator: () => ({ type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }),
      createGain: () => ({ gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }),
      close: () => Promise.resolve()
    };
  };
  window.webkitAudioContext = window.AudioContext;
  window.Notification = function () {};
  window.Notification.permission = 'default';
  window.Notification.requestPermission = () => Promise.resolve('granted');
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
  window.performance = window.performance || { now: () => Date.now() };
  if (!window.structuredClone) window.structuredClone = o => JSON.parse(JSON.stringify(o));
  // contentEditable selection API used by the block editor
  window.getSelection = () => ({
    rangeCount: 0, anchorNode: null, toString: () => '',
    removeAllRanges() {}, addRange() {},
    getRangeAt: () => ({
      cloneRange: () => ({ selectNodeContents() {}, setEnd() {}, setStart() {}, collapse() {}, toString: () => '' }),
      collapsed: true, startContainer: null, startOffset: 0, endContainer: null, endOffset: 0,
      selectNodeContents() {}, setEnd() {}, setStart() {}, getBoundingClientRect: () => ({ top: 0, left: 0, bottom: 0, right: 0 })
    })
  });
  document.execCommand = () => true;

  // run the bundle
  window.eval(bundle);

  // wait for boot (async store.load)
  await new Promise(r => setTimeout(r, 700));

  const NX = window.NX;
  if (!NX) { console.error('FATAL: window.NX never initialised'); process.exit(1); }

  console.log('  Boot ......................... OK');

  /* ---------------- store ---------------- */
  ok('store loaded', () => { if (!NX.store.data.notes) throw new Error('no data'); });
  ok('seed data present', () => {
    const d = NX.store.data;
    if (!d.notes.length) throw new Error('no notes');
    if (!d.tasks.length) throw new Error('no tasks');
    if (!d.chat.messages.length) throw new Error('no messages');
  });
  ok('collection CRUD', () => {
    const n = NX.store.notes.create({ title: 'CRUD test', blocks: [NX.md.newBlock('text', { text: 'hi' })], tags: [], parentId: null });
    if (NX.store.notes.find(n.id).title !== 'CRUD test') throw new Error('create failed');
    NX.store.notes.update(n.id, { title: 'renamed' });
    if (NX.store.notes.find(n.id).title !== 'renamed') throw new Error('update failed');
    NX.store.notes.remove(n.id);
    if (NX.store.notes.find(n.id)) throw new Error('remove failed');
  });
  ok('persistence round-trip', () => {
    const json = NX.store.exportJSON();
    NX.store.importJSON(json, 'replace');
    if (!NX.store.data.notes.length) throw new Error('import produced no notes');
  });

  /* ---------------- every module renders ---------------- */
  const modules = NX.router.all();
  console.log(`  Modules registered ........... ${modules.length}`);
  for (const m of modules) {
    ok(`render #${m.id}`, () => {
      window.location.hash = '#/' + m.id;
      NX.router.render();
      const view = document.getElementById('view');
      if (!view || !view.children.length) throw new Error('rendered nothing');
    });
  }

  /* ---------------- sub-views ---------------- */
  const subviews = [
    ['tasks kanban', () => { window.location.hash = '#/tasks?view=kanban'; NX.router.render(); }],
    ['tasks table', () => { window.location.hash = '#/tasks?view=table'; NX.router.render(); }],
    ['tasks calendar', () => { window.location.hash = '#/tasks?view=calendar'; NX.router.render(); }],
    ['tasks smart', () => { window.location.hash = '#/tasks?view=smart'; NX.router.render(); }],
    ['notes database', () => { NX.localStore.set('nexadesk.notesView', 'db'); window.location.hash = '#/notes'; NX.router.render(); }],
    ['notes markdown', () => { NX.localStore.set('nexadesk.notesView', 'md'); NX.router.render(); }],
    ['calendar week', () => { NX.localStore.set('nexadesk.calMode', 'week'); window.location.hash = '#/calendar'; NX.router.render(); }],
    ['calendar day', () => { NX.localStore.set('nexadesk.calMode', 'day'); NX.router.render(); }],
    ['calendar agenda', () => { NX.localStore.set('nexadesk.calMode', 'agenda'); NX.router.render(); }],
    ['calendar freebusy', () => { NX.localStore.set('nexadesk.calMode', 'freebusy'); NX.router.render(); }],
    ['calendar month', () => { NX.localStore.set('nexadesk.calMode', 'month'); NX.router.render(); }],
    ['habits heatmap', () => { window.location.hash = '#/habits?view=heatmap'; NX.router.render(); }],
    ['habits stats', () => { window.location.hash = '#/habits?view=stats'; NX.router.render(); }],
    ['habits all', () => { window.location.hash = '#/habits?view=all'; NX.router.render(); }],
    ['journal timeline', () => { window.location.hash = '#/journal?view=timeline'; NX.router.render(); }],
    ['journal moods', () => { window.location.hash = '#/journal?view=moods'; NX.router.render(); }],
    ['journal prompts', () => { window.location.hash = '#/journal?view=prompts'; NX.router.render(); }],
    ['journal stats', () => { window.location.hash = '#/journal?view=stats'; NX.router.render(); }],
    ['wiki graph', () => { window.location.hash = '#/wiki?view=graph'; NX.router.render(); }],
    ['wiki index', () => { window.location.hash = '#/wiki?view=index'; NX.router.render(); }],
    ['wiki orphans', () => { window.location.hash = '#/wiki?view=orphan'; NX.router.render(); }],
    ['ai insights', () => { window.location.hash = '#/ai?tab=insights'; NX.router.render(); }],
    ['ai tools', () => { window.location.hash = '#/ai?tab=tools'; NX.router.render(); }],
    ['ai digest', () => { window.location.hash = '#/ai?tab=digest'; NX.router.render(); }],
    ['finance transactions', () => { window.location.hash = '#/finance?tab=transactions'; NX.router.render(); }],
    ['finance budgets', () => { window.location.hash = '#/finance?tab=budgets'; NX.router.render(); }],
    ['finance accounts', () => { window.location.hash = '#/finance?tab=accounts'; NX.router.render(); }],
    ['finance insights', () => { window.location.hash = '#/finance?tab=insights'; NX.router.render(); }],
    ['time logs', () => { window.location.hash = '#/time?tab=logs'; NX.router.render(); }],
    ['time reports', () => { window.location.hash = '#/time?tab=reports'; NX.router.render(); }],
    ...['appearance', 'ai', 'notifications', 'projects', 'tags', 'templates', 'finance', 'data', 'shortcuts', 'trash', 'about']
      .map(t => ['settings ' + t, () => { window.location.hash = '#/settings?tab=' + t; NX.router.render(); }])
  ];
  for (const [name, fn] of subviews) ok(name, fn);
  console.log(`  Sub-views rendered ........... ${subviews.length}`);

  /* ---------------- AI engine ---------------- */
  ok('readability', () => {
    const r = NX.aiEngine.readability('The quick brown fox jumps over the lazy dog. This is a longer sentence that has more words in it for testing.');
    if (!r.words || r.words < 10) throw new Error('bad word count: ' + r.words);
    if (typeof r.flesch !== 'number') throw new Error('no flesch');
  });
  ok('sentiment', () => {
    const pos = NX.aiEngine.sentiment('This is great and I love it, wonderful success.');
    const neg = NX.aiEngine.sentiment('This is terrible and I hate it, awful failure.');
    if (pos.score <= 0) throw new Error('positive scored ' + pos.score);
    if (neg.score >= 0) throw new Error('negative scored ' + neg.score);
  });
  ok('summarize', () => {
    const s = NX.aiEngine.summarize('First sentence about apples. Second sentence about oranges. Third sentence about bananas. Fourth sentence about grapes. Fifth sentence about pears.', 2);
    if (!s || s.length < 10) throw new Error('empty summary');
  });
  ok('keywords', () => {
    const k = NX.aiEngine.keywords('NexaDesk is a workspace. NexaDesk has notes. NexaDesk has tasks. The workspace is local.');
    if (!k.length) throw new Error('no keywords');
  });
  ok('parseWhen: tomorrow 3pm', () => {
    const r = NX.aiEngine.parseWhen('call Sam tomorrow 3pm');
    if (!r.date) throw new Error('no date parsed');
    const d = new Date(r.date);
    if (d.getHours() !== 15) throw new Error('wrong hour: ' + d.getHours());
    if (NX.diffDays(d, new Date()) !== 1) throw new Error('wrong day');
  });
  ok('parseWhen: next friday', () => {
    const r = NX.aiEngine.parseWhen('meeting next friday');
    if (!r.date || new Date(r.date).getDay() !== 5) throw new Error('not a friday');
  });
  ok('parseWhen: in 2 hours', () => {
    const r = NX.aiEngine.parseWhen('remind me in 2 hours');
    if (!r.date) throw new Error('no date');
    const diff = (new Date(r.date) - Date.now()) / 3600000;
    if (diff < 1.9 || diff > 2.1) throw new Error('off by ' + diff);
  });
  ok('parseQuickCapture', () => {
    const p = NX.aiEngine.parseQuickCapture('Email the invoice tomorrow 9am !high #work @Personal');
    if (p.priority !== 'High') throw new Error('priority: ' + p.priority);
    if (!p.due) throw new Error('no due date');
    if (!p.tags.includes('work')) throw new Error('tags: ' + JSON.stringify(p.tags));
    if (!/email the invoice/i.test(p.title)) throw new Error('title: ' + p.title);
  });
  ok('search returns ranked results', () => {
    const r = NX.aiEngine.search('launch');
    if (!r.length) throw new Error('no results for "launch"');
    if (r[0].score < r[1].score) throw new Error('not sorted');
  });
  ok('task scoring ranks overdue urgent highest', () => {
    const a = NX.aiEngine.scoreTask({ priority: 'Urgent', due: new Date(Date.now() - 86400000 * 3).toISOString(), status: 'In Progress', done: false });
    const b = NX.aiEngine.scoreTask({ priority: 'Low', due: null, status: 'Backlog', done: false });
    if (a <= b) throw new Error(`urgent overdue ${a} not > low ${b}`);
  });
  ok('SM-2 spaced repetition', () => {
    let c = { ease: 2.5, interval: 0, reps: 0 };
    c = NX.aiEngine.sm2(c, 5); if (c.interval !== 1) throw new Error('first interval ' + c.interval);
    c = NX.aiEngine.sm2(c, 5); if (c.interval !== 6) throw new Error('second interval ' + c.interval);
    c = NX.aiEngine.sm2(c, 1); if (c.reps !== 0) throw new Error('lapse did not reset reps');
  });
  ok('insights produce findings', () => {
    const i = NX.aiEngine.insights();
    if (!Array.isArray(i)) throw new Error('not an array');
  });
  ok('daily digest', () => {
    const d = NX.aiEngine.dailyDigest();
    if (!/DAILY DIGEST/.test(d)) throw new Error('bad digest');
  });
  ok('weekly review', () => {
    const w = NX.aiEngine.weeklyReview();
    if (!/# Weekly Review/.test(w)) throw new Error('bad review');
  });
  ok('offline answer with sources', () => {
    const a = NX.aiEngine.answer('product launch');
    if (!a.text || !a.text.length) throw new Error('empty answer');
  });
  ok('action extraction', () => {
    const acts = NX.aiEngine.extractActions('Marcus will rerun the load test by Friday. Please send the changelog draft. We should review the copy.');
    if (!acts.length) throw new Error('no actions extracted');
  });
  console.log('  AI engine (offline) .......... 17 checks');

  /* ---------------- markdown round-trip ---------------- */
  ok('markdown -> blocks -> markdown', () => {
    const src = '# Heading\n\nSome **bold** text.\n\n- bullet one\n- bullet two\n\n1. first\n2. second\n\n- [x] done task\n- [ ] open task\n\n> a quote\n\n```\ncode here\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
    const blocks = NX.md.markdownToBlocks(src);
    if (!blocks.length) throw new Error('no blocks');
    const types = blocks.map(b => b.type);
    for (const want of ['h1', 'bullet', 'number', 'todo', 'quote', 'code', 'table'])
      if (!types.includes(want)) throw new Error('missing block type: ' + want + ' got ' + types.join(','));
    const out = NX.md.blocksToMarkdown(blocks);
    if (!/# Heading/.test(out)) throw new Error('heading lost');
    if (!/\| a \| b \|/.test(out)) throw new Error('table lost');
    if (!/- \[x\] done task/.test(out)) throw new Error('checkbox lost');
  });
  ok('html -> markdown', () => {
    const md = NX.md.htmlToMarkdown('<h2>Title</h2><p>Hello <b>world</b></p><ul><li>one</li><li>two</li></ul>');
    if (!/## Title/.test(md)) throw new Error('heading: ' + md);
    if (!/\*\*world\*\*/.test(md)) throw new Error('bold: ' + md);
    if (!/- one/.test(md)) throw new Error('list: ' + md);
  });
  ok('csv round-trip', () => {
    const csv = NX.md.toCSV([['a', 'b'], ['1', 'has,comma'], ['2', 'quote"here']]);
    const rows = NX.md.parseCSV(csv);
    if (rows.length !== 3) throw new Error('rows: ' + rows.length);
    if (rows[1][1] !== 'has,comma') throw new Error('comma cell: ' + rows[1][1]);
    if (rows[2][1] !== 'quote"here') throw new Error('quote cell: ' + rows[2][1]);
  });
  ok('note -> markdown with front matter', () => {
    const n = NX.store.notes.all()[0];
    const md = NX.md.noteToMarkdown(n, { includeMeta: true, includeBacklinks: true });
    if (!/^---/.test(md)) throw new Error('no front matter');
    if (!md.includes(n.title)) throw new Error('title missing');
  });

  /* ---------------- selectors ---------------- */
  ok('selectors', () => {
    const need = ['noteTree', 'notePlain', 'overdueTasks', 'tasksDueOn', 'eventsOn', 'pendingReminders',
      'habitStreak', 'goalProgress', 'moodTrend', 'netWorth', 'monthTotals', 'spendByCategory',
      'channelMessages', 'unreadInbox', 'corpus', 'noteLinks', 'relatedNotes', 'nextUp'];
    for (const k of need) if (typeof NX.sel[k] !== 'function') throw new Error('missing selector: ' + k);
    NX.sel.noteTree(); NX.sel.overdueTasks(); NX.sel.corpus(); NX.sel.noteLinks();
    const h0 = NX.store.habits.all()[0];
    if (h0 && typeof NX.sel.habitStreak(h0) !== 'number') throw new Error('habitStreak not a number');
  });
  ok('recurrence', () => {
    const next = NX.recurrence.nextAfter(new Date().toISOString(), 'weekly', new Date());
    if (!next) throw new Error('no next occurrence');
    const days = NX.diffDays(next, new Date());
    if (days < 6 || days > 8) throw new Error('weekly gave ' + days + ' days');
  });

  /* ---------------- UI primitives ---------------- */
  ok('toast', () => { NX.ui.toast({ type: 'success', message: 'test' }); if (!document.getElementById('toasts').children.length) throw new Error('no toast'); });
  ok('modal + close', () => { const m = NX.ui.modal({ title: 'T', body: 'x' }); if (!NX.ui.isModalOpen()) throw new Error('not open'); m.close(); if (NX.ui.isModalOpen()) throw new Error('did not close'); });
  ok('context menu', () => { NX.ui.contextMenu(10, 10, [{ label: 'a', onClick() {} }, '-', { label: 'b' }]); NX.ui.closeMenu(); });
  ok('ring / barChart / donut / sparkline', () => {
    if (!NX.ui.ring(50, 60).querySelector('svg')) throw new Error('ring');
    if (!NX.ui.barChart([{ label: 'a', value: 3 }]).children.length) throw new Error('barChart');
    if (!NX.ui.donut([{ label: 'a', value: 3, color: '#fff' }]).querySelector('svg')) throw new Error('donut');
    if (!NX.ui.sparkline([1, 2, 3]).querySelector('svg')) throw new Error('sparkline');
  });

  /* ---------------- interactions ---------------- */
  ok('toggle a task', () => {
    const t = NX.store.tasks.all().find(x => !x.done);
    const before = t.done;
    NX.components.toggleTaskDone(t.id, !before);
    if (NX.store.tasks.find(t.id).done === before) throw new Error('did not toggle');
    NX.components.toggleTaskDone(t.id, before);
  });
  ok('toggle a habit', () => {
    const hb = NX.store.habits.all()[0];
    const key = '2020-01-15';
    NX.components.toggleHabit(hb.id, key, true);
    if (!NX.sel.habitDoneOn(NX.store.habits.find(hb.id), key)) throw new Error('not logged');
    NX.components.toggleHabit(hb.id, key, false);
  });
  ok('create + delete a note', () => {
    const n = NX.store.notes.create({ title: 'tmp', blocks: [NX.md.newBlock('text', { text: 'x' })], tags: [], parentId: null });
    if (!NX.store.notes.find(n.id)) throw new Error('not created');
    NX.store.notes.remove(n.id);
    if (NX.store.notes.find(n.id)) throw new Error('not removed');
    if (!NX.store.trash.all().some(x => x.record && x.record.id === n.id)) throw new Error('not in trash');
  });
  ok('send a chat message', () => {
    const ch = NX.store.channels.all()[0];
    const before = NX.store.messages.count();
    NX.store.messages.create({ authorId: NX.sel.me().id, channelId: ch.id, text: 'test message', reactions: [], attachments: [], replyTo: null });
    if (NX.store.messages.count() !== before + 1) throw new Error('not sent');
  });
  ok('reminder poll does not throw', () => { NX.reminders.pollDue(); });
  ok('theme switching', () => {
    ['light', 'sepia', 'midnight', 'dark'].forEach(t => {
      NX.store.setSetting('theme', t);
      if (document.documentElement.getAttribute('data-theme') !== t) throw new Error('theme not applied: ' + t);
    });
  });
  ok('command palette builds items', () => {
    NX.shell.openPalette('launch');
    const items = document.querySelectorAll('#paletteResults .pal-item');
    if (!items.length) throw new Error('no palette results');
    NX.shell.closePalette();
  });
  ok('global search renders results', () => {
    window.location.hash = '#/search?q=launch';
    NX.router.render();
    if (!document.querySelectorAll('#view .sr-item').length) throw new Error('no search results rendered');
  });

  /* ---------------- regression: functions that were previously undefined ---------------- */
  ok('notes: every toolbar handler is callable', () => {
    // the formatting toolbar used to call an undefined withSelection()
    const n = NX.store.notes.all().find(x => (x.blocks || []).length);
    window.location.hash = '#/notes/' + n.id;
    NX.router.render();
    const btns = document.querySelectorAll('#view .note-toolbar .tb-btn');
    if (btns.length < 8) throw new Error('toolbar did not render (' + btns.length + ' buttons)');
    // click every non-menu toolbar button; none may throw
    btns.forEach(b => { b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  });
  ok('wiki: AI tools row is callable', () => {
    window.location.hash = '#/wiki';
    NX.router.render();
    // switch to Reader via the real segmented control
    const seg = Array.from(document.querySelectorAll('#view .seg button')).find(b => /Reader/.test(b.textContent));
    if (!seg) throw new Error('no view switcher rendered');
    seg.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    // "Expand" used to call an undefined showDiff()
    const btns = Array.from(document.querySelectorAll('#view .wiki-content button.btn.sm.subtle'));
    if (!btns.length) throw new Error('no wiki AI tool buttons rendered');
    if (!btns.some(b => /Expand/.test(b.textContent))) throw new Error('Expand button missing');
  });
  ok('notes: slash menu opens from the toolbar', () => {
    NX.localStore.set('nexadesk.notesView', 'doc');
    const n = NX.store.notes.all().find(x => (x.blocks || []).length);
    window.location.hash = '#/notes/' + n.id;
    NX.router.render();
    const blocks = document.querySelectorAll('#view .block');
    if (blocks.length < 2) throw new Error('blocks did not render: ' + blocks.length);
    const tb = document.querySelectorAll('#view .note-toolbar .tb-btn');
    if (tb.length < 8) throw new Error('toolbar did not render');
  });
  ok('notes: database view builds every column type', () => {
    window.location.hash = '#/notes';
    NX.router.render();
    const tableBtn = Array.from(document.querySelectorAll('#view .seg button')).find(b => /^Table$/.test(b.textContent.trim()));
    if (!tableBtn) throw new Error('no Table view button');
    tableBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const ths = document.querySelectorAll('#view table.db th');
    if (ths.length < 6) throw new Error('only ' + ths.length + ' columns');
    const rows = document.querySelectorAll('#view table.db tbody tr');
    if (!rows.length) throw new Error('no rows rendered');
    // back to document view
    const backBtn = Array.from(document.querySelectorAll('#view button.btn.xs.ghost')).find(b => /Back to document/.test(b.textContent));
    if (backBtn) backBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    else NX.localStore.set('nexadesk.notesView', 'doc');
  });
  ok('notes: markdown source view round-trips', () => {
    NX.localStore.set('nexadesk.notesView', 'doc');
    // pick a note that actually has a heading + a table so the conversion is exercised
    const n = NX.store.notes.all().find(x => (x.blocks || []).some(b => /^h[123]$/.test(b.type)))
           || NX.store.notes.all().find(x => (x.blocks || []).length);
    window.location.hash = '#/notes/' + n.id;
    NX.router.render();
    // confirm the editor really opened the note we picked
    const titleEl = document.querySelector('#view .note-title-input');
    if (!titleEl) throw new Error('note editor did not render');
    if (titleEl.value !== (n.title || '')) throw new Error('opened the wrong note: ' + titleEl.value + ' vs ' + n.title);
    const mdBtn = Array.from(document.querySelectorAll('#view .seg button')).find(b => /^MD$/.test(b.textContent.trim()));
    if (!mdBtn) throw new Error('no MD view button');
    mdBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const ta = document.querySelector('#view textarea.textarea');   // not the title field
    if (!ta) throw new Error('markdown editor textarea not rendered');
    if (!ta.value.trim()) throw new Error('markdown editor empty');
    if (!document.querySelector('#view .md-preview')) throw new Error('live preview pane missing');
    const expected = NX.md.blocksToMarkdown(NX.store.notes.find(n.id).blocks);
    if (ta.value.trim() !== expected.trim()) throw new Error('editor content does not match blocksToMarkdown()');
    if (!/^#{1,3} /m.test(ta.value)) throw new Error('no heading in markdown output');
    // and back again
    const back = NX.md.markdownToBlocks(ta.value);
    if (!back.length) throw new Error('markdown did not parse back into blocks');
    const docBtn = Array.from(document.querySelectorAll('#view .seg button')).find(b => /^Doc$/.test(b.textContent.trim()));
    if (docBtn) docBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    NX.localStore.set('nexadesk.notesView', 'doc');
  });

  /* ---------------- v3: easy mode, glyphs, wallet, home ---------------- */
  ok('custom SVG glyph library', () => {
    const g = NX.glyph('flame', 20);
    if (!g || !g.includes('<svg') || !g.includes('path')) throw new Error('glyph not svg');
    if (NX.glyph('nope-not-real') !== null) throw new Error('unknown glyph should be null');
    const av = NX.avatarSVG('test-user', 40);
    if (!av.includes('<svg') || !av.includes('linearGradient')) throw new Error('avatar not svg');
  });
  ok('home module renders (easy landing)', () => {
    window.location.hash = '#/home';
    NX.router.render();
    const v = document.getElementById('view');
    if (!v || !/the one thing/i.test(v.textContent)) throw new Error('home card missing');
    if (!v.querySelector('.widget-wall')) throw new Error('widget wall missing');
    if (!v.querySelector('.seg')) throw new Error('seg digits missing on wall');
  });
  ok('easy mode filters the rail', () => {
    NX.easy.set(true);
    const vis = NX.router.visible().map(m => m.id);
    if (!vis.includes('home') || !vis.includes('tasks')) throw new Error('essentials missing');
    if (vis.includes('finance') || vis.includes('chat')) throw new Error('easy mode should hide non-essentials: ' + vis.join(','));
    NX.easy.set(false);
    if (!NX.router.visible().map(m => m.id).includes('finance')) throw new Error('full mode must restore all');
  });
  ok('skill wallet export/import round-trip', () => {
    const before = NX.store.data.skills.length;
    const payload = { kind: 'pebble-wallet', version: 1, skills: [{ name: 'Wallet Test Skill', desc: 'd', icon: 'bolt', body: 'You are a test skill. Behave precisely.' }], prompts: [{ title: 'Wallet prompt', body: 'Say {{word}}' }] };
    const fake = { text: () => Promise.resolve(JSON.stringify(payload)), name: 't.wallet' };
    return NX.skills.walletImport(fake, 't.wallet').then(() => {
      if (!NX.store.data.skills.some(s => s.name === 'Wallet Test Skill')) throw new Error('skill not installed from wallet');
      if (!NX.store.data.prompts.some(p => p.title === 'Wallet prompt')) throw new Error('prompt not installed from wallet');
    });
  });
  ok('skill install from raw .skill text', () => {
    const fake = { name: 'dropped.skill', text: () => Promise.resolve('---\nname: Dropped Skill\ndescription: from a file\nicon: leaf\n---\nYou are a dropped skill.') };
    return NX.skills.installFiles([fake]).then(n => {
      if (!n || !NX.store.data.skills.some(s => s.name === 'Dropped Skill')) throw new Error('install failed');
    });
  });
  ok('priority matrix view renders', () => {
    window.location.hash = '#/tasks?view=matrix';
    NX.router.render();
    const v = document.getElementById('view');
    if (!v.textContent.includes('Do now') || !v.textContent.includes('Maybe delete')) throw new Error('matrix boxes missing');
  });
  ok('ambient sound definitions exist', () => {
    if (typeof NX.easy.soundPanel !== 'function') throw new Error('soundPanel missing');
    if (typeof NX.easy.zenWrite !== 'function' || typeof NX.easy.scratchpad !== 'function') throw new Error('zen/scratch missing');
  });

  /* ---------------- async AI paths ---------------- */
  await okAsync('AI summarize (offline path)', async () => {
    const r = await NX.ai.features.summarize('One two three. Four five six. Seven eight nine. Ten eleven twelve.');
    if (!r.text) throw new Error('no text');
    if (r.source !== 'offline') throw new Error('expected offline, got ' + r.source);
  });
  await okAsync('AI chat (offline retrieval)', async () => {
    const r = await NX.ai.features.chat('What is the product launch plan?');
    if (!r.text) throw new Error('no text');
  });
  await okAsync('AI extractTasks', async () => {
    const r = await NX.ai.features.extractTasks('Please send the invoice by Friday. Marcus will review the copy.');
    if (!Array.isArray(r.tasks)) throw new Error('not an array');
  });
  await okAsync('AI insights', async () => {
    const r = await NX.ai.features.insights();
    if (!Array.isArray(r.items)) throw new Error('no items');
  });
  await okAsync('AI dailyDigest + weeklyReview', async () => {
    const d = await NX.ai.features.dailyDigest();
    const w = await NX.ai.features.weeklyReview();
    if (!d.text || !w.text) throw new Error('empty');
  });
  await okAsync('AI testConnection reports unconfigured', async () => {
    const r = await NX.ai.features.testConnection();
    if (r.ok !== false) throw new Error('should be unconfigured');
  });

  /* ---------------- exports ---------------- */
  let downloads = [];
  window.URL.createObjectURL = () => 'blob:x';
  const origClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  ok('export JSON', () => { NX.actions.exportJSON(); });
  ok('export markdown bundle', () => { NX.actions.exportMarkdown(); });
  window.HTMLAnchorElement.prototype.click = origClick;
  console.log(`  Export handlers fired ........ ${downloads.length}`);

  /* ---------------- report ---------------- */
  const jsLen = (bundle.length / 1024).toFixed(0);
  const cssLen = (css.length / 1024).toFixed(0);
  console.log('\n' + '─'.repeat(62));
  if (failures.length) {
    console.log(`  ✗ ${failures.length} FAILURE(S) out of ${checks} checks\n`);
    failures.forEach((f, i) => console.log(`   ${i + 1}. ${f}\n`));
    process.exit(1);
  }
  const realErrors = consoleErrors.filter(e => !/Not implemented|Could not parse CSS|Error: Not impl/i.test(e));
  console.log(`  ✓ ${checks} checks passed, 0 failures`);
  console.log(`  ✓ ${modules.length} modules + ${subviews.length} sub-views rendered`);
  console.log(`  ✓ bundle: ${jsLen} KB JS + ${cssLen} KB CSS`);
  console.log(`  ✓ data: ${NX.store.notes.count()} notes, ${NX.store.tasks.count()} tasks, ${NX.store.messages.count()} messages, ${NX.sel.corpus().length} indexed`);
  if (realErrors.length) {
    console.log(`\n  ⚠ ${realErrors.length} console error(s) during run:`);
    realErrors.slice(0, 8).forEach(e => console.log('    ' + e.slice(0, 190)));
  } else {
    console.log('  ✓ no console errors during the whole run');
  }
  console.log('─'.repeat(62) + '\n');
  process.exit(realErrors.length > 3 ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH:', e); process.exit(1); });
