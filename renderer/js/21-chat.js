/* ============================================================
   Pebble 3.0 — 21-chat.js
   Discord-style chat, Elera finish. Fixes:
   - server rail shows name instantly (tooltip + expanded labels)
   - no async delays on names/avatars (synchronous render)
   - roomy message column, typing indicator, reactions
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

let curServer = null, curChan = null, membersOpen = true;

function seedMessages(srvId, chId){
  const key = srvId + ':' + chId;
  const msgs = NX.store.get('messages', {});
  if(msgs[key]) return;
  const profile = NX.store.get('profile', NX.defaults.profile);
  const seeds = {
    'srv_hub:ch_welcome': [
      { who:'Pebble', avatar:'#7CD56E', bot:true, text:'Welcome to Pebble HQ! This is your own private workspace chat.\n\nEverything here runs 100% on your device — no servers, no waiting.', ts:Date.now()-86400e3 },
      { who:'Pebble', avatar:'#7CD56E', bot:true, text:'Tip: type @Pel to ask the built-in AI right inside any channel.', ts:Date.now()-86400e3+60000 }
    ],
    'srv_hub:ch_general': [
      { who:'Pebble', avatar:'#7CD56E', bot:true, text:'General chatter lives here. Messages save to your workspace storage automatically.', ts:Date.now()-7200e3 }
    ],
    'srv_work:ch_sprint': [
      { who:'Pebble', avatar:'#5EB8FF', bot:true, text:'Sprint board tip: add tasks in Tasks, drag them across columns, and link focus time from Timeless.', ts:Date.now()-5000e3 }
    ],
    'srv_study:ch_notes': [
      { who:'Pebble', avatar:'#8B5CF6', bot:true, text:'Drop your notes here, or open the Notes module for the full editor.', ts:Date.now()-9000e3 }
    ],
    'srv_life:ch_random': [
      { who:'Pebble', avatar:'#E8853D', bot:true, text:'Rule #1 of Life Lounge: relax. Try the Arcade module 🎮', ts:Date.now()-20000e3 }
    ]
  };
  msgs[key] = seeds[key] || [{ who:'Pebble', avatar:'#7CD56E', bot:true, text:'Channel created. Say hi!', ts:Date.now()-3600e3 }];
  NX.store.set('messages', msgs);
}

function serverInitials(name){ return U.initials(name); }

function renderMsgs(host){
  const key = curServer + ':' + curChan;
  const msgs = NX.store.get('messages', {})[key] || [];
  const profile = NX.store.get('profile', NX.defaults.profile);
  const wrap = q('.chat-msgs', host);
  const chan = (NX.store.get('channels', {})[curServer]||[]).find(c=>c.id===curChan);
  q('#ch-topic-txt', host) && (q('#ch-topic-txt', host).textContent = chan ? chan.topic || 'No topic yet' : '');
  if(!msgs.length){
    wrap.innerHTML = `<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${NX.ICON_PATHS.chat}"/></svg>
      <div class="e-title">This is the start of #${U.esc(chan?chan.name:'')}</div><div class="e-sub">Send the first message below.</div></div>`;
    return;
  }
  let html = '', lastDay = '', lastWho = null, lastTs = 0;
  msgs.forEach((m, idx)=>{
    const day = U.todayKey(m.ts);
    if(day !== lastDay){
      lastDay = day; lastWho = null;
      const nice = new Date(m.ts).toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
      html += `<div class="msg-day">${day === U.todayKey() ? 'Today' : U.esc(nice)}</div>`;
    }
    const grouped = m.who === lastWho && (m.ts - lastTs) < 5*60e3;
    const initials = U.initials(m.who);
    const color = m.avatar || U.colorFor(m.who);
    html += `<div class="msg ${grouped?'grouped':''}" data-i="${idx}">
      ${grouped ? '<div style="width:32px;flex:none"></div>' : `<span class="avatar" style="background:${U.esc(color)}">${U.esc(initials)}</span>`}
      <div class="m-body">
        <div class="m-head"><span class="m-author" style="color:${U.esc(color)}">${U.esc(m.who)}</span>${m.bot?'<span class="pill green" style="height:16px;font-size:9px">BOT</span>':''}<span class="m-time">${U.esc(U.hhmm(m.ts))}</span></div>
        <div class="m-text">${fmtText(U.esc(m.text))}</div>
      </div>
      <div class="m-acts">
        <button data-act="copy" data-tip="Copy">⧉</button>
        <button data-act="react" data-tip="React">👍</button>
        <button data-act="ask" data-tip="Ask Pel AI">✨</button>
      </div>
    </div>`;
    lastWho = m.who; lastTs = m.ts;
  });
  wrap.innerHTML = html;
  wrap.scrollTop = wrap.scrollHeight;
  qa('.m-acts button', wrap).forEach(b=>{
    b.onclick = (e)=>{
      const i = +b.closest('.msg').dataset.i;
      const m = (NX.store.get('messages', {})[key]||[])[i];
      if(b.dataset.act === 'copy'){ NX.native.clipboardWrite(m.text).then(()=>NX.toastOk('Copied','Message copied to clipboard.')); }
      if(b.dataset.act === 'react'){ b.textContent = '❤️'; NX.sfx.play('pop'); }
      if(b.dataset.act === 'ask'){ const key0 = curServer + ':' + curChan; streamPelReply(key0, m.text, q('#shell-view')); }
    };
  });
  /* live presence for message authors */
}

