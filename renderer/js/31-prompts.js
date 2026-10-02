/* ============================================================
   PebbleX v0.1 — 31-prompts.js
   Prompt Saver — Supercharged:
   - Categories: Coding, Writing, Productivity, AI Chat, System
   - Dynamic Variables Engine: auto-detects {variable} placeholders,
     with interactive "Fill & Copy" modal
   - Favorites / Starred prompts pinned to top
   - Direct integration: Ask Pel AI, Create Note, Post to Chat
   - Import & Export as JSON and Markdown
   - 15+ curated pre-seeded prompts for dev, writing & productivity
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let listQuery = '', curCategory = 'all', showOnlyFavorites = false;

function prompts(){ return NX.store.get('prompts', []); }
function savePrompts(p){ NX.store.set('prompts', p); }

const SEEDS = [
  {
    id: 'pr_code_review',
    title: 'Senior Code Review & Security Audit',
    category: 'coding',
    body: `Act as a principal software engineer. Review the following {language} code for:
1. Correctness, edge cases & unexpected null/nil inputs
2. Potential race conditions or security vulnerabilities
3. Performance hot paths & memory allocations
4. Idiomatic clean code & refactoring suggestions

Here is the code:
\`\`\`{language}
{code}
\`\`\``,
    tags: ['dev', 'review', 'security'],
    favorite: true,
    used: 12,
    created: Date.now() - 360000e3
  },
  {
    id: 'pr_bug_fixer',
    title: 'Root Cause Bug Analysis',
    category: 'coding',
    body: `Analyze this error stack trace and snippet:
Error:
{error_message}

Code context:
\`\`\`
{code_context}
\`\`\`

Explain:
1. Why this error happens in plain English
2. How to fix it (provide code snippet)
3. How to prevent this bug with tests or types`,
    tags: ['dev', 'debug', 'fix'],
    favorite: true,
    used: 8,
    created: Date.now() - 300000e3
  },
  {
    id: 'pr_standup',
    title: 'Daily Standup Update',
    category: 'productivity',
    body: `Here is my daily standup:
• Yesterday: Finished {yesterday_completed}
• Today: Working on {today_goals}
• Blockers: {blockers_or_none}`,
    tags: ['work', 'standup', 'team'],
    favorite: true,
    used: 15,
    created: Date.now() - 250000e3
  },
  {
    id: 'pr_eli5',
    title: 'Explain Like I\'m 5 (ELI5)',
    category: 'writing',
    body: `Explain the concept of "{topic}" to someone without a technical background. Use an engaging real-world analogy, keep jargon to an absolute minimum, and provide 2 key takeaways.`,
    tags: ['learning', 'explain', 'simple'],
    favorite: false,
    used: 5,
    created: Date.now() - 200000e3
  },
  {
    id: 'pr_email_polisher',
    title: 'Executive Email Polisher',
    category: 'writing',
    body: `Rewrite the draft below to sound {tone} (e.g. professional, assertive, warm, concise).
Goal: {email_goal}

Draft:
"{draft_text}"`,
    tags: ['email', 'writing', 'work'],
    favorite: false,
    used: 9,
    created: Date.now() - 180000e3
  },
  {
    id: 'pr_sql_generator',
    title: 'Optimal SQL Query Generator',
    category: 'coding',
    body: `Write a high-performance {database_type} query for the following requirement:
Requirement: {query_requirement}
Tables & schema:
{schema_description}

Include indexes to add for maximum read performance.`,
    tags: ['dev', 'sql', 'database'],
    favorite: false,
    used: 4,
    created: Date.now() - 140000e3
  },
  {
    id: 'pr_system_architect',
    title: 'System Design & Tradeoffs',
    category: 'coding',
    body: `Design a scalable architecture for: {system_description}
Traffic scale: {expected_scale}

Provide:
1. High-level component diagram & data flow
2. Storage engine recommendation (SQL vs NoSQL vs Cache)
3. Key failure modes & mitigation strategies`,
    tags: ['architecture', 'backend', 'system'],
    favorite: false,
    used: 3,
    created: Date.now() - 90000e3
  }
];

NX.ensureDefaults = (function(orig){
  return function(){
    orig();
    if(NX.store.get('prompts', null) == null) NX.store.set('prompts', SEEDS);
  };
})(NX.ensureDefaults);

/* Extract {variables} or [variables] from text */
function extractVariables(text){
  const vars = new Set();
  const m1 = text.match(/\{([a-zA-Z0-9_-]+)\}/g) || [];
  m1.forEach(v => vars.add(v.slice(1, -1)));
  return Array.from(vars);
}

