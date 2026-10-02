/* ============================================================
   Pebble 3.2 — 24-ai.js
   Pel AI — REAL AI powered by live LLMs (Pollinations gateway,
   no API key needed), with your workspace as context.
   - streaming responses, model picker, chat history
   - graceful offline fallback to on-device workspace answers
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

const AI_API = 'https://text.pollinations.ai/openai';
const MODELS = [
  { id:'openai',      name:'Pel Pro',   sub:'GPT-class · smartest' },
  { id:'openai-fast', name:'Pel Swift', sub:'GPT-class · fastest' },
  { id:'mistral',     name:'Pel Mistral', sub:'Mistral · balanced' },
  { id:'llama',       name:'Pel Llama',  sub:'Llama · open weights' }
];

/* ---------------- workspace snapshot for the system prompt ---------------- */
function workspaceContext(){
  const p = NX.store.get('profile', NX.defaults.profile);
  const today = U.todayKey();
  const tasks = NX.store.get('tasks', []);
  const open = tasks.filter(t=>!t.done).slice(0, 10).map(t=>`- [${t.col}${t.cat?'/'+t.cat:''}] ${t.name}`);
  const notes = NX.store.get('notes', []).slice(0, 8).map(n=>`- ${n.title||'Untitled'}`);
  const tl = (NX.store.get('timeless', {})[today]) || {};
  let prod=0, distr=0, neut=0;
  Object.entries(tl).forEach(([k,a])=>{ if(k==='__hours'||!a||!a.sec) return; if(a.cat==='prod')prod+=a.sec; else if(a.cat==='distr')distr+=a.sec; else neut+=a.sec; });
  const rems = NX.store.get('reminders', []).filter(r=>!r.fired).slice(0,4).map(r=>`- ${r.name} (${U.untilStr(r.when)})`);
  return [
    `You are Pel, the built-in AI assistant of Pebble — a calm all-in-one workspace app (chat, notes, tasks kanban, reminders, Timeless time tracking, desktop widget).`,
    `Current user: ${p.name}. Today is ${new Date().toDateString()}.`,
    `Open tasks (${tasks.filter(t=>!t.done).length}):`, open.length ? open.join('\n') : '- none',
    `Recent notes:`, notes.length ? notes.join('\n') : '- none',
    `Time tracking today: ${U.fmtTime(prod)} productive, ${U.fmtTime(neut)} neutral, ${U.fmtTime(distr)} distraction.`,
    rems.length ? `Upcoming reminders:\n${rems.join('\n')}` : `No upcoming reminders.`,
    `Answer briefly, warm and useful. Use Markdown lightly (bold, short lists, code blocks). When the user asks about their tasks/notes/time, use the data above — never invent tasks that are not listed.`
  ].join('\n');
}

/* ---------------- markdown-lite renderer (escaped + safe) ---------------- */
function mdLite(text){
  let t = U.esc(String(text||''));
  t = t.replace(/```([\s\S]*?)```/g, (_,c)=>`<pre class="md-pre">${c.replace(/^\n/,'')}</pre>`);
  t = t.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
  t = t.replace(/(^|\n)\s*[-•] /g, '$1• ');
  return t.replace(/\n/g, '<br>');
}

/* ---------------- offline fallback brain (from v3.0, still handy) ---------------- */
function tryMath(q){
  const m = q.match(/^(-?[\d.\s()+*/%^-]+)=\s*\??$/);
  if(!m) return null;
  try{
    const expr = m[1].replace(/\^/g,'**').replace(/[^0-9+\-*/().%\s]/g,'');
    if(!expr.trim()) return null;
    const val = Function('"use strict";return(' + expr + ')')();
    if(typeof val === 'number' && isFinite(val)) return `${expr.trim()} = ${Math.round(val*1e6)/1e6}`;
  }catch(e){}
  return null;
}
function offlineAnswer(q){
  const tasks = NX.store.get('tasks', []).filter(t=>!t.done);
  if(/task|todo/i.test(q)) return tasks.length
    ? `You have ${tasks.length} open tasks:\n${tasks.slice(0,6).map(t=>'• '+t.name).join('\n')}`
    : 'No open tasks — inbox zero!';
  if(/time report|focus|timeless|screen time|productivity/i.test(q)){
    const tl = NX.store.get('timeless', {})[U.todayKey()] || {};
    let prod=0, distr=0; Object.values(tl).forEach(a=>{ if(!a||!a.sec)return; if(a.cat==='prod')prod+=a.sec; if(a.cat==='distr')distr+=a.sec; });
    return prod+distr ? `Today: ${U.fmtTime(prod)} productive · ${U.fmtTime(distr)} distraction.` : 'No Timeless data yet today.';
  }
  if(/joke|funny/i.test(q)) return 'Why do programmers prefer dark mode? Because light attracts bugs.';
  if(/motivat|inspire/i.test(q)) return 'Small steps every day. That\'s the whole secret.';
  return null;
}