function fmtText(t){
  let s = t.replace(/&#39;/g,"'")
    .replace(/@Pel\b/g, '<span class="mention">@Pel</span>')
    .replace(/@([A-Za-z0-9_]{2,16})/g, (mm,n)=> profileName().toLowerCase()===n.toLowerCase() ? `<span class="mention">@${mm.slice(1)}</span>` : mm)
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="chat-img-thumb" onclick="if(window.__nx_openLightbox) window.__nx_openLightbox(this.src, this.alt)">');
  s = s.replace(/\[(?:📎|file:)?\s*([^\]]+?\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|tar|gz|7z|rar|mp3|wav|mp4))\s*(?:\(([^)]+)\))?\]\(([^)]+)\)/gi, (m0, fName, ext, fSize, url) => {
    return `<div class="chat-file-card">
      <span style="font-size:18px">📄</span>
      <div style="flex:1;min-width:0">
        <div class="cf-name" title="${U.esc(fName)}">${U.esc(fName)}</div>
        <div class="cf-meta">${fSize ? U.esc(fSize) + ' · ' : ''}${U.esc(ext.toUpperCase())}</div>
      </div>
      <a href="${url}" download="${U.esc(fName)}" class="btn btn-sm btn-soft" style="height:26px;font-size:11px;padding:0 8px;gap:4px" onclick="event.stopPropagation()">${icon('download', 11)} Save</a>
    </div>`;
  });
  return s;
}
function profileName(){ return NX.store.get('profile', NX.defaults.profile).name; }

window.__nx_openLightbox = function(src, title){
  const body = h(`<div style="display:flex;justify-content:center;align-items:center;padding:8px;max-height:80vh;overflow:auto"><img src="${src}" style="max-width:100%;max-height:75vh;border-radius:8px;box-shadow:var(--sh-card)"></div>`);
  NX.modal({
    title: title || 'Image',
    icon: 'image',
    body,
    footer: [
      { label:'Download', cls:'btn-green', onClick:()=>{
        const a = document.createElement('a'); a.href = src; a.download = title || 'image.png'; a.click();
      }},
      { label:'Close', cls:'btn-soft' }
    ]
  });
};

/* Pel AI inline in chat — REAL streaming LLM */
async function streamPelReply(key, prompt, view){
  const typing = q('#chat-typing', view);
  if(typing) typing.innerHTML = `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span> Pel is thinking…`;
  const msgs = NX.store.get('messages', {});
  msgs[key] = msgs[key] || [];
  const botMsg = { who:'Pel', avatar:'#8B5CF6', bot:true, text:'', ts: Date.now() };
  msgs[key].push(botMsg);
  NX.store.set('messages', msgs);
  renderMsgs(q('#shell-view'));
  const cfg = NX.store.get('ai', { model:'openai', context:true, history:[] });
  const historyMsgs = [];
  if(cfg.context !== false) historyMsgs.push({ role:'system', content: NX.pelAI.workspaceContext() });
  historyMsgs.push({ role:'user', content: prompt });
  let lastPaint = 0;
  try{
    const answer = await NX.pelAI.askLLM({
      model: cfg.model || 'openai',
      messages: historyMsgs,
      onDelta: (full)=>{
        botMsg.text = full;
        const now = Date.now();
        if(now - lastPaint > 120){ lastPaint = now; paintBot(botMsg); }
      }
    });
    botMsg.text = answer || botMsg.text;
  }catch(e){
    botMsg.text = NX.pelAI.offlineAnswer(prompt) || 'I could not reach the AI service just now — check your internet.';
  }
  const m2 = NX.store.get('messages', {});
  m2[key] = m2[key] || [];
  const target = m2[key][m2[key].length-1];
  if(target && target.who === 'Pel') target.text = botMsg.text;
  NX.store.set('messages', m2);
  if(typing) typing.innerHTML = '';
  renderMsgs(q('#shell-view'));
  NX.sfx.play('receive');
}
function paintBot(m){
  const wrap = q('.chat-msgs', q('#shell-view'));
  if(!wrap) return;
  const nodes = qa('.msg', wrap);
  const last = nodes[nodes.length-1];
  if(last){ const t = last.querySelector('.m-text'); if(t) t.innerHTML = fmtText(U.esc(m.text || '…')); }
  wrap.scrollTop = wrap.scrollHeight;
}

