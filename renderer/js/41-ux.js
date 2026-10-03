/* ============================================================
   PebbleX v0.1 — 41-ux.js
   Systemic UX fixes:
     · one overlay stack — Escape always closes the top-most thing
     · skeleton loaders for anything that waits
     · inline form validation (no more shake-only errors)
     · cancelable Pel AI streaming with a real Stop button
     · long-text truncation helpers
     · focus rings for custom controls
   ============================================================ */
(function(NX){
'use strict';
const { h, q, qa, util:U, icon } = NX;

/* ============================================================
   1. OVERLAY STACK — one Escape closes the top-most layer
   ============================================================ */
const Overlays = {
  stack: [],
  register(el, close){
    if(!el) return null;
    const entry = { el, close: close || (()=> el.remove()), dead:false };
    this.stack.push(entry);
    return entry;
  },
  unregister(el){
    for(let i=this.stack.length-1;i>=0;i--){
      if(this.stack[i].el === el || this.stack[i].dead) this.stack.splice(i,1);
    }
  },
  /* Reconcile against the DOM instead of trusting the observer:
     MutationObserver callbacks are async, so an overlay opened and
     closed within one tick would otherwise be missed. */
  reconcile(){
    const root = document.getElementById('nx-overlay-root') || document.body;
    if(root){
      const live = root.querySelectorAll(OVERLAY_SEL);
      for(let i=0;i<live.length;i++){
        const el = live[i];
        if(!this.stack.some(e => e.el === el)) this.register(el, () => this.closeEl(el));
      }
    }
    for(let i=this.stack.length-1;i>=0;i--){
      const e = this.stack[i];
      if(e.dead || !e.el || !document.body.contains(e.el)) this.stack.splice(i,1);
    }
    return this.stack;
  },
  closeEl(el){
    if(!el) return;
    if(el.classList.contains('modal-backdrop')){
      const dlg = el.querySelector('.modal');
      if(dlg && NX.closeModal) NX.closeModal(dlg);
      else el.remove();
    } else el.remove();
  },
  top(){
    return this.reconcile()[this.stack.length-1] || null;
  },
  clear(){ this.stack = []; }
};
NX.overlays = Overlays;

const OVERLAY_SEL = '.qs-backdrop, .gs-backdrop, .cmdk-backdrop, .modal-backdrop';

/* keeps the stack warm between events; top() reconciles regardless */
function watchOverlays(){
  const root = document.getElementById('nx-overlay-root') || document.body;
  if(!root) return;
  new MutationObserver(muts=>{
    muts.forEach(m=>{
      (m.addedNodes || []).forEach(node=>{
        if(node.nodeType === 1 && node.matches && node.matches(OVERLAY_SEL)){
          Overlays.register(node, ()=> Overlays.closeEl(node));
        }
      });
      (m.removedNodes || []).forEach(node=>{
        if(node.nodeType === 1) Overlays.unregister(node);
      });
    });
  }).observe(root, { childList:true });
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchOverlays);
else watchOverlays();

document.addEventListener('keydown', e=>{
  if(e.key !== 'Escape') return;
  const t = Overlays.top();
  if(!t){
    /* last resort: a stray context menu */
    const m = q('.menu');
    if(m) m.remove();
    return;
  }
  /* capture phase: close once and stop the per-overlay handlers */
  e.preventDefault();
  e.stopPropagation();
  t.dead = true;
  try{ t.close(); }catch(err){ console.error(err); }
  Overlays.prune();
}, true);

/* ============================================================
   2. SKELETONS
   ============================================================ */
NX.skeleton = function(rows, opts){
  opts = opts || {};
  const n = rows || 3;
  return `<div class="nx-skel ${opts.block ? 'block' : ''}">
    ${Array.from({ length:n }, (_,i)=>`
      <div class="skel-row">
        ${opts.avatar === false ? '' : '<div class="skel skel-ic"></div>'}
        <div class="skel-lines">
          <div class="skel" style="width:${70 + (i*13)%28}%"></div>
          <div class="skel" style="width:${38 + (i*17)%40}%"></div>
        </div>
      </div>`).join('')}
  </div>`;
};
/* paint a skeleton, then run the real render on the next frame */
NX.withSkeleton = function(host, skeletonRows, realFn){
  if(!host) return;
  host.innerHTML = NX.skeleton(skeletonRows || 3);
  requestAnimationFrame(()=> requestAnimationFrame(()=>{
    try{ realFn(); }catch(e){ console.error('[skeleton]', e); }
  }));
};

/* the AI page gets a skeleton instead of three bouncing dots */
NX.afterRouteRender('ai', function(view){
  const msgs = q('.ai-msgs', view);
  if(!msgs) return;
  const stop = h(`<button class="btn btn-soft btn-sm ai-stop" id="ai-stop" style="display:none">${icon('x')} Stop</button>`);
  const head = q('.ai-root .chat-head', view);
  if(head) head.appendChild(stop);
  stop.onclick = ()=>{
    if(NX.ai) NX.ai.cancel();
    NX.events.emit('ai:stopped');
  };
});

/* ============================================================
   3. INLINE FORM VALIDATION
   ============================================================ */
NX.formError = function(input, message, opts){
  opts = opts || {};
  if(!input) return false;
  const clear = ()=>{
    input.classList.remove('nx-invalid');
    const m = input.parentElement && input.parentElement.querySelector('.nx-field-error');
    if(m) m.remove();
  };
  clear();
  if(!message) return true;
  input.classList.add('nx-invalid');
  const box = h(`<div class="nx-field-error">${icon('alert',13)}<span>${U.esc(message)}</span></div>`);
  const host = input.parentElement;
  if(host) host.appendChild(box);
  if(opts.focus !== false && typeof input.focus === 'function') input.focus();
  try{ NX.sfx.play('err'); }catch(e){}
  return false;
};
NX.formOk = function(input){ return NX.formError(input, null); };

/* required-field rules, applied on submit */
NX.validate = function(form, rules){
  const out = [];
  Object.keys(rules || {}).forEach(sel=>{
    const el = q(sel, form) || q(sel);
    if(!el) return;
    const rule = rules[sel];
    const v = String(el.value == null ? '' : el.value).trim();
    let msg = null;
    if(rule.required && !v) msg = rule.label ? rule.label + ' is required' : 'This is required';
    else if(rule.min && v.length < rule.min) msg = 'Needs at least ' + rule.min + ' characters';
    else if(rule.max && v.length > rule.max) msg = 'Keep it under ' + rule.max + ' characters';
    else if(rule.email && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) msg = 'That email does not look right';
    else if(rule.number && v && isNaN(Number(v))) msg = 'Numbers only';
    if(msg){ NX.formError(el, msg); out.push(sel); }
    else NX.formOk(el);
  });
  return out;
};

/* live-clear the error as soon as the field becomes valid */
document.addEventListener('input', e=>{
  const el = e.target;
  if(!el || !el.classList || !el.classList.contains('nx-invalid')) return;
  if(String(el.value || '').trim()) NX.formOk(el);
});

/* ============================================================
   4. TRUNCATION
   ============================================================ */
NX.truncate = function(text, max){
  const s = String(text == null ? '' : text);
  if(s.length <= max) return s;
  return s.slice(0, Math.max(1, max-1)).trimEnd() + '…';
};

/* ============================================================
   5. AI — cancelable streaming with a skeleton + Stop button
   ============================================================ */
NX.afterRouteRender('ai', function(view){
  const oldInp = q('#ai-input', view);
  const msgs = q('.ai-msgs', view);
  if(!oldInp || !msgs) return;

  /* The module binds its own keydown/click handlers with addEventListener,
     which cannot be un-bound. Clone the nodes so those listeners go away
     and only the cancelable implementation below remains. */
  const inp = oldInp.cloneNode(true);
  oldInp.parentNode.replaceChild(inp, oldInp);
  const sendBtn = q('#ai-send', view);
  let liveBtn = null;
  if(sendBtn){
    liveBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(liveBtn, sendBtn);
    liveBtn.style.opacity = '';
  }

  let busy = false;
  const render = (full, caret) =>
    (NX.chatMd ? NX.chatMd(full) : U.esc(full).replace(/\n/g,'<br>')) + (caret ? '<span class="ai-caret"></span>' : '');

  async function ask(){
    const text = inp.value.trim();
    if(!text || busy) return;
    if(!NX.ai || !NX.ai.ask){ NX.formError(inp, 'Pel AI is not available'); return; }
    NX.formOk(inp);
    busy = true;
    inp.value = '';
    if(liveBtn) liveBtn.style.opacity = .4;

    const mine = h(`<div class="ai-msg user"><div class="am-bubble">${U.esc(text)}</div></div>`);
    msgs.appendChild(mine);
    const reply = h(`<div class="ai-msg ai"><div class="am-bubble">${NX.skeleton(2, { avatar:false })}</div></div>`);
    msgs.appendChild(reply);
    msgs.scrollTop = msgs.scrollHeight;

    const stopBtn = q('#ai-stop', view);
    if(stopBtn) stopBtn.style.display = '';
    let stopped = false;
    const off = NX.events.on('ai:stopped', ()=>{ stopped = true; });

    try{
      const out = await NX.ai.ask(text, {
        onDelta: full =>{
          if(stopped) return;
          reply.innerHTML = `<div class="am-bubble">${render(full, true)}</div>`;
          msgs.scrollTop = msgs.scrollHeight;
        }
      });
      if(stopped){
        reply.innerHTML = `<div class="am-bubble"><span class="ai-typing">stopped — nothing was saved to history</span></div>`;
      } else {
        reply.innerHTML = `<div class="am-bubble">${render(out || '', false)}</div>`;
        const cfg = NX.store.get('ai', { history:[] });
        if(cfg && Array.isArray(cfg.history)){
          cfg.history.push({ role:'user', content:text });
          cfg.history.push({ role:'assistant', content:out || '' });
          NX.store.set('ai', cfg);
        }
      }
    }catch(e){
      /* an abort can surface either as AbortError or as a plain network
         failure, so treat "stopped" as the winner either way */
      if(stopped){
        reply.innerHTML = `<div class="am-bubble"><span class="ai-typing">stopped — nothing was saved to history</span></div>`;
      } else {
        reply.innerHTML = `<div class="am-bubble error">${U.esc(e.message || 'Could not reach the AI service')}</div>`;
        if(NX.net){ NX.net.aiDown = true; NX.events.emit('net:changed'); }
      }
    }finally{
      off();
      if(stopBtn) stopBtn.style.display = 'none';
      if(liveBtn) liveBtn.style.opacity = '';
      msgs.scrollTop = msgs.scrollHeight;
      busy = false;
    }
  }

  if(liveBtn) liveBtn.onclick = ask;
  inp.addEventListener('keydown', e=>{
    if(e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if(!inp.value.trim()){
      NX.formError(inp, 'Ask Pel something first');
      return;
    }
    ask();
  });
});

/* flag AI reachability so the topbar can say so */
NX.events.on('store:ai', ()=>{ if(NX.net){ NX.net.aiDown = false; NX.events.emit('net:changed'); } });
})(window.NX);
