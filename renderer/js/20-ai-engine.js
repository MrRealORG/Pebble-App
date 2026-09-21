/* ============================================================
   Pebble — ai-engine.js
   Fully offline language engine: analysis, summarisation, tagging,
   scheduling, ranking, insights. No network, no key required.
   ============================================================ */
(function (NX) {
  'use strict';

  /* --------------------------- STOPWORDS --------------------------- */
  const STOP = new Set(('a about above after again against all am an and any are aren as at be because been before being below between both but by can cannot could couldn did do does doesn doing don down during each few for from further had hasn has have haven having he her here hers herself him himself his how i if in into is isn it its itself let me more most mustn my myself no nor not of off on once only or other ought our ours ourselves out over own same shan she should shouldn so some such than that the their theirs them themselves then there these they this those through to too under until up very was wasn we were weren what when where which while who whom why with won would wouldn you your yours yourself yourselves also use using used make made get got thing things really actually just like will shall may might must one two three first second new old good bad big small'.split(/\s+/)));

  const tokenize = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !STOP.has(t));
  const sentences = (text) => String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map(s => s.trim()).filter(s => s.length > 3);

  function freq(text, limit) {
    const map = new Map();
    tokenize(text).forEach(t => map.set(t, (map.get(t) || 0) + 1));
    const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    return limit ? arr.slice(0, limit) : arr;
  }

  /** Keyword extraction with light TF boost for capitalised/rare terms */
  function keywords(text, n) {
    const raw = freq(text);
    if (!raw.length) return [];
    const max = raw[0][1];
    const lower = String(text || '').toLowerCase();
    const scored = raw.map(([w, c]) => {
      let s = c / max;
      if (w.length > 6) s *= 1.14;
      if (w.length < 4) s *= 0.88;
      // appears capitalised mid-sentence → likely a proper noun / concept
      const capRe = new RegExp('(^|[^.!?]\\s)' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/^./, m => m.toUpperCase()), 'g');
      if (capRe.test(String(text || ''))) s *= 1.25;
      return { word: w, count: c, score: s };
    });
    return scored.sort((a, b) => b.score - a.score).slice(0, n || 10);
  }

  /** Suggest tags from an existing tag vocabulary, else from keywords */
  function suggestTags(text, vocabulary, n) {
    n = n || 5;
    const words = new Set(tokenize(text));
    const vocab = (vocabulary || []).map(v => typeof v === 'string' ? { name: v } : v);
    const hits = [];
    vocab.forEach(v => {
      const parts = String(v.name).toLowerCase().split(/[\s_-]+/);
      const matched = parts.filter(p => words.has(p)).length;
      if (matched) hits.push({ name: v.name, score: matched / parts.length + (matched > 1 ? 0.2 : 0), id: v.id, color: v.color });
    });
    hits.sort((a, b) => b.score - a.score);
    const out = hits.slice(0, n);
    if (out.length < n) {
      const existing = new Set(out.map(o => o.name));
      keywords(text, n * 3).forEach(k => {
        if (out.length >= n) return;
        if (!existing.has(k.word)) { out.push({ name: k.word, score: k.score * 0.5, id: null, color: NX.colorFromString(k.word) }); existing.add(k.word); }
      });
    }
    return out;
  }

  /* --------------------------- READABILITY --------------------------- */
  function syllables(word) {
    word = word.toLowerCase().replace(/[^a-z]/g, '');
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = word.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }

  function readability(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const sents = sentences(text);
    if (!words.length) return { words: 0, sentences: 0, avgSentence: 0, avgSyllables: 0, flesch: 0, grade: 0, level: 'empty', readMinutes: 0, longSentences: 0 };
    const syl = words.reduce((a, w) => a + syllables(w), 0);
    const asl = words.length / Math.max(1, sents.length);
    const asw = syl / words.length;
    const flesch = 206.835 - 1.015 * asl - 84.6 * asw;
    const grade = 0.39 * asl + 11.8 * asw - 15.59;
    const longSentences = sents.filter(s => s.split(/\s+/).length > 25).length;
    let level;
    if (flesch >= 90) level = 'Very easy';
    else if (flesch >= 80) level = 'Easy';
    else if (flesch >= 70) level = 'Fairly easy';
    else if (flesch >= 60) level = 'Standard';
    else if (flesch >= 50) level = 'Fairly difficult';
    else if (flesch >= 30) level = 'Difficult';
    else level = 'Very difficult';
    return {
      words: words.length, sentences: sents.length, characters: text.length,
      avgSentence: Math.round(asl * 10) / 10, avgSyllables: Math.round(asw * 100) / 100,
      flesch: Math.round(flesch), grade: Math.round(grade * 10) / 10, level,
      readMinutes: Math.max(1, Math.round(words.length / 220)), longSentences,
      uniqueWords: new Set(words.map(w => w.toLowerCase())).size,
      paragraphs: String(text).split(/\n\s*\n/).filter(p => p.trim()).length
    };
  }

  /* --------------------------- SENTIMENT --------------------------- */
  const POS = ('good great excellent amazing awesome love wonderful fantastic happy best better nice perfect brilliant superb enjoy enjoyed enjoying fun beautiful clever helpful easy easier fast quick win won success successful achieve achieved proud grateful thankful calm relaxed confident motivated productive smooth pleased grateful relieved impressed valuable useful important progress improve improved boost benefit'.split(' '));
  const NEG = ('bad terrible awful horrible hate hated worst worse ugly sad angry annoyed frustrated frustrating difficult hard fail failed failing broken bug buggy slow stuck blocked late missed overdue wrong error problem issue risk risky worry worried anxious stressed overwhelmed drained exhausted confused lost behind disappointing disappointment costly expensive painful'.split(' '));
  const NEGATORS = new Set(['not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nor', "don't", "doesn't", "didn't", "isn't", "aren't", "won't", "can't", 'cannot', "shouldn't", "wouldn't"]);

  function sentiment(text) {
    const toks = tokenize(text).concat(String(text || '').toLowerCase().match(/\b\w+'\w+\b/g) || []);
    let pos = 0, neg = 0;
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i];
      const negated = i > 0 && NEGATORS.has(toks[i - 1]);
      if (POS.includes(w)) negated ? neg++ : pos++;
      else if (NEG.includes(w)) negated ? pos++ : neg++;
    }
    const total = pos + neg;
    const score = total ? (pos - neg) / total : 0;      // -1 .. 1
    let label = 'Neutral';
    if (score > 0.35) label = 'Positive';
    else if (score > 0.12) label = 'Slightly positive';
    else if (score < -0.35) label = 'Negative';
    else if (score < -0.12) label = 'Slightly negative';
    return { score: Math.round(score * 100) / 100, label, positive: pos, negative: neg, total, emoji: score > 0.2 ? '🙂' : score < -0.2 ? '😟' : '😐' };
  }

  /* --------------------------- SUMMARISATION --------------------------- */
  /** Extractive summariser — ranks sentences by term frequency + position */
  function summarize(text, maxSentences) {
    maxSentences = maxSentences || 3;
    const sents = sentences(text);
    if (!sents.length) return '';
    if (sents.length <= maxSentences) return sents.join(' ');
    const f = new Map(freq(text));
    const maxF = Math.max(1, ...f.values());
    const scored = sents.map((s, i) => {
      const toks = tokenize(s);
      if (!toks.length) return { s, i, score: -1 };
      let sc = toks.reduce((a, t) => a + (f.get(t) || 0) / maxF, 0) / Math.sqrt(toks.length);
      if (i === 0) sc *= 1.45;                       // lead bias
      if (i === sents.length - 1) sc *= 1.12;        // conclusion bias
      if (/\b(but|however|therefore|so|thus|important|key|must|should|decision|conclusion|risk)\b/i.test(s)) sc *= 1.18;
      if (s.length < 25) sc *= 0.8;
      return { s, i, score: sc };
    });
    const top = scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.i - b.i);
    return top.map(x => x.s).join(' ');
  }

  /** Turn a note into structured bullet points */
  function outline(text, maxItems) {
    maxItems = maxItems || 8;
    const out = [];
    String(text || '').split(/\n+/).forEach(line => {
      const t = line.trim();
      if (!t) return;
      const m = t.match(/^(#{1,6})\s+(.*)$/);
      if (m) { out.push({ level: m[1].length, text: m[2].replace(/[*_`]/g, '') }); return; }
      const b = t.match(/^[-*•+]\s+(.*)$/);
      if (b && b[1].length > 12) out.push({ level: 2, text: b[1].slice(0, 160) });
    });
    if (out.length < 3) {
      sentences(text).slice(0, maxItems).forEach(s => out.push({ level: 2, text: s.slice(0, 180) }));
    }
    return out.slice(0, maxItems);
  }

  /* --------------------------- DATE PARSING --------------------------- */
  const MONTH_MAP = { jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11 };
  const DAY_MAP = { sun:0,sunday:0,mon:1,monday:1,tue:2,tuesday:2,wed:3,wednesday:3,thu:4,thursday:4,thur:4,thursday:4,fri:5,friday:5,sat:6,saturday:6 };

  /**
   * Pull a date/time out of free text.
   * Understands: today, tomorrow, tonight, yesterday, next monday, in 3 days,
   * 5pm, at 14:30, on 12 March, 2026-04-01, "in 2 hours", "friday at 9am"
   * Returns { date, matched, cleaned } where cleaned is the text with the phrase removed.
   */
  function parseWhen(text) {
    let s = String(text || '');
    const lower = ' ' + s.toLowerCase() + ' ';
    const now = new Date();
    let d = null, matched = null;

    const set = (base, mm) => { d = new Date(base.getTime()); if (mm) { d.setHours(mm.h, mm.m, 0, 0); } matched = mm && mm.text || matched; };

    // absolute ISO
    let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?\b/);
    if (m) { d = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0); matched = m[0]; return finish(s, d, matched); }

    m = s.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
    if (m && (+m[1] <= 31 && +m[2] <= 12 || +m[2] <= 31 && +m[1] <= 12)) {
      const year = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
      const dd = +m[1] <= 31 && +m[2] <= 12 ? [+m[2] - 1, +m[1]] : [+m[1] - 1, +m[2]];
      d = new Date(year, dd[0], dd[1], 9, 0); matched = m[0];
      const t = parseTimeOnly(s); if (t) { d.setHours(t.h, t.m); matched += ' ' + t.text; }
      return finish(s, d, matched);
    }

    // "on 12 March" / "12 March 2026"
    m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\b(?:\s+(\d{4}))?/i);
    if (m && MONTH_MAP[m[2].toLowerCase().slice(0, 3)] !== undefined) {
      const year = m[3] ? +m[3] : now.getFullYear();
      d = new Date(year, MONTH_MAP[m[2].toLowerCase().slice(0, 3)], +m[1], 9, 0);
      matched = m[0];
      if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !m[3]) d.setFullYear(year + 1);
      const t = parseTimeOnly(s); if (t) { d.setHours(t.h, t.m); matched += ' ' + t.text; }
      return finish(s, d, matched);
    }

    const time = parseTimeOnly(s);
    if (time) matched = time.text;

    // relative words
    if (/\b(today|tonight)\b/.test(lower)) {
      d = new Date(now); d.setHours(time ? time.h : (lower.includes('tonight') ? 20 : 17), time ? time.m : 0, 0, 0);
      matched = ((lower.match(/\b(today|tonight)\b/) || [])[0] || '') + (time ? ' ' + time.text : '');
      return finish(s, d, matched);
    }
    if (/\btomorrow\b/.test(lower)) {
      d = NX.addDays(now, 1); d.setHours(time ? time.h : 9, time ? time.m : 0, 0, 0);
      matched = 'tomorrow' + (time ? ' ' + time.text : '');
      return finish(s, d, matched);
    }
    if (/\byesterday\b/.test(lower)) {
      d = NX.addDays(now, -1); d.setHours(time ? time.h : 9, time ? time.m : 0, 0, 0);
      matched = 'yesterday' + (time ? ' ' + time.text : '');
      return finish(s, d, matched);
    }
    m = lower.match(/\bin (\d+)\s*(minute|min|mins|hour|hr|hrs|hours|day|days|week|weeks|wks|month|months|year|years)\b/);
    if (m) {
      const n = +m[1], unit = m[2];
      d = new Date(now);
      if (/min/.test(unit)) d.setMinutes(d.getMinutes() + n);
      else if (/h(r|our)/.test(unit)) d.setHours(d.getHours() + n);
      else if (/day/.test(unit)) d.setDate(d.getDate() + n);
      else if (/w(eek|k)/.test(unit)) d.setDate(d.getDate() + n * 7);
      else if (/month/.test(unit)) d = NX.addMonths(d, n);
      else d = NX.addMonths(d, n * 12);
      matched = m[0].trim();
      return finish(s, d, matched);
    }
    m = lower.match(/\b(\d+)\s*(minute|min|mins|hour|hr|hrs|hours|day|days|week|weeks|month|months|year|years)\s*(from now|later|out)\b/);
    if (m) {
      const n = +m[1], unit = m[2]; d = new Date(now);
      if (/min/.test(unit)) d.setMinutes(d.getMinutes() + n);
      else if (/h/.test(unit)) d.setHours(d.getHours() + n);
      else if (/day/.test(unit)) d.setDate(d.getDate() + n);
      else if (/w/.test(unit)) d.setDate(d.getDate() + n * 7);
      else if (/month/.test(unit)) d = NX.addMonths(d, n);
      else d = NX.addMonths(d, n * 12);
      matched = m[0].trim();
      return finish(s, d, matched);
    }
    // next <weekday>
    m = lower.match(/\b(?:next |this |on |)\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|thur|fri|sat)\b/);
    if (m) {
      const target = DAY_MAP[m[1].slice(0, 4).toLowerCase()] !== undefined ? DAY_MAP[m[1].slice(0, 4).toLowerCase()] : DAY_MAP[m[1]];
      if (target !== undefined) {
        d = new Date(now);
        let add = (target - d.getDay() + 7) % 7;
        if (add === 0 && /\bnext\b/.test(lower)) add = 7;
        if (add === 0 && !time) add = 7;
        d.setDate(d.getDate() + add);
        d.setHours(time ? time.h : 9, time ? time.m : 0, 0, 0);
        matched = m[0].trim() + (time ? ' ' + time.text : '');
        return finish(s, d, matched);
      }
    }
    // bare time today/tomorrow
    if (time) {
      d = new Date(now); d.setHours(time.h, time.m, 0, 0);
      if (d < now) d.setDate(d.getDate() + 1);
      matched = time.text;
      return finish(s, d, matched);
    }
    return { date: null, matched: null, cleaned: s.trim(), repeat: null };

    function finish(src, date, phrase) {
      let cleaned = src;
      if (phrase) {
        cleaned = src.replace(new RegExp('\\b(?:at |on |by |due |from |)?' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
                     .replace(/\s+/g, ' ').trim();
      }
      let repeat = null;
      const low = src.toLowerCase();
      if (/\b(daily|every day|everyday)\b/.test(low)) repeat = 'daily';
      else if (/\b(weekly|every week)\b/.test(low)) repeat = 'weekly';
      else if (/\b(every weekday|weekdays)\b/.test(low)) repeat = 'weekdays';
      else if (/\b(monthly|every month)\b/.test(low)) repeat = 'monthly';
      else if (/\b(every year|yearly|annually)\b/.test(low)) repeat = 'yearly';
      else if (/\bevery (\d+) (day|days)\b/.test(low)) repeat = 'daily';
      if (repeat) cleaned = cleaned.replace(/\b(every\s+\w+(\s+\w+)?|daily|weekly|weekdays|monthly|yearly|annually|everyday)\b/gi, ' ').replace(/\s+/g, ' ').trim();
      return { date, matched: phrase, cleaned: cleaned || src.trim(), repeat };
    }
  }

  function parseTimeOnly(s) {
    const low = String(s || '').toLowerCase();
    let m = low.match(/\b(at |from |by |@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b/);
    if (!m) return null;
    let hh = +m[2];
    const mm = m[3] ? +m[3] : 0;
    const mer = m[4] ? m[4][0] : null;
    if (!mer && !m[3] && (hh < 6 || hh > 23)) return null;      // avoid matching random numbers
    if (!mer && hh > 23) return null;
    if (mer === 'p' && hh < 12) hh += 12;
    if (mer === 'a' && hh === 12) hh = 0;
    if (hh > 23 || mm > 59) return null;
    return { h: hh, m: mm, text: m[0].replace(/^\s*(at|from|by)\s*/i, '').trim() };
  }

  /** Natural-language quick capture: "call mum tomorrow 6pm #personal !high" */
  function parseQuickCapture(raw) {
    let text = String(raw || '').trim();
    const out = { title: text, due: null, repeat: null, priority: 'Medium', tags: [], projectId: null, description: '' };
    // !priority
    const p = text.match(/!(urgent|high|med|medium|low|none)\b/i);
    if (p) {
      const v = p[1].toLowerCase();
      out.priority = v === 'med' ? 'Medium' : v === 'none' ? 'None' : v[0].toUpperCase() + v.slice(1);
      text = text.replace(p[0], ' ');
    }
    // #tag
    text = text.replace(/#([\w-]+)/g, (m0, t) => { out.tags.push(t.toLowerCase()); return ' '; });
    // @project
    text = text.replace(/@([\w-]+)/g, (m0, t) => { out.projectHint = t.toLowerCase(); return ' '; });
    // dates
    const when = parseWhen(text);
    if (when.date) { out.due = when.date.toISOString(); out.repeat = when.repeat; text = when.cleaned; }
    out.title = text.replace(/\s+/g, ' ').trim();
    return out;
  }

  /* --------------------------- SEARCH RANKING --------------------------- */
  /** BM25-ish scoring over the corpus */
  function search(query, opts) {
    opts = opts || {};
    const q = String(query || '').trim();
    if (!q) return [];
    const kinds = opts.kinds ? new Set(opts.kinds) : null;
    const limit = opts.limit || 60;
    const corpus = NX.sel.corpus().filter(c => !kinds || kinds.has(c.kind));
    const qTokens = tokenize(q);
    const qLower = q.toLowerCase();
    const isPhrase = /\s/.test(q) || qLower.startsWith('"');
    const phrase = qLower.replace(/^"|"$/g, '');

    // document frequency for idf
    const df = new Map();
    corpus.forEach(doc => {
      const set = new Set(tokenize((doc.title || '') + ' ' + (doc.text || '')));
      set.forEach(t => df.set(t, (df.get(t) || 0) + 1));
    });
    const N = Math.max(1, corpus.length);
    const idf = t => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

    const KIND_WEIGHT = { note: 1.0, task: 1.0, wiki: 1.0, event: .9, bookmark: .85, journal: .8, contact: .8, goal: .8, message: .7, habit: .7, reminder: .7, transaction: .55, project: .8 };

    const results = [];
    corpus.forEach(doc => {
      const title = doc.title || '', text = doc.text || '';
      const titleL = title.toLowerCase(), textL = text.toLowerCase();
      let score = 0;

      if (isPhrase && phrase.length > 2) {
        if (titleL.includes(phrase)) score += 26;
        if (textL.includes(phrase)) score += 12;
      }
      qTokens.forEach(t => {
        const w = idf(t);
        const inTitle = titleL.includes(t);
        const startsTitle = titleL.startsWith(t);
        const count = (textL.match(new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (inTitle) score += 14 * w * (startsTitle ? 1.5 : 1);
        if (count) score += Math.min(9, 2.2 * Math.log(1 + count)) * w;
      });
      if (!qTokens.length && titleL.includes(qLower)) score += 10;
      if (score <= 0) return;

      score *= KIND_WEIGHT[doc.kind] || .7;
      // recency boost
      const ageDays = doc.updated ? (Date.now() - new Date(doc.updated).getTime()) / 86400000 : 400;
      score *= 1 + 1 / (1 + Math.max(0, ageDays) / 14);
      // favourite boost
      if (doc.kind === 'note') {
        const n = NX.store.notes.find(doc.id);
        if (n && n.favorite) score *= 1.2;
      }
      results.push({ doc, score, snippet: snippetFor(text, qTokens, phrase) });
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  function snippetFor(text, tokens, phrase) {
    text = String(text || '').replace(/\s+/g, ' ');
    if (!text) return '';
    const low = text.toLowerCase();
    let idx = -1;
    if (phrase) idx = low.indexOf(phrase);
    if (idx < 0) for (const t of tokens || []) { const i = low.indexOf(t); if (i >= 0) { idx = i; break; } }
    if (idx < 0) return text.slice(0, 180);
    const start = Math.max(0, idx - 70);
    const end = Math.min(text.length, idx + 130);
    return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
  }

  function highlight(text, query) {
    const t = NX.esc(text);
    const tokens = tokenize(query).concat([query.trim()]).filter(x => x && x.length > 1);
    if (!tokens.length) return t;
    const re = new RegExp('(' + tokens.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
    return t.replace(re, '<mark>$1</mark>');
  }

  /* --------------------------- TASK INTELLIGENCE --------------------------- */
  const PRIORITY_WEIGHT = { Urgent: 100, High: 62, Medium: 34, Low: 12, None: 4 };

  function scoreTask(t) {
    let s = 0;
    s += PRIORITY_WEIGHT[t.priority] || 0;
    if (t.due) {
      const days = NX.diffDays(t.due, new Date());
      if (days < 0) s += 90 + Math.min(60, Math.abs(days) * 6);
      else if (days === 0) s += 78;
      else if (days === 1) s += 56;
      else if (days <= 3) s += 40;
      else if (days <= 7) s += 24;
      else if (days <= 30) s += 10;
    }
    if (t.status === 'In Progress') s += 30;
    else if (t.status === 'Blocked') s += 12;
    else if (t.status === 'Backlog') s -= 10;
    const cl = t.checklist || [];
    if (cl.length) {
      const done = cl.filter(c => c.done).length;
      if (done / cl.length > 0.6) s += 22;            // nearly finished → finish it
    }
    if (t.estimate && t.estimate <= 20) s += 14;        // quick win
    if (t.done) s -= 1000;
    return Math.round(s);
  }

  /** Ranked "do this next" list */
  function nextUp(n) {
    return NX.sel.openTasks()
      .map(t => ({ task: t, score: scoreTask(t) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n || 7);
  }

  function taskSummary(tasks) {
    tasks = tasks || NX.store.tasks.all();
    const open = tasks.filter(t => !t.done && !t.archived);
    const done = tasks.filter(t => t.done);
    const overdue = open.filter(t => t.due && new Date(t.due) < NX.startOfDay(new Date()));
    const today = open.filter(t => t.due && NX.isToday(t.due));
    const thisWeek = open.filter(t => t.due && NX.diffDays(t.due, new Date()) >= 0 && NX.diffDays(t.due, new Date()) <= 7);
    const byPriority = {};
    ['Urgent', 'High', 'Medium', 'Low', 'None'].forEach(p => byPriority[p] = open.filter(t => (t.priority || 'None') === p).length);
    const byStatus = {};
    ['Backlog', 'To Do', 'In Progress', 'Blocked', 'Review', 'Done'].forEach(s => byStatus[s] = tasks.filter(t => t.status === s).length);
    return {
      total: tasks.length, open: open.length, done: done.length,
      completionRate: tasks.length ? Math.round(done.length / tasks.length * 100) : 0,
      overdue: overdue.length, today: today.length, thisWeek: thisWeek.length,
      byPriority, byStatus,
      estimatedMinutes: NX.sum(open.map(t => t.estimate || 0)),
      loggedMinutes: NX.sum(done.map(t => t.actual || 0))
    };
  }

  /* --------------------------- SPACED REPETITION (SM-2) --------------------------- */
  /**
   * card: { id, ease=2.5, interval=0, reps=0, due=ISO }
   * quality 0..5
   */
  function sm2(card, quality) {
    quality = NX.clamp(Math.round(quality), 0, 5);
    let { ease = 2.5, interval = 0, reps = 0 } = card || {};
    if (quality < 3) { reps = 0; interval = 1; }
    else {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 6;
      else interval = Math.round(interval * ease);
      reps++;
    }
    ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    const due = NX.addDays(new Date(), interval).toISOString();
    return { ease: Math.round(ease * 100) / 100, interval, reps, due, quality };
  }

  /* --------------------------- RELATIONSHIPS --------------------------- */
  /** Find notes similar to a given note (tag overlap + term overlap) */
  function relatedNotes(noteId, n) {
    const note = NX.store.notes.find(noteId);
    if (!note) return [];
    const text = NX.sel.notePlain(note);
    const kw = new Set(keywords(text, 24).map(k => k.word));
    const tags = new Set(note.tags || []);
    return NX.store.notes.all()
      .filter(o => o.id !== noteId && !o.archived)
      .map(o => {
        const otherText = NX.sel.notePlain(o);
        const otherKw = new Set(keywords(otherText, 24).map(k => k.word));
        let shared = 0; kw.forEach(w => { if (otherKw.has(w)) shared++; });
        const sharedTags = (o.tags || []).filter(t => tags.has(t)).length;
        const score = shared / Math.max(1, Math.sqrt(kw.size * otherKw.size || 1)) * 10 + sharedTags * 4 + (o.favorite ? 1.5 : 0);
        return { note: o, score: Math.round(score * 100) / 100, sharedTerms: shared, sharedTags };
      })
      .filter(x => x.score > 1.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, n || 6);
  }

  /* --------------------------- INSIGHTS --------------------------- */
  /** Cross-module narrative analysis of the whole workspace */
  function insights() {
    const out = [];
    const s = NX.store, sel = NX.sel;

    // tasks
    const ts = taskSummary();
    if (ts.overdue) out.push({ kind: 'warn', icon: 'warn', title: `${ts.overdue} task${ts.overdue > 1 ? 's are' : ' is'} overdue`,
      text: ts.overdue > 3 ? 'That is more than a normal backlog slip. Consider closing or re-dating tasks you are not actually going to do — an overdue list you ignore trains you to ignore the whole list.'
                            : `Worth clearing today: ${sel.overdueTasks().slice(0, 3).map(t => `“${t.title}”`).join(', ')}.`,
      link: '#/tasks' });
    if (ts.today) out.push({ kind: 'info', icon: 'task', title: `${ts.today} task${ts.today > 1 ? 's' : ''} due today`,
      text: ts.estimatedMinutes ? `Total estimated effort: ${NX.fmtDuration(ts.estimatedMinutes)}.` : 'No estimates set — adding them makes the daily plan realistic.', link: '#/tasks' });
    if (ts.completionRate >= 70 && ts.total > 5) out.push({ kind: 'good', icon: 'check', title: `${ts.completionRate}% of tasks completed`, text: 'Healthy completion rate across ' + ts.total + ' tasks.', link: '#/tasks' });
    if (ts.byStatus.Blocked > 0) out.push({ kind: 'warn', icon: 'lock', title: `${ts.byStatus.Blocked} task${ts.byStatus.Blocked > 1 ? 's are' : ' is'} blocked`, text: 'Blocked work does not resolve itself. Each one needs a named person and a next action.', link: '#/tasks' });

    // focus
    const focusToday = sel.focusMinutesToday();
    const focusWeek = NX.sum(s.pomodoro.all().filter(p => p.completed && p.mode === 'focus' && new Date(p.startedAt) > NX.addDays(new Date(), -7)).map(p => p.actualMinutes || p.plannedMinutes || 0));
    if (focusWeek) out.push({ kind: 'info', icon: 'timer', title: `${NX.fmtDuration(focusWeek)} of deep focus in the last 7 days`,
      text: focusToday ? `Today so far: ${NX.fmtDuration(focusToday)}.` : 'Nothing logged yet today — a single 25-minute block is enough to start the day well.', link: '#/pomodoro' });
    if (focusWeek > 0 && focusWeek < 180) out.push({ kind: 'warn', icon: 'zap', title: 'Focus time is low', text: 'Under 3 hours of tracked deep work in a week usually means the work is happening in fragments. Try blocking two 90-minute windows in the calendar.', link: '#/pomodoro' });

    // habits
    const habits = s.habits.all().filter(h => h.active !== false);
    if (habits.length) {
      const todayDone = sel.habitsCompletedToday();
      const rates = habits.map(h => ({ h, rate: sel.habitRate(h, 14) })).sort((a, b) => b.rate - a.rate);
      const best = rates[0], worst = rates[rates.length - 1];
      out.push({ kind: todayDone.done === todayDone.total ? 'good' : 'info', icon: 'flame',
        title: `Habits today: ${todayDone.done}/${todayDone.total}`,
        text: best && best.rate > 60 ? `Strongest: ${best.h.name} (${best.rate}% over 14 days).` : 'No habit is above 60% consistency yet — pick one and protect it before adding more.',
        link: '#/habits' });
      if (worst && worst.rate < 30) out.push({ kind: 'warn', icon: 'flame', title: `“${worst.h.name}” is at ${worst.rate}%`,
        text: 'Habits below ~30% usually need to be made smaller, not more disciplined about. Shrink it until it is trivial.', link: '#/habits' });
      const longest = habits.map(h => ({ h, st: sel.habitStreak(h) })).sort((a, b) => b.st - a.st)[0];
      if (longest && longest.st >= 3) out.push({ kind: 'good', icon: 'flame', title: `${longest.st}-day streak on “${longest.h.name}”`, text: 'Do not break the chain today.', link: '#/habits' });
    }

    // journal / mood
    const mood = sel.moodTrend(14).filter(m => m.mood !== null);
    if (mood.length >= 3) {
      const avg = mood.reduce((a, m) => a + m.mood, 0) / mood.length;
      const first = mood.slice(0, Math.floor(mood.length / 2)), second = mood.slice(Math.floor(mood.length / 2));
      const trend = (second.reduce((a, m) => a + m.mood, 0) / second.length) - (first.reduce((a, m) => a + m.mood, 0) / first.length);
      out.push({ kind: trend > 0.3 ? 'good' : trend < -0.3 ? 'warn' : 'info', icon: 'smile',
        title: `Average mood ${avg.toFixed(1)}/5 over ${mood.length} entries`,
        text: trend > 0.3 ? 'Trending upward over the last two weeks.' : trend < -0.3 ? 'Trending downward — worth looking at what changed.' : 'Steady.', link: '#/journal' });
    }
    const journalGap = (() => {
      const dates = new Set(s.journal.all().map(j => j.date));
      for (let i = 0; i < 14; i++) if (!dates.has(NX.ymd(NX.addDays(new Date(), -i)))) return i;
      return null;
    })();
    if (journalGap !== null && journalGap >= 2) out.push({ kind: 'info', icon: 'journal', title: `No journal entry for ${journalGap} day${journalGap > 1 ? 's' : ''}`, text: 'Even two sentences keeps the streak of reflection alive.', link: '#/journal' });

    // goals
    s.goals.all().filter(g => !g.archived).forEach(g => {
      const p = sel.goalProgress(g);
      const days = g.targetDate ? NX.diffDays(g.targetDate, new Date()) : null;
      if (days !== null && days >= 0) {
        const expected = 100 - (days / Math.max(1, NX.diffDays(g.targetDate, new Date(g.created || g.targetDate)) || 1)) * 100;
        if (p + 15 < expected) out.push({ kind: 'warn', icon: 'target', title: `“${g.title}” is behind pace`, text: `${p}% complete with ${days} day${days === 1 ? '' : 's'} left. Either add effort or move the date — do not leave it ambiguous.`, link: '#/goals' });
      }
      if (p >= 100) out.push({ kind: 'good', icon: 'target', title: `Goal complete: ${g.title}`, text: 'Time to archive it and set the next one.', link: '#/goals' });
    });

    // calendar load
    const upcoming = sel.upcomingEvents(30);
    const meetingsTomorrow = sel.eventsOn(NX.addDays(new Date(), 1)).filter(e => !e.allDay);
    if (meetingsTomorrow.length >= 4) out.push({ kind: 'warn', icon: 'calendar', title: `${meetingsTomorrow.length} events tomorrow`, text: 'That is a fragmented day. Move the deep work block to whichever half is clear.', link: '#/calendar' });
    const freeDays = (() => { let c = 0; for (let i = 1; i <= 14; i++) if (!sel.eventsOn(NX.addDays(new Date(), i)).length) c++; return c; })();
    if (freeDays >= 5) out.push({ kind: 'good', icon: 'calendar', title: `${freeDays} clear days in the next two weeks`, text: 'Rare. Book deep work into them before someone else does.', link: '#/calendar' });

    // finance
    const fin = sel.monthTotals(0);
    if (fin.income || fin.expense) {
      const rate = fin.income ? Math.round((fin.income - fin.expense) / fin.income * 100) : 0;
      out.push({ kind: rate >= 20 ? 'good' : rate < 0 ? 'warn' : 'info', icon: 'money',
        title: `Saving ${rate}% of income this month`,
        text: `${NX.store.getSetting('currencySymbol', '$')}${NX.fmtNum(fin.income, 0)} in, ${NX.store.getSetting('currencySymbol', '$')}${NX.fmtNum(fin.expense, 0)} out.`, link: '#/finance' });
      sel.spendByCategory(0).forEach(c => {
        if (c.budget && c.amount > c.budget) out.push({ kind: 'warn', icon: 'money', title: `${c.name} is over budget`, text: `${NX.store.getSetting('currencySymbol','$')}${NX.fmtNum(c.amount,0)} of ${NX.store.getSetting('currencySymbol','$')}${NX.fmtNum(c.budget,0)} (${Math.round(c.amount / c.budget * 100)}%).`, link: '#/finance' });
        else if (c.budget && c.amount / c.budget > 0.85) out.push({ kind: 'info', icon: 'money', title: `${c.name} at ${Math.round(c.amount / c.budget * 100)}% of budget`, text: `${NX.fmtNum(Math.max(0, c.budget - c.amount), 0)} left this month.`, link: '#/finance' });
      });
    }

    // knowledge
    const notes = s.notes.all().filter(n => !n.archived);
    const stale = notes.filter(n => NX.diffDays(new Date(), new Date(n.updated)) > 90);
    if (stale.length) out.push({ kind: 'info', icon: 'archive', title: `${stale.length} note${stale.length > 1 ? 's' : ''} untouched for 90+ days`, text: 'Either they are reference (fine — tag them) or they are dead weight (delete them).', link: '#/notes' });
    const links = sel.noteLinks();
    const linked = new Set(links.filter(l => l.toId).map(l => l.fromId));
    const orphaned = notes.filter(n => !linked.has(n.id) && !sel.backlinksTo(n.id).length && !n.parentId);
    if (orphaned.length >= 3) out.push({ kind: 'info', icon: 'wiki', title: `${orphaned.length} orphaned notes`, text: 'Notes nothing links to and that link to nothing. Orphans are how knowledge gets lost — connect or archive them.', link: '#/wiki' });
    const unresolved = links.filter(l => !l.toId);
    if (unresolved.length) out.push({ kind: 'info', icon: 'link', title: `${unresolved.length} broken wiki link${unresolved.length > 1 ? 's' : ''}`, text: `Pointing at pages that do not exist yet: ${NX.unique(unresolved.map(l => l.toTitle)).slice(0, 4).map(t => `“${t}”`).join(', ')}.`, link: '#/wiki' });

    // chat
    const unread = sel.totalUnread();
    if (unread) out.push({ kind: 'info', icon: 'chat', title: `${unread} unread message${unread > 1 ? 's' : ''}`, text: 'Across your channels and DMs.', link: '#/chat' });

    // inbox
    const unreadInbox = sel.unreadInbox().length;
    if (unreadInbox) out.push({ kind: 'info', icon: 'inbox', title: `${unreadInbox} unread inbox item${unreadInbox > 1 ? 's' : ''}`, text: 'Clearing the inbox to zero is a 2-minute task that makes everything else feel manageable.', link: '#/inbox' });

    const order = { warn: 0, good: 1, info: 2 };
    return out.sort((a, b) => (order[a.kind] || 9) - (order[b.kind] || 9));
  }

  /** Plain-text daily digest */
  function dailyDigest() {
    const sel = NX.sel, s = NX.store;
    const lines = [];
    const d = new Date();
    lines.push(`DAILY DIGEST — ${NX.fmtDate(d, 'long')}`);
    lines.push('');
    const today = sel.tasksDueOn(d).filter(t => !t.done);
    const overdue = sel.overdueTasks();
    const ev = sel.eventsOn(d);
    const hab = sel.habitsCompletedToday();
    const rem = sel.pendingReminders().filter(r => new Date(r.at) > d && new Date(r.at) < NX.addDays(d, 1));
    lines.push(`TASKS — ${today.length} due today, ${overdue.length} overdue`);
    overdue.slice(0, 5).forEach(t => lines.push(`  ! OVERDUE  ${t.title}  (${NX.dueLabel(t.due)})`));
    today.slice(0, 8).forEach(t => lines.push(`  • ${t.title}${t.priority && t.priority !== 'Medium' ? `  [${t.priority}]` : ''}${t.estimate ? `  ~${NX.fmtDuration(t.estimate)}` : ''}`));
    lines.push('');
    lines.push(`CALENDAR — ${ev.length} event${ev.length === 1 ? '' : 's'}`);
    ev.slice(0, 10).forEach(e => lines.push(`  ${e.allDay ? 'all day ' : NX.fmtTime(e.start) + ' '} ${e.title}${e.location ? ' @ ' + e.location : ''}`));
    lines.push('');
    lines.push(`HABITS — ${hab.done}/${hab.total} logged today`);
    s.habits.all().filter(h => h.active !== false).slice(0, 8).forEach(h => {
      const done = sel.habitDoneOn(h, NX.todayStr());
      lines.push(`  ${done ? '[x]' : '[ ]'} ${h.emoji || ''} ${h.name}  (streak ${sel.habitStreak(h)})`);
    });
    if (rem.length) { lines.push(''); lines.push('REMINDERS'); rem.forEach(r => lines.push(`  ${NX.fmtTime(r.at)}  ${r.title}`)); }
    lines.push('');
    lines.push('FOCUS');
    lines.push(`  Deep work today: ${NX.fmtDuration(sel.focusMinutesToday())}`);
    const nw = nextUp(3);
    if (nw.length) { lines.push('  Do these next:'); nw.forEach((x, i) => lines.push(`   ${i + 1}. ${x.task.title}  (score ${x.score})`)); }
    return lines.join('\n');
  }

  /** Weekly review text, generated from real data */
  function weeklyReview() {
    const sel = NX.sel, s = NX.store;
    const weekAgo = NX.addDays(new Date(), -7);
    const L = [];
    L.push(`# Weekly Review — week of ${NX.fmtDate(NX.startOfWeek(new Date()), 'medium')}`);
    L.push('');
    const completed = s.tasks.all().filter(t => t.done && t.completed && new Date(t.completed) >= weekAgo);
    const created = s.tasks.all().filter(t => t.created && new Date(t.created) >= weekAgo);
    const overdue = sel.overdueTasks();
    L.push('## Numbers');
    L.push(`- Tasks completed: **${completed.length}**`);
    L.push(`- Tasks created: **${created.length}**`);
    L.push(`- Still overdue: **${overdue.length}**`);
    const focus = NX.sum(s.pomodoro.all().filter(p => p.completed && p.mode === 'focus' && new Date(p.startedAt) >= weekAgo).map(p => p.actualMinutes || p.plannedMinutes || 0));
    L.push(`- Deep focus: **${NX.fmtDuration(focus)}** (${Math.round(focus / 25)} pomodoros)`);
    const timeLogged = NX.sum(s.timeLogs.all().filter(t => new Date(t.start) >= weekAgo).map(t => t.minutes || 0));
    L.push(`- Time logged: **${NX.fmtDuration(timeLogged)}**`);
    const notesTouched = s.notes.all().filter(n => new Date(n.updated) >= weekAgo);
    L.push(`- Notes touched: **${notesTouched.length}**`);
    const entries = s.journal.all().filter(j => new Date(j.date) >= weekAgo);
    const avgMood = entries.length ? (entries.reduce((a, j) => a + (j.mood || 0), 0) / entries.length).toFixed(1) : '—';
    L.push(`- Journal entries: **${entries.length}** (avg mood ${avgMood}/5)`);
    const habits = s.habits.all().filter(h => h.active !== false);
    if (habits.length) {
      L.push('');
      L.push('## Habit consistency (last 7 days)');
      habits.forEach(h => {
        let done = 0;
        for (let i = 0; i < 7; i++) if (sel.habitDoneOn(h, NX.ymd(NX.addDays(new Date(), -i)))) done++;
        L.push(`- ${h.emoji || '•'} ${h.name}: ${done}/7 ${'█'.repeat(done)}${'░'.repeat(7 - done)}`);
      });
    }
    L.push('');
    L.push('## Completed this week');
    completed.slice(0, 20).forEach(t => L.push(`- ✅ ${t.title}${t.projectId ? ` _(${sel.projectName(t.projectId)})_` : ''}`));
    if (!completed.length) L.push('- _Nothing completed — worth examining why._');
    L.push('');
    L.push('## Carried over / overdue');
    overdue.slice(0, 15).forEach(t => L.push(`- ⚠️ ${t.title} — ${NX.dueLabel(t.due)}`));
    if (!overdue.length) L.push('- _Clean slate._');
    L.push('');
    L.push('## Goals');
    s.goals.all().filter(g => !g.archived).forEach(g => {
      const p = sel.goalProgress(g);
      L.push(`- ${g.title}: **${p}%**${g.targetDate ? ` (target ${NX.fmtDate(g.targetDate, 'medium')})` : ''}`);
    });
    L.push('');
    L.push('## Focus for next week');
    L.push('_Pick three. Only three._');
    L.push('1. ');
    L.push('2. ');
    L.push('3. ');
    L.push('');
    L.push('## Reflection prompts');
    L.push('- What worked that I should keep doing?');
    L.push('- What drained me?');
    L.push('- What am I avoiding, and what is the smallest first step?');
    L.push('- Is anything on my list that I should just delete?');
    return L.join('\n');
  }

  /* --------------------------- TITLE SUGGESTION --------------------------- */
  function suggestTitle(text) {
    const sents = sentences(text);
    if (!sents.length) return 'Untitled';
    // prefer a heading-looking line
    const heading = String(text).split('\n').map(x => x.trim()).find(x => /^#{1,3}\s+/.test(x));
    if (heading) return heading.replace(/^#+\s*/, '').slice(0, 70);
    const first = sents[0];
    const kw = keywords(first, 4).map(k => k.word);
    if (kw.length) {
      const title = kw.map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
      if (title.length <= 60) return title;
    }
    return first.slice(0, 60).replace(/[.,;:!?]$/, '') + (first.length > 60 ? '…' : '');
  }

  /* --------------------------- ACTION EXTRACTION --------------------------- */
  /** Pull actionable items out of meeting notes / free text */
  function extractActions(text) {
    const out = [];
    const sents = sentences(text).concat(String(text).split('\n').map(x => x.trim()).filter(x => /^[-*•]\s/.test(x)));
    const verbRe = /^(please\s+)?(need to|have to|must|should|will|follow up|send|email|call|book|schedule|prepare|write|draft|review|check|fix|update|create|build|contact|ask|confirm|submit|order|pay|cancel|arrange|set up|research|finish|complete|deliver|ship|test|deploy)\b/i;
    const ownerRe = /(@[\w.-]+|\b(?:I|we|you|they|he|she|[A-Z][a-z]+)\b)\s+(?:will|should|need to|must|to)\b/;
    sents.forEach(s => {
      const clean = s.replace(/^[-*•\d.)\s]+/, '').trim();
      if (clean.length < 8 || clean.length > 200) return;
      const isAction = verbRe.test(clean) || /\b(TODO|ACTION|FIXME|follow-?up)\b/i.test(clean);
      const due = parseWhen(clean);
      if (!isAction && !due.date) return;
      const ownerMatch = clean.match(ownerRe);
      const assignee = clean.match(/@([\w.-]+)/) ? clean.match(/@([\w.-]+)/)[1] : (ownerMatch ? ownerMatch[1] : null);
      out.push({
        text: clean.replace(/@[ \w.-]+/, '').replace(/\b(please|will|should|need to|have to|must)\b/gi, '').replace(/\s+/g, ' ').trim(),
        assignee,
        due: due.date ? due.date.toISOString() : null,
        repeat: due.repeat,
        priority: /\b(urgent|asap|immediately|critical|today)\b/i.test(clean) ? 'Urgent' : /\b(important|soon|high)\b/i.test(clean) ? 'High' : 'Medium'
      });
    });
    // dedupe
    const seen = new Set();
    return out.filter(a => { const k = a.text.toLowerCase().slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /* --------------------------- OFFLINE Q&A over notes --------------------------- */
  /**
   * Keyword-driven retrieval answer. Not an LLM, but genuinely useful:
   * it finds the passages that answer a question and composes a response.
   */
  function answer(question, opts) {
    opts = opts || {};
    const hits = search(question, { limit: opts.limit || 6, kinds: opts.kinds });
    if (!hits.length) {
      return {
        text: `I could not find anything in your workspace matching **“${question}”**.\n\nTry different wording, or check that the relevant notes are not archived.`,
        sources: [], confidence: 0
      };
    }
    const qTokens = tokenize(question);
    const parts = [];
    parts.push(`Here is what your workspace says about **${question.trim()}**:\n`);
    hits.forEach((hit, i) => {
      const doc = hit.doc;
      const text = doc.text || '';
      const sents = sentences(text);
      const best = sents.map(s => {
        const toks = tokenize(s);
        const overlap = toks.filter(t => qTokens.includes(t)).length;
        return { s, score: overlap / Math.sqrt(toks.length || 1) };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
      const quote = (best.length ? best.map(b => b.s) : [NX.aiEngine.summarize(text, 1)]).join(' ');
      parts.push(`**${i + 1}. ${doc.title}** _(${doc.kind})_\n> ${quote.slice(0, 340)}`);
    });
    const conf = NX.clamp(Math.round((hits[0].score / 40) * 100), 12, 96);
    parts.push(`\n_Confidence: ${conf}% — based on ${hits.length} matching item${hits.length > 1 ? 's' : ''}. This is offline retrieval, not a language model; add an API key in Settings → AI for reasoning and synthesis._`);
    return { text: parts.join('\n\n'), sources: hits.map(h => ({ kind: h.doc.kind, id: h.doc.id, title: h.doc.title })), confidence: conf };
  }

  /* --------------------------- TEXT TRANSFORMS --------------------------- */
  const transforms = {
    upper: t => t.toUpperCase(),
    lower: t => t.toLowerCase(),
    title: t => t.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase()),
    sentence: t => t.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase()),
    camel: t => t.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase()),
    kebab: t => NX.slug(t),
    snake: t => NX.slug(t).replace(/-/g, '_'),
    trimLines: t => t.split('\n').map(x => x.trim()).filter(Boolean).join('\n'),
    dedupeLines: t => NX.unique(t.split('\n').map(x => x.trim()).filter(Boolean)).join('\n'),
    sortLines: t => t.split('\n').filter(Boolean).sort((a, b) => a.localeCompare(b)).join('\n'),
    sortLinesDesc: t => t.split('\n').filter(Boolean).sort((a, b) => b.localeCompare(a)).join('\n'),
    reverse: t => t.split('').reverse().join(''),
    bullets: t => t.split('\n').filter(Boolean).map(x => '- ' + x.replace(/^[-*•\d.)\s]+/, '')).join('\n'),
    numbers: t => t.split('\n').filter(Boolean).map((x, i) => `${i + 1}. ` + x.replace(/^[-*•\d.)\s]+/, '')).join('\n'),
    checkboxes: t => t.split('\n').filter(Boolean).map(x => '- [ ] ' + x.replace(/^[-*•\[\]x\s]+/i, '')).join('\n'),
    stripMarkdown: t => t.replace(/[#*_`~>\[\]()!|-]/g, ''),
    collapseSpaces: t => t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n'),
    removeUrls: t => t.replace(/https?:\/\/\S+/g, ''),
    extractUrls: t => NX.unique((t.match(/https?:\/\/[^\s)>\]]+/g) || [])).join('\n'),
    extractEmails: t => NX.unique((t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])).join('\n'),
    wordCount: t => `${tokenize(t).length + (t.match(/\s/g) || []).length + 1} words, ${t.length} characters`,
    base64: t => { try { return btoa(unescape(encodeURIComponent(t))); } catch (e) { return t; } },
    unbase64: t => { try { return decodeURIComponent(escape(atob(t))); } catch (e) { return t; } },
    urlEncode: t => encodeURIComponent(t),
    urlDecode: t => { try { return decodeURIComponent(t); } catch (e) { return t; } },
    escapeHtml: t => NX.esc(t),
    jsonPretty: t => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch (e) { return '// not valid JSON\n' + t; } },
    csvToJson: t => {
      const lines = t.trim().split(/\r?\n/).filter(Boolean);
      if (!lines.length) return '[]';
      const heads = lines[0].split(',').map(x => x.trim().replace(/^"|"$/g, ''));
      const rows = lines.slice(1).map(l => {
        const cells = l.split(',').map(x => x.trim().replace(/^"|"$/g, ''));
        const o = {}; heads.forEach((hd, i) => o[hd] = cells[i] !== undefined ? cells[i] : '');
        return o;
      });
      return JSON.stringify(rows, null, 2);
    },
    toTable: t => {
      const lines = t.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return t;
      const cells = lines.map(l => l.split(/[,\t]/).map(c => c.trim()));
      const w = cells[0].length;
      const widths = Array.from({ length: w }, (_, i) => Math.max(...cells.map(r => (r[i] || '').length)));
      const row = r => '| ' + r.map((c, i) => (c || '').padEnd(widths[i])).join(' | ') + ' |';
      const sep = '|' + widths.map(x => '-'.repeat(x + 2)).join('|') + '|';
      return [row(cells[0]), sep].concat(cells.slice(1).map(row)).join('\n');
    },
    lorem: () => 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    today: () => NX.fmtDate(new Date(), 'long'),
    timestamp: () => new Date().toISOString(),
    slugify: t => NX.slug(t),
    initials: t => t.split(/\s+/).filter(Boolean).map(w => w[0]).join('').toUpperCase(),
    abbreviate: t => t.split(/\s+/).filter(w => w.length > 3 && /^[A-Z]/.test(w)).map(w => w[0]).join(''),
    removePunctuation: t => t.replace(/[.,;:!?]/g, ''),
    smartQuotes: t => t.replace(/"/g, '”').replace(/(\s|^)'|'/g, '$1‘').replace(/(\w)'(\w)/g, '$1’$2'),
    emDashes: t => t.replace(/\s--\s/g, ' — '),
    fixSpacing: t => t.replace(/\s+([.,;:!?])/g, '$1').replace(/([.,;:!?])(?=\w)/g, '$1 ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s{2,}/g, ' '),
    rot13: t => t.replace(/[a-zA-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + (c.toLowerCase() < 'n' ? 13 : -13))),
    morse: t => {
      const MAP = { A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..','0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.' };
      return t.toUpperCase().split('').map(c => c === ' ' ? '/' : (MAP[c] || '')).filter(Boolean).join(' ');
    }
  };

  /* --------------------------- AUTO-ORGANISE --------------------------- */
  /** Suggest a folder/tag/project structure for a pile of notes */
  function clusterNotes(noteIds) {
    const notes = (noteIds ? NX.store.notes.byIds(noteIds) : NX.store.notes.all()).filter(n => !n.archived);
    const docs = notes.map(n => ({ n, kws: keywords(NX.sel.notePlain(n), 12).map(k => k.word) }));
    const groups = new Map();
    docs.forEach(d => {
      const key = d.kws[0] || 'misc';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d.n.title);
    });
    return Array.from(groups.entries())
      .map(([name, titles]) => ({ name, count: titles.length, titles }))
      .sort((a, b) => b.count - a.count);
  }

  /* --------------------------- PUBLIC API --------------------------- */
  NX.aiEngine = {
    STOP, tokenize, sentences, freq, keywords, suggestTags,
    readability, sentiment, summarize, outline,
    parseWhen, parseTimeOnly, parseQuickCapture,
    search, snippetFor, highlight,
    scoreTask, nextUp, taskSummary,
    sm2, relatedNotes,
    insights, dailyDigest, weeklyReview,
    suggestTitle, extractActions, answer,
    transforms, clusterNotes,
    get offlineReady() { return true; }
  };
})(window.NX);