function renderMembers(host){
  const bar = q('.chat-members', host);
  if(!bar) return;
  const profile = NX.store.get('profile', NX.defaults.profile);
  const people = [
    { n: profile.name, c: profile.avatar, st:'online' },
    { n:'Pel', c:'#8B5CF6', st:'online', bot:true },
    { n:'Pebble', c:'#7CD56E', st:'online', bot:true }
  ];
  bar.innerHTML = `<div class="cm-h">Online — ${people.length}</div>` + people.map(p=>`
    <div class="chan-member"><span class="avatar sm" style="background:${U.esc(p.c)}">${U.initials(p.n)}<i class="presence"></i></span>
      <span class="ellipsis">${U.esc(p.n)}</span>${p.bot?'<span class="pill green" style="margin-left:auto;height:16px;font-size:9px">BOT</span>':''}</div>`).join('');
}

NX.routeInShell('chat', 'Chat', 'chat', function(view){
  view.classList.add('full');
  const servers = NX.store.get('servers', []);
  if(!curServer || !servers.find(s=>s.id===curServer)) curServer = servers[0] && servers[0].id;
  const chans = NX.store.get('channels', {})[curServer] || [];
  if(!curChan || !chans.find(c=>c.id===curChan)) curChan = chans[0] && chans[0].id;

  view.innerHTML = `
  <div class="chat-root">
    <nav class="srv-rail" aria-label="Servers"></nav>
    <div class="chat-body">
      <aside class="chan-list">
        <div class="chan-server-h"><div class="cs-name" id="cs-name"></div><div class="cs-sub" id="cs-desc"></div></div>
        <div class="chan-scroll" id="chan-scroll"></div>
      </aside>
      <div class="chat-main">
        <div class="chat-head">
          ${icon('hash')}
          <div class="ch-name" id="ch-name"></div>
          <div class="ch-topic" id="ch-topic-txt"></div>
          <div style="flex:1"></div>
          <button class="icon-btn sm" id="ch-simple" data-tip="Ultra simple mode — one clean column">${icon('eye')}</button>
          <button class="icon-btn sm" id="ch-members-toggle" data-tip="Toggle members">${icon('users')}</button>
        </div>
        <div class="chat-msgs"></div>
        <div class="chat-typing" id="chat-typing"></div>
        <div class="chat-inputbar">
          <div class="chat-input">
            <button class="ci-tool" id="ci-attach" data-tip="Attach file or image (/upload)">${icon('upload', 14)}</button>
            <button class="ci-tool" id="ci-emoji" data-tip="Emoji">😀</button>
            <textarea id="ci-input" rows="1" placeholder="Message… (@Pel to ask AI, /upload to attach, Enter to send)"></textarea>
            <button class="ci-send" id="ci-send" data-tip="Send">${icon('send')}</button>
          </div>
        </div>
      </div>
      <aside class="chat-members"></aside>
    </div>
  </div>`;

  /* --- server rail: instant names (synchronous, no waiting) --- */
  const rail = q('.srv-rail', view);
  const home = h(`<button class="srv-tile on" data-srv="__home" data-tip="Pebble HQ" style="background:var(--tile)">${NX.brandMark()}</button>`);
  rail.appendChild(home);
  rail.appendChild(h('<div class="srv-sep"></div>'));
  servers.forEach(s=>{
    const t = h(`<button class="srv-tile" data-srv="${s.id}" data-tip="${U.esc(s.name)}" style="background:${U.esc(s.color)}">
      ${s.icon ? icon(s.icon, 20) : U.esc(serverInitials(s.name))}</button>`);
    rail.appendChild(t);
  });
  const addT = h(`<button class="srv-tile" data-tip="New server" style="background:var(--surface-3);color:var(--ink-2)">${icon('plus')}</button>`);
  rail.appendChild(addT);
  addT.onclick = ()=>{
    const inp = h(`<div style="display:flex;flex-direction:column;gap:12px">
      <div class="field"><label>Server name</label><input class="input" id="ns-name" placeholder="e.g. Side Projects"></div>
    </div>`);
    NX.modal({ title:'Create a server', icon:'chat', body:inp, footer:[
      { label:'Cancel', cls:'btn-soft' },
      { label:'Create', cls:'btn-green', onClick:()=>{
          const name = q('#ns-name', inp).value.trim(); if(!name) return;
          const list = NX.store.get('servers', []);
          const colors = ['#7CD56E','#5EB8FF','#E8853D','#8B5CF6','#E05C9C','#0FA3A3'];
          const srv = { id:U.uid('srv'), name, color:colors[list.length % colors.length], icon:null, desc:'Your new space' };
          list.push(srv);
          const chs = NX.store.get('channels', {}); chs[srv.id] = [{ id:U.uid('ch'), name:'general', topic:'Fresh start' }];
          NX.store.set('servers', list); NX.store.set('channels', chs);
          NX.closeAllModals(); NX.toastOk('Server created', name); NX.router.go('chat');
        } }
    ]});
    setTimeout(()=>q('#ns-name', inp) && q('#ns-name', inp).focus(), 50);
  };
  qa('.srv-tile', rail).forEach(t=>{
    t.onclick = ()=>{
      if(t.dataset.srv === '__home'){ /* already HQ */ }
      curServer = t.dataset.srv === '__home' ? servers[0].id : t.dataset.srv;
      curChan = (NX.store.get('channels', {})[curServer]||[])[0]?.id;
      qa('.srv-tile', rail).forEach(x=>x.classList.remove('on'));
      t.classList.add('on');
      fillServerAndChans(view);
    };
  });

  function fillServerAndChans(view){
    const srv = servers.find(s=>s.id===curServer) || servers[0];
    q('#cs-name', view).innerHTML = `${icon('hash',16)} ${U.esc(srv.name)}`;
    q('#cs-desc', view).textContent = srv.desc || '';
    const chans = NX.store.get('channels', {})[curServer] || [];
    q('#ch-name', view).textContent = chans[0] ? chans[0].name : '';
    const sc = q('#chan-scroll', view);
    sc.innerHTML = `<div class="chan-cat"><span>Text channels</span><button id="ch-add" data-tip="New channel">+</button></div>`;
    chans.forEach(c=>{
      const el = h(`<button class="chan-item ${c.id===curChan?'on':''}">${icon('hash')}<span class="ellipsis">${U.esc(c.name)}</span></button>`);
      el.onclick = ()=>{ curChan = c.id; qa('.chan-item', sc).forEach(x=>x.classList.remove('on')); el.classList.add('on');
        q('#ch-name', view).textContent = c.name;
        seedMessages(curServer, curChan); renderMsgs(view); NX.sfx.play('click'); };
      sc.appendChild(el);
    });
    q('#ch-add', sc).onclick = ()=>{
      const inp = h(`<div class="field"><label>Channel name</label><input class="input" id="nc-name" placeholder="e.g. launch-day"></div>`);
      NX.modal({ title:'New channel', icon:'hash', body:inp, footer:[
        { label:'Cancel', cls:'btn-soft' },
        { label:'Create', cls:'btn-green', onClick:()=>{
            const name = q('#nc-name', inp).value.trim().toLowerCase().replace(/\s+/g,'-'); if(!name) return;
            const all = NX.store.get('channels', {});
            all[curServer] = all[curServer] || [];
            all[curServer].push({ id:U.uid('ch'), name, topic:'' });
            NX.store.set('channels', all); NX.closeAllModals(); NX.router.go('chat');
          } }
      ]});
    };
    seedMessages(curServer, curChan);
    renderMsgs(view);
    renderMembers(view);
  }

  function sendFiles(fileList){
    const files = Array.from(fileList || []);
    if(!files.length) return;
    const key = curServer + ':' + curChan;
    const all = NX.store.get('messages', {});
    all[key] = all[key] || [];
    const profile = NX.store.get('profile', NX.defaults.profile);
    let done = 0;
    files.forEach(f => {
      const rd = new FileReader();
      rd.onload = () => {
        const dataUrl = rd.result;
        const isImg = f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name);
        const formatSize = (bytes) => {
          if(!bytes || bytes <= 0) return '0 B';
          if(bytes < 1024) return bytes + ' B';
          if(bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
          return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };
        const text = isImg ? `![${f.name}](${dataUrl})` : `[📎 ${f.name} (${formatSize(f.size)})](${dataUrl})`;
        all[key].push({ who: profile.name, avatar: profile.avatar, text, ts: Date.now(), me:true });
        done++;
        if(done === files.length){
          NX.store.set('messages', all);
          NX.sfx.play('send');
          renderMsgs(view);
          NX.toastOk('Sent ' + files.length + ' file(s)');
        }
      };
      rd.readAsDataURL(f);
    });
  }

  function pickAndSendFiles(){
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.accept = '*/*';
    inp.style.display = 'none';
    inp.onchange = () => {
      if(inp.files && inp.files.length) sendFiles(inp.files);
      inp.remove();
    };
    document.body.appendChild(inp);
    inp.click();
  }

  function send(){
    const inp = q('#ci-input', view);
    const text = inp.value.trim(); if(!text) return;
    if(text.toLowerCase() === '/upload' || text.toLowerCase() === '/file'){
      inp.value = '';
      pickAndSendFiles();
      return;
    }
    const key = curServer + ':' + curChan;
    const all = NX.store.get('messages', {});
    all[key] = all[key] || [];
    const profile = NX.store.get('profile', NX.defaults.profile);
    all[key].push({ who: profile.name, avatar: profile.avatar, text, ts: Date.now(), me:true });
    NX.store.set('messages', all);
    inp.value = ''; inp.style.height = 'auto';
    NX.sfx.play('send');
    renderMsgs(view);
    if(/^@pel\b/i.test(text)){
      streamPelReply(key, text.replace(/^@pel\b/i,'').trim(), view);
    }
  }
  q('#ci-send', view).onclick = send;
  const attachBtn = q('#ci-attach', view);
  if(attachBtn) attachBtn.onclick = pickAndSendFiles;

  // Drag & drop files onto chat
  const msgsWrap = q('.chat-msgs', view);
  const inputBar = q('.chat-inputbar', view);
  [msgsWrap, inputBar].forEach(zone => {
    if(!zone) return;
    zone.addEventListener('dragover', (e) => {
      if(e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')){
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    zone.addEventListener('drop', (e) => {
      if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){
        e.preventDefault();
        sendFiles(e.dataTransfer.files);
      }
    });
  });

  const inp = q('#ci-input', view);
  inp.addEventListener('keydown', e=>{
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
  });
  inp.addEventListener('input', ()=>{ inp.style.height = 'auto'; inp.style.height = Math.min(130, inp.scrollHeight)+'px'; });
  q('#ci-emoji', view).onclick = (e)=>NX.menu(e.currentTarget, ['😀','😂','🔥','🚀','💚','✨','👍','🙌','😴','🎮','☕','📈'].map(em=>({ label:em, icon:null, onClick:()=>{ inp.value += em; inp.focus(); } })));
  q('#ch-members-toggle', view).onclick = ()=>{
    membersOpen = !membersOpen;
    q('.chat-members', view).style.display = membersOpen ? '' : 'none';
  };
  /* ultra-simple mode: single clean column, channels in a dropdown */
  const simpleRoot = q('.chat-root', view);
  const applySimple = ()=>{
    const on = NX.store.get('ui:chatSimple', false);
    simpleRoot.classList.toggle('simple', on);
    q('.srv-rail', view).style.display = on ? 'none' : '';
    q('.chan-list', view).style.display = on ? 'none' : '';
    q('.chat-members', view).style.display = on ? 'none' : (membersOpen ? '' : 'none');
    q('#ch-simple', view).style.color = on ? 'var(--green)' : '';
  };
  q('#ch-simple', view).onclick = ()=>{
    NX.store.set('ui:chatSimple', !NX.store.get('ui:chatSimple', false));
    applySimple();
    NX.sfx.play('pop');
  };
  applySimple();

  fillServerAndChans(view);
});
})(window.NX);