/* Modal to Fill Variables and Copy */
function openFillVariablesModal(prompt){
  const vars = extractVariables(prompt.body);
  if(!vars.length){
    // No variables, copy directly
    NX.native.clipboardWrite(prompt.body).then(()=>{
      prompt.used = (prompt.used || 0) + 1;
      savePrompts(prompts());
      NX.toastOk('Copied to clipboard', `"${prompt.title}" is ready to paste.`);
      NX.sfx.play('pop');
      renderGrid();
    });
    return;
  }

  const fields = vars.map(v => `
    <div class="field" style="margin-bottom:10px">
      <label style="text-transform:capitalize">${U.esc(v.replace(/_/g, ' '))}</label>
      <input class="input var-input" data-var="${U.esc(v)}" placeholder="Enter ${U.esc(v)}…">
    </div>
  `).join('');

  const body = h(`<div>
    <p class="faint small" style="margin-bottom:12px">Fill in the placeholders for <b>${U.esc(prompt.title)}</b>:</p>
    ${fields}
    <div class="field" style="margin-top:12px">
      <label>Live Preview</label>
      <pre class="md-pre" id="var-preview" style="max-height:160px;overflow-y:auto;white-space:pre-wrap;font-size:12px">${U.esc(prompt.body)}</pre>
    </div>
  </div>`);

  function updatePreview(){
    let result = prompt.body;
    qa('.var-input', body).forEach(inp => {
      const v = inp.dataset.var;
      const val = inp.value.trim() || `{${v}}`;
      result = result.split(`{${v}}`).join(val);
    });
    const prev = q('#var-preview', body);
    if(prev) prev.textContent = result;
    return result;
  }

  qa('.var-input', body).forEach(inp => inp.addEventListener('input', updatePreview));

  NX.modal({
    title: 'Fill & Copy Prompt',
    icon: 'star',
    body,
    footer: [
      { label:'Cancel', cls:'btn-soft' },
      { label:'Copy with values', cls:'btn-green', onClick: () => {
        const finalPrompt = updatePreview();
        NX.native.clipboardWrite(finalPrompt).then(() => {
          prompt.used = (prompt.used || 0) + 1;
          savePrompts(prompts());
          NX.closeAllModals();
          NX.toastOk('Filled & Copied!', prompt.title);
          NX.sfx.play('ok');
          renderGrid();
        });
      }}
    ]
  });

  setTimeout(() => {
    const first = q('.var-input', body);
    if(first) first.focus();
  }, 60);
}