/* ---------------- the LLM call (streaming) ---------------- */
async function askLLM({ model, messages, onDelta, signal }){
  /* try streaming first */
  try{
    const res = await fetch(AI_API, {
      method:'POST', signal,
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ model, messages, stream:true })
    });
    if(res.ok && res.body){
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', got = '';
      for(;;){
        const { done, value } = await reader.read();
        if(done) break;
        buf += dec.decode(value, { stream:true });
        const lines = buf.split('\n'); buf = lines.pop() || '';
        for(const line of lines){
          const s = line.trim();
          if(!s.startsWith('data:')) continue;
          const payload = s.slice(5).trim();
          if(payload === '[DONE]') continue;
          try{
            const j = JSON.parse(payload);
            const d = j.choices && j.choices[0] && (j.choices[0].delta || j.choices[0].message);
            const piece = d && (d.content || '');
            if(piece){ got += piece; onDelta(got); }
          }catch(e){}
        }
      }
      if(got.trim()) return got;
    }
  }catch(e){ if(e && e.name === 'AbortError') throw e; }

  /* fallback: non-streaming */
  const res2 = await fetch(AI_API, {
    method:'POST', signal,
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ model, messages, stream:false })
  });
  if(!res2.ok) throw new Error('http-' + res2.status);
  const j2 = await res2.json();
  const out = j2.choices && j2.choices[0] && j2.choices[0].message && j2.choices[0].message.content;
  if(!out) throw new Error('empty');
  onDelta(out);
  return out;
}

NX.pelAI = { askLLM, workspaceContext, mdLite, offlineAnswer, MODELS };

/* ---------------- public AI API (omnibox, commands, automations) ----------
   One in-flight call at a time, cancelable. Every consumer goes
   through here so streaming can always be stopped.            */
let liveController = null;
NX.ai = {
  configured(){ return true; },                 /* gateway needs no key */
  label(){ return 'Pel AI · ' + (NX.store.get('ai', {}).model || 'openai'); },
  busy: false,
  cancel(){
    if(!liveController) return false;
    try{ liveController.abort(); }catch(e){}
    liveController = null;
    NX.ai.busy = false;
    return true;
  },
  async ask(text, opts){
    opts = opts || {};
    text = String(text || '').trim();
    if(!text) return '';
    const cfg = NX.store.get('ai', { model:'openai', context:true, history:[] });
    const msgs = [];
    if(cfg.context && !opts.noContext) msgs.push({ role:'system', content: workspaceContext() });
    msgs.push({ role:'user', content:text });

    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    liveController = ctl;
    NX.ai.busy = true;
    try{
      const out = await askLLM({
        model: cfg.model || 'openai',
        messages: msgs,
        signal: opts.signal || (ctl ? ctl.signal : undefined),
        onDelta: full => { if(opts.onDelta) opts.onDelta(full); }
      });
      return out;
    }catch(e){
      if(e && e.name === 'AbortError'){
        if(opts.onAbort) opts.onAbort();
        return '';
      }
      const local = opts.offline !== false ? offlineAnswer(text) : null;
      if(local){ if(opts.onDelta) opts.onDelta(local); return local; }
      throw e;
    }finally{
      liveController = null;
      NX.ai.busy = false;
    }
  }
};

