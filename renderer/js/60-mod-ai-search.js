/* ============================================================
   Pebble — mod-ai.js + mod-search.js
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, iconHTML } = NX;
  const store = () => NX.store, sel = () => NX.sel;

  /* =====================================================================
     AI ASSISTANT
     ===================================================================== */
  (function () {
    let history = NX.localStore.get('nexadesk.aiHistory', []);
    let tab = 'chat';
    let busy = false;

    const SUGGESTIONS = [
      'What should I focus on today?',
      'Summarise my week so far',
      'Which goals are behind pace?',
      'What did I write about in my journal this week?',
      'Turn my open tasks into a realistic plan',
      'What am I avoiding?',
      'Find everything about the product launch',
      'How is my spending this month?',
      'Which habits are slipping?',
      'Draft a status update for my team'
    ];

    function render(params) {
      if (params && params.tab) tab = params.tab;
      const page = h('div.page');
      page.appendChild(NX.components.pageHead({
        icon: 'ai', title: 'AI Assistant',
        sub: NX.ai.isConfigured()
          ? `Connected to ${NX.ai.providerInfo().name} · model ${NX.ai.activeModel()}`
          : 'Offline engine active — add an API key in Settings → AI for full language-model power',
        actions: [
          h('button.btn.sm' + (NX.ai.isConfigured() ? '.subtle' : '.primary'), { html: iconHTML('key', 13) + (NX.ai.isConfigured() ? ' Change provider' : ' Connect an AI provider'), onclick: () => NX.router.go('settings', { tab: 'ai' }) }),
          h('button.btn.sm.ghost', { onclick: () => NX.router.go('settings', { tab: 'ai' }) }, 'AI settings')
        ]
      }));
      page.appendChild(h('div.tabs', ['chat', 'insights', 'tools', 'digest'].map(t =>
        h('button' + (tab === t ? '.on' : ''), { onclick: () => { tab = t; NX.router.render(); } }, t[0].toUpperCase() + t.slice(1)))));

      if (!NX.ai.isConfigured() && tab === 'chat') {
        page.appendChild(h('div.card.pad-sm', { style: { background: 'var(--acc-blu-bg)', marginBottom: 'var(--sp-4)', borderColor: 'rgba(74,168,232,.3)' } }, [
          h('div.row', { style: { gap: '10px', alignItems: 'flex-start' } }, [
            h('span', { html: iconHTML('info', 17), style: { color: 'var(--acc-blu)', display: 'flex', marginTop: '1px' } }),
            h('div.grow', [
              h('b.small', 'Running on the built-in offline engine'),
              h('div.small', { style: { marginTop: '3px', color: 'var(--tx-2)', lineHeight: '1.6' } },
                'Everything below works without any key or network: full-text search over your whole workspace, keyword-driven answers with sources, task extraction, tag suggestions, readability and sentiment analysis, summarisation, spaced repetition, and generated reviews. Add an OpenAI / Anthropic / Gemini / Groq / OpenRouter / Ollama key in Settings → AI to unlock free-form reasoning and rewriting.')
            ]),
            h('button.btn.sm.primary', { onclick: () => NX.router.go('settings', { tab: 'ai' }) }, 'Add a key')
          ])
        ]));
      }

      if (tab === 'chat') page.appendChild(chatView());
      else if (tab === 'insights') page.appendChild(insightsView());
      else if (tab === 'tools') page.appendChild(toolsView());
      else page.appendChild(digestView());
      return page;
    }

    /* ---------------- chat ---------------- */
    function chatView() {
      const wrap = h('div.ai-chat');
      const msgs = h('div.ai-msgs', { id: 'aiMsgs' });
      if (!history.length) {
        msgs.appendChild(h('div', { style: { textAlign: 'center', padding: '26px 0' } }, [
          h('div', { style: { width: '58px', height: '58px', borderRadius: '17px', background: 'var(--brand-grad)', display: 'grid', placeItems: 'center', margin: '0 auto 13px', boxShadow: '0 8px 28px rgba(124,108,255,.34)' }, html: iconHTML('ai', 27) }),
          h('h3', { style: { fontSize: '18px' } }, 'Ask me anything about your workspace'),
          h('p.small.muted', { style: { maxWidth: '430px', margin: '6px auto 0', lineHeight: '1.65' } },
            'I can see your notes, tasks, calendar, habits, goals, journal, finances, wiki and chat. Ask a question, request a plan, or use one of the prompts below.')
        ]));
      } else {
        history.forEach(m => msgs.appendChild(msgNode(m)));
      }
      wrap.appendChild(msgs);

      const composer = h('div.ai-composer');
      composer.appendChild(h('div.ai-suggest', SUGGESTIONS.map(s =>
        h('button', { onclick: () => { const ta = document.getElementById('aiInput'); ta.value = s; ta.focus(); ta.dispatchEvent(new Event('input')); } }, s))));
      const ta = h('textarea.textarea', { id: 'aiInput', rows: 2, placeholder: 'Ask a question… (Enter to send, Shift+Enter for a new line)' });
      ta.style.resize = 'none';
      const box = h('div.composer-box', { style: { background: 'var(--bg-input)', border: '1px solid var(--bd-2)', borderRadius: '13px', padding: '9px 12px' } });
      box.appendChild(ta);
      box.appendChild(h('div.composer-tools', [
        h('button.icon-btn', { html: iconHTML('sparkle', 17), title: 'AI tools menu', onclick: e => NX.ui.dropdown(e.currentTarget, toolsMenu(), { right: true, up: true }) }),
        history.length ? h('button.icon-btn', { html: iconHTML('trash', 16), title: 'Clear conversation', onclick: () => { history = []; NX.localStore.set('nexadesk.aiHistory', []); NX.router.render(); } }) : null,
        h('button.icon-btn', { html: iconHTML('send', 17), title: 'Send', style: { color: 'var(--brand-1)' }, onclick: () => send() })
      ]));
      composer.appendChild(box);
      composer.appendChild(h('div.row', { style: { marginTop: '6px', gap: '10px', padding: '0 3px' } }, [
        h('span.tiny.muted', `Context: ${NX.ai.isConfigured() ? 'workspace snapshot sent with each request' : 'local retrieval over ' + sel().corpus().length + ' indexed items'}`),
        h('div.grow'),
        h('label.checkbox', [h('input', { type: 'checkbox', checked: store().getSetting('aiSendNotes', true), onchange: e => store().setSetting('aiSendNotes', e.target.checked) }), h('span.tiny', 'Include workspace context')])
      ]));
      wrap.appendChild(composer);

      ta.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(150, ta.scrollHeight) + 'px'; });
      setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 30);

      async function send() {
        const text = ta.value.trim();
        if (!text || busy) return;
        busy = true;
        ta.value = ''; ta.style.height = 'auto';
        history.push({ role: 'user', content: text, at: Date.now() });
        msgs.appendChild(msgNode({ role: 'user', content: text }));
        const thinking = h('div.ai-msg.bot', [
          h('div.am-av', { html: iconHTML('ai', 16) }),
          h('div.am-body', [h('div.am-name', 'Nexa'), h('div.am-text', h('span.typing-dots', [h('span'), h('span'), h('span')]))])
        ]);
        msgs.appendChild(thinking);
        msgs.scrollTop = msgs.scrollHeight;
        let res;
        try {
          res = await NX.ai.features.chat(text, history.slice(-10).map(m => ({ role: m.role, content: m.content })), {});
        } catch (e) { res = { text: 'Error: ' + String(e.message || e), source: 'error' }; }
        thinking.remove();
        history.push({ role: 'assistant', content: res.text, at: Date.now(), source: res.source, sources: res.sources });
        NX.localStore.set('nexadesk.aiHistory', history.slice(-40));
        msgs.appendChild(msgNode(history[history.length - 1]));
        msgs.scrollTop = msgs.scrollHeight;
        busy = false;
      }
      return wrap;
    }

    function msgNode(m) {
      const isUser = m.role === 'user';
      return h('div.ai-msg.' + (isUser ? 'user' : 'bot'), [
        h('div.am-av', isUser ? h('span', { style: { fontSize: '13px' } }, '🧑') : h('span', { html: iconHTML('ai', 16) })),
        h('div.am-body', [
          h('div.am-name', isUser ? (store().getSetting('userName', 'You')) : 'Nexa' + (m.source && !isUser ? ` · ${m.source === 'api' ? NX.ai.providerInfo().name : 'offline engine'}` : '')),
          h('div.am-text', { html: NX.ai.renderMarkdown(m.content) }),
          (m.sources && m.sources.length) ? h('div.ai-sources', m.sources.slice(0, 8).map(s =>
            h('button.ai-src', { onclick: () => NX.actions.openResult({ kind: s.kind, id: s.id }) }, [
              h('span', { html: iconHTML(kindIcon(s.kind), 11), style: { display: 'flex' } }), s.title
            ]))) : null,
          !isUser ? h('div.row', { style: { gap: '5px', marginTop: '7px' } }, [
            h('button.btn.xs.ghost', { onclick: () => NX.copyText(m.content).then(() => NX.ui.toast({ message: 'Copied', duration: 1400 })) }, 'Copy'),
            h('button.btn.xs.ghost', { onclick: () => {
                const n = store().notes.create({ title: '🤖 ' + (history.find(x => x.role === 'user') || { content: 'AI response' }).content.slice(0, 46), icon: '🤖', emoji: '🤖', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(m.content) });
                NX.ui.toast({ type: 'success', message: 'Saved as a note', duration: 4000, actions: [{ label: 'Open', onClick: () => NX.router.go('notes', { id: n.id }) }] });
              } }, 'Save as note')
          ]) : null
        ])
      ]);
    }
    function kindIcon(k) { return { note: 'note', task: 'task', wiki: 'book', event: 'calendar', message: 'chat', bookmark: 'bookmark', contact: 'contact', journal: 'journal', goal: 'target', habit: 'habit' }[k] || 'zap'; }

    /* ---------------- insights ---------------- */
    function insightsView() {
      const wrap = h('div');
      const box = h('div', { id: 'insightBox' }, h('div', { style: { textAlign: 'center', padding: '40px' } }, [
        h('div.spin', { html: iconHTML('refresh', 26), style: { color: 'var(--tx-4)', display: 'inline-block' } }),
        h('p.small.muted', { style: { marginTop: '10px' } }, 'Analysing your whole workspace…')
      ]));
      wrap.appendChild(box);
      setTimeout(async () => {
        const r = await NX.ai.features.insights();
        NX.clear(box);
        if (r.aiText) {
          box.appendChild(h('div.card', { style: { marginBottom: 'var(--sp-4)', background: 'var(--sel)' } }, [
            h('div.card-head', [h('span', { html: iconHTML('sparkle', 16), style: { display: 'flex', color: 'var(--acc-pur)' } }), h('h3', 'AI observations')]),
            h('div.md-preview', { html: NX.ai.renderMarkdown(r.aiText) })
          ]));
        }
        const items = r.items;
        if (!items.length) { box.appendChild(NX.ui.emptyState('check', 'Nothing needs attention', 'No overdue tasks, no budget breaches, no stalled goals. Rare and worth noticing.')); return; }
        const groups = { warn: [], good: [], info: [] };
        items.forEach(i => (groups[i.kind] || groups.info).push(i));
        const section = (title, list, color) => {
          if (!list.length) return null;
          return h('div.section', [
            h('div.section-head', [h('h2', { style: { color } }, title), h('span.sh-sub', String(list.length))]),
            h('div.grid.grid-auto', list.map(i => h('div.card.hoverable.pad-sm', { style: { cursor: 'pointer', borderLeft: '3px solid ' + color }, onclick: () => NX.router.navigate(i.link || '#/ai') }, [
              h('div.row', { style: { gap: '8px', marginBottom: '5px' } }, [
                h('span', { html: iconHTML(i.icon || 'info', 15), style: { color, display: 'flex' } }),
                h('b.small.grow', i.title)
              ]),
              h('div.small.muted', { style: { lineHeight: '1.6' } }, i.text)
            ])))
          ]);
        };
        box.appendChild(section('Needs attention', groups.warn, 'var(--acc-org)'));
        box.appendChild(section('Going well', groups.good, 'var(--acc-grn)'));
        box.appendChild(section('Worth knowing', groups.info, 'var(--acc-blu)'));
      }, 60);
      return wrap;
    }

    /* ---------------- tools ---------------- */
    function toolsMenu() {
      return [
        { header: 'Planning' },
        { icon: 'target', label: 'Plan my day', onClick: () => runTool('planDay') },
        { icon: 'calendar', label: 'Weekly review', onClick: () => NX.actions.weeklyReview() },
        { icon: 'sparkle', label: 'Daily briefing', onClick: () => { tab = 'digest'; NX.router.render(); } },
        '-',
        { header: 'Writing' },
        { icon: 'note', label: 'Draft a new note…', onClick: () => runTool('draft') },
        { icon: 'edit', label: 'Improve selected text…', onClick: () => runTool('improve') },
        { icon: 'globe', label: 'Translate…', onClick: () => runTool('translate') },
        '-',
        { header: 'Analysis' },
        { icon: 'task', label: 'Extract tasks from text…', onClick: () => runTool('extract') },
        { icon: 'tag', label: 'Suggest tags for text…', onClick: () => runTool('tags') },
        { icon: 'chart', label: 'Analyse text statistics…', onClick: () => runTool('analyse') },
        { icon: 'layers', label: 'Cluster my notes by topic', onClick: () => runTool('cluster') },
        { icon: 'brain', label: 'Build flashcards from a note…', onClick: () => runTool('flashcards') }
      ];
    }

    function toolsView() {
      const wrap = h('div');
      const tools = [
        { icon: '🗓️', name: 'Plan my day', desc: 'Ranks every open task by priority, due date and effort, then time-blocks what fits into your remaining hours.', run: () => runTool('planDay') },
        { icon: '🔁', name: 'Weekly review', desc: 'Generates a full weekly review from real data: completions, streaks, focus hours, goals, and reflection prompts.', run: () => NX.actions.weeklyReview() },
        { icon: '📝', name: 'Draft a note', desc: 'Turns a topic into a structured note with headings, bullets and open questions.', run: () => runTool('draft') },
        { icon: '✍️', name: 'Improve writing', desc: 'Fixes grammar, tightens wordy sentences, keeps your voice and every fact.', run: () => runTool('improve') },
        { icon: '🌍', name: 'Translate', desc: 'Translates any text into 30+ languages.', run: () => runTool('translate') },
        { icon: '✅', name: 'Extract tasks', desc: 'Pulls actionable items out of meeting notes or any pasted text, with owners and due dates.', run: () => runTool('extract') },
        { icon: '🏷️', name: 'Suggest tags', desc: 'Reads your text and suggests tags, preferring the vocabulary you already use.', run: () => runTool('tags') },
        { icon: '📊', name: 'Text analysis', desc: 'Word count, readability score, grade level, sentiment, key terms, sentence stats.', run: () => runTool('analyse') },
        { icon: '🧩', name: 'Cluster notes', desc: 'Groups your notes by shared vocabulary so you can see the topics you actually think about.', run: () => runTool('cluster') },
        { icon: '🃏', name: 'Flashcards', desc: 'Turns a note into spaced-repetition cards using the SM-2 algorithm.', run: () => runTool('flashcards') },
        { icon: '🕸️', name: 'Find orphaned knowledge', desc: 'Notes and wiki pages that nothing links to — the ones most likely to be lost.', run: () => runTool('orphans') },
        { icon: '🔮', name: 'On this day', desc: 'What you wrote, did and tracked on this date in previous years.', run: () => runTool('onThisDay') }
      ];
      wrap.appendChild(h('div.grid.grid-auto', tools.map(t => h('button.card.hoverable', { style: { textAlign: 'left', cursor: 'pointer' }, onclick: t.run }, [
        h('div', { style: { fontSize: '23px', marginBottom: '8px' } }, t.icon),
        h('b', { style: { fontSize: '13.5px', display: 'block' } }, t.name),
        h('div.small.muted', { style: { marginTop: '4px', lineHeight: '1.55' } }, t.desc)
      ]))));
      return wrap;
    }

    async function runTool(kind) {
      if (kind === 'planDay') { NX.router.navigate('#/tasks'); setTimeout(() => document.dispatchEvent(new CustomEvent('nx:noop')), 50); NX.router.go('tasks'); setTimeout(() => { const b = NX.$$('.btn.sm.subtle').find(x => /Plan my day/.test(x.textContent)); if (b) b.click(); }, 250); return; }
      if (kind === 'cluster') {
        const clusters = NX.aiEngine.clusterNotes();
        NX.ui.modal({ title: 'Topic clusters', subtitle: 'Grouped by strongest keyword', size: 'wide', hideFooter: true,
          body: h('div', clusters.slice(0, 30).map(c => h('div.card.pad-sm', { style: { marginBottom: '8px', background: 'var(--bg-sunken)' } }, [
            h('div.row', [h('b.small', '#' + c.name), h('span.badge-count', String(c.count))]),
            h('div.small.muted', { style: { marginTop: '5px' } }, c.titles.slice(0, 10).join(' · '))
          ]))) });
        return;
      }
      if (kind === 'orphans') {
        const linked = new Set(); sel().noteLinks().forEach(l => { if (l.toId) linked.add(l.toId); });
        const orphans = store().notes.all().filter(n => !n.archived && !linked.has(n.id) && !sel().backlinksTo(n.id).length && !n.parentId)
          .concat(store().wiki.all().filter(p => !linked.has(p.id)));
        NX.ui.modal({ title: 'Orphaned knowledge', subtitle: `${orphans.length} items nothing links to`, size: 'wide', hideFooter: true,
          body: orphans.length ? h('div.list', orphans.map(o => h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => { NX.ui.closeTopModal(); NX.actions.openResult({ kind: store().notes.find(o.id) ? 'note' : 'wiki', id: o.id }); } }, [
            h('span', { style: { fontSize: '15px' } }, o.icon || '📄'),
            h('div.lr-main', [h('div.lr-title', o.title), h('div.lr-sub', (store().notes.find(o.id) ? 'Note' : 'Wiki page') + ' · edited ' + NX.relTime(o.updated))])
          ]))) : NX.ui.emptyState('link', 'Nothing is orphaned', 'Every note and page is connected to something.') });
        return;
      }
      if (kind === 'onThisDay') {
        const now = new Date();
        const out = [];
        for (let y = 1; y <= 5; y++) {
          const d = new Date(now.getFullYear() - y, now.getMonth(), now.getDate());
          const k = NX.ymd(d);
          const j = sel().journalFor(k);
          if (j) out.push({ year: y, label: `${y} year${y > 1 ? 's' : ''} ago`, type: 'Journal', text: String(j.text || '').slice(0, 260), mood: j.mood });
          store().notes.all().filter(n => String(n.created).slice(0, 10) === k).forEach(n => out.push({ year: y, label: `${y} year${y > 1 ? 's' : ''} ago`, type: 'Note created', text: n.title }));
          store().tasks.all().filter(t => t.completed && String(t.completed).slice(0, 10) === k).forEach(t => out.push({ year: y, label: `${y} year${y > 1 ? 's' : ''} ago`, type: 'Task completed', text: t.title }));
          store().pomodoro.all().filter(p => String(p.startedAt).slice(0, 10) === k).length && out.push({ year: y, label: `${y} year${y > 1 ? 's' : ''} ago`, type: 'Focus', text: `${NX.fmtDuration(NX.sum(store().pomodoro.all().filter(p => String(p.startedAt).slice(0, 10) === k).map(p => p.actualMinutes || 0)))} of deep work` });
        }
        NX.ui.modal({ title: 'On this day', size: 'wide', hideFooter: true,
          body: out.length ? h('div', out.map(o => h('div.card.pad-sm', { style: { marginBottom: '8px', background: 'var(--bg-sunken)' } }, [
            h('div.row', [h('span.chip', o.label), h('span.chip.chip-blu', o.type)]),
            h('div.small', { style: { marginTop: '6px', whiteSpace: 'pre-wrap' } }, o.text)
          ]))) : NX.ui.emptyState('history', 'Nothing recorded on this date', 'Keep going — in a year this will have something to show you.') });
        return;
      }
      if (kind === 'flashcards') {
        const notes = sel().recentNotes(30);
        const pick = await new Promise(res => {
          const list = h('div.list', { style: { maxHeight: '320px', overflow: 'auto' } });
          notes.forEach(n => list.appendChild(h('button.list-row.selectable', { style: { width: '100%' }, onclick: () => { m.close(); res(n); } }, [h('span', { style: { fontSize: '15px' } }, n.icon || '📄'), h('div.lr-main', [h('div.lr-title', n.title || 'Untitled'), h('div.lr-sub', sel().noteWordCount(n) + ' words')])])));
          const m = NX.ui.modal({ title: 'Build flashcards from…', size: '', hideFooter: true, body: list, onClose: () => res(null) });
        });
        if (!pick) return;
        const text = sel().notePlain(pick);
        const sents = NX.aiEngine.sentences(text).filter(s => s.length > 30 && s.length < 200);
        const cards = sents.slice(0, 14).map(s => {
          const kw = NX.aiEngine.keywords(s, 1)[0];
          if (!kw) return null;
          return { front: s.replace(new RegExp(kw.word, 'i'), '______'), back: s, term: kw.word, ease: 2.5, interval: 0, reps: 0, due: new Date().toISOString() };
        }).filter(Boolean);
        if (!cards.length) { NX.ui.toast({ type: 'warn', message: 'Not enough content to build cards' }); return; }
        startFlashcards(cards, pick.title);
        return;
      }

      // text-input tools
      const needText = { improve: 'Paste the text to improve', translate: 'Paste the text to translate', extract: 'Paste meeting notes or any text', tags: 'Paste text to tag', analyse: 'Paste text to analyse', draft: 'What should the note be about?' };
      const inp = h('textarea.textarea', { rows: 9, placeholder: needText[kind] || 'Paste text…' });
      const langSel = kind === 'translate' ? h('select.select', { id: 'toolLang' }, ['Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Portuguese', 'Italian', 'Russian', 'Arabic', 'Hindi', 'Korean', 'Dutch', 'Swedish', 'Polish', 'Turkish'].map(l => h('option', { value: l }, l))) : null;
      const m = NX.ui.modal({
        title: toolsTitle(kind), size: 'wide',
        body: h('div', [
          h('div.field', [h('label', kind === 'draft' ? 'Topic' : 'Text'), inp]),
          langSel ? h('div.field', { style: { marginTop: '10px' } }, [h('label', 'Target language'), langSel]) : null
        ]),
        footer: [h('div.grow'), h('button.btn.primary', { onclick: async () => {
          const text = inp.value.trim();
          if (!text) return;
          m.close();
          const t = NX.ui.toast({ type: 'info', message: 'Working…', duration: 0 });
          try { await runWithText(kind, text, langSel ? langSel.value : null); }
          finally { t.close(); }
        } }, 'Run')]
      });
      setTimeout(() => inp.focus(), 50);
    }
    function toolsTitle(k) { return { improve: 'Improve writing', translate: 'Translate', extract: 'Extract tasks', tags: 'Suggest tags', analyse: 'Analyse text', draft: 'Draft a note' }[k] || 'Tool'; }

    async function runWithText(kind, text, lang) {
      if (kind === 'improve' || kind === 'translate') {
        const r = kind === 'improve' ? await NX.ai.features.improve(text) : await NX.ai.features.translate(text, lang);
        NX.ui.modal({ title: toolsTitle(kind), size: 'wide',
          body: h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' } }, [
            h('div', [h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600' } }, 'ORIGINAL'), h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12.5px', background: 'var(--bg-sunken)', padding: '12px', borderRadius: '8px', border: '1px solid var(--bd)', maxHeight: '44vh', overflow: 'auto' } }, text)]),
            h('div', [h('div.small.muted', { style: { marginBottom: '6px', fontWeight: '600' } }, 'RESULT'), h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '12.5px', background: 'var(--sel)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(124,108,255,.3)', maxHeight: '44vh', overflow: 'auto' } }, r.text)])
          ]),
          footer: [r.note ? h('span.small.muted.grow', r.note) : h('div.grow'),
            h('button.btn.ghost', { onclick: () => NX.copyText(r.text) }, 'Copy'),
            h('button.btn.primary', { onclick: () => { const n = store().notes.create({ title: NX.aiEngine.suggestTitle(r.text), icon: '✨', emoji: '✨', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(r.text) }); NX.ui.closeTopModal(); NX.router.go('notes', { id: n.id }); } }, 'Save as note')] });
        return;
      }
      if (kind === 'extract') {
        const r = await NX.ai.features.extractTasks(text);
        if (!r.tasks.length) { NX.ui.toast({ type: 'info', message: 'No action items found' }); return; }
        const chosen = new Set(r.tasks.map((_, i) => i));
        NX.ui.modal({ title: `${r.tasks.length} action items found`, subtitle: r.source === 'api' ? 'via AI' : 'via offline engine', size: 'wide',
          body: h('div', r.tasks.map((a, i) => h('label.checkbox', { style: { display: 'flex', padding: '7px 0', borderBottom: '1px solid var(--bd)', alignItems: 'flex-start' } }, [
            h('input', { type: 'checkbox', checked: true, style: { marginTop: '2px' }, onchange: e => e.target.checked ? chosen.add(i) : chosen.delete(i) }),
            h('div.grow', [h('div', { style: { fontSize: '13px' } }, a.title), h('div.small.muted', [a.priority !== 'Medium' ? a.priority : '', a.due ? NX.fmtDate(a.due, 'medium') : '', a.assignee ? '@' + a.assignee : ''].filter(Boolean).join(' · '))])
          ]))),
          footer: [h('div.grow'), h('button.btn.primary', { onclick: () => {
            let n = 0;
            r.tasks.forEach((a, i) => { if (!chosen.has(i)) return; store().tasks.create({ title: a.title, description: text.slice(0, 200), projectId: null, status: 'To Do', priority: a.priority || 'Medium', due: a.due ? new Date(a.due).toISOString() : null, repeat: null, tags: [], checklist: [], estimate: 0, order: 0, done: false, archived: false }, true); n++; });
            store().touch(); store().emit('tasks');
            NX.ui.closeTopModal();
            NX.ui.toast({ type: 'success', title: `${n} tasks created`, duration: 4200, actions: [{ label: 'View', onClick: () => NX.router.navigate('#/tasks') }] });
          } }, 'Create tasks')] });
        return;
      }
      if (kind === 'tags') {
        const r = await NX.ai.features.suggestTags(text);
        NX.ui.modal({ title: 'Suggested tags', subtitle: r.source === 'api' ? 'via AI' : 'via offline analysis', size: 'narrow', hideFooter: true,
          body: h('div.row-wrap', { style: { gap: '7px' } }, r.tags.map(t => h('button.chip.clickable', {
            style: { borderColor: t.color, fontSize: '13px', padding: '4px 12px' },
            onclick: () => { let tag = store().tags.all().find(x => x.name === t.name); if (!tag) tag = store().tags.create({ name: t.name, color: t.color || NX.colorFromString(t.name) }); NX.ui.toast({ message: 'Created tag #' + tag.name, duration: 1600 }); }
          }, (t.id ? '' : '+ ') + t.name))) });
        return;
      }
      if (kind === 'analyse') {
        const r = NX.aiEngine.readability(text);
        const s = NX.aiEngine.sentiment(text);
        const kw = NX.aiEngine.keywords(text, 14);
        NX.ui.modal({ title: 'Text analysis', size: 'wide', hideFooter: true,
          body: h('div', [
            h('div.grid.grid-4', { style: { marginBottom: '14px' } }, [
              NX.components.statTile('Words', NX.fmtNum(r.words), '', 'note'),
              NX.components.statTile('Read time', r.readMinutes + ' min', `${r.sentences} sentences`, 'clock'),
              NX.components.statTile('Flesch score', r.flesch, r.level, 'chart', r.flesch > 60 ? 'grn' : 'org'),
              NX.components.statTile('Grade level', r.grade, `avg ${r.avgSentence} words/sentence`, 'target', 'pur')
            ]),
            h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)', marginBottom: '14px' } }, [
              NX.ui.kv('Tone', `${s.emoji} ${s.label} (${s.score > 0 ? '+' : ''}${s.score})`),
              NX.ui.kv('Positive / negative terms', `${s.positive} / ${s.negative}`),
              NX.ui.kv('Unique words', `${r.uniqueWords} (${Math.round((r.uniqueWords || 0) / Math.max(1, r.words) * 100)}% lexical diversity)`),
              NX.ui.kv('Long sentences (>25 words)', String(r.longSentences)),
              NX.ui.kv('Avg syllables per word', String(r.avgSyllables)),
              NX.ui.kv('Characters', NX.fmtNum(r.characters))
            ]),
            kw.length ? h('div', [h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, 'Key terms')]),
              h('div.row-wrap', { style: { gap: '5px' } }, kw.map(k => h('span.chip', { title: `${k.count}× · score ${k.score.toFixed(2)}` }, k.word)))]) : null,
            h('div.section-head', { style: { marginTop: '14px' } }, [h('h2', { style: { fontSize: '13px' } }, 'Outline')]),
            h('div', NX.aiEngine.outline(text, 10).map(o => h('div.small', { style: { padding: '2px 0 2px ' + ((o.level - 1) * 14) + 'px' } }, '• ' + o.text)))
          ]) });
        return;
      }
      if (kind === 'draft') {
        const r = await NX.ai.features.draftNote(text);
        const n = store().notes.create({ title: NX.aiEngine.suggestTitle(text), icon: '✨', emoji: '✨', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(r.text) });
        NX.router.go('notes', { id: n.id });
        NX.ui.toast({ type: 'success', message: 'Draft created' + (r.source === 'offline' ? ' (offline template)' : '') });
      }
    }

    /* ---------------- spaced repetition flashcards ---------------- */
    function startFlashcards(cards, sourceTitle) {
      const state = NX.localStore.get('nexadesk.flashcards', {});
      let idx = 0, revealed = false, correct = 0;
      const box = h('div');
      const m = NX.ui.modal({ title: `Flashcards — ${sourceTitle}`, size: 'wide', hideFooter: true, body: box });
      draw();
      function draw() {
        NX.clear(box);
        if (idx >= cards.length) {
          box.appendChild(h('div', { style: { textAlign: 'center', padding: '30px 0' } }, [
            h('div', { style: { fontSize: '44px', marginBottom: '10px' } }, '🎉'),
            h('h3', `Session complete — ${correct}/${cards.length} remembered`),
            h('p.small.muted', { style: { marginTop: '6px' } }, 'Cards you missed will come back sooner (SM-2 scheduling).'),
            h('button.btn.primary', { style: { marginTop: '14px' }, onclick: () => { idx = 0; correct = 0; revealed = false; draw(); } }, 'Run it again')
          ]));
          return;
        }
        const c = cards[idx];
        box.appendChild(h('div.row', { style: { marginBottom: '12px' } }, [
          h('span.small.muted', `Card ${idx + 1} of ${cards.length}`),
          h('div.grow'),
          h('div.progress', { style: { width: '130px' } }, h('i', { style: { width: (idx / cards.length * 100) + '%' } }))
        ]));
        box.appendChild(h('div.card', { style: { minHeight: '190px', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '28px', cursor: 'pointer', background: revealed ? 'var(--acc-grn-bg)' : 'var(--bg-sunken)' },
          onclick: () => { revealed = true; draw(); } }, [
          h('div', { style: { fontSize: revealed ? '15px' : '19px', lineHeight: '1.7', fontWeight: revealed ? '400' : '550' } }, revealed ? c.back : c.front),
          revealed ? h('div.small', { style: { marginTop: '12px', color: 'var(--acc-grn)', fontWeight: '650' } }, c.term) : h('div.small.muted', { style: { marginTop: '14px' } }, 'Click to reveal')
        ]));
        if (revealed) {
          box.appendChild(h('div.small.muted', { style: { margin: '12px 0 6px', textAlign: 'center' } }, 'How well did you know it?'));
          box.appendChild(h('div.row', { style: { justifyContent: 'center', gap: '7px' } }, [
            { q: 0, l: 'Forgot', c: 'danger' }, { q: 2, l: 'Hard', c: 'subtle' }, { q: 4, l: 'Good', c: 'primary' }, { q: 5, l: 'Easy', c: 'success' }
          ].map(b => h('button.btn.' + b.c, { onclick: () => {
            const r = NX.aiEngine.sm2({ ease: c.ease, interval: c.interval, reps: c.reps }, b.q);
            Object.assign(c, r);
            if (b.q >= 3) correct++;
            state[c.front] = { ease: c.ease, interval: c.interval, reps: c.reps, due: c.due };
            NX.localStore.set('nexadesk.flashcards', state);
            idx++; revealed = false; draw();
          } }, b.l))));
        }
      }
    }

    /* ---------------- digest ---------------- */
    function digestView() {
      const wrap = h('div');
      const box = h('div.card', { style: { whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: '12.5px', lineHeight: '1.75' } });
      wrap.appendChild(h('div.row', { style: { marginBottom: '12px', gap: '7px' } }, [
        h('button.btn.sm.primary', { onclick: async e => { e.target.textContent = 'Generating…'; const r = await NX.ai.features.dailyDigest(); box.textContent = r.text; e.target.textContent = 'Regenerate'; }, html: iconHTML('refresh', 13) + ' Generate briefing' }),
        h('button.btn.sm.ghost', { onclick: () => NX.copyText(box.textContent) }, 'Copy'),
        h('button.btn.sm.ghost', { onclick: () => { const n = store().notes.create({ title: '📋 Daily briefing — ' + NX.fmtDate(new Date(), 'medium'), icon: '📋', emoji: '📋', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(box.textContent) }); NX.router.go('notes', { id: n.id }); } }, 'Save as note'),
        h('button.btn.sm.ghost', { onclick: () => { const n = store().notes.create({ title: '🔁 Weekly review — ' + NX.fmtDate(NX.startOfWeek(new Date()), 'medium'), icon: '🔁', emoji: '🔁', tags: [], parentId: null, order: 0, favorite: false, archived: false, properties: [], blocks: NX.md.markdownToBlocks(NX.aiEngine.weeklyReview()) }); NX.router.go('notes', { id: n.id }); } }, 'Weekly review → note'),
        h('div.grow'),
        h('span.small.muted', 'Plain text, generated from your real data')
      ]));
      box.textContent = NX.aiEngine.dailyDigest();
      wrap.appendChild(box);
      return wrap;
    }

    NX.router.register({
      id: 'ai', name: 'AI Assistant', icon: 'ai', group: 'system', order: 71,
      render,
      commands: () => [
        { label: 'AI: plan my day', icon: 'target', run: () => runTool('planDay') },
        { label: 'AI: show insights', icon: 'brain', run: () => { tab = 'insights'; NX.router.render(); } },
        { label: 'AI: daily briefing', icon: 'sparkle', run: () => { tab = 'digest'; NX.router.render(); } },
        { label: 'AI: weekly review', icon: 'calendar', run: () => NX.actions.weeklyReview() },
        { label: 'AI: extract tasks from text', icon: 'task', run: () => runTool('extract') },
        { label: 'AI: find orphaned notes', icon: 'link', run: () => runTool('orphans') },
        { label: 'AI: on this day', icon: 'history', run: () => runTool('onThisDay') }
      ]
    });
  })();

  /* =====================================================================
     SEARCH
     ===================================================================== */
  (function () {
    let query = NX.qs('q') || '';
    let kinds = new Set();
    let sortMode = 'relevance';

    const KIND_META = {
      note: { label: 'Notes', icon: 'note', color: '#7c6cff' },
      task: { label: 'Tasks', icon: 'task', color: '#4aa8e8' },
      wiki: { label: 'Wiki', icon: 'book', color: '#33b8a3' },
      event: { label: 'Events', icon: 'calendar', color: '#e86cb0' },
      message: { label: 'Messages', icon: 'chat', color: '#9b6cf0' },
      bookmark: { label: 'Bookmarks', icon: 'bookmark', color: '#f2994a' },
      contact: { label: 'Contacts', icon: 'contact', color: '#4caf7d' },
      journal: { label: 'Journal', icon: 'journal', color: '#eb5757' },
      goal: { label: 'Goals', icon: 'target', color: '#e3c14a' },
      habit: { label: 'Habits', icon: 'habit', color: '#f2994a' },
      reminder: { label: 'Reminders', icon: 'bell', color: '#8b8f98' },
      transaction: { label: 'Transactions', icon: 'money', color: '#4caf7d' },
      project: { label: 'Projects', icon: 'folder', color: '#7c6cff' }
    };

    function render(params) {
      const page = h('div.page');
      page.appendChild(NX.components.pageHead({
        icon: 'search', title: 'Search',
        sub: `${NX.sel.corpus().length} items indexed across ${Object.keys(KIND_META).length} content types · BM25-style relevance with recency weighting`,
        actions: [h('button.btn.sm.ghost', { onclick: showOperators }, 'Search operators')]
      }));

      const inp = h('input.input', {
        placeholder: 'Search notes, tasks, messages, wiki, contacts, transactions…',
        value: query, style: { fontSize: '16px', padding: '11px 14px' }
      });
      inp.addEventListener('input', NX.debounce(e => { query = e.target.value; history.replaceState(null, '', '#/search?q=' + encodeURIComponent(query)); draw(); }, 200));
      inp.addEventListener('keydown', e => { if (e.key === 'Escape') { inp.value = ''; query = ''; draw(); } });
      page.appendChild(inp);

      // type filters with counts
      const counts = new Map();
      if (query.trim()) {
        NX.aiEngine.search(query, { limit: 400 }).forEach(r => counts.set(r.doc.kind, (counts.get(r.doc.kind) || 0) + 1));
      } else {
        sel().corpus().forEach(c => counts.set(c.kind, (counts.get(c.kind) || 0) + 1));
      }
      const filterBar = h('div.sr-filters', { style: { marginTop: '14px' } });
      filterBar.appendChild(h('span.chip.clickable' + (!kinds.size ? '.on' : ''), { onclick: () => { kinds.clear(); draw(); } }, `Everything (${NX.sum(Array.from(counts.values()))})`));
      Object.entries(KIND_META).forEach(([k, meta]) => {
        const n = counts.get(k) || 0;
        if (!n) return;
        filterBar.appendChild(h('span.chip.clickable' + (kinds.has(k) ? '.on' : ''), {
          onclick: () => { kinds.has(k) ? kinds.delete(k) : kinds.add(k); draw(); }
        }, `${meta.label} (${n})`));
      });
      page.appendChild(filterBar);

      page.appendChild(h('div.row', { style: { marginBottom: '12px', gap: '9px' } }, [
        h('div.grow'),
        h('div.seg', ['relevance', 'newest', 'oldest', 'alpha'].map(s =>
          h('button' + (sortMode === s ? '.on' : ''), { onclick: () => { sortMode = s; draw(); } }, s[0].toUpperCase() + s.slice(1))))
      ]));

      const results = h('div', { id: 'srResults' });
      page.appendChild(results);
      setTimeout(() => inp.focus(), 40);
      draw();

      function draw() {
        NX.clear(results);
        const q = query.trim();
        if (!q) {
          // show recents
          results.appendChild(h('div.section-head', [h('h2', { style: { fontSize: '13px' } }, 'Recently edited')]));
          sel().recentNotes(10).forEach(n => results.appendChild(noteItem(n)));
          results.appendChild(h('div.section-head', { style: { marginTop: '18px' } }, [h('h2', { style: { fontSize: '13px' } }, 'Jump to a module')]));
          results.appendChild(h('div.grid.grid-auto-sm', NX.router.visible().map(m =>
            h('button.qa-btn', { onclick: () => NX.router.navigate('#/' + m.id) }, [h('span.qa-ico', { html: iconHTML(m.icon, 15) }), h('span', m.name)]))));
          return;
        }
        let hits = NX.aiEngine.search(q, { limit: 200, kinds: kinds.size ? Array.from(kinds) : null });
        if (sortMode === 'newest') hits.sort((a, b) => new Date(b.doc.updated || 0) - new Date(a.doc.updated || 0));
        else if (sortMode === 'oldest') hits.sort((a, b) => new Date(a.doc.updated || 0) - new Date(b.doc.updated || 0));
        else if (sortMode === 'alpha') hits.sort((a, b) => (a.doc.title || '').localeCompare(b.doc.title || ''));

        const t0 = performance.now();
        results.appendChild(h('div.small.muted', { style: { marginBottom: '10px' } },
          `${hits.length} result${hits.length === 1 ? '' : 's'} for “${q}”${kinds.size ? ` in ${Array.from(kinds).map(k => KIND_META[k].label).join(', ')}` : ''}`));
        if (!hits.length) {
          results.appendChild(NX.ui.emptyState('search', 'No matches', `Nothing in your workspace matches “${q}”. Try fewer words, or a different spelling.`, `Create “${q}” as a note`, () => NX.actions.quickCreate(q)));
          return;
        }
        // AI answer box
        results.appendChild(h('div.card', { style: { marginBottom: '14px', background: 'var(--sel)', borderColor: 'rgba(124,108,255,.3)' } }, [
          h('div.card-head', [h('span', { html: iconHTML('sparkle', 16), style: { display: 'flex', color: 'var(--acc-pur)' } }), h('h3', 'Short answer'), h('div.grow'),
            h('button.btn.xs.ghost', { id: 'aiAnswerBtn', onclick: async e => { e.target.textContent = 'Thinking…'; const r = NX.aiEngine.answer(q, { limit: 5 }); const box = document.getElementById('aiAnswerBox'); if (box) box.innerHTML = NX.ai.renderMarkdown(r.text); e.target.remove(); } }, 'Generate')]),
          h('div.md-preview', { id: 'aiAnswerBox', style: { fontSize: '13px' } }, (() => { const r = NX.aiEngine.answer(q, { limit: 4 }); return NX.ai.renderMarkdown(r.text.slice(0, 700) + (r.text.length > 700 ? '…' : '')); })())
        ]));

        hits.slice(0, 80).forEach(r => results.appendChild(resultItem(r, q)));
      }
      return page;
    }

    function resultItem(r, q) {
      const meta = KIND_META[r.doc.kind] || { label: r.doc.kind, icon: 'zap', color: '#8b8f98' };
      const item = h('div.sr-item', { onclick: () => NX.actions.openResult(r.doc) });
      NX.ui.bindMenu(item, () => [
        { icon: 'eye', label: 'Open', onClick: () => NX.actions.openResult(r.doc) },
        { icon: 'copy', label: 'Copy title', onClick: () => NX.copyText(r.doc.title) },
        { icon: 'link', label: 'Copy link', onClick: () => NX.copyText(location.origin + location.pathname + '#/search?q=' + encodeURIComponent(q)) }
      ]);
      item.appendChild(h('div.sr-ico', { style: { background: meta.color + '22', color: meta.color } },
        r.doc.extra && !/^[\w\s]*$/.test(r.doc.extra) ? h('span', { style: { fontSize: '15px' } }, r.doc.extra) : h('span', { html: iconHTML(meta.icon, 15) })));
      item.appendChild(h('div.grow', { style: { minWidth: '0' } }, [
        h('div.sr-title', { html: NX.aiEngine.highlight(r.doc.title || '(untitled)', q) }),
        r.snippet ? h('div.sr-snippet', { html: NX.aiEngine.highlight(r.snippet, q) }) : null,
        h('div.sr-meta', [
          h('span', { style: { color: meta.color, fontWeight: '600' } }, meta.label),
          r.doc.updated ? h('span', NX.relTime(r.doc.updated)) : null,
          h('span', 'score ' + r.score.toFixed(1)),
          ...(r.doc.tags || []).slice(0, 3).map(t => h('span', '#' + (sel().tagName(t) || t)))
        ])
      ]));
      return item;
    }

    function noteItem(n) {
      return h('div.sr-item', { onclick: () => NX.router.go('notes', { id: n.id }) }, [
        h('div.sr-ico', { style: { fontSize: '15px' } }, n.icon || '📄'),
        h('div.grow', { style: { minWidth: '0' } }, [
          h('div.sr-title', n.title || 'Untitled'),
          h('div.sr-snippet', sel().notePlain(n).replace(/\s+/g, ' ').slice(0, 150)),
          h('div.sr-meta', [h('span', 'Note'), h('span', NX.relTime(n.updated)), h('span', sel().noteWordCount(n) + ' words')])
        ])
      ]);
    }

    function showOperators() {
      NX.ui.modal({ title: 'Search tips', size: '', hideFooter: true,
        body: h('div', [
          h('p.small', { style: { lineHeight: '1.75', marginBottom: '12px' } }, 'Search covers every note, task, wiki page, calendar event, chat message, bookmark, contact, journal entry, goal, habit, reminder, transaction and project in your workspace.'),
          h('div.card.pad-sm', { style: { background: 'var(--bg-sunken)' } }, [
            NX.ui.kv('Multiple words', 'all must appear (AND)'),
            NX.ui.kv('"exact phrase"', 'matches the phrase as typed'),
            NX.ui.kv('Tab in ⌘K', 'cycles the content-type filter'),
            NX.ui.kv('Ranking', 'title matches > body matches > recency > favourites'),
            NX.ui.kv('Type filters', 'use the chips above the results'),
            NX.ui.kv('Shortcuts', 'Ctrl+Shift+F opens this page from anywhere')
          ])
        ]) });
    }

    NX.router.register({
      id: 'search', name: 'Search', icon: 'search', group: 'system', order: 72, hidden: false, rail: false,
      render,
      commands: () => [{ label: 'Search: focus the search box', icon: 'search', run: () => { const i = document.querySelector('#view input.input'); if (i) i.focus(); } }]
    });
  })();
})(window.NX);
