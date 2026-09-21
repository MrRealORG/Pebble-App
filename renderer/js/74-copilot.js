/* ============================================================
   Pebble — 74-copilot.js : persistent AI copilot sidebar
   • watches what you do (context engine) and suggests actions
   • agent mode: executes real commands across the app
   • voice in (Web Speech API + Windows SAPI bridge) & voice out
   • animated orb, skills integration, prompt insertion
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  let open = NX.localStore.get('nexadesk.copilotOpen', false);
  let agentMode = NX.localStore.get('nexadesk.copilotAgent', true);
  let voiceOut = NX.localStore.get('nexadesk.copilotVoice', false);
  let history = NX.localStore.get('nexadesk.copilotHistory', []);
  let busy = false;
  let recognizing = false;
  let recog = null;

  /* ================= context engine ================= */
  const ctx = { lastRoute: null, lastNote: null, lastTask: null, selections: [], events: [], startedAt: Date.now() };

  function trackRoute(id, params) {
    ctx.lastRoute = id;
    if (id === 'notes' && params && params.id) ctx.lastNote = params.id;
    if (id === 'tasks' && params && params.focus) ctx.lastTask = params.focus;
    pushEvent('opened ' + id);
  }
  function pushEvent(text) {
    ctx.events.unshift({ at: Date.now(), text });
    if (ctx.events.length > 60) ctx.events.length = 60;
  }

  function currentContext() {
    const route = NX.router.currentId();
    const parts = [];
    parts.push(`Current module: ${route}`);
    if (route === 'notes' && ctx.lastNote) {
      const n = store().notes.find(ctx.lastNote);
      if (n) parts.push(`Open note: "${n.title}" (${sel().noteWordCount(n)} words, edited ${NX.relTime(n.updated)})`);
    }
    const ts = NX.game ? NX.game.commitmentMinutesToday() : sel().focusMinutesToday();
    parts.push(`Focus today: ${NX.fmtDuration(ts)} · tasks done today: ${store().tasks.all().filter(t => t.done && t.completed && NX.isToday(t.completed)).length}`);
    const overdue = sel().overdueTasks();
    if (overdue.length) parts.push(`${overdue.length} overdue task(s): ` + overdue.slice(0, 4).map(t => t.title).join('; '));
    const due = sel().tasksDueOn(new Date()).filter(t => !t.done);
    if (due.length) parts.push(`Due today: ` + due.slice(0, 4).map(t => t.title).join('; '));
    const hab = sel().habitsCompletedToday();
    parts.push(`Habits: ${hab.done}/${hab.total} logged`);
    const unread = sel().unreadInbox().length;
    if (unread) parts.push(`${unread} unread inbox items`);
    const recent = ctx.events.slice(0, 6).map(e => e.text);
    if (recent.length) parts.push('Recent activity: ' + recent.join(' → '));
    return parts.join('\n');
  }

  /** Smart suggestions derived from live state */
  function suggestions() {
    const out = [];
    const route = NX.router.currentId();
    const overdue = sel().overdueTasks();
    if (overdue.length) out.push({ label: `Triage ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`, run: () => ask(`Help me triage these overdue tasks: ${overdue.slice(0, 6).map(t => t.title).join('; ')}. Suggest what to do now, reschedule or delete for each.`) });
    if (route === 'notes' && ctx.lastNote) {
      out.push({ label: 'Summarise this note', run: () => runNoteTool('summarize') });
      out.push({ label: 'Extract tasks from it', run: () => runNoteTool('tasks') });
      out.push({ label: 'Find related notes', run: () => runNoteTool('related') });
    }
    const hab = sel().habitsCompletedToday();
    if (hab.total && hab.done < hab.total) {
      const missing = store().habits.all().filter(x => x.active !== false && !sel().habitDoneOn(x, NX.todayStr()));
      out.push({ label: `Log "${missing[0].name}" now`, run: () => { NX.components.toggleHabit(missing[0].id); } });
    }
    if (sel().focusMinutesToday() < 25) out.push({ label: 'Start a focus session', run: () => NX.router.navigate('#/pomodoro') });
    if (!sel().journalFor(NX.todayStr())) out.push({ label: 'Start today\'s journal', run: () => NX.router.go('journal', { date: NX.todayStr() }) });
    if (sel().unreadInbox().length) out.push({ label: 'Clear the inbox', run: () => NX.router.navigate('#/inbox') });
    out.push({ label: 'Plan the rest of my day', run: () => ask('Plan the rest of my day based on what is due, my energy and my remaining hours. Be concrete and short.') });
    out.push({ label: 'What am I avoiding?', run: () => ask('Look at my tasks, habits and journal. What pattern am I avoiding, and what is the smallest first step?') });
    return out.slice(0, 5);
  }

  /* ================= agent tools ================= */
  const TOOLS = [
    { id: 'navigate', desc: 'Open a module', params: ['module'], run: p => { NX.router.navigate('#/' + p.module); return 'Opened ' + p.module; } },
    { id: 'create_task', desc: 'Create a task (natural language ok)', params: ['text'], run: p => {
        const parsed = NX.aiEngine.parseQuickCapture(p.text);
        const tags = parsed.tags.map(name => { const t = store().tags.all().find(x => x.name === name); return t ? t.id : store().tags.create({ name, color: NX.colorFromString(name) }, true).id; });
        const t = store().tasks.create({ title: parsed.title, description: '', projectId: null, status: 'To Do', priority: parsed.priority, due: parsed.due, repeat: parsed.repeat, tags, checklist: [], estimate: 0, order: 0, done: false, archived: false, parentId: null });
        return `Created task "${t.title}"${t.due ? ' due ' + NX.dueLabel(t.due) : ''}`;
      } },
    { id: 'complete_task', desc: 'Complete a task by title (fuzzy)', params: ['text'], run: p => {
        const t = findTask(p.text); if (!t) return 'No task matching "' + p.text + '"';
        NX.components.toggleTaskDone(t.id, true); return 'Completed "' + t.title + '"';
      } },
    { id: 'create_note', desc: 'Create a note', params: ['title', 'body'], run: p => {
        const n = store().notes.create({ title: p.title || 'Untitled', icon: '📄', emoji: '📄', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(p.body || '') });
        NX.router.go('notes', { id: n.id }); return 'Created note "' + n.title + '"';
      } },
    { id: 'create_reminder', desc: 'Set a reminder (natural language)', params: ['text'], run: p => {
        const w = NX.aiEngine.parseWhen(p.text);
        const at = w.date || NX.addMinutes(new Date(), 30);
        store().reminders.create({ title: w.cleaned || p.text, body: '', at: at.toISOString(), repeat: w.repeat, done: false, priority: 'normal', deepLink: '#/reminders' });
        return 'Reminder set: ' + (w.cleaned || p.text) + ' at ' + NX.fmtDateTime(at, 'medium');
      } },
    { id: 'create_event', desc: 'Create a calendar event', params: ['text'], run: p => {
        const w = NX.aiEngine.parseWhen(p.text);
        const s = w.date || NX.addMinutes(new Date(), 60);
        const e = store().events.create({ title: w.cleaned || p.text, start: new Date(s).toISOString(), end: new Date(new Date(s).getTime() + 3600000).toISOString(), allDay: false, color: '#7c6cff', calendar: 'Personal', description: '', reminder: 10, repeat: null, attendees: [], busy: true });
        return 'Event created: ' + e.title + ' at ' + NX.fmtTime(e.start);
      } },
    { id: 'log_habit', desc: 'Log a habit today by name', params: ['text'], run: p => {
        const hb = store().habits.all().find(x => x.name.toLowerCase().includes(String(p.text).toLowerCase()));
        if (!hb) return 'No habit matching "' + p.text + '"';
        NX.components.toggleHabit(hb.id, NX.todayStr(), true); return 'Logged habit "' + hb.name + '"';
      } },
    { id: 'start_focus', desc: 'Start or stop the focus timer', params: [], run: () => { document.dispatchEvent(new CustomEvent('nx:pomodoro-toggle')); NX.router.navigate('#/pomodoro'); return 'Focus timer toggled'; } },
    { id: 'set_theme', desc: 'Switch theme', params: ['value'], run: p => { store().setSetting('theme', p.value); return 'Theme set to ' + p.value; } },
    { id: 'toggle_simple', desc: 'Toggle Simple Mode', params: [], run: () => { NX.shellV2.toggleSimple(); return 'Simple mode ' + (document.documentElement.dataset.simple === 'on' ? 'on' : 'off'); } },
    { id: 'toggle_island', desc: 'Show/hide the Dynamic Island', params: [], run: () => { NX.shellV2.toggleIsland(); return 'Dynamic Island toggled'; } },
    { id: 'search', desc: 'Search the workspace', params: ['text'], run: p => { NX.router.navigate('#/search?q=' + encodeURIComponent(p.text)); return 'Searching for "' + p.text + '"'; } },
    { id: 'weekly_review', desc: 'Generate the weekly review', params: [], run: () => { NX.actions.weeklyReview(); return 'Weekly review opened'; } },
    { id: 'daily_digest', desc: 'Generate today\'s briefing', params: [], run: async () => { const r = await NX.ai.features.dailyDigest(); return r.text; } },
    { id: 'buy_item', desc: 'Buy/equip a shop item by name', params: ['text'], run: p => { const it = NX.game.SHOP.find(s => s.name.toLowerCase().includes(String(p.text).toLowerCase())); if (!it) return 'No shop item matching that'; NX.game.buy(it.id); return 'Purchased/equipped ' + it.name; } },
    { id: 'confetti', desc: 'Celebrate (confetti!)', params: [], run: () => { NX.game.confetti(140); return '🎊 Celebrated!'; } }
  ];

  function findTask(q) {
    q = String(q || '').toLowerCase();
    return sel().openTasks().find(t => t.title.toLowerCase() === q)
        || sel().openTasks().find(t => t.title.toLowerCase().includes(q))
        || store().tasks.all().find(t => t.title.toLowerCase().includes(q));
  }

  /** Parse an agent command out of free text: "agent: create task X tomorrow" */
  function parseAgentIntent(text) {
    const t = String(text).trim();
    const m = t.match(/^(?:agent[:,]?\s+)?(create|add|make)\s+(?:a\s+|an\s+)?(task|todo|note|reminder|event|habit)\s*[:\-]?\s*(.+)$/i);
    if (m) {
      const kind = m[2].toLowerCase();
      return { tool: kind === 'todo' ? 'create_task' : 'create_' + kind, params: { text: m[3], title: m[3], body: '' } };
    }
    const c = t.match(/^(?:agent[:,]?\s+)?(?:complete|finish|done|check)\s+(?:task\s+)?[:\-]?\s*(.+)$/i);
    if (c) return { tool: 'complete_task', params: { text: c[1] } };
    const g = t.match(/^(?:agent[:,]?\s+)?(?:go to|open)\s+([a-z]+)$/i);
    if (g && NX.router.get(g[1].toLowerCase())) return { tool: 'navigate', params: { module: g[1].toLowerCase() } };
    const r = t.match(/^(?:agent[:,]?\s+)?remind me\s*(.+)$/i);
    if (r) return { tool: 'create_reminder', params: { text: r[1] } };
    const th = t.match(/^(?:agent[:,]?\s+)?(?:set|switch|use)\s+(?:the\s+)?theme\s*(?:to\s*)?([a-z]+)$/i);
    if (th) return { tool: 'set_theme', params: { value: th[1] } };
    if (/^(?:agent[:,]?\s+)?start (?:a )?focus/i.test(t)) return { tool: 'start_focus', params: {} };
    if (/^(?:agent[:,]?\s+)?log (?:habit\s+)?(.+)$/i.test(t) && store().habits.all().some(x => x.name.toLowerCase().includes(t.replace(/^.*log (?:habit\s+)?/i, '').toLowerCase())))
      return { tool: 'log_habit', params: { text: t.replace(/^.*log (?:habit\s+)?/i, '') } };
    return null;
  }

  /* ================= UI ================= */
  function panel() {
    let el = document.getElementById('copilot');
    if (!el) {
      el = h('aside.copilot', { id: 'copilot' });
      document.body.appendChild(el);
    }
    NX.clear(el);
    el.classList.toggle('open', open);
    document.getElementById('app').classList.toggle('cp-open', open);

    // head
    el.appendChild(h('div.cp-head', [
      h('div.cp-orb' + (busy ? '.thinking' : ''), { id: 'cpOrb', title: 'Nexa copilot', onclick: () => { if (!busy) ask(NX.randomOf(suggestions()).label); } }, h('i')),
      h('div.cp-title', [
        h('b', 'Copilot'),
        h('span', { id: 'cpStatus' }, agentMode ? 'agent mode on · watching your context' : 'chat mode')
      ]),
      h('button.icon-btn' + (agentMode ? '.on' : ''), { title: 'Agent mode: copilot can execute actions', html: iconHTML('bolt', 15), onclick: () => { agentMode = !agentMode; NX.localStore.set('nexadesk.copilotAgent', agentMode); panel(); } }),
      h('button.icon-btn' + (voiceOut ? '.on' : ''), { title: 'Speak replies aloud', html: iconHTML('volume', 15), onclick: () => { voiceOut = !voiceOut; NX.localStore.set('nexadesk.copilotVoice', voiceOut); panel(); } }),
      h('button.icon-btn', { title: 'Insert a saved prompt', html: iconHTML('copy', 15), onclick: e => NX.ui.dropdown(e.currentTarget, promptMenu(), { right: true }) }),
      h('button.icon-btn', { title: 'Close copilot', html: iconHTML('x', 15), onclick: () => setOpen(false) })
    ]));

    // live context card
    el.appendChild(h('div.cp-ctx', [
      h('span', { html: iconHTML('eye', 13), style: { display: 'flex', marginTop: '1px', color: 'var(--brand-1)' } }),
      h('div', { style: { whiteSpace: 'pre-line', lineHeight: '1.5' } }, currentContext())
    ]));

    // suggestions
    el.appendChild(h('div.cp-suggest', suggestions().map(s => h('button.press', { onclick: () => s.run() }, s.label))));

    // messages
    const msgs = h('div.cp-msgs', { id: 'cpMsgs' });
    if (!history.length) {
      msgs.appendChild(h('div', { style: { textAlign: 'center', padding: '26px 12px', color: 'var(--tx-4)' } }, [
        h('div', { style: { display: 'flex', justifyContent: 'center', color: 'var(--brand-1)', marginBottom: '8px' }, html: NX.glyph('spark', 34, 1.6) }),
        h('b', { style: { display: 'block', fontSize: '13.5px', color: 'var(--tx-2)' } }, 'I see everything you do in here'),
        h('p.small', { style: { marginTop: '5px', lineHeight: '1.6' } }, 'Ask me anything, or tell me to DO something: "create task email Sam tomorrow 9am", "complete the launch checklist", "go to calendar", "set theme midnight".')
      ]));
    } else {
      history.slice(-30).forEach(m => msgs.appendChild(msgNode(m)));
    }
    el.appendChild(msgs);

    // composer
    const ta = h('textarea', { id: 'cpInput', rows: 1, placeholder: 'Ask, or command the agent…' });
    const mic = h('button.cp-mic', { id: 'cpMic', title: 'Voice input (Web Speech / Windows ASR)', html: iconHTML('mic', 16), onclick: toggleVoice });
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ta.value); ta.value = ''; ta.style.height = 'auto'; }
    });
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
    el.appendChild(h('div.cp-foot', [
      h('div.cp-input-row', [ta, mic,
        h('button.btn.primary.icon', { style: { width: '36px', height: '36px', borderRadius: '99px' }, html: iconHTML('send', 15), onclick: () => { send(ta.value); ta.value = ''; ta.style.height = 'auto'; } })])
    ]));

    setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 30);
    return el;
  }

  function msgNode(m) {
    const node = h('div.cp-msg.' + m.role, [
      h('div.cm-av', m.role === 'bot' ? h('span', { html: iconHTML('ai', 13) }) : h('span', { style: { display: 'flex' }, html: NX.avatarSVG(NX.store.getSetting('userName', 'you'), 26) })),
      h('div.cm-body', [h('div', { html: NX.ai.renderMarkdown(m.content) })])
    ]);
    if (m.actions && m.actions.length) {
      node.querySelector('.cm-body').appendChild(h('div.cm-actions', m.actions.map(a =>
        h('button' + (a.kind === 'run' ? '.run' : ''), { onclick: () => { if (a.kind === 'run') executeTool(a.tool, a.params); else NX.copyText(m.content); } }, a.label))));
    }
    return node;
  }

  function setOpen(v) {
    open = v;
    NX.localStore.set('nexadesk.copilotOpen', v);
    panel();
  }
  function toggle() { setOpen(!open); }

  /* ================= send / agent loop ================= */
  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    history.push({ role: 'user', content: text });
    NX.localStore.set('nexadesk.copilotHistory', history.slice(-60));
    panel();
    pushEvent('asked copilot: ' + text.slice(0, 60));

    // 1) agent intent?
    if (agentMode) {
      const intent = parseAgentIntent(text);
      if (intent) {
        const result = await executeTool(intent.tool, intent.params, true);
        finish(result);
        return;
      }
    }
    // 2) LLM / offline answer with context + skills
    try {
      const skillPrompt = NX.skills ? NX.skills.activePromptBlock() : '';
      const full = (skillPrompt ? skillPrompt + '\n\n' : '') + 'LIVE CONTEXT:\n' + currentContext() + '\n\nUSER: ' + text;
      const r = await NX.ai.features.chat(full, history.slice(-8).map(x => ({ role: x.role === 'bot' ? 'assistant' : x.role, content: x.content })), {});
      let content = r.text;
      // detect proposed actions in the reply and offer run buttons
      const actions = [];
      const proposed = content.match(/`(create_task|complete_task|create_note|create_reminder|create_event|navigate|log_habit|start_focus|set_theme|weekly_review|daily_digest|confetti)(\([^)\n]*\))?`/);
      if (proposed) {
        try {
          const p = proposed[2] ? JSON.parse(proposed[2].slice(1, -1)) : {};
          actions.push({ kind: 'run', label: '▶ Execute ' + proposed[1], tool: proposed[1], params: p });
        } catch (e) {}
      }
      actions.push({ kind: 'copy', label: 'Copy' });
      finish(content, actions);
    } catch (e) {
      finish('Error: ' + String(e.message || e));
    }

    function finish(content, actions) {
      history.push({ role: 'bot', content, actions });
      NX.localStore.set('nexadesk.copilotHistory', history.slice(-60));
      busy = false;
      panel();
      if (voiceOut) speak(content);
      NX.game && NX.game.award(2, 'Asked the copilot', { silent: true });
    }
  }

  async function executeTool(toolId, params, announce) {
    const tool = TOOLS.find(t => t.id === toolId);
    if (!tool) return 'Unknown tool: ' + toolId;
    pushEvent('agent ran ' + toolId);
    let out;
    try { out = await tool.run(params || {}); }
    catch (e) { out = 'Tool failed: ' + String(e.message || e); }
    if (announce) {
      history.push({ role: 'bot', content: '⚡ **' + toolId + '** → ' + out });
      NX.localStore.set('nexadesk.copilotHistory', history.slice(-60));
      busy = false;
      panel();
      if (voiceOut) speak(out);
    }
    NX.ui.toast({ type: 'success', message: '⚡ ' + out, duration: 3200 });
    return out;
  }

  function runNoteTool(kind) {
    const n = store().notes.find(ctx.lastNote);
    if (!n) { NX.ui.toast({ type: 'warn', message: 'Open a note first' }); return; }
    if (kind === 'summarize') NX.router.go('notes', { id: n.id });
    if (kind === 'tasks') { NX.router.go('notes', { id: n.id }); setTimeout(() => NX.ui.toast({ message: 'Use the note toolbar → AI → extract action items', duration: 3000 }), 300); }
    if (kind === 'related') {
      const rel = sel().relatedNotes(n.id, 6);
      NX.ui.modal({ title: 'Related to "' + n.title + '"', hideFooter: true, size: '',
        body: rel.length ? h('div.list', rel.map(r2 => h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => { NX.ui.closeTopModal(); NX.router.go('notes', { id: r2.note.id }); } }, [h('span', r2.note.icon || '📄'), h('div.lr-main', [h('div.lr-title', r2.note.title), h('div.lr-sub', r2.sharedTerms + ' shared terms · score ' + r2.shared)])]))) : h('p.small.muted', 'Nothing similar yet.') });
    }
  }

  function promptMenu() {
    const prompts = (store().data.prompts || []);
    if (!prompts.length) return [{ label: 'No saved prompts — open Prompt Manager', onClick: () => NX.router.navigate('#/prompts') }];
    return prompts.slice(0, 14).map(p => ({ label: p.title, onClick: () => {
      const filled = NX.prompts.fill(p.body);
      const ta = document.getElementById('cpInput');
      if (ta) { ta.value = filled; ta.focus(); }
    } }));
  }

  /* ================= voice ================= */
  function toggleVoice() {
    if (recognizing) { stopVoice(); return; }
    startVoice();
  }

  function startVoice() {
    const mic = document.getElementById('cpMic');
    // Windows native ASR bridge (System.Speech) when in the desktop app
    if (store().desktop && window.nex && window.nex.asr && NX.appInfo && NX.appInfo.platform === 'win32') {
      recognizing = true; if (mic) mic.classList.add('rec');
      setStatus('listening via Windows speech…');
      window.nex.asr(15000).then(text => {
        recognizing = false; if (mic) mic.classList.remove('rec'); setStatus('');
        if (text) { const ta = document.getElementById('cpInput'); if (ta) ta.value = (ta.value + ' ' + text).trim(); send(text); }
      }).catch(() => { recognizing = false; if (mic) mic.classList.remove('rec'); setStatus(''); webSpeech(); });
      return;
    }
    webSpeech();
  }

  function webSpeech() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = document.getElementById('cpMic');
    if (!SR) {
      NX.ui.toast({ type: 'warn', title: 'Voice not available', message: 'This browser has no SpeechRecognition. On Windows desktop the app falls back to system ASR.', duration: 5000 });
      return;
    }
    recog = new SR();
    recog.lang = (store().getSetting('language', 'en') === 'en' ? 'en-US' : store().getSetting('language'));
    recog.interimResults = true;
    recog.continuous = false;
    recognizing = true;
    if (mic) mic.classList.add('rec');
    setStatus('listening…');
    let finalText = '';
    recog.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      const ta = document.getElementById('cpInput');
      if (ta) ta.value = (finalText + interim).trim();
    };
    recog.onend = () => {
      recognizing = false; if (mic) mic.classList.remove('rec'); setStatus('');
      if (finalText.trim()) { pushEvent('voice: ' + finalText.slice(0, 40)); send(finalText.trim()); }
    };
    recog.onerror = e => { recognizing = false; if (mic) mic.classList.remove('rec'); setStatus(''); NX.ui.toast({ type: 'error', message: 'Voice error: ' + e.error, duration: 3500 }); };
    try { recog.start(); } catch (e) {}
  }
  function stopVoice() { if (recog) { try { recog.stop(); } catch (e) {} } recognizing = false; const mic = document.getElementById('cpMic'); if (mic) mic.classList.remove('rec'); }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const clean = String(text).replace(/[#*`>\[\]()_]/g, '').slice(0, 900);
      const u = new SpeechSynthesisUtterance(clean);
      u.rate = 1.04; u.pitch = 1;
      const orb = document.getElementById('cpOrb');
      u.onstart = () => orb && orb.classList.add('talking');
      u.onend = () => orb && orb.classList.remove('talking');
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  function setStatus(t) { const el = document.getElementById('cpStatus'); if (el) el.textContent = t || (agentMode ? 'agent mode on · watching your context' : 'chat mode'); }

  /* ================= hooks ================= */
  function init() {
    document.addEventListener('nx:route', e => { trackRoute(e.detail.id, e.detail.params); if (open) panel(); });
    store().on(() => { if (open && !busy) { const s = document.querySelector('.cp-suggest'); if (s) { NX.clear(s); suggestions().forEach(x => s.appendChild(h('button.press', { onclick: () => x.run() }, x.label))); } } });
    // topbar button
    const btn = h('button.icon-btn', { id: 'btnCopilot', title: 'AI Copilot (Ctrl+Shift+C)', html: iconHTML('ai', 17), onclick: toggle });
    const ai = document.getElementById('btnAI');
    if (ai && ai.parentElement) ai.parentElement.insertBefore(btn, ai);
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); toggle(); }
    });
    if (open) setTimeout(panel, 60);
  }

  NX.copilot = { init, toggle, setOpen, panel, ask: send, send, speak, TOOLS, executeTool, currentContext, suggestions, isOpen: () => open };
})(window.NX);