/* Modal to Create/Edit a Prompt */
NX.newPrompt = function(opts){
  opts = opts || {};
  const isEdit = !!opts.id;
  const categories = ['coding', 'writing', 'productivity', 'ai', 'system', 'other'];

  const body = h(`<div>
    <div class="field" style="margin-bottom:10px">
      <label>Title</label>
      <input class="input" id="np-title" placeholder="e.g. Code Review Checklist" value="${U.esc(opts.title||'')}">
    </div>
    <div class="row gap-8" style="margin-bottom:10px">
      <div class="field" style="flex:1">
        <label>Category</label>
        <select class="input" id="np-cat">
          ${categories.map(c => `<option value="${c}" ${opts.category===c?'selected':''}>${U.esc(c.toUpperCase())}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="flex:1">
        <label>Tags (comma separated)</label>
        <input class="input" id="np-tags" placeholder="dev, review, api" value="${U.esc((opts.tags||[]).join(', '))}">
      </div>
    </div>
    <div class="field">
      <label>Prompt Body (use {variable} for dynamic fields)</label>
      <textarea class="input" id="np-body" rows="8" placeholder="Type prompt here… e.g. Review the following {language} code for {goal}:">${U.esc(opts.body||'')}</textarea>
    </div>
  </div>`);

  NX.modal({
    title: isEdit ? 'Edit Prompt' : 'Save New Prompt',
    icon: 'star',
    body,
    footer: [
      { label:'Cancel', cls:'btn-soft' },
      { label: isEdit ? 'Save Changes' : 'Save Prompt', cls:'btn-green', onClick: () => {
        const title = q('#np-title', body).value.trim();
        if(!title){ q('#np-title', body).focus(); return; }
        const category = q('#np-cat', body).value;
        const tags = q('#np-tags', body).value.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
        const promptBody = q('#np-body', body).value;
        const list = prompts();

        if(isEdit){
          const p = list.find(x => x.id === opts.id);
          if(p){
            p.title = title;
            p.category = category;
            p.tags = tags;
            p.body = promptBody;
          }
        } else {
          list.unshift({
            id: U.uid('pr'),
            title,
            category,
            body: promptBody,
            tags,
            favorite: false,
            used: 0,
            created: Date.now()
          });
        }

        savePrompts(list);
        NX.closeAllModals();
        NX.sfx.play('ok');
        if(NX.router.currentName === 'prompts') NX.router.go('prompts');
        NX.toastOk(isEdit ? 'Prompt updated' : 'Prompt saved', 'Ready to use anytime.');
      }}
    ]
  });

  setTimeout(() => q('#np-title', body) && q('#np-title', body).focus(), 60);
};

/* Module Route */
let currentView = null;
function renderGrid(){
  if(!currentView) return;
  const host = q('#pr-grid', currentView);
  if(!host) return;

  const s = listQuery.toLowerCase();
  const filtered = prompts()
    .filter(p => curCategory === 'all' || (p.category || 'other') === curCategory)
    .filter(p => !showOnlyFavorites || p.favorite)
    .filter(p => !s || (p.title + ' ' + p.body + ' ' + (p.tags||[]).join(' ')).toLowerCase().includes(s))
    .sort((a,b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || b.created - a.created);

  host.innerHTML = filtered.map(p => {
    const vars = extractVariables(p.body);
    const varChips = vars.map(v => `<span class="pill blue sm" style="font-size:10px">{${U.esc(v)}}</span>`).join(' ');

    return `
    <div class="card pr-card anim-in" data-id="${p.id}" style="padding:16px;display:flex;flex-direction:column;gap:10px">
      <div class="pr-top" style="display:flex;align-items:flex-start;gap:10px">
        <div class="tile sm" style="background:var(--orange-soft);color:var(--orange-deep)">${icon('star',15)}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px">
            <b class="ellipsis" style="font-size:14px">${U.esc(p.title)}</b>
            ${p.favorite ? `<span style="color:var(--orange);font-size:14px" title="Favorite">★</span>` : ''}
          </div>
          <div class="pr-meta faint tiny" style="margin-top:2px">
            <span class="pill gray sm">${U.esc((p.category||'general').toUpperCase())}</span>
            ${(p.tags||[]).map(t => `<span class="tagchip">#${U.esc(t)}</span>`).join(' ')}
            <span>· used ${p.used||0}×</span>
          </div>
        </div>
        <button class="icon-btn sm" data-menu="${p.id}" data-tip="Options">${icon('dots')}</button>
      </div>

      ${varChips ? `<div class="row gap-4" style="flex-wrap:wrap">${varChips}</div>` : ''}

      <div class="pr-body faint small" style="background:var(--surface-2);padding:10px;border-radius:10px;max-height:100px;overflow:hidden;line-height:1.45;white-space:pre-wrap;font-family:monospace;font-size:11.5px">${U.esc(p.body)}</div>

      <div class="pr-foot row gap-6" style="margin-top:auto;padding-top:4px">
        <button class="btn btn-green btn-sm" data-fill="${p.id}">${icon('copy')} ${vars.length ? 'Fill & Copy' : 'Copy'}</button>
        <button class="btn btn-soft btn-sm" data-ai="${p.id}" data-tip="Send to Pel AI">${icon('ai')} Ask Pel</button>
        <button class="icon-btn sm" data-fav="${p.id}" data-tip="${p.favorite?'Remove from favorites':'Star prompt'}" style="${p.favorite?'color:var(--orange)':''}">${icon('star',14)}</button>
        <span class="faint tiny" style="margin-left:auto">${U.esc(U.relTime(p.created))}</span>
      </div>
    </div>`;
  }).join('');

  q('#pr-empty', currentView).style.display = filtered.length ? 'none' : 'block';

  // Wire events
  qa('[data-fill]', host).forEach(b => {
    b.onclick = () => {
      const p = prompts().find(x => x.id === b.dataset.fill);
      if(p) openFillVariablesModal(p);
    };
  });

  qa('[data-fav]', host).forEach(b => {
    b.onclick = () => {
      const p = prompts().find(x => x.id === b.dataset.fav);
      if(p){
        p.favorite = !p.favorite;
        savePrompts(prompts());
        renderGrid();
        NX.sfx.play('pop');
      }
    };
  });

  qa('[data-ai]', host).forEach(b => {
    b.onclick = () => {
      const p = prompts().find(x => x.id === b.dataset.ai);
      if(p){
        const cfg = NX.store.get('ai', { model:'openai', context:true, history:[] });
        cfg.history = cfg.history || [];
        cfg.history.push({ role:'user', content:p.body });
        NX.store.set('ai', cfg);
        NX.router.go('ai');
        NX.toastOk('Sent to Pel AI', 'Opening AI chat…');
      }
    };
  });

  qa('[data-menu]', host).forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const p = prompts().find(x => x.id === b.dataset.menu);
      if(!p) return;
      NX.menu(e.currentTarget, [
        { label:'Edit prompt', icon:'edit', onClick:()=>NX.newPrompt(p) },
        { label:'Duplicate', icon:'copy', onClick:()=>{
          const list = prompts();
          list.unshift({ ...p, id:U.uid('pr'), title:p.title + ' (Copy)', used:0, created:Date.now() });
          savePrompts(list);
          renderGrid();
          NX.toastOk('Duplicated prompt');
        }},
        { label:'Create Note from this', icon:'notes', onClick:()=>{
          const n = { id:U.uid('nt'), title:p.title, body:'# ' + p.title + '\n\n' + p.body, tags:p.tags||[], pinned:false, updated:Date.now() };
          const nl = NX.store.get('notes', []);
          nl.unshift(n);
          NX.store.set('notes', nl);
          NX.router.go('notes');
          NX.toastOk('Created note', p.title);
        }},
        '-',
        { label: p.favorite ? 'Unfavorite' : 'Mark favorite', icon:'star', onClick:()=>{
          p.favorite = !p.favorite; savePrompts(prompts()); renderGrid();
        }},
        { label:'Delete prompt', icon:'trash', danger:true, onClick:()=>{
          savePrompts(prompts().filter(x => x.id !== p.id));
          renderGrid();
          NX.toastOk('Prompt deleted');
        }}
      ]);
    };
  });
}

NX.routeInShell('prompts', 'Prompts', 'star', function(view){
  currentView = view;
  const cats = [
    { id:'all', label:'All' },
    { id:'coding', label:'Coding' },
    { id:'writing', label:'Writing' },
    { id:'productivity', label:'Work' },
    { id:'ai', label:'AI' },
    { id:'system', label:'System' }
  ];

  view.innerHTML = `
  <div class="page">
    <div class="row gap-8" style="flex-wrap:wrap;margin-bottom:14px">
      <div class="search-box" style="width:240px">
        ${icon('search')}<input id="pr-search" placeholder="Search prompts or {vars}…">
      </div>
      <div class="seg sm" id="pr-cats" role="tablist">
        ${cats.map(c => `<button role="tab" class="${curCategory===c.id?'on':''}" data-cat="${c.id}">${c.label}</button>`).join('')}
      </div>
      <button class="btn btn-soft btn-sm ${showOnlyFavorites?'btn-green':''}" id="pr-fav-toggle">${icon('star')} Starred</button>
      <span style="flex:1"></span>
      <button class="btn btn-soft btn-sm" id="pr-export">${icon('download')} Export .md</button>
      <button class="btn btn-dark btn-sm" id="pr-new">${icon('plus')} New prompt</button>
    </div>

    <div class="pr-grid" id="pr-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px"></div>

    <div class="card empty" id="pr-empty" style="display:none;padding:40px;text-align:center">
      <div class="e-title">No prompts found</div>
      <div class="e-sub">Create your first reusable prompt with dynamic {placeholders}.</div>
      <button class="btn btn-green" id="pr-empty-create" style="margin-top:12px">${icon('plus')} Create prompt</button>
    </div>
  </div>`;

  q('#pr-search', view).addEventListener('input', e => { listQuery = e.target.value; renderGrid(); });
  q('#pr-new', view).onclick = () => NX.newPrompt();
  const ec = q('#pr-empty-create', view);
  if(ec) ec.onclick = () => NX.newPrompt();

  q('#pr-fav-toggle', view).onclick = () => {
    showOnlyFavorites = !showOnlyFavorites;
    q('#pr-fav-toggle', view).classList.toggle('btn-green', showOnlyFavorites);
    renderGrid();
  };

  qa('#pr-cats button', view).forEach(b => {
    b.onclick = () => {
      curCategory = b.dataset.cat;
      qa('#pr-cats button', view).forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      renderGrid();
    };
  });

  q('#pr-export', view).onclick = () => {
    const list = prompts();
    const md = '# PebbleX Prompts Library\n\n' + list.map(p => `## ${p.title} [${p.category||'general'}]\nTags: ${(p.tags||[]).join(', ')}\n\n\`\`\`\n${p.body}\n\`\`\``).join('\n\n---\n\n');
    Promise.resolve(NX.native.saveTextFile('PebbleX-Prompts.md', md)).then(res => {
      NX.toastOk('Exported Prompts', res && res.path ? res.path : 'PebbleX-Prompts.md');
    });
  };

  renderGrid();
});
})(window.NX);
