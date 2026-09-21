/* ============================================================
   Pebble — 76-prompts-skills.js
   • Prompt Manager: save / organise / variable-fill prompts
   • Skill Vault: .skill / .md / .txt / .zip skills, drag & drop
     anywhere, auto-parsed title + description, enabled toggles,
     injected into the copilot as extra system prompt + tools
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, iconHTML } = NX;
  const store = () => NX.store;

  function data() { const d = store().data; if (!d.prompts) d.prompts = []; if (!d.skills) d.skills = seedSkills(); return d; }
  const save = () => { store().touch(); store().emit('prompts'); };

  /* ================= built-in starter skills ================= */
  function seedSkills() {
    return [
      { id: 'sk_plan', name: 'Ruthless Prioritiser', icon: '🎯', desc: 'Makes the AI cut your list down to what actually matters.', enabled: true, source: 'built-in',
        body: 'You are the Ruthless Prioritiser. When given any list of tasks or goals: (1) pick the ONE item with the highest leverage, (2) say why in one sentence, (3) list at most two supporting actions, (4) explicitly name what should be deleted or delegated. Never exceed 120 words.' },
      { id: 'sk_writer', name: 'Plain-Language Writer', icon: '✍️', desc: 'Rewrites anything in short, warm, human sentences.', enabled: true, source: 'built-in',
        body: 'You are the Plain-Language Writer. Rewrite user text so a tired 14-year-old could follow it: sentences under 18 words, no jargon without a gloss, active voice, no filler openers ("I hope this finds you…"). Keep every fact and number. Preserve the author\'s warmth.' },
      { id: 'sk_devil', name: 'Devil\'s Advocate', icon: '😈', desc: 'Attacks your plan to find the holes before reality does.', enabled: false, source: 'built-in',
        body: 'You are the Devil\'s Advocate. For any plan or decision the user describes: list the three most likely failure modes, the assumption each one rests on, and one cheap experiment to test that assumption this week. Be blunt but never cruel. End with "Still worth doing? Yes/No because…".' },
      { id: 'sk_teacher', name: 'Socratic Tutor', icon: '🧑‍🏫', desc: 'Answers questions with guiding questions instead of lectures.', enabled: false, source: 'built-in',
        body: 'You are a Socratic Tutor. Never give the full answer first. Ask one focused question that moves the user one step closer, wait, then build on their reply. If they ask for the answer directly, give a worked example with the key step removed.' }
    ];
  }

  /* ================= prompt parsing ================= */
  /** Auto-extract title/description/variables from raw prompt text */
  function parsePrompt(raw, filename) {
    let body = String(raw || '');
    let title = '', desc = '', tags = [];
    // YAML-ish frontmatter
    const fm = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (fm) {
      fm[1].split('\n').forEach(line => {
        const m = line.match(/^([A-Za-z_-]+)\s*:\s*(.*)$/);
        if (!m) return;
        const k = m[1].toLowerCase(), v = m[2].trim().replace(/^["']|["']$/g, '');
        if (k === 'title' || k === 'name') title = v;
        else if (k === 'description' || k === 'desc') desc = v;
        else if (k === 'tags') tags = v.split(/[,\s]+/).filter(Boolean);
      });
      body = body.slice(fm[0].length);
    }
    // first heading
    if (!title) {
      const hm = body.match(/^\s*(?:#\s*)?(.{3,70})\n/);
      if (hm && !/^you are/i.test(hm[1])) title = hm[1].trim();
    }
    if (!title && filename) title = filename.replace(/\.(md|txt|skill|prompt)$/i, '').replace(/[-_]+/g, ' ');
    if (!title) title = body.split(/\s+/).slice(0, 6).join(' ') || 'Untitled prompt';
    if (!desc) {
      const lines = body.split('\n').map(l => l.trim()).filter(l => l && l !== title);
      desc = (lines[1] || lines[0] || '').slice(0, 140);
    }
    const vars = NX.unique(Array.from(body.matchAll(/\{\{\s*([\w-]+)\s*\}\}|\{([\w-]+)\}/g)).map(m => m[1] || m[2])).filter(v => v && v.length < 24);
    return { title, desc, tags, vars, body: body.trim() };
  }

  function fill(body, values) {
    values = values || {};
    return String(body).replace(/\{\{\s*([\w-]+)\s*\}\}|\{([\w-]+)\}/g, (m, a, b) => {
      const key = a || b;
      if (values[key] !== undefined) return values[key];
      // smart defaults
      if (/date/i.test(key)) return NX.fmtDate(new Date(), 'long');
      if (/time/i.test(key)) return NX.fmtTime(new Date());
      if (/name|user/i.test(key)) return store().getSetting('userName', 'You');
      if (/note/i.test(key)) { const n = store().notes.all()[0]; return n ? n.title : ''; }
      return m;
    });
  }

  /* ================= skill parsing ================= */
  function parseSkill(raw, filename) {
    let body = String(raw || '');
    let name = '', desc = '', icon = '🧩', tags = [];
    const fm = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
    if (fm) {
      fm[1].split('\n').forEach(line => {
        const m = line.match(/^([A-Za-z_-]+)\s*:\s*(.*)$/);
        if (!m) return;
        const k = m[1].toLowerCase(), v = m[2].trim().replace(/^["']|["']$/g, '');
        if (k === 'name' || k === 'title') name = v;
        else if (k === 'description' || k === 'desc') desc = v;
        else if (k === 'icon' || k === 'emoji') icon = v;
        else if (k === 'tags') tags = v.split(/[,\s]+/).filter(Boolean);
      });
      body = body.slice(fm[0].length);
    }
    if (!name) {
      const hm = body.match(/^\s*#\s*(.{2,60})/m);
      if (hm) name = hm[1].trim();
    }
    if (!name && filename) name = filename.replace(/\.(md|txt|skill)$/i, '').replace(/[-_]+/g, ' ');
    if (!name) name = 'Untitled skill';
    if (!desc) {
      const first = body.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))[0] || '';
      desc = first.slice(0, 150);
    }
    const em = body.match(/(^|\n)\s*(\p{Extended_Pictographic}(?:\uFE0F)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F)?)*)/u);
    if (em && em[2] && em[2].length <= 8) icon = em[2];
    return { name, desc, icon, tags, body: body.trim() };
  }

  /* ================= minimal ZIP reader (store + deflate) ================= */
  async function readZip(buffer) {
    const dv = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    // find End Of Central Directory
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Not a zip file');
    const count = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(ptr, true) !== 0x02014b50) break;
      const method = dv.getUint16(ptr + 10, true);
      const compSize = dv.getUint32(ptr + 20, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const commentLen = dv.getUint16(ptr + 32, true);
      const localOff = dv.getUint32(ptr + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
      // local header -> data offset
      const ln = dv.getUint16(localOff + 26, true);
      const le = dv.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + ln + le;
      const raw = bytes.subarray(dataStart, dataStart + compSize);
      if (!name.endsWith('/')) {
        let text = '';
        if (method === 0) text = new TextDecoder().decode(raw);
        else if (method === 8 && typeof DecompressionStream !== 'undefined') {
          try {
            const ds = new DecompressionStream('deflate-raw');
            const stream = new Blob([raw]).stream().pipeThrough(ds);
            text = await new Response(stream).text();
          } catch (e) { text = ''; }
        }
        out.push({ name, text });
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  /* ================= install flows ================= */
  async function installFiles(fileList) {
    fileList = Array.from(fileList || []).filter(f => f && f.name);
    if (!fileList.length) {
      NX.ui.toast({ type: 'warn', title: 'Nothing dropped', message: 'Drop .skill / .md / .txt / .zip files — or use Paste and Import in the Skill Wallet.', duration: 5000 });
      return 0;
    }
    let added = 0;
    for (const f of fileList) {
      const name = f.name || 'file';
      if (/\.zip$/i.test(name)) {
        try {
          const buf = await f.arrayBuffer();
          const entries = await readZip(buf);
          const skillEntries = entries.filter(e => /\.(skill|md|txt)$/i.test(e.name) && e.text && e.text.length > 20);
          if (!skillEntries.length) { NX.ui.toast({ type: 'warn', message: name + ': no .skill/.md/.txt found inside' }); continue; }
          skillEntries.forEach(e => { addSkill(parseSkill(e.text, e.name.split('/').pop()), name); added++; });
        } catch (e) { NX.ui.toast({ type: 'error', message: name + ': ' + e.message }); }
      } else if (/\.(skill|md|txt)$/i.test(name)) {
        const text = await f.text();
        // a single file can hold MULTIPLE skills separated by --- skill boundaries
        const chunks = text.split(/\n(?=---\s*$)^.*$/m).length > 1 ? text.split(/^---$/m) : [text];
        chunks.forEach(c => { if (c.trim().length > 20) { addSkill(parseSkill(c, name), name); added++; } });
      } else {
        NX.ui.toast({ type: 'warn', message: name + ': unsupported type (use .skill, .md, .txt or .zip)' });
      }
    }
    if (added) {
      save();
      const g = NX.game && NX.game.G(); if (g) { g.stats.skills = store().data.skills.length; }
      NX.game && NX.game.checkAchievements();
      NX.ui.toast({ type: 'success', title: `${added} skill${added > 1 ? 's' : ''} installed`, message: 'The copilot will use them automatically.', duration: 5000 });
      NX.router.render();
    }
  }

  function addSkill(parsed, origin) {
    const d = data();
    const existing = d.skills.find(s => s.name.toLowerCase() === parsed.name.toLowerCase());
    if (existing) { Object.assign(existing, parsed, { source: origin || existing.source, updated: Date.now() }); return existing; }
    const sk = Object.assign({ id: NX.uid('sk'), enabled: true, source: origin || 'manual', created: Date.now() }, parsed);
    d.skills.push(sk);
    return sk;
  }

  /** Everything enabled, formatted for the AI system prompt */
  function activePromptBlock() {
    const d = data();
    const on = d.skills.filter(s => s.enabled);
    if (!on.length) return '';
    return 'ACTIVE SKILLS (adopt these personas/instructions when relevant):\n' +
      on.map(s => `--- SKILL: ${s.name} ---\n${s.body.slice(0, 1600)}`).join('\n\n');
  }

  /* ================= SKILL WALLET =================
     One portable file that carries your whole skill + prompt
     collection between devices. Opens anywhere in Pebble.   */
  function walletExport() {
    const d = data();
    const payload = {
      kind: 'pebble-wallet', version: 1, exported: new Date().toISOString(),
      owner: store().getSetting('userName', 'you'),
      skills: d.skills.map(s => ({ name: s.name, desc: s.desc, icon: s.icon, tags: s.tags, enabled: s.enabled, body: s.body })),
      prompts: d.prompts.map(p => ({ title: p.title, desc: p.desc, tags: p.tags, body: p.body }))
    };
    NX.download('pebble-wallet-' + NX.todayStr() + '.wallet', JSON.stringify(payload, null, 2), 'application/json');
    NX.ui.toast({ type: 'success', title: 'Wallet exported', message: payload.skills.length + ' skills + ' + payload.prompts.length + ' prompts', duration: 4500 });
  }

  async function walletImport(fileOrText, name) {
    let text = typeof fileOrText === 'string' ? fileOrText : await fileOrText.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch (e) { NX.ui.toast({ type: 'error', title: 'Not a wallet', message: 'That file is not valid JSON. Wallets are .wallet files exported from Pebble.', duration: 6000 }); return 0; }
    if (!payload || payload.kind !== 'pebble-wallet' || !Array.isArray(payload.skills)) {
      NX.ui.toast({ type: 'error', title: 'Not a wallet', message: 'Missing "kind": "pebble-wallet".', duration: 6000 }); return 0;
    }
    let added = 0;
    payload.skills.forEach(sk => { if (sk && sk.body) { addSkill(parseSkill(sk.body, sk.name), 'wallet:' + (name || 'import')); added++; } });
    (payload.prompts || []).forEach(pr => {
      if (!pr || !pr.body) return;
      const d = data();
      if (!d.prompts.some(x => x.title === pr.title)) { d.prompts.unshift({ id: NX.uid('pm'), title: pr.title, desc: pr.desc || '', tags: pr.tags || [], vars: parsePrompt(pr.body).vars, body: pr.body, created: Date.now(), uses: 0 }); added++; }
    });
    save();
    const g = NX.game && NX.game.G(); if (g) { g.stats.skills = data().skills.length; }
    NX.game && NX.game.checkAchievements();
    NX.ui.toast({ type: 'success', title: 'Wallet opened', message: added + ' item(s) added to your vault', duration: 5000 });
    NX.router.render();
    return added;
  }

  async function pasteInstall() {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch (e) {}
    if (!text) { NX.ui.toast({ type: 'warn', message: 'Clipboard empty — copy a skill or wallet JSON first', duration: 4000 }); return; }
    if (text.trim().startsWith('{') && text.includes('pebble-wallet')) return walletImport(text, 'clipboard');
    const parsed = parseSkill(text, 'pasted skill');
    addSkill(parsed, 'clipboard');
    save();
    NX.ui.toast({ type: 'success', title: 'Skill installed from clipboard', message: parsed.name, duration: 4500 });
    NX.router.render();
  }

  function walletCard() {
    const d = data();
    return h('div.card', { style: { marginBottom: '16px', overflow: 'hidden', padding: '0' } }, [
      h('div', { style: { background: 'linear-gradient(120deg, #241f3d, #173042 55%, #1d3b34)', padding: '18px 20px', color: '#eef' } }, [
        h('div.row', { style: { gap: '10px' } }, [
          h('span', { style: { display: 'flex', color: '#8ff0d4' }, html: NX.glyph('wallet', 26, 1.6) }),
          h('div.grow', [
            h('b', { style: { fontSize: '15px', letterSpacing: '.2px' } }, 'Skill Wallet'),
            h('div', { style: { fontSize: '11px', opacity: .7 } }, (store().getSetting('userName', 'you')) + ' · ' + d.skills.length + ' skills · ' + d.prompts.length + ' prompts')
          ]),
          h('div', { style: { textAlign: 'right' } }, [
            h('div', { style: { fontSize: '11px', opacity: .7 } }, 'active'),
            h('b', { style: { fontSize: '16px', color: '#8ff0d4' } }, String(d.skills.filter(s => s.enabled).length))
          ])
        ]),
        h('div.row', { style: { gap: '7px', marginTop: '14px', flexWrap: 'wrap' } }, [
          h('button.isl-btn', { style: { background: 'rgba(255,255,255,.12)' }, onclick: walletExport }, [h('span', { style: { display: 'flex' }, html: NX.glyph('share', 13) }), 'Export wallet']),
          h('button.isl-btn', { style: { background: 'rgba(255,255,255,.12)' }, onclick: () => { const inp = h('input', { type: 'file', accept: '.wallet,.json', style: { display: 'none' } }); inp.onchange = () => walletImport(inp.files[0], inp.files[0].name); document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000); } }, [h('span', { style: { display: 'flex' }, html: NX.glyph('inbox', 13) }), 'Open wallet file']),
          h('button.isl-btn', { style: { background: 'rgba(255,255,255,.12)' }, onclick: pasteInstall }, [h('span', { style: { display: 'flex' }, html: NX.glyph('scratch', 13) }), 'Paste from clipboard']),
          h('button.isl-btn', { style: { background: 'rgba(255,255,255,.12)' }, onclick: () => NX.serverClient ? NX.serverClient.push().then(() => NX.ui.toast({ type: 'success', message: 'Wallet synced to server' })) : NX.ui.toast({ type: 'info', message: 'Connect a server in Settings → Account to sync your wallet', duration: 4500 }) }, [h('span', { style: { display: 'flex' }, html: NX.glyph('orbit', 13) }), 'Sync'])
        ])
      ]),
      h('div', { style: { padding: '12px 16px', display: 'flex', gap: '8px', overflowX: 'auto' } },
        d.skills.slice(0, 12).map(sk => h('div', {
          title: sk.name + (sk.enabled ? '' : ' (off)'),
          style: { flex: '0 0 auto', width: '58px', height: '38px', borderRadius: '7px', display: 'grid', placeItems: 'center', background: sk.enabled ? 'linear-gradient(135deg,#2c2650,#1d3b34)' : 'var(--bg-sunken)', border: '1px solid ' + (sk.enabled ? 'rgba(143,240,212,.35)' : 'var(--bd)'), color: sk.enabled ? '#8ff0d4' : 'var(--tx-4)', cursor: 'pointer' },
          onclick: () => { sk.enabled = !sk.enabled; save(); NX.router.render(); }
        }, h('span', { style: { display: 'flex' }, html: NX.glyphOrText(sk.icon || 'puzzle', 17) })))
      )
    ]);
  }

  /* ================= global drag & drop ================= */
  let overlayEl = null, depth = 0;
  function initDrop() {
    document.addEventListener('dragenter', e => {
      const types = Array.from(e.dataTransfer && e.dataTransfer.types || []);
      if (!types.includes('Files')) return;
      e.preventDefault(); depth++;
      if (!overlayEl) {
        overlayEl = h('div.skill-drop-overlay', h('div.sdo-card', [
          h('div', { style: { fontSize: '44px' } }, '🧩'),
          h('b', { style: { fontSize: '17px', display: 'block', marginTop: '8px' } }, 'Drop to install skills'),
          h('div.small.muted', { style: { marginTop: '4px' } }, '.skill · .md · .txt · .zip (bundles)')
        ]));
        document.body.appendChild(overlayEl);
      }
    });
    document.addEventListener('dragover', e => { if (overlayEl) e.preventDefault(); });
    document.addEventListener('dragleave', e => { e.preventDefault(); depth--; if (depth <= 0 && overlayEl) { overlayEl.remove(); overlayEl = null; depth = 0; } });
    document.addEventListener('drop', async e => {
      if (!overlayEl) return;
      e.preventDefault();
      overlayEl.remove(); overlayEl = null; depth = 0;
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length && /\.wallet$/i.test(files[0].name || '')) await walletImport(files[0], files[0].name);
      else if (files.length) await installFiles(files);
    });
  }

  /* ================= PROMPT MANAGER MODULE ================= */
  function renderPrompts(params) {
    const d = data();
    let q = '';
    const page = h('div.page');
    page.appendChild(NX.components.pageHead({
      icon: 'copy', title: 'Prompt Manager',
      sub: `${d.prompts.length} saved prompts · variables like {{topic}} are filled on use`,
      actions: [
        h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New prompt', onclick: () => editor(null) }),
        h('button.btn.sm.subtle', { onclick: () => { const inp = h('input', { type: 'file', accept: '.md,.txt,.prompt', multiple: true, style: { display: 'none' } }); inp.onchange = async () => { for (const f of Array.from(inp.files)) { const p = parsePrompt(await f.text(), f.name); d.prompts.unshift(Object.assign({ id: NX.uid('pm'), created: Date.now(), uses: 0 }, p)); } save(); NX.router.render(); NX.ui.toast({ type: 'success', message: 'Imported' }); }; document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000); } }, 'Import'),
        h('button.btn.sm.ghost', { onclick: () => { const L = d.prompts.map(p => `---\ntitle: ${p.title}\ndescription: ${p.desc || ''}\ntags: ${(p.tags || []).join(', ')}\n---\n${p.body}\n`).join('\n'); NX.download('nexadesk-prompts.md', L, 'text/markdown'); } }, 'Export')
      ]
    }));
    const bar = NX.components.filterBar([
      { type: 'search', placeholder: 'Search prompts…', width: 260, onInput: v => { q = v.toLowerCase(); draw(); } },
      { type: 'spacer' },
      { type: 'text', text: 'Click a card to run it in the copilot' }
    ]);
    page.appendChild(bar);
    const grid = h('div.grid.grid-auto.stagger');
    page.appendChild(grid);
    draw();
    function draw() {
      NX.clear(grid);
      const list = d.prompts.filter(p => !q || (p.title + ' ' + p.body + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q));
      if (!list.length) { grid.appendChild(NX.ui.emptyState('copy', 'No prompts yet', 'Save the prompts you reuse every day. Variables like {{topic}} get filled when you run them.', 'Create your first prompt', () => editor(null))); return; }
      list.forEach(p => {
        grid.appendChild(h('div.pm-card', { onclick: () => runPrompt(p) }, [
          h('b', [h('span', { style: { display: 'flex', color: 'var(--brand-1)' }, html: NX.glyph('scratch', 15) }), p.title, h('div.grow'), h('span.tiny.muted', (p.uses || 0) + ' uses')]),
          h('div.pm-body', highlightVars(p.body)),
          h('div.pm-meta', [
            ...(p.tags || []).map(t => h('span.tag', t)),
            ...(p.vars || []).slice(0, 4).map(v => h('span.pm-var', '{{' + v + '}}')),
            h('div.grow'),
            h('button.btn.xs.ghost', { onclick: e => { e.stopPropagation(); editor(p); } }, 'Edit'),
            h('button.btn.xs.ghost', { onclick: e => { e.stopPropagation(); NX.copyText(fill(p.body)); NX.ui.toast({ message: 'Copied (variables filled)', duration: 1800 }); } }, 'Copy'),
            h('button.btn.xs.ghost', { onclick: e => { e.stopPropagation(); d.prompts = d.prompts.filter(x => x.id !== p.id); save(); NX.router.render(); } }, 'Delete')
          ])
        ]));
      });
    }
    function highlightVars(body) {
      return NX.esc(body).replace(/\{\{?\s*([\w-]+)\s*\}?\}/g, '<span class="pm-var">{{$1}}</span>');
    }
    return page;
  }

  async function editor(p) {
    const isNew = !p;
    const r = await NX.ui.form({
      title: isNew ? 'New prompt' : 'Edit prompt', wide: true, okLabel: 'Save',
      fields: [
        { key: 'title', label: 'Title', type: 'text', value: p ? p.title : '', required: true },
        { key: 'tags', label: 'Tags (comma separated)', type: 'text', value: p ? (p.tags || []).join(', ') : '' },
        { key: 'desc', label: 'Description', type: 'text', value: p ? (p.desc || '') : '', full: true },
        { key: 'body', label: 'Prompt body — use {{variables}} anywhere', type: 'textarea', rows: 12, value: p ? p.body : '', required: true, full: true, placeholder: 'You are a …\n\nWrite about {{topic}} for {{audience}} in {{tone}} tone.' }
      ]
    });
    if (!r) return;
    const parsed = parsePrompt(r.body, r.title);
    const rec = {
      id: p ? p.id : NX.uid('pm'), title: r.title, desc: r.desc, tags: r.tags.split(',').map(x => x.trim()).filter(Boolean),
      vars: parsed.vars, body: r.body, created: p ? p.created : Date.now(), uses: p ? (p.uses || 0) : 0
    };
    if (p) { const i = data().prompts.findIndex(x => x.id === p.id); data().prompts[i] = rec; }
    else data().prompts.unshift(rec);
    const g = NX.game && NX.game.G(); if (g) g.stats.prompts = data().prompts.length;
    NX.game && NX.game.checkAchievements();
    save(); NX.router.render();
    NX.ui.toast({ type: 'success', message: 'Prompt saved' });
  }

  async function runPrompt(p) {
    const values = {};
    if ((p.vars || []).length) {
      const r = await NX.ui.form({
        title: 'Fill variables — ' + p.title, okLabel: 'Run',
        fields: p.vars.map(v => ({ key: v, label: '{{' + v + '}}', type: 'text', full: true }))
      });
      if (!r) return;
      Object.assign(values, r);
    }
    p.uses = (p.uses || 0) + 1; save();
    const text = fill(p.body, values);
    NX.copilot.setOpen(true);
    setTimeout(() => { const ta = document.getElementById('cpInput'); if (ta) { ta.value = text; ta.focus(); } NX.copilot.send(text); }, 200);
  }

  /* ================= SKILL VAULT MODULE ================= */
  function renderSkills() {
    const d = data();
    const page = h('div.page');
    page.appendChild(NX.components.pageHead({
      icon: 'brain', title: 'Skill Vault',
      sub: `${d.skills.filter(s => s.enabled).length}/${d.skills.length} skills active · the copilot adopts every enabled skill automatically`,
      actions: [
        h('button.btn.sm.primary', { html: iconHTML('plus', 13) + ' New skill', onclick: () => skillEditor(null) }),
        h('button.btn.sm.subtle', { onclick: () => { const inp = h('input', { type: 'file', accept: '.skill,.md,.txt,.zip', multiple: true, style: { display: 'none' } }); inp.onchange = () => installFiles(Array.from(inp.files)); document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000); } }, 'Install files')
      ]
    }));
    page.appendChild(walletCard());
    const local = h('div.drop-zone', { onclick: () => { const inp = h('input', { type: 'file', accept: '.skill,.md,.txt,.zip,.wallet', multiple: true, style: { display: 'none' } }); inp.onchange = () => { if (inp.files[0] && /\.wallet$/i.test(inp.files[0].name)) walletImport(inp.files[0], inp.files[0].name); else installFiles(Array.from(inp.files)); }; document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000); } }, [
      h('div.dz-ico', { style: { display: 'flex', justifyContent: 'center', color: 'var(--brand-1)' }, html: NX.glyph('wallet', 36, 1.5) }),
      h('b', { style: { display: 'block', fontSize: '14px', color: 'var(--tx-2)' } }, 'Drag & drop skills anywhere in the app'),
      h('div.small.muted', { style: { marginTop: '4px' } }, '.skill · .md · .txt — or a .zip bundle of them. Titles and descriptions are parsed automatically from front-matter or the first heading.'),
      h('div.row', { style: { justifyContent: 'center', gap: '6px', marginTop: '12px' } }, [
        h('code.small', '---\\nname: My Skill\\ndescription: …\\n---'),
        h('span.small.muted', 'or just'), h('code.small', '# My Skill')
      ])
    ]);
    local.addEventListener('dragover', e => { e.preventDefault(); local.classList.add('over'); });
    local.addEventListener('dragleave', () => local.classList.remove('over'));
    local.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); local.classList.remove('over'); await installFiles(Array.from(e.dataTransfer.files || [])); });
    page.appendChild(local);

    page.appendChild(h('div.section-head', { style: { marginTop: '18px' } }, [h('h2', 'Installed skills'), h('span.sh-sub', String(d.skills.length))]));
    const grid = h('div.grid.grid-auto.stagger');
    d.skills.forEach(s => {
      grid.appendChild(h('div.skill-card' + (s.enabled ? '' : '.off'), [
        h('div.sk-head', [
          h('div.sk-ico', { html: NX.glyphOrText(s.icon || 'puzzle', 18) }),
          h('div.grow', { style: { minWidth: '0' } }, [h('b', s.name), h('div.sk-desc', s.desc || '')]),
          h('label.switch', [h('input', { type: 'checkbox', checked: !!s.enabled, onchange: e => { s.enabled = e.target.checked; save(); NX.router.render(); NX.ui.toast({ message: (s.enabled ? 'Enabled: ' : 'Disabled: ') + s.name, duration: 1800 }); } }), h('span.track')]),
          h('button.icon-btn', { html: iconHTML('more', 15), onclick: e => NX.ui.dropdown(e.currentTarget, [
            { icon: 'eye', label: 'View / test in copilot', onClick: () => { NX.copilot.setOpen(true); setTimeout(() => NX.copilot.send('Use the skill "' + s.name + '" to demonstrate itself in two sentences.'), 250); } },
            { icon: 'edit', label: 'Edit…', onClick: () => skillEditor(s) },
            { icon: 'copy', label: 'Copy body', onClick: () => NX.copyText(s.body) },
            { icon: 'download', label: 'Export as .skill', onClick: () => NX.download(NX.slug(s.name) + '.skill', `---\nname: ${s.name}\ndescription: ${s.desc || ''}\nicon: ${s.icon || '🧩'}\ntags: ${(s.tags || []).join(', ')}\n---\n${s.body}`, 'text/plain') },
            '-',
            { icon: 'trash', label: 'Delete skill', danger: true, onClick: async () => { if (await NX.ui.confirmDelete('the skill "' + s.name + '"')) { d.skills = d.skills.filter(x => x.id !== s.id); save(); NX.router.render(); } } }
          ], { right: true }) })
        ]),
        h('div.sk-body', s.body.slice(0, 900))
      ]));
    });
    page.appendChild(grid);
    return page;
  }

  async function skillEditor(s) {
    const r = await NX.ui.form({
      title: s ? 'Edit skill' : 'New skill', wide: true, okLabel: 'Save',
      fields: [
        { key: 'name', label: 'Name', type: 'text', value: s ? s.name : '', required: true },
        { key: 'icon', label: 'Icon (emoji)', type: 'text', value: s ? (s.icon || '🧩') : '🧩' },
        { key: 'desc', label: 'Description', type: 'text', value: s ? (s.desc || '') : '', full: true },
        { key: 'body', label: 'Skill instructions (what the AI should become / do)', type: 'textarea', rows: 12, value: s ? s.body : '', required: true, full: true }
      ]
    });
    if (!r) return;
    if (s) Object.assign(s, r, { source: s.source });
    else addSkill(Object.assign(parseSkill(r.body, r.name), { name: r.name, desc: r.desc, icon: r.icon }), 'manual');
    const g = NX.game && NX.game.G(); if (g) g.stats.skills = data().skills.length;
    NX.game && NX.game.checkAchievements();
    save(); NX.router.render();
    NX.ui.toast({ type: 'success', message: 'Skill saved' });
  }

  NX.prompts = { data, fill, parsePrompt, installFiles, activePromptBlock, initDrop, runPrompt };
  NX.skills = { data, addSkill, parseSkill, activePromptBlock, installFiles, readZip, walletExport, walletImport, pasteInstall, walletCard };

  NX.router.register({
    id: 'prompts', name: 'Prompts', icon: 'copy', group: 'system', order: 74, rail: true,
    render: renderPrompts,
    commands: () => [
      { label: 'Prompts: new prompt', icon: 'plus', run: () => editor(null) },
      ...data().prompts.slice(0, 8).map(p => ({ label: 'Run prompt: ' + p.title, icon: 'copy', run: () => runPrompt(p) }))
    ]
  });
  NX.router.register({
    id: 'skills', name: 'Skills', icon: 'brain', group: 'system', order: 75, rail: true,
    render: renderSkills,
    commands: () => [
      { label: 'Skills: install from file', icon: 'upload', run: () => { const inp = h('input', { type: 'file', accept: '.skill,.md,.txt,.zip', multiple: true, style: { display: 'none' } }); inp.onchange = () => installFiles(Array.from(inp.files)); document.body.appendChild(inp); inp.click(); setTimeout(() => inp.remove(), 4000); } },
      { label: 'Skills: new skill', icon: 'plus', run: () => skillEditor(null) }
    ]
  });
})(window.NX);
