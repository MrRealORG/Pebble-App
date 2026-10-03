/* ============================================================
   PebbleX v0.1 — 42-chat.js
   Chat polish for Pel AI:
     · real Markdown rendering (safe — escapes before formatting)
     · proper bubble layout, timestamps, hover actions
     · copy answer, regenerate the last answer
     · scroll-to-bottom affordance
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* ============================================================
   1. SAFE MARKDOWN
   Everything is HTML-escaped first, so nothing from the model can
   inject markup. Only the tags produced here are ever emitted.
   ============================================================ */
function inline(s){
  return U.esc(s)
    .replace(/`([^`\n]+)`/g, (m,c)=> '<code class="md-code">' + c + '</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(\[])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(\[])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (m,t,h)=> '<a class="md-link" href="'+h+'" target="_blank" rel="noopener noreferrer">'+t+'</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<)]+)/g,
      (m,pre,u)=> pre + '<a class="md-link" href="'+u+'" target="_blank" rel="noopener noreferrer">'+u+'</a>');
}

function renderMarkdown(src){
  const blocks = [];
  let text = String(src == null ? '' : src);

  /* fenced code first, stashed behind sentinels */
  text = text.replace(/```([\w+#-]*)[ \t]*\r?\n?([\s\S]*?)```/g, (m, lang, code)=>{
    blocks.push({ lang: lang || '', code: String(code).replace(/\n$/, '') });
    return '\0B' + (blocks.length - 1) + '\0';
  });
  /* inline code stashed too, so list/heading parsing cannot touch it */
  const inlineCode = [];
  text = text.replace(/`([^`\n]+)`/g, (m,c)=>{
    inlineCode.push(c);
    return '\0I' + (inlineCode.length - 1) + '\0';
  });

  const lines = text.split(/\r?\n/);
  const out = [];
  let list = null;           /* 'ul' | 'ol' */
  let para = [];
  let quote = [];

  function flushPara(){
    if(!para.length) return;
    out.push('<p class="md-p">' + inline(para.join(' ')) + '</p>');
    para = [];
  }
  function flushList(){
    if(!list) return;
    out.push('</' + list + '>');
    list = null;
  }
  function flushQuote(){
    if(!quote.length) return;
    out.push('<blockquote class="md-quote">' + inline(quote.join(' ')) + '</blockquote>');
    quote = [];
  }
  function flushAll(){ flushPara(); flushList(); flushQuote(); }

  for(let i=0;i<lines.length;i++){
    const raw = lines[i];
    const line = raw.replace(/\s+$/,'');

    if(/^\0B\d+\0$/.test(line.trim())){
      flushAll();
      const b = blocks[+line.trim().match(/^\0B(\d+)\0$/)[1]];
      out.push('<div class="md-codeblock"><div class="md-codeblock-h"><span>' +
        U.esc(b.lang || 'code') + '</span><button class="md-copy-btn" data-copy-code>Copy</button></div>' +
        '<pre class="md-pre"><code>' + U.esc(b.code) + '</code></pre></div>');
      continue;
    }

    if(!line.trim()){ flushAll(); continue; }

    let m;
    /* horizontal rule */
    if(/^([-*_])\s*(\1\s*){2,}$/.test(line.trim())){
      flushAll();
      out.push('<hr class="md-hr">');
      continue;
    }
    /* heading */
    if((m = line.match(/^(#{1,6})\s+(.*)$/))){
      flushAll();
      const lvl = Math.min(3, m[1].length);
      out.push('<div class="md-h md-h' + lvl + '">' + inline(m[2]) + '</div>');
      continue;
    }
    /* blockquote */
    if((m = line.match(/^>\s?(.*)$/))){
      flushPara(); flushList();
      quote.push(m[1]);
      continue;
    }
    if(quote.length && !/^>/.test(line)) flushQuote();

    /* task list — accepts [x] and the emoji boxes models actually emit */
    if((m = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/))){
      flushPara();
      if(list !== 'ul'){ flushList(); out.push('<ul class="md-ul md-tasks">'); list = 'ul'; }
      const on = m[1].toLowerCase() === 'x';
      out.push('<li class="md-task' + (on ? ' done' : '') + '">' +
        '<span class="md-box">' + (on ? icon('check', 11) : '') + '</span>' +
        '<span>' + inline(m[2]) + '</span></li>');
      continue;
    }
    /* bullet list — ✅ / ☐ / ☑ become real boxes too */
    if((m = line.match(/^\s*[-*+]\s+(.*)$/))){
      flushPara();
      const box = m[1].match(/^\s*(\[([ xX])\]|✅|☑️?|✔️?|⛔|☐️?|□|◻️?)\s*(.*)$/);
      if(box){
        if(list !== 'ul'){ flushList(); out.push('<ul class="md-ul md-tasks">'); list = 'ul'; }
        const glyph = box[2] !== undefined ? box[2].toLowerCase() === 'x' : /[✅☑✔]/.test(box[1]);
        const rest = box[3] !== undefined ? box[3] : box[1].replace(/^\s*\[([ xX])\]\s*/, '');
        out.push('<li class="md-task' + (glyph ? ' done' : '') + '">' +
          '<span class="md-box">' + (glyph ? icon('check', 11) : '') + '</span>' +
          '<span>' + inline(rest) + '</span></li>');
        continue;
      }
      if(list !== 'ul'){ flushList(); out.push('<ul class="md-ul">'); list = 'ul'; }
      out.push('<li>' + inline(m[1]) + '</li>');
      continue;
    }
    /* ordered list */
    if((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))){
      flushPara();
      if(list !== 'ol'){ flushList(); out.push('<ol class="md-ol">'); list = 'ol'; }
      out.push('<li>' + inline(m[2]) + '</li>');
      continue;
    }
    /* table */
    if(/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i+1] || '')){
      flushAll();
      const cells = r => r.trim().replace(/^\||\|$/g,'').split('|').map(c => c.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while(i < lines.length && /\|/.test(lines[i])){ body.push(cells(lines[i])); i++; }
      i--;
      out.push('<div class="md-table-wrap"><table class="md-table"><thead><tr>' +
        head.map(h2 => '<th>' + inline(h2) + '</th>').join('') + '</tr></thead><tbody>' +
        body.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }

    if(list) flushList();
    para.push(line.trim());
  }
  flushAll();

  /* put inline code and code blocks back */
  let html = out.join('');
  html = html.replace(/\0I(\d+)\0/g, (m,i)=> '<code class="md-code">' + U.esc(inlineCode[+i]) + '</code>');
  html = html.replace(/\0B(\d+)\0/g, ()=> '');
  if(!html) html = '<p class="md-p"></p>';
  return html;
}
NX.chatMd = renderMarkdown;

/* ============================================================
   2. BUBBLE DECORATION — timestamps + actions
   ============================================================ */
const seen = new WeakSet();

function decorateMessages(root){
  const msgs = q('.ai-msgs', root) || root;
  if(!msgs) return;
  qa('.ai-msg', msgs).forEach(msg=>{
    /* the streamed bubble has its innerHTML replaced on every token,
       which wipes anything we appended — so only skip when the meta
       row is genuinely still there */
    if(seen.has(msg) && msg.querySelector('.am-meta')) return;
    const bubble = msg.querySelector('.am-bubble') || msg;
    seen.add(msg);

    /* markdown, but never re-render a streaming caret away */
    if(!bubble.querySelector('.md-p, .md-h, .md-ul, .md-ol, .md-codeblock, .md-table')){
      const raw = bubble.textContent;
      const caret = bubble.querySelector('.ai-caret');
      if(raw && raw.trim()){
        bubble.innerHTML = renderMarkdown(raw) + (caret ? '<span class="ai-caret"></span>' : '');
      }
    }

    const isUser = msg.classList.contains('user');
    const meta = h(`<div class="am-meta">
      <span class="am-time">${U.esc(U.hhmm(Date.now()))}</span>
      ${isUser ? '' : `
        <button class="am-act" data-act="copy" data-tip="Copy answer">${icon('copy',13)}</button>
        <button class="am-act" data-act="regen" data-tip="Ask again">${icon('refresh',13)}</button>`}
    </div>`);
    msg.appendChild(meta);

    qa('[data-act]', meta).forEach(b=>b.onclick = ()=>{
      const text = bubble.textContent || '';
      if(b.dataset.act === 'copy'){
        const done = ()=>NX.toastOk('Copied', text.slice(0,40) + (text.length>40?'…':''));
        if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
        else done();
      } else {
        const last = [...msgs.querySelectorAll('.ai-msg.user .am-bubble')].pop();
        const prompt = last ? last.textContent.trim() : '';
        if(!prompt){ NX.toastErr('Nothing to repeat', 'Ask something first'); return; }
        msg.scrollIntoView({ block:'center', behavior:'smooth' });
        const inp = q('.ai-root #ai-input', root) || q('#ai-input');
        if(inp){ inp.value = prompt; inp.focus(); }
        NX.toastInfo('Ask again', prompt.slice(0,48));
      }
    });
  });

  /* copy buttons inside code blocks */
  qa('[data-copy-code]', msgs).forEach(b=>{
    if(b._bound) return;
    b._bound = true;
    b.onclick = ()=>{
      const code = b.closest('.md-codeblock').querySelector('code').textContent;
      const done = ()=>NX.toastOk('Code copied', code.split('\n')[0].slice(0,40));
      if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, done);
      else done();
    };
  });
}

/* ============================================================
   3. SCROLL TO BOTTOM
   ============================================================ */
function wireScroll(root){
  const msgs = q('.ai-msgs', root);
  if(!msgs) return;
  let btn = q('.ai-scroll-end', root);
  if(!btn){
    btn = h(`<button class="ai-scroll-end" data-tip="Jump to latest">${icon('chevD',15)}</button>`);
    const rootEl = q('.ai-root', root);
    if(rootEl) rootEl.appendChild(btn);
  }
  const sync = ()=>{
    const far = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight > 120;
    btn.classList.toggle('show', far);
  };
  msgs.addEventListener('scroll', sync, { passive:true });
  btn.onclick = ()=>{ msgs.scrollTo ? msgs.scrollTo({ top: msgs.scrollHeight, behavior:'smooth' }) : (msgs.scrollTop = msgs.scrollHeight); };
  sync();
}

/* ============================================================
   4. HOOK
   ============================================================ */
NX.afterRouteRender('ai', function(view){
  const msgs = q('.ai-msgs', view);
  if(!msgs) return;
  decorateMessages(view);
  wireScroll(view);
  msgs.scrollTop = msgs.scrollHeight;

  /* keep up as answers stream in */
  if(!msgs._chatObs){
    msgs._chatObs = true;
    new MutationObserver(()=>{
      decorateMessages(view);
      const near = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 200;
      if(near) msgs.scrollTop = msgs.scrollHeight;
      const btn = q('.ai-scroll-end', view);
      if(btn) btn.classList.toggle('show', msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight > 120);
    }).observe(msgs, { childList:true, subtree:true, characterData:true });
  }

  /* suggestion chips: fill the box rather than firing blind */
  const suggest = q('#ai-suggest', view);
  const inp = q('#ai-input', view);
  if(suggest && inp && !suggest._wired){
    suggest._wired = true;
    qa('.chip', suggest).forEach(c=>c.onclick = ()=>{
      inp.value = c.textContent.trim();
      inp.dispatchEvent(new Event('input', { bubbles:true }));
      inp.focus();
      const send = q('#ai-send', view);
      if(send) send.click();
    });
  }
});
})(window.NX);