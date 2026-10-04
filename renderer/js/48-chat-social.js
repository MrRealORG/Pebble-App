/* ============================================================
   PebbleX — 48-chat-social.js
   People chat: channels, DMs, slash commands, emoji and GIFs.

   Transport-agnostic: everything goes through NX.cloud.chat, so this
   works whether the backend is Realtime Database or a Durable Object.
   With no cloud config the whole surface renders an honest empty state
   and never throws.
   ============================================================ */
(function(NX){
'use strict';

const { q, qa, util:U, icon, h } = NX;

/* per-conversation UI state, kept out of the store on purpose */
const view = {
  path: null,          // current conversation path
  title: '',
  kind: 'channel',     // 'channel' | 'dm'
  messages: [],
  members: [],
  unsub: null,
  users: []            // known people for the DM picker
};

/* ------------------------------------------------------------------ *
 *  Conversations                                                        *
 * ------------------------------------------------------------------ */

function defaultStarterChannels(){
  return [
    { path:'channels/general', title:'general', kind:'channel', code:'GENRAL', lastAt:Date.now() },
    { path:'channels/announcements', title:'announcements', kind:'channel', code:'ANNC01', lastAt:Date.now() - 3600e3 },
    { path:'channels/random', title:'random', kind:'channel', code:'RAND01', lastAt:Date.now() - 7200e3 }
  ];
}

function conversations(){
  const saved = NX.store.get('chat:convos', null);
  if(!saved || !Array.isArray(saved) || !saved.length){
    const defs = defaultStarterChannels();
    NX.store.set('chat:convos', defs);
    return defs;
  }
  return saved;
}
function rememberConversation(c){
  const list = conversations().filter(x => x.path !== c.path);
  list.unshift(Object.assign({ lastAt: Date.now() }, c));
  NX.store.set('chat:convos', list.slice(0, 40));
}

function openChannel(code){
  return NX.cloud.chat.getChannel(code).then(r => {
    if(!r.ok) return r;
    rememberConversation({ path:NX.cloud.channelPath(r.channel.code), title:r.channel.name,
                           kind:'channel', code:r.channel.code });
    return r;
  });
}
function createChannel(name){
  return NX.cloud.chat.createChannel(name || 'New channel').then(r => {
    if(r.ok) rememberConversation({ path:NX.cloud.channelPath(r.code), title:name || 'New channel',
                                    kind:'channel', code:r.code });
    return r;
  });
}
function joinChannel(code){
  return NX.cloud.chat.joinChannel(code).then(r => {
    if(r.ok) rememberConversation({ path:NX.cloud.channelPath(r.channel.code), title:r.channel.name,
                                   kind:'channel', code:r.channel.code });
    return r;
  });
}
/* DM: deterministic path, so both people land in the same thread */
function openDM(other){
  const me = NX.cloud.auth.user;
  if(!me) return Promise.resolve({ ok:false, error:'sign in first' });
  if(!other || !other.uid) return Promise.resolve({ ok:false, error:'no such person' });
  const path = NX.cloud.dmPath(me.uid, other.uid);
  rememberConversation({ path, title:other.name || other.email || 'Direct message', kind:'dm', uid:other.uid });
  return Promise.resolve({ ok:true, path, title:other.name || other.email });
}

/* ------------------------------------------------------------------ *
 *  Rendering                                                            *
 * ------------------------------------------------------------------ */

function ready(){
  const st = NX.cloud ? NX.cloud.status() : { configured:false, signedIn:false };
  if(st.configured && st.signedIn) return true;
  return false;
}

function emptyState(host){
  const st = NX.cloud ? NX.cloud.status() : { configured:false, signedIn:false };
  host.innerHTML = `<div class="empty" style="padding:34px">
    <div class="e-title">${st.signedIn ? 'Cloud chat is not configured' : 'Sign in to chat'}</div>
    <div class="e-sub">${st.signedIn
      ? 'Add your Supabase config in Settings → Cloud. Everything else in Pebble works without it.'
      : 'Chat needs a cloud account. Your PIN login and the rest of the app are unaffected.'}</div>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="btn btn-soft btn-sm" id="cs-settings">Open Cloud settings</button>
      <button class="btn btn-soft btn-sm" id="cs-help">What is this?</button>
    </div>
  </div>`;
  const s = q('#cs-settings', host);
  if(s) s.onclick = ()=> NX.router.go('settings');
  const h2 = q('#cs-help', host);
  if(h2) h2.onclick = ()=> NX.modal({
    title:'Cloud chat', icon:'chat',
    body:`<div class="small" style="line-height:1.6">
      Messages sync across your devices when cloud is on. Sign in with the same email or Google account on the website and the desktop app and you see the same thing. Channels are joined with a 6-character code and
      DMs are private to you and one other person.<br><br>
      Nothing here is required: Pebble is fully usable offline, and your PIN login never changes.</div>`
  });
}

function renderWelcome(box, host){
  if(!box) return;
  box.innerHTML = `
    <div class="cs-welcome-hero">
      <div class="cs-welcome-avatar">💬</div>
      <div class="cs-welcome-title">Welcome to Pebble Messages</div>
      <div class="cs-welcome-sub">Join public discussion channels or start direct messages with your team.</div>
      <div class="cs-welcome-grid">
        <button class="cs-welcome-card" data-channel="channels/general">
          <span class="cs-wc-ic">💬</span>
          <div class="cs-wc-txt">
            <strong># general</strong>
            <span>Team discussions & workspace hub</span>
          </div>
        </button>
        <button class="cs-welcome-card" data-channel="channels/announcements">
          <span class="cs-wc-ic">📢</span>
          <div class="cs-wc-txt">
            <strong># announcements</strong>
            <span>Project news, releases & milestones</span>
          </div>
        </button>
        <button class="cs-welcome-card" data-channel="channels/random">
          <span class="cs-wc-ic">☕</span>
          <div class="cs-wc-txt">
            <strong># random</strong>
            <span>Casual chats & coffee breaks</span>
          </div>
        </button>
        <button class="cs-welcome-card" id="cs-wc-create">
          <span class="cs-wc-ic">➕</span>
          <div class="cs-wc-txt">
            <strong>Create Channel</strong>
            <span>New custom channel with 6-char code</span>
          </div>
        </button>
      </div>
    </div>
  `;
  qa('.cs-welcome-card[data-channel]', box).forEach(btn => {
    btn.onclick = () => select(btn.dataset.channel);
  });
  const createBtn = q('#cs-wc-create', box);
  if(createBtn) createBtn.onclick = () => createFlow(host);
}

function renderShell(host){
  const user = (NX.cloud && NX.cloud.auth && NX.cloud.auth.user) || null;
  const userTxt = user ? (user.name || user.email || 'Cloud connected') : 'Online';

  host.innerHTML = `
    <div class="page cs-page">
      <div class="cs-layout">
        <aside class="cs-side">
          <div class="cs-side-head">
            <div class="tile sm" style="background:var(--green-soft);color:var(--green)">${icon('chat')}</div>
            <div style="min-width:0;flex:1">
              <div class="c-title" style="font-size:13.5px;font-weight:700">Messages</div>
              <div class="c-sub" id="cs-sub" style="display:flex;align-items:center;gap:5px;font-size:11px">
                <span class="cs-status-dot"></span>
                <span class="ellipsis">${U.esc(userTxt)}</span>
              </div>
            </div>
            <button class="icon-btn sm" id="cs-new" data-tip="New channel or DM">${icon('plus')}</button>
          </div>
          <div class="cs-search">
            ${icon('search')}<input id="cs-filter" placeholder="Filter channels & DMs…">
          </div>
          <div class="cs-convos" id="cs-convos"></div>
          <div class="cs-foot">
            <button class="btn btn-soft btn-sm" id="cs-join" style="flex:1" data-tip="Join channel with code">Join with code</button>
            <button class="btn btn-soft btn-sm" id="cs-dm" style="flex:1" data-tip="New direct message">New DM</button>
          </div>
        </aside>

        <section class="cs-main">
          <div class="cs-head">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
              <span class="cs-head-icon" id="cs-head-icon" style="font-size:16px;font-weight:800;color:var(--green-deep)">#</span>
              <div style="min-width:0;flex:1">
                <div class="cs-title" id="cs-title">Select a conversation</div>
                <div class="cs-sub" id="cs-presence">Pick a channel or DM to start chatting</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button class="btn btn-soft btn-sm" id="cs-copy-code" style="display:none;font-size:11px;padding:3px 8px;border-radius:6px;gap:4px">
                ${icon('copy', 12)} <span id="cs-code-txt">Copy code</span>
              </button>
              <button class="icon-btn sm" id="cs-clear" data-tip="Clear view">${icon('refresh')}</button>
            </div>
          </div>
          <div class="cs-msgs" id="cs-msgs"></div>
          <div class="cs-composer">
            <div class="cmdpane-host" id="chat-cmdhost"></div>
            <div class="cs-row">
              <button class="icon-btn" id="cs-attach" data-tip="Attach image or file">${icon('plus', 14)}</button>
              <input type="file" id="cs-file-input" style="display:none" accept="image/*,.pdf,.doc,.docx,.txt,.md,.json">
              <button class="icon-btn" id="cs-mic" data-tip="Voice Dictation (Speech-to-Text)">${icon('mic', 14)}</button>
              <button class="icon-btn" id="cs-emoji" data-tip="Emoji">☺</button>
              <button class="icon-btn" id="cs-gif" data-tip="GIF">GIF</button>
              <textarea id="cs-input" rows="1" placeholder="Message…  (type / for commands)"></textarea>
              <button class="btn btn-green" id="cs-send">${icon('arrowR', 14)} Send</button>
            </div>
            <div class="cs-hint">Enter to send · Shift+Enter for a new line · <b>/</b> for commands · 🎙️ Voice dictation</div>
          </div>
        </section>
      </div>
    </div>`;

  qa('#cs-convos .cs-item').forEach(()=>{});
  wire(host);
  paintConversations();
  if(view.path) select(view.path);
  else {
    const list = conversations();
    if(list.length) select(list[0].path);
    else renderWelcome(q('#cs-msgs', host), host);
  }
}

function paintConversations(){
  const box = q('#cs-convos');
  if(!box) return;
  const filter = String((q('#cs-filter') || {}).value || '').toLowerCase();
  const list = conversations().filter(c => !filter || (c.title || '').toLowerCase().includes(filter));
  if(!list.length){
    box.innerHTML = `<div class="faint tiny" style="padding:16px;text-align:center">
      ${conversations().length ? 'Nothing matches that filter.' : 'No conversations yet. Join a channel or start a DM.'}</div>`;
    return;
  }
  box.innerHTML = list.map(c => `
    <button class="cs-item ${c.path === view.path ? 'on' : ''}" data-path="${U.esc(c.path)}">
      <span class="cs-ic">${icon(c.kind === 'dm' ? 'user' : 'chat', 14)}</span>
      <span style="min-width:0;flex:1">
        <span class="cs-item-t">${c.kind === 'channel' ? '# ' : ''}${U.esc(c.title || 'Conversation')}</span>
        <span class="cs-item-s">${c.kind === 'dm' ? 'Direct message' : 'Channel' + (c.code ? ' · ' + U.esc(c.code) : '')}</span>
      </span>
    </button>`).join('');
  qa('.cs-item', box).forEach(b => { b.onclick = () => select(b.dataset.path); });
}

/* ------------------------------------------------------------------ *
 *  Message pane                                                         *
 * ------------------------------------------------------------------ */

function bubble(m, meUid){
  const mine = (meUid && m.uid === meUid) || m.uid === 'local';
  const t = new Date(m.at || Date.now());
  const when = t.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  let body = U.esc(m.text || '');
  body = body.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="cs-msg-img" loading="lazy">')
             .replace(/\[📎 ([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" download="$1" class="cs-msg-file">📎 $1</a>')
             .replace(/`([^`\n]+)`/g, '<code>$1</code>')
             .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
             .replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>')
             .replace(/\n/g, '<br>');
  const senderName = m.name || (mine ? 'You' : 'Member');
  const avatarBg = U.colorFor(senderName);
  const initials = U.initials(senderName);

  return `<div class="cs-msg ${mine ? 'mine' : ''} ${m.kind === 'action' ? 'action' : ''}">
      ${mine ? '' : `<div class="cs-avatar" style="background:${avatarBg};margin-right:8px">${U.esc(initials)}</div>`}
      <div class="cs-bub">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px">
          <span class="cs-who" style="font-weight:700;color:${mine ? 'var(--green-deep)' : 'var(--ink)'}">${U.esc(senderName)}</span>
          <span class="cs-when">${when}</span>
        </div>
        <div class="cs-text">${body}</div>
        <div class="cs-actions-hover">
          <button class="cs-act-btn cs-copy-btn" data-text="${U.esc(m.text || '')}" title="Copy message">📋</button>
          <button class="cs-act-btn cs-rx-btn" data-rx="👍" title="React 👍">👍</button>
          <button class="cs-act-btn cs-rx-btn" data-rx="❤️" title="React ❤️">❤️</button>
          <button class="cs-act-btn cs-rx-btn" data-rx="🎉" title="React 🎉">🎉</button>
        </div>
      </div>
    </div>`;
}

function paintMessages(){
  const box = q('#cs-msgs');
  if(!box) return;
  const me = (NX.cloud && NX.cloud.auth) ? NX.cloud.auth.user : null;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if(!view.messages.length){
    if(!view.path){
      renderWelcome(box, q('.cs-page'));
    } else {
      box.innerHTML = `<div class="faint small" style="padding:26px;text-align:center">
        No messages yet in <b>${U.esc(view.title)}</b>. Say hello or type <b>/</b> for commands!</div>`;
    }
  }else{
    box.innerHTML = view.messages.map(m => bubble(m, me && me.uid)).join('');
  }
  qa('.cs-copy-btn', box).forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      NX.native.clipboardWrite(b.dataset.text);
      NX.toastOk('Message copied');
    };
  });
  qa('.cs-rx-btn', box).forEach(b => {
    b.onclick = (e) => {
      e.stopPropagation();
      const rx = b.dataset.rx;
      NX.toastOk('Reaction added', rx);
      NX.sfx.play('pop');
    };
  });
  if(nearBottom) box.scrollTop = box.scrollHeight;
}

function select(path){
  if(view.unsub){ try{ view.unsub.unsubscribe(); }catch(e){} view.unsub = null; }
  const convo = conversations().find(c => c.path === path);
  view.path = path;
  view.title = convo ? convo.title : 'general';
  view.kind = convo ? convo.kind : 'channel';

  const t = q('#cs-title'); if(t) t.textContent = (view.kind === 'channel' ? '# ' : '') + view.title;
  const ic = q('#cs-head-icon'); if(ic) ic.textContent = view.kind === 'channel' ? '#' : '👤';
  const p = q('#cs-presence'); if(p) p.textContent = view.kind === 'dm' ? 'Private · just the two of you' : (convo && convo.code ? 'Channel · Code: ' + convo.code : 'Public channel');
  const copyBtn = q('#cs-copy-code');
  const codeTxt = q('#cs-code-txt');
  if(copyBtn && codeTxt){
    if(convo && convo.code){
      copyBtn.style.display = 'inline-flex';
      codeTxt.textContent = convo.code;
      copyBtn.onclick = () => {
        NX.native.clipboardWrite(convo.code);
        NX.toastOk('Channel code copied', convo.code);
      };
    } else copyBtn.style.display = 'none';
  }

  // Restore local cache
  try {
    const cached = NX.store.get('chat:cache:' + path, null);
    if(Array.isArray(cached) && cached.length){
      view.messages = cached;
      paintMessages();
    }
  }catch(e){}

  const me = (NX.cloud && NX.cloud.auth) ? NX.cloud.auth.user : null;
  if(NX.cloud && NX.cloud.chat && typeof NX.cloud.chat.subscribe === 'function'){
    view.unsub = NX.cloud.chat.subscribe(path, (list, state) => {
      if(state !== 'ok'){
        if(state === 'not-signed-in'){
          const b = q('#cs-msgs');
          if(b && !view.messages.length) b.innerHTML = '<div class="faint small" style="padding:26px;text-align:center">Local mode active. Messages will save in your workspace.</div>';
        }
        return;
      }
      if(Array.isArray(list) && list.length){
        view.messages = list;
        NX.store.set('chat:cache:' + path, list.slice(-100));
        view.members = list.slice(-40).map(m => ({ uid:m.uid, name:m.name }));
        paintMessages();
      }
    });
  }
  paintConversations();
}

/* ------------------------------------------------------------------ *
 *  Composer                                                             *
 * ------------------------------------------------------------------ */

function ctx(){
  const me = (NX.cloud && NX.cloud.auth) ? NX.cloud.auth.user : null;
  return {
    path: view.path,
    user: me,
    members: ()=> view.members,
    clear(){ view.messages = []; paintMessages(); },
    close(){ view.path = null; const t = q('#cs-title'); if(t) t.textContent = 'Select a conversation'; paintConversations(); },
    send(text, extra){
      if(!view.path){
        const list = conversations();
        if(list.length) select(list[0].path);
        else return Promise.resolve({ ok:false });
      }
      return (NX.cloud && NX.cloud.chat && typeof NX.cloud.chat.send === 'function')
        ? NX.cloud.chat.send(view.path, text, extra).catch(e => ({ ok:false, error:e }))
        : Promise.resolve({ ok:true });
    }
  };
}

function runCommand(raw){
  const body = raw.replace(/^\//, '');
  const sp = body.indexOf(' ');
  const token = sp === -1 ? body : body.slice(0, sp);
  const arg = sp === -1 ? '' : body.slice(sp + 1).trim();
  const cmd = NX.chatCommands ? NX.chatCommands.find(token) : null;
  if(!cmd){
    NX.toastErr('Chat', 'Unknown command /' + token + ' — try /help');
    return;
  }
  cmd.run(ctx(), arg);
}

const EMOJI = ['😀','😂','🙂','😉','😍','🤔','😴','😎','🥳','🤯','😇','🙃','😡','😭','😤',
               '👍','👎','👏','🙏','💪','🔥','✨','🎉','💯','❤️','💔','👀','🧠','☕','🍕',
               '⚡','🎯','🏆','🚀','💡','📌','📎','✅','❌','⏰','📅','🔒','🌙','☀️','🌧'];

function wire(host){
  const input = q('#cs-input', host);

  /* auto-grow */
  if(input){
    input.addEventListener('input', ()=>{
      input.style.height = 'auto';
      input.style.height = Math.min(140, input.scrollHeight) + 'px';
    });
  }

  /* "/" opens the command palette */
  let palette = null;
  const closePalette = ()=>{ if(palette){ palette.remove(); palette = null; } };

  const maybePalette = ()=>{
    if(!input) return;
    const v = input.value;
    if(v.startsWith('/') && !v.includes('\n')){
      const query = v.slice(1).split(' ')[0];
      closePalette();
      if(NX.chatCommandPalette){
        palette = NX.chatCommandPalette(input, cmd => {
          closePalette();
          input.value = '/' + cmd + ' ';
          input.focus();
        }, query);
      }
    }else closePalette();
  };
  if(input) input.addEventListener('input', maybePalette);

  /* voice dictation */
  const micBtn = q('#cs-mic', host);
  if(micBtn){
    let chatRec = null;
    let isListening = false;
    let baseVal = '';

    function stopChatMic(){
      if(chatRec){ try{ chatRec.stop(); }catch(e){} chatRec = null; }
      isListening = false;
      micBtn.classList.remove('active');
      micBtn.style.color = '';
      micBtn.style.background = '';
      if(input) input.placeholder = 'Message…  (type / for commands)';
    }

    micBtn.onclick = () => {
      if(isListening){ stopChatMic(); if(input) input.focus(); return; }
      const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if(!SpeechClass){
        NX.toastInfo('Microphone', 'Web Speech is not supported in this environment.');
        return;
      }
      try {
        const rec = new SpeechClass();
        chatRec = rec;
        isListening = true;
        baseVal = input ? (input.value ? input.value.trim() + ' ' : '') : '';
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = navigator.language || 'en-US';

        micBtn.classList.add('active');
        micBtn.style.color = '#fff';
        micBtn.style.background = 'var(--red,#ef4444)';
        micBtn.style.borderRadius = '99px';
        if(input){
          input.placeholder = '🎙️ Listening… Speak your message';
          input.focus();
        }
        NX.sfx.play('pop');
        NX.toastInfo('🎙️ Listening…', 'Speak your message. Click mic again or press Enter when done.');

        rec.onresult = (e) => {
          let fin = '';
          let interim = '';
          for (let i = 0; i < e.results.length; ++i) {
            if (e.results[i].isFinal) fin += e.results[i][0].transcript.trim() + ' ';
            else interim += e.results[i][0].transcript;
          }
          if(input){
            input.value = (baseVal + fin + interim).trim();
            input.style.height = 'auto';
            input.style.height = Math.min(140, input.scrollHeight) + 'px';
          }
        };

        rec.onerror = (e) => {
          const err = (e && typeof e.error === 'string') ? e.error : '';
          console.warn('[Chat Speech]', err || 'error');
          stopChatMic();
        };

        rec.onend = () => {
          if(isListening) stopChatMic();
        };

        rec.start();
      } catch(err){
        console.warn('Chat Speech error', err);
        stopChatMic();
      }
    };
  }

  /* file attachment */
  const attachBtn = q('#cs-attach', host);
  const fileInput = q('#cs-file-input', host);
  if(attachBtn && fileInput){
    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files && fileInput.files[0];
      if(!file) return;
      if(file.size > 10 * 1024 * 1024){
        NX.toastErr('File upload', 'File exceeds 10MB limit.');
        fileInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        if(file.type.startsWith('image/')){
          const mdImg = `![${file.name}](${dataUrl})`;
          if(input){
            input.value = (input.value ? input.value + '\n' : '') + mdImg;
            input.focus();
            input.dispatchEvent(new Event('input'));
          }
        } else {
          const mdFile = `[📎 ${file.name}](${dataUrl})`;
          if(input){
            input.value = (input.value ? input.value + '\n' : '') + mdFile;
            input.focus();
            input.dispatchEvent(new Event('input'));
          }
        }
        NX.toastOk('File attached', file.name);
        fileInput.value = '';
      };
      reader.readAsDataURL(file);
    };
  }

  /* emoji picker (safe insert before .cs-row) */
  const emojiBtn = q('#cs-emoji', host);
  if(emojiBtn) emojiBtn.onclick = ()=>{
    const existing = q('#cs-emojibar', host);
    if(existing){ existing.remove(); return; }
    const bar = h(`<div class="cs-emojibar" id="cs-emojibar">
      ${EMOJI.map(e => `<button class="cs-em" data-e="${e}">${e}</button>`).join('')}
    </div>`);
    const row = q('.cs-row', host);
    if(row) row.before(bar);
    qa('.cs-em', bar).forEach(b => b.onclick = ()=>{
      if(input){
        input.value += b.dataset.e;
        input.focus();
        input.dispatchEvent(new Event('input'));
      }
    });
  };

  /* GIF search */
  const gifBtn = q('#cs-gif', host);
  if(gifBtn) gifBtn.onclick = ()=>{
    const key = NX.store.get('chat:gifKey', '') || '';
    if(!key){
      NX.modal({
        title:'GIF search', icon:'image',
        body:`<div class="small" style="line-height:1.6">
          GIF search needs a provider API key. Add one in <b>Settings → Cloud</b> (Tenor or Giphy),
          or paste any image link directly.<br><br>
          Emoji, attachments, and photos work right out of the box.</div>`,
        footer:`<button class="btn btn-soft" id="g-close">Got it</button>`
      });
      const c = q('#g-close');
      if(c) c.onclick = ()=> NX.closeModal && NX.closeModal();
      return;
    }
    const term = window.prompt('Search GIFs for:');
    if(!term) return;
    NX.toastInfo('Chat', 'Searching…');
  };

  /* send */
  const sendBtn = q('#cs-send', host);
  const doSend = ()=>{
    if(!input) return;
    const raw = input.value.trim();
    if(!raw) return;
    if(raw.startsWith('/')){ runCommand(raw); input.value = ''; closePalette(); return; }
    if(raw.length > 4000){ NX.toastErr('Chat', 'Message is too long.'); return; }
    if(!view.path){
      const list = conversations();
      if(list.length) select(list[0].path);
      else return;
    }
    const me = (NX.cloud && NX.cloud.auth) ? NX.cloud.auth.user : null;
    const localMsg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,7),
      uid: me ? me.uid : 'local',
      name: me ? (me.name || me.email) : 'You',
      text: raw,
      at: Date.now()
    };
    view.messages.push(localMsg);
    try{ NX.store.set('chat:cache:' + view.path, view.messages.slice(-100)); }catch(e){}
    paintMessages();
    input.value = '';
    input.style.height = 'auto';
    closePalette();
    NX.sfx.play('pop');

    if(NX.cloud && NX.cloud.chat && typeof NX.cloud.chat.send === 'function'){
      NX.cloud.chat.send(view.path, raw).catch(()=>{});
    }
  };
  if(sendBtn) sendBtn.onclick = doSend;
  if(input) input.addEventListener('keydown', e => {
    if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); doSend(); }
    if(e.key === 'Escape'){ closePalette(); const b = q('#cs-emojibar', host); if(b) b.remove(); }
  });

  /* filter */
  const filter = q('#cs-filter', host);
  if(filter) filter.addEventListener('input', paintConversations);

  /* new conversation */
  const nw = q('#cs-new', host);
  if(nw) nw.onclick = ()=> createFlow(host);

  const join = q('#cs-join', host);
  if(join) join.onclick = ()=>{
    const code = window.prompt('Channel code (6 characters)');
    if(!code) return;
    joinChannel(code.trim()).then(r => {
      if(r.ok){ paintConversations(); select(r.channel ? NX.cloud.channelPath(r.channel.code) : view.path); }
      else NX.toastErr('Chat', r.error || 'Could not join');
    });
  };

  const dm = q('#cs-dm', host);
  if(dm) dm.onclick = ()=> dmFlow(host);

  const clr = q('#cs-clear', host);
  if(clr) clr.onclick = ()=>{ view.messages = []; paintMessages(); };
}

function createFlow(host){
  NX.modal({
    title:'New conversation', icon:'plus',
    body:`<div class="small" style="margin-bottom:10px">Create a channel and share its 6-character code, or start a direct message.</div>
      <label class="nx-field"><span class="nx-field-label">Channel name</span>
        <input id="nc-name" placeholder="e.g. study-group"></label>
      <div id="nc-code-out" style="margin-top:12px"></div>`,
    footer:`<button class="btn btn-soft" id="nc-cancel">Cancel</button>
            <button class="btn btn-green" id="nc-create">Create channel</button>`
  });
  const cancel = q('#nc-cancel'); if(cancel) cancel.onclick = ()=> NX.closeModal && NX.closeModal();
  const create = q('#nc-create');
  if(create) create.onclick = ()=>{
    const name = String((q('#nc-name') || {}).value || '').trim() || 'New channel';
    createChannel(name).then(r => {
      if(!r.ok){ NX.toastErr('Chat', r.error || 'Could not create'); return; }
      NX.closeModal && NX.closeModal();
      paintConversations();
      select(NX.cloud.channelPath(r.code));
      NX.toastOk('Channel created', 'Share this code: ' + r.code);
    });
  };
}

/* People directory: the extension reports who is online, plus anyone you
   have already spoken to. Without that, fall back to a manual uid entry. */
function dmFlow(host){
  const known = [];
  const seen = new Set();
  try{
    (NX.store.get('chat:people', []) || []).forEach(p => { if(p && p.uid && !seen.has(p.uid)){ seen.add(p.uid); known.push(p); } });
  }catch(e){}
  conversations().filter(c => c.kind === 'dm').forEach(c => {
    if(c.uid && !seen.has(c.uid)){ seen.add(c.uid); known.push({ uid:c.uid, name:c.title }); }
  });

  NX.modal({
    title:'Direct message', icon:'user',
    body:`<div class="small" style="margin-bottom:10px">Pick someone you have chatted with before, or paste their user id.</div>
      ${known.length ? `<div class="cs-people">${known.map(p => `
        <button class="cs-person" data-uid="${U.esc(p.uid)}">
          <span class="cs-avatar" style="background:${U.colorFor(p.name || p.uid)}">${U.esc(U.initials(p.name || p.uid))}</span>
          <span style="min-width:0;flex:1;text-align:left">
            <span class="cs-person-t">${U.esc(p.name || p.uid)}</span>
            <span class="cs-person-s">${U.esc(p.uid)}</span>
          </span>
        </button>`).join('')}</div>` : '<div class="faint tiny" style="padding:10px 0">No one yet.</div>'}
      <label class="nx-field" style="margin-top:12px"><span class="nx-field-label">Or paste a user id</span>
        <input id="nd-uid" placeholder="user id"></label>`,
    footer:`<button class="btn btn-soft" id="nd-cancel">Cancel</button>`
  });
  const cancel = q('#nd-cancel'); if(cancel) cancel.onclick = ()=> NX.closeModal && NX.closeModal();
  const start = uid =>{
    if(!uid){ NX.toastErr('Chat', 'Need a user id'); return; }
    openDM({ uid, name:uid.slice(0, 10) }).then(r => {
      if(r.ok){ NX.closeModal && NX.closeModal(); paintConversations(); select(r.path); }
      else NX.toastErr('Chat', r.error || 'Could not open');
    });
  };
  qa('.cs-person').forEach(b => b.onclick = ()=> start(b.dataset.uid));
  const go = q('#nd-go');
  const inp = q('#nd-uid');
  if(inp) inp.addEventListener('keydown', e=>{ if(e.key === 'Enter') start(inp.value.trim()); });
}

/* ------------------------------------------------------------------ *
 *  Route                                                                *
 * ------------------------------------------------------------------ */

NX.routeInShell('messages', 'Messages', 'chat', function(host){
  if(!ready()){ emptyState(host); return; }
  renderShell(host);
});

NX.chatSocial = {
  openChannel, createChannel, joinChannel, openDM,
  conversations, rememberConversation,
  runCommand, select
};

})(window.NX);