/* ---------------- Pel AI module page ---------------- */
NX.routeInShell('ai', 'Pel AI', 'ai', function(view){
  view.classList.add('full');
  const cfg = NX.store.get('ai', { model:'openai', context:true, history:[] });
  if(!cfg.history) cfg.history = [];
  const SUGGEST = ['Summarize my day','What should I work on next?','Draft a message to my team','Give me a focus plan for 2 hours','Tell me a joke about coding'];

  view.innerHTML = `
  <div class="ai-root anim-in">
    <div class="chat-head" style="flex:none">
      <span class="avatar" style="background:#8B5CF6">P</span>
      <div class="ch-name">Pel <span class="pill green" id="ai-state" style="margin-left:6px">real AI · online</span></div>
      <div class="ch-topic">Real LLM answers with your workspace in context</div>
      <div class="spacer"></div>
      <div class="seg" id="ai-models" role="tablist"></div>
      <button class="icon-btn sm" id="ai-ctx" data-tip="Workspace context">${icon(cfg.context?'eye':'eye')}</button>
      <button class="icon-btn sm" id="ai-clear" data-tip="Clear chat">${icon('trash')}</button>
    </div>
    <div class="ai-msgs" id="ai-msgs"></div>
    <div class="ai-suggest" id="ai-suggest">${SUGGEST.map(s=>`<button class="chip">${U.esc(s)}</button>`).join('')}</div>
    <div class="ai-inputbar">
      <div class="chat-input">
        <textarea id="ai-input" rows="1" placeholder="Ask Pel anything — real answers, your data in context…"></textarea>
        <button class="ci-send" id="ai-send">${icon('send')}</button>
      </div>
    </div>
  </div>`;

  const msgsEl = q('#ai-msgs', view);
  const statePill = q('#ai-state', view);

  /* model picker */
  const mseg = q('#ai-models', view);
  mseg.innerHTML = MODELS.map(m=>`<button role="tab" class="${cfg.model===m.id?'on':''}" data-tip="${U.esc(m.sub)}">${U.esc(m.name.replace('Pel ',''))}</button>`).join('');
  qa('button', mseg).forEach((b,i)=>b.onclick = ()=>{
    cfg.model = MODELS[i].id; NX.store.set('ai', cfg);
    qa('button', mseg).forEach(x=>x.classList.remove('on')); b.classList.add('on');
    NX.toastInfo('Pel switched', MODELS[i].name + ' — ' + MODELS[i].sub);
  });

  q('#ai-ctx', view).onclick = ()=>{
    cfg.context = !cfg.context; NX.store.set('ai', cfg);
    NX.toastInfo('Workspace context', cfg.context ? 'Pel sees your tasks, notes & time.' : 'Pel answers without your data.');
    NX.sfx.play('pop');
  };
  q('#ai-clear', view).onclick = ()=>{
    cfg.history = []; NX.store.set('ai', cfg);
    msgsEl.innerHTML = '';
    greet();
  };

  function bubble(who, me, avColor){
    const el = h(`<div class="ai-msg ${me?'user':'ai'}">
      <span class="avatar" style="background:${avColor}">${U.esc(who.slice(0,1))}</span>
      <div><div class="am-name">${U.esc(who)}</div><div class="am-bubble"></div></div>
    </div>`);
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el.querySelector('.am-bubble');
  }
  function greet(){
    bubble('Pel', false, '#8B5CF6').innerHTML = mdLite(
      `Hi ${NX.store.get('profile', NX.defaults.profile).name}! I'm Pel — now with a **real AI brain** 🧠\nI stream live answers from a full LLM and I can see your tasks, notes and focus time. Ask me anything.`);
  }
  if(cfg.history.length){
    cfg.history.slice(-30).forEach(m=>{ bubble(m.role==='user'?'You':'Pel', m.role==='user', m.role==='user'?NX.store.get('profile',NX.defaults.profile).avatar:'#8B5CF6').innerHTML = mdLite(m.content); });
  } else greet();

  let busy = false;
  async function ask(text){
    text = String(text||'').trim();
    if(!text || busy) return;
    busy = true;
    q('#ai-send', view).style.opacity = .4;
    bubble('You', true, NX.store.get('profile', NX.defaults.profile).avatar).innerHTML = mdLite(text);
    NX.sfx.play('send');
    const inp = q('#ai-input', view); inp.value = '';
    const target = bubble('Pel', false, '#8B5CF6');
    target.innerHTML = '<span class="ai-typing">Pel is thinking<span class="dots"><i>.</i><i>.</i><i>.</i></span></span>';

    const msgs = [];
    if(cfg.context) msgs.push({ role:'system', content: workspaceContext() });
    cfg.history.slice(-12).forEach(m=>msgs.push({ role:m.role, content:m.content }));
    msgs.push({ role:'user', content:text });

    let ok = false;
    try{
      const answer = await askLLM({
        model: cfg.model || 'openai',
        messages: msgs,
        onDelta: (full)=>{ target.innerHTML = mdLite(full) + '<span class="ai-caret"></span>'; msgsEl.scrollTop = msgsEl.scrollHeight; }
      });
      target.innerHTML = mdLite(answer);
      cfg.history.push({ role:'user', content:text });
      cfg.history.push({ role:'assistant', content:answer });
      if(cfg.history.length > 50) cfg.history = cfg.history.slice(-50);
      NX.store.set('ai', cfg);
      statePill.textContent = 'real AI · online'; statePill.className = 'pill green';
      ok = true;
      NX.sfx.play('receive');
    }catch(e){
      const local = offlineAnswer(text) || 'I could not reach the AI service just now — check your internet. Your workspace data stays safe on-device.';
      const withNote = offlineAnswer(text) ? local + '\n\n_(offline mode)_' : local;
      target.innerHTML = mdLite(withNote);
      statePill.textContent = 'offline mode'; statePill.className = 'pill yellow';
      NX.sfx.play('err');
    }
    msgsEl.scrollTop = msgsEl.scrollHeight;
    q('#ai-send', view).style.opacity = 1;
    busy = false;
  }

  q('#ai-send', view).onclick = ()=>ask(q('#ai-input', view).value);
  const inp = q('#ai-input', view);
  inp.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); ask(inp.value); } });
  qa('.ai-suggest .chip', view).forEach(c=>c.onclick = ()=>ask(c.textContent));
});
})(window.NX);
