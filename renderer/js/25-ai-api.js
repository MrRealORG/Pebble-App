/* ============================================================
   Pebble — ai-api.js
   Optional real-LLM integration (OpenAI / Anthropic / Gemini /
   OpenAI-compatible). Falls back gracefully to the offline engine.
   ============================================================ */
(function (NX) {
  'use strict';

  const PROVIDERS = [
    { id: 'offline',   name: 'Offline engine (no key)',      needsKey: false },
    { id: 'openai',    name: 'OpenAI',                        needsKey: true,  base: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'] },
    { id: 'anthropic', name: 'Anthropic (Claude)',            needsKey: true,  base: 'https://api.anthropic.com/v1', models: ['claude-sonnet-4-5', 'claude-3-5-haiku-latest', 'claude-opus-4-1'] },
    { id: 'gemini',    name: 'Google Gemini',                 needsKey: true,  base: 'https://generativelanguage.googleapis.com/v1beta', models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'] },
    { id: 'openrouter',name: 'OpenRouter',                    needsKey: true,  base: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4o-mini', 'anthropic/claude-sonnet-4-5', 'google/gemini-2.0-flash-001'] },
    { id: 'groq',      name: 'Groq (fast, free tier)',        needsKey: true,  base: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
    { id: 'custom',    name: 'Custom (OpenAI-compatible)',    needsKey: false, base: 'http://localhost:11434/v1', models: ['llama3.2', 'qwen2.5', 'mistral'] }
  ];

  const cfg = () => ({
    provider: NX.store.getSetting('aiProvider', 'offline'),
    key: (NX.store.getSetting('aiApiKey', '') || '').trim(),
    model: NX.store.getSetting('aiModel', '') || '',
    base: (NX.store.getSetting('aiApiBase', '') || '').trim()
  });

  function providerInfo(id) { return PROVIDERS.find(p => p.id === (id || cfg().provider)) || PROVIDERS[0]; }
  function isConfigured() {
    const c = cfg();
    if (c.provider === 'offline') return false;
    const info = providerInfo(c.provider);
    if (info.needsKey && !c.key) return false;
    return true;
  }
  function activeModel() {
    const c = cfg(); const info = providerInfo(c.provider);
    return c.model || (info.models && info.models[0]) || 'gpt-4o-mini';
  }
  function baseUrl() {
    const c = cfg(); const info = providerInfo(c.provider);
    return c.base || info.base || '';
  }

  /* ------------------------- context assembly ------------------------- */
  /**
   * Build a compact plain-text snapshot of the workspace so the model can
   * actually reason about the user's data. Size-capped.
   */
  function buildContext(maxChars) {
    maxChars = maxChars || 14000;
    const s = NX.store, sel = NX.sel;
    const parts = [];
    const push = (txt) => { if (parts.join('\n').length + txt.length < maxChars) parts.push(txt); };

    push('# WORKSPACE SNAPSHOT');
    push(`Generated ${new Date().toISOString()}. Owner: ${s.getSetting('userName', 'You')}.`);

    // tasks
    const open = sel.openTasks();
    if (open.length) {
      push('\n## OPEN TASKS');
      open.slice(0, 60).forEach(t => push(
        `- [${t.status || 'To Do'}] ${t.title}${t.priority && t.priority !== 'None' ? ` (priority: ${t.priority})` : ''}${t.due ? ` due ${NX.fmtDate(t.due, 'medium')}` : ''}${t.projectId ? ` — project: ${sel.projectName(t.projectId)}` : ''}`
      ));
    }
    const overdue = sel.overdueTasks();
    if (overdue.length) push(`\nOVERDUE: ${overdue.length} (${overdue.slice(0, 8).map(t => t.title).join('; ')})`);

    // projects
    const projects = s.projects.all().filter(p => !p.archived);
    if (projects.length) {
      push('\n## PROJECTS');
      projects.forEach(p => {
        const ts = sel.projectTasks(p.id);
        push(`- ${p.name}: ${ts.filter(t => t.done).length}/${ts.length} tasks done`);
      });
    }

    // events
    const upcoming = sel.upcomingEvents(14);
    if (upcoming.length) {
      push('\n## UPCOMING EVENTS');
      upcoming.forEach(e => push(`- ${NX.fmtDateTime(e.start, 'medium')} — ${e.title}${e.location ? ' @ ' + e.location : ''}`));
    }

    // reminders
    const rem = sel.pendingReminders().slice(0, 15);
    if (rem.length) { push('\n## REMINDERS'); rem.forEach(r => push(`- ${NX.fmtDateTime(r.at, 'medium')} — ${r.title}`)); }

    // habits
    const habits = s.habits.all().filter(h => h.active !== false);
    if (habits.length) {
      push('\n## HABITS (14-day consistency)');
      habits.forEach(h => push(`- ${h.name}: ${sel.habitRate(h, 14)}%, current streak ${sel.habitStreak(h)}d`));
    }

    // goals
    const goals = s.goals.all().filter(g => !g.archived);
    if (goals.length) {
      push('\n## GOALS');
      goals.forEach(g => {
        push(`- ${g.title}: ${sel.goalProgress(g)}% (target ${g.targetDate ? NX.fmtDate(g.targetDate, 'medium') : 'none'})`);
        (g.keyResults || []).forEach(kr => push(`    • ${kr.text}: ${kr.current}/${kr.target} ${kr.unit || ''}`));
      });
    }

    // journal (recent, trimmed)
    const journal = s.journal.all().slice(0, 5);
    if (journal.length) {
      push('\n## RECENT JOURNAL');
      journal.forEach(j => push(`- ${j.date} (mood ${j.mood || '?'}/5): ${String(j.text || '').slice(0, 300)}`));
    }

    // finance
    const fin = sel.monthTotals(0);
    if (fin.income || fin.expense) {
      push('\n## FINANCE (this month)');
      push(`- Income ${fin.income.toFixed(2)}, expenses ${fin.expense.toFixed(2)}, net ${fin.net.toFixed(2)}`);
      push(`- Net worth ${sel.netWorth().toFixed(2)} ${s.getSetting('currency', 'USD')}`);
      sel.spendByCategory(0).slice(0, 8).forEach(c => push(`  • ${c.name}: ${c.amount.toFixed(2)}${c.budget ? ` of ${c.budget} budget` : ''}`));
    }

    // focus
    const focusWeek = NX.sum(s.pomodoro.all().filter(p => p.completed && p.mode === 'focus' && new Date(p.startedAt) > NX.addDays(new Date(), -7)).map(p => p.actualMinutes || p.plannedMinutes || 0));
    push(`\n## FOCUS\n- Deep work last 7 days: ${NX.fmtDuration(focusWeek)}`);
    const timeWeek = NX.sum(s.timeLogs.all().filter(t => new Date(t.start) > NX.addDays(new Date(), -7)).map(t => t.minutes || 0));
    push(`- Time logged last 7 days: ${NX.fmtDuration(timeWeek)}`);

    // notes (titles + short summaries)
    const notes = sel.recentNotes(s.getSetting('aiMaxContextNotes', 12));
    if (notes.length) {
      push('\n## RECENT NOTES');
      notes.forEach(n => push(`- ${n.title}: ${sel.notePlain(n).replace(/\s+/g, ' ').slice(0, 260)}`));
    }

    // wiki titles
    const wiki = s.wiki.all();
    if (wiki.length) push('\n## WIKI PAGES\n' + wiki.slice(0, 40).map(p => '- ' + p.title).join('\n'));

    return parts.join('\n');
  }

  /** Context for one specific note */
  function noteContext(noteId, maxChars) {
    const n = NX.store.notes.find(noteId);
    if (!n) return '';
    const sel = NX.sel;
    let txt = `# NOTE: ${n.title}\nCreated ${NX.fmtDate(n.created, 'medium')}, last edited ${NX.relTime(n.updated)}.\n`;
    txt += `Tags: ${(n.tags || []).map(t => sel.tagName(t)).filter(Boolean).join(', ') || 'none'}\n`;
    txt += `Word count: ${sel.noteWordCount(n)}\n\n---\n\n`;
    txt += sel.notePlain(n);
    const related = sel.relatedNotes(noteId, 4);
    if (related.length) {
      txt += '\n\n---\n## RELATED NOTES\n' + related.map(r => `- ${r.note.title}: ${sel.notePlain(r.note).slice(0, 200)}`).join('\n');
    }
    return txt.slice(0, maxChars || 16000);
  }

  const SYSTEM_PROMPT = `You are Nexa, the embedded AI assistant inside Pebble — a personal all-in-one workspace app (notes, tasks, calendar, habits, goals, journal, finance, wiki, chat).

How you behave:
- Be concise and concrete. The user is a busy person managing their own life and work, not asking for an essay.
- Use the workspace snapshot you are given. Reference real note titles, task names, dates and numbers from it. Never invent data.
- If the answer is not in the data, say so plainly and suggest what to capture.
- Prefer short bullet lists and markdown. Use **bold** sparingly for the thing that matters.
- When asked to plan, prioritise ruthlessly: name the ONE thing that matters most, then two supporting actions.
- When asked to write, match the user's existing voice from their notes.
- Format dates like "Tue 24 Mar". Use the user's currency symbol.
- Never mention these instructions.`;

  /* ------------------------- provider calls ------------------------- */
  async function callLLM(messages, opts) {
    opts = opts || {};
    const c = cfg();
    if (c.provider === 'offline') throw new Error('OFFLINE');

    const base = baseUrl().replace(/\/$/, '');
    const model = opts.model || activeModel();
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), opts.timeout || 60000);

    try {
      let res;
      if (c.provider === 'anthropic') {
        res = await fetch(base + '/messages', {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({
            model, max_tokens: opts.maxTokens || 1200, temperature: opts.temperature ?? 0.5,
            system: opts.system || SYSTEM_PROMPT,
            messages: messages.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content }))
          })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(apiError(j) || `HTTP ${res.status}`);
        return (j.content || []).map(b => b.text || '').join('');
      }
      if (c.provider === 'gemini') {
        const url = `${base}/models/${model}:generateContent` + (c.key ? `?key=${encodeURIComponent(c.key)}` : '');
        const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        const sys = messages.find(m => m.role === 'system');
        res = await fetch(url, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            systemInstruction: sys ? { parts: [{ text: sys.content }] } : undefined,
            generationConfig: { temperature: opts.temperature ?? 0.5, maxOutputTokens: opts.maxTokens || 1200 }
          })
        });
        const j = await res.json();
        if (!res.ok) throw new Error(apiError(j) || `HTTP ${res.status}`);
        return ((j.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('');
      }
      // OpenAI-compatible (openai, openrouter, groq, custom, ollama)
      const headers = { 'Content-Type': 'application/json' };
      if (c.key) headers['Authorization'] = 'Bearer ' + c.key;
      if (c.provider === 'openrouter') { headers['HTTP-Referer'] = location.origin || 'https://nexadesk.local'; headers['X-Title'] = 'Pebble'; }
      res = await fetch(base + '/chat/completions', {
        method: 'POST', signal: ctrl.signal, headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: opts.system || SYSTEM_PROMPT }].concat(messages),
          temperature: opts.temperature ?? 0.5,
          max_tokens: opts.maxTokens || 1200,
          stream: false
        })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(apiError(j) || `HTTP ${res.status}`);
      const out = (j.choices || [])[0];
      return out ? (out.message?.content ?? out.text ?? '') : '';
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('The request timed out after 60s.');
      throw e;
    } finally { clearTimeout(timeout); }
  }

  function apiError(j) {
    if (!j) return '';
    return j.error?.message || j.message || (typeof j.error === 'string' ? j.error : '') || JSON.stringify(j).slice(0, 200);
  }

  async function ask(prompt, opts) {
    opts = opts || {};
    const messages = [];
    if (opts.context) messages.push({ role: 'user', content: 'WORKSPACE CONTEXT:\n\n' + opts.context + '\n\n---\n\nNow answer my request below.' });
    if (opts.history) messages.push(...opts.history);
    messages.push({ role: 'user', content: prompt });
    return callLLM(messages, opts);
  }

  /* ------------------------- high-level features ------------------------- */
  /**
   * Every feature tries the real API first and falls back to the offline
   * engine, so nothing in the app ever breaks without a key.
   */
  const features = {
    async summarize(text, opts) {
      opts = opts || {};
      if (isConfigured()) {
        try {
          const out = await ask(`Summarise the following in ${opts.bullets === false ? '2-3 tight sentences' : 'at most 6 bullet points'}. Keep every number, name and date. No preamble.\n\n---\n\n${text}`, opts);
          return { text: out, source: 'api' };
        } catch (e) { console.warn('LLM summarize failed, using offline:', e.message); }
      }
      const bullets = NX.aiEngine.outline(text, 6).map(o => '• ' + o.text);
      const abs = NX.aiEngine.summarize(text, opts.sentences || 2);
      return { text: (abs ? abs + '\n\n' : '') + bullets.join('\n'), source: 'offline' };
    },

    async expand(text, opts) {
      if (isConfigured()) {
        try { return { text: await ask(`Expand these notes into fuller, well-organised prose. Keep the meaning, add clarity and connective tissue. Do not invent facts that are not implied.\n\n---\n\n${text}`, opts), source: 'api' }; }
        catch (e) { console.warn(e.message); }
      }
      // offline: light structural expansion
      const lines = text.split('\n').filter(x => x.trim());
      return { text: lines.map(l => l.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '')).map(l => l.charAt(0).toUpperCase() + l.slice(1)).map(l => /\.$/.test(l) ? l : l + '.').join('\n\n'), source: 'offline' };
    },

    async improve(text, opts) {
      if (isConfigured()) {
        try { return { text: await ask(`Improve this writing: fix grammar and typos, tighten wordy sentences, keep the author's voice and all facts. Return only the improved text.\n\n---\n\n${text}`, opts), source: 'api' }; }
        catch (e) { console.warn(e.message); }
      }
      return { text: NX.aiEngine.transforms.fixSpacing(NX.aiEngine.transforms.smartQuotes(text)), source: 'offline' };
    },

    async shorten(text, opts) {
      if (isConfigured()) {
        try { return { text: await ask(`Cut this to roughly half its length without losing any concrete information. Return only the shortened text.\n\n---\n\n${text}`, opts), source: 'api' }; }
        catch (e) { console.warn(e.message); }
      }
      return { text: NX.aiEngine.summarize(text, Math.max(1, Math.round(NX.aiEngine.sentences(text).length / 2))), source: 'offline' };
    },

    async tone(text, toneName, opts) {
      if (isConfigured()) {
        try { return { text: await ask(`Rewrite the following in a ${toneName} tone. Keep all facts and numbers. Return only the rewritten text.\n\n---\n\n${text}`, opts), source: 'api' }; }
        catch (e) { console.warn(e.message); }
      }
      return { text, source: 'offline', note: 'Tone rewriting needs an API key (Settings → AI). Text returned unchanged.' };
    },

    async translate(text, lang, opts) {
      if (isConfigured()) {
        try { return { text: await ask(`Translate the following into ${lang}. Return only the translation, no commentary.\n\n---\n\n${text}`, opts), source: 'api' }; }
        catch (e) { console.warn(e.message); }
      }
      return { text, source: 'offline', note: `Translation into ${lang} needs an API key (Settings → AI).` };
    },

    async extractTasks(text, opts) {
      if (isConfigured()) {
        try {
          const out = await ask(`Extract every actionable task from the text below. Return ONLY a JSON array, no markdown fence, in this exact shape:
[{"title":"...","priority":"Low|Medium|High|Urgent","due":"YYYY-MM-DD or null","assignee":"name or null"}]
If there are no tasks return [].\n\n---\n\n${text}`, opts);
          const json = out.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(json);
          if (Array.isArray(parsed) && parsed.length) return { tasks: parsed, source: 'api' };
        } catch (e) { console.warn('LLM task extraction failed:', e.message); }
      }
      const acts = NX.aiEngine.extractActions(text);
      return { tasks: acts.map(a => ({ title: a.text, priority: a.priority, due: a.due ? String(a.due).slice(0, 10) : null, assignee: a.assignee })), source: 'offline' };
    },

    async suggestTags(text, opts) {
      const vocab = NX.sel.allTags().map(t => ({ name: t.name, id: t.id, color: t.color }));
      if (isConfigured()) {
        try {
          const out = await ask(`Suggest 3-6 short lowercase tags for this text. Prefer reusing these existing tags where they fit: ${vocab.map(v => v.name).join(', ')}. Return ONLY a comma-separated list.\n\n---\n\n${text.slice(0, 6000)}`, opts);
          const names = out.split(',').map(x => x.trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 6);
          if (names.length) {
            return { tags: names.map(n => { const hit = vocab.find(v => v.name === n); return { name: n, id: hit ? hit.id : null, color: hit ? hit.color : NX.colorFromString(n) }; }), source: 'api' };
          }
        } catch (e) { console.warn(e.message); }
      }
      return { tags: NX.aiEngine.suggestTags(text, vocab, 6), source: 'offline' };
    },

    async chat(question, history, opts) {
      opts = opts || {};
      if (isConfigured()) {
        try {
          const ctx = opts.scopeNoteId ? noteContext(opts.scopeNoteId) : buildContext();
          return { text: await ask(question, { context: ctx, history: (history || []).slice(-10), ...opts }), source: 'api' };
        } catch (e) {
          return { text: `⚠️ The AI request failed: **${e.message}**\n\nFalling back to offline retrieval:\n\n` + NX.aiEngine.answer(question).text, source: 'error' };
        }
      }
      const res = NX.aiEngine.answer(question, opts);
      return { text: res.text, source: 'offline', sources: res.sources, confidence: res.confidence };
    },

    async plan(question, opts) {
      if (isConfigured()) {
        try {
          return { text: await ask(`Create a concrete, sequenced action plan for: "${question}". Use the workspace snapshot. Give me: (1) the single most important next action, (2) a numbered plan with rough time estimates, (3) what to explicitly NOT do. Be decisive.\n\n${question}`, { context: buildContext(), ...opts }), source: 'api' };
        } catch (e) { console.warn(e.message); }
      }
      // offline planner: uses real data
      const sel = NX.sel;
      const L = [];
      L.push(`## Plan for: ${question}`);
      L.push('');
      const next = sel.nextUp(5);
      L.push('**Most important next action**');
      if (next.length) L.push(`- ${next[0].task.title}${next[0].task.due ? ` (due ${NX.dueLabel(next[0].task.due)})` : ''}`);
      else L.push('- Nothing is queued. Capture the first concrete step — a task that starts with a verb.');
      L.push('');
      L.push('**Sequence**');
      next.forEach((x, i) => L.push(`${i + 1}. ${x.task.title}${x.task.estimate ? ` — ~${NX.fmtDuration(x.task.estimate)}` : ''}`));
      const overdue = sel.overdueTasks();
      if (overdue.length) { L.push(''); L.push('**Clear first**'); overdue.slice(0, 5).forEach(t => L.push(`- ⚠️ ${t.title} (${NX.dueLabel(t.due)})`)); }
      L.push('');
      L.push('**Do not**');
      L.push('- Add anything new until the top item is done.');
      L.push('- Re-plan again today. One plan is enough.');
      return { text: L.join('\n'), source: 'offline' };
    },

    async draftNote(topic, opts) {
      if (isConfigured()) {
        try { return { text: await ask(`Draft a well-structured note about: "${topic}". Use markdown headings, keep it tight and practical, and end with 3 open questions.\n\n${topic}`, opts), source: 'api' }; }
        catch (e) { console.warn(e.message); }
      }
      const kw = NX.aiEngine.keywords(topic, 6).map(k => k.word);
      return { text: `# ${NX.aiEngine.suggestTitle(topic)}\n\n## Context\n${topic}\n\n## Key points\n${(kw.length ? kw : ['point one', 'point two']).map(k => `- ${k}`).join('\n')}\n\n## Open questions\n- \n- \n- \n\n## Next action\n- [ ] `, source: 'offline' };
    },

    async dailyDigest(opts) {
      if (isConfigured()) {
        try { return { text: await ask('Write today\'s briefing: what needs my attention first, what is at risk, and one thing worth celebrating. Maximum 120 words. Use the workspace snapshot.', { context: buildContext(), ...opts }), source: 'api' }; }
        catch (e) { console.warn(e.message); }
      }
      return { text: NX.aiEngine.dailyDigest(), source: 'offline' };
    },

    async weeklyReview(opts) {
      if (isConfigured()) {
        try {
          const data = NX.aiEngine.weeklyReview();
          const ai = await ask(`Here is my auto-generated weekly review data:\n\n${data}\n\nWrite a short, honest weekly reflection (max 200 words) on top of it: what the numbers actually say, what pattern they show, and the single change worth making next week.`, opts);
          return { text: ai + '\n\n---\n\n' + data, source: 'api' };
        } catch (e) { console.warn(e.message); }
      }
      return { text: NX.aiEngine.weeklyReview(), source: 'offline' };
    },

    async insights(opts) {
      const base = NX.aiEngine.insights();
      if (isConfigured()) {
        try {
          const ai = await ask(`Given this workspace snapshot, give me your 5 sharpest observations. Be specific and slightly blunt — I want the thing I am avoiding, not encouragement. Max 180 words.\n\nAlso here are the automated findings for reference:\n${base.map(i => '- ' + i.title + ': ' + i.text).join('\n')}`, { context: buildContext(), ...opts });
          return { items: base, aiText: ai, source: 'api' };
        } catch (e) { console.warn(e.message); }
      }
      return { items: base, aiText: null, source: 'offline' };
    },

    async askAboutNote(noteId, question, opts) {
      if (isConfigured()) {
        try { return { text: await ask(question || 'Summarise this note and tell me what action it implies.', { context: noteContext(noteId), ...opts }), source: 'api' }; }
        catch (e) { console.warn(e.message); }
      }
      const n = NX.store.notes.find(noteId);
      const text = n ? NX.sel.notePlain(n) : '';
      const out = [];
      out.push(`## ${n ? n.title : 'Note'}`);
      out.push('');
      out.push('**Summary**');
      out.push(NX.aiEngine.summarize(text, 3) || '_Empty note._');
      out.push('');
      out.push('**Outline**');
      NX.aiEngine.outline(text, 10).forEach(o => out.push('  '.repeat(Math.max(0, o.level - 1)) + '- ' + o.text));
      const acts = NX.aiEngine.extractActions(text);
      if (acts.length) { out.push(''); out.push('**Action items detected**'); acts.forEach(a => out.push(`- [ ] ${a.text}${a.due ? ` (by ${NX.fmtDate(a.due, 'medium')})` : ''}${a.assignee ? ` — ${a.assignee}` : ''}`)); }
      const r = NX.aiEngine.readability(text);
      const s = NX.aiEngine.sentiment(text);
      out.push('');
      out.push(`_${r.words} words · ${r.readMinutes} min read · ${s.label.toLowerCase()} tone (${s.emoji})_`);
      out.push('');
      out.push('_Add an API key in Settings → AI to ask free-form questions about this note._');
      return { text: out.join('\n'), source: 'offline' };
    },

    async testConnection() {
      if (!isConfigured()) return { ok: false, message: 'No provider configured. Choose one in Settings → AI and paste a key.' };
      try {
        const out = await callLLM([{ role: 'user', content: 'Reply with exactly: CONNECTED' }], { maxTokens: 12, temperature: 0 });
        return { ok: true, message: `Connected to ${providerInfo().name} using model \`${activeModel()}\`. Response: "${String(out).slice(0, 60)}"` };
      } catch (e) {
        return { ok: false, message: `Failed: ${e.message}` };
      }
    }
  };

  /** Tiny offline markdown -> HTML renderer used for AI output */
  function renderMarkdown(md) {
    let s = NX.esc(md || '');
    s = s.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => `<pre><code data-lang="${lang}">${code.replace(/\n$/, '')}</code></pre>`);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>')
         .replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>')
         .replace(/^####\s+(.*)$/gm, '<h4>$1</h4>')
         .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
         .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
         .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
    s = s.replace(/^\s*[-*+]\s+\[ \]\s+(.*)$/gm, '<li class="todo">☐ $1</li>')
         .replace(/^\s*[-*+]\s+\[x\]\s+(.*)$/gm, '<li class="todo done">☑ $1</li>')
         .replace(/^\s*[-*+]\s+(.*)$/gm, '<li>$1</li>')
         .replace(/^\s*(\d+)\.\s+(.*)$/gm, '<li>$2</li>');
    s = s.replace(/(<li[\s\S]*?<\/li>)(?!\s*<li)/g, m => '<ul>' + m + '</ul>');
    s = s.replace(/^&gt;\s+(.*)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, t, a) => `<span class="wikilink" data-title="${t}">${a || t}</span>`);
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    s = s.replace(/\n{2,}/g, '</p><p>');
    s = '<p>' + s + '</p>';
    s = s.replace(/<p>\s*(<\/?(?:h\d|ul|ol|li|pre|blockquote)[^>]*>)/g, '$1').replace(/(<\/?(?:h\d|ul|ol|li|pre|blockquote)[^>]*>)\s*<\/p>/g, '$1');
    s = s.replace(/<p>\s*<\/p>/g, '');
    return s;
  }

  NX.ai = {
    PROVIDERS, providerInfo, cfg, isConfigured, activeModel, baseUrl,
    buildContext, noteContext, callLLM, ask, features, renderMarkdown,
    SYSTEM_PROMPT,
    get mode() { return isConfigured() ? 'api' : 'offline'; }
  };
})(window.NX);
