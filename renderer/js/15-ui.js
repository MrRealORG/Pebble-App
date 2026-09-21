/* ============================================================
   Pebble — ui.js : toasts, modals, menus, pickers, prompts
   ============================================================ */
(function (NX) {
  'use strict';
  const { h, esc, icon, iconHTML, clear } = NX;

  /* ------------------------------ TOASTS ------------------------------ */
  const TOAST_ICONS = { success: 'check', error: 'warn', warn: 'warn', info: 'info' };

  function toast(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    const { type = 'info', title, message, duration = 3800, actions = [] } = opts;
    const root = document.getElementById('toasts');
    if (!root) return;

    const el = h('div.toast.' + type, [
      h('span.t-ico', { html: iconHTML(type === 'success' ? 'check' : (TOAST_ICONS[type] || 'info'), 16) }),
      h('div.t-body', [
        title ? h('div.t-title', title) : null,
        message ? h('div.t-msg', { html: esc(message).replace(/\n/g, '<br>') }) : null,
        actions.length ? h('div.t-actions', actions.map(a =>
          h('button.btn.sm' + (a.primary ? '.primary' : '.ghost'), {
            onclick: () => { close(); a.onClick && a.onClick(); }
          }, a.label))) : null
      ]),
      h('button.t-x', { html: iconHTML('x', 13), onclick: () => close() })
    ]);

    let timer = null;
    function close() {
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => el.remove(), 200);
    }
    root.appendChild(el);
    if (duration > 0) timer = setTimeout(close, duration);
    return { close };
  }

  /* ------------------------------ MODAL ------------------------------ */
  let modalStack = [];

  function modal(opts) {
    if (typeof opts === 'string') opts = { title: opts };
    const {
      title, subtitle, body, footer, size = '', onMount, onClose, closeOnBackdrop = true,
      hideFooter = false
    } = opts;

    const root = document.getElementById('modalRoot');
    const prev = modalStack.length ? modalStack[modalStack.length - 1] : null;

    const box = h('div.modal' + (size ? '.' + size : ''), [
      h('div.modal-head', [
        h('h3', title || ''),
        subtitle ? h('span.small.muted', subtitle) : null,
        h('div.spacer'),
        h('button.icon-btn', { html: iconHTML('x', 16), title: 'Close (Esc)', onclick: () => close() })
      ]),
      h('div.modal-body' + (opts.flush ? '.flush' : ''), body || ''),
      hideFooter ? null : h('div.modal-foot', footer || [])
    ]);

    const backdrop = h('div', {
      style: { display: 'contents' }
    });
    backdrop.appendChild(box);
    if (prev) prev.backdrop.style.filter = 'blur(2px) brightness(.8)';
    root.hidden = false;
    root.appendChild(backdrop);

    backdrop.addEventListener('mousedown', e => { if (e.target === backdrop && closeOnBackdrop) close(); });
    // click outside the box
    box.addEventListener('mousedown', e => {
      if (e.target === box.parentElement && closeOnBackdrop) close();
    });

    const api = {
      el: box, backdrop,
      body: box.querySelector('.modal-body'),
      close,
      setTitle: t => { box.querySelector('.modal-head h3').textContent = t; },
      setFooter: nodes => { clear(box.querySelector('.modal-foot')); NX.h(box.querySelector('.modal-foot'), null, nodes); }
    };
    modalStack.push(api);

    function close() {
      const i = modalStack.indexOf(api);
      if (i < 0) return;
      modalStack.splice(i, 1);
      backdrop.remove();
      if (prev) prev.backdrop.style.filter = '';
      if (!modalStack.length) root.hidden = true;
      onClose && onClose();
      document.dispatchEvent(new CustomEvent('nx:modalclosed'));
    }

    if (onMount) onMount(api);
    // focus first input
    setTimeout(() => {
      const f = box.querySelector('input:not([type=hidden]), textarea, select, button.primary');
      if (f) f.focus();
    }, 40);
    return api;
  }

  function closeAllModals() { while (modalStack.length) modalStack[modalStack.length - 1].close(); }
  function closeTopModal() { if (modalStack.length) modalStack[modalStack.length - 1].close(); }

  /* --------------------------- CONFIRM DIALOG --------------------------- */
  function confirm(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    const { title = 'Are you sure?', message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true } = opts;
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
      const m = modal({
        title, size: 'narrow',
        body: h('div', { style: { fontSize: '13px', lineHeight: '1.6', color: 'var(--tx-2)' }, html: esc(message || '').replace(/\n/g, '<br>') }),
        footer: [
          h('button.btn.ghost', { onclick: () => finish(false) }, cancelLabel),
          h('button.btn' + (danger ? '.danger' : '.primary'), { onclick: () => finish(true) }, confirmLabel)
        ],
        onClose: () => finish(false)
      });
    });
  }

  async function confirmDelete(what, extra) {
    if (!NX.store.getSetting('confirmDelete', true)) return true;
    return confirm({
      title: 'Delete ' + what + '?',
      message: (extra || 'This moves it to the trash. You can restore it later from Settings → Trash.') ,
      confirmLabel: 'Delete', cancelLabel: 'Keep it'
    });
  }

  /* --------------------------- PROMPT DIALOG --------------------------- */
  function prompt(opts) {
    if (typeof opts === 'string') opts = { message: opts };
    const { title = 'Enter a value', message = '', value = '', placeholder = '', multiline = false, okLabel = 'OK' } = opts;
    return new Promise(resolve => {
      let done = false;
      const input = multiline
        ? h('textarea.textarea', { rows: 5, placeholder })
        : h('input.input', { placeholder });
      input.value = value || '';
      const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
      const submit = () => { const v = input.value.trim(); if (!v) { input.focus(); return; } finish(v); };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
      });
      const m = modal({
        title, size: 'narrow',
        body: h('div', [message ? h('p.small.muted', { style: { marginBottom: '10px' } }, message) : null, input]),
        footer: [
          h('button.btn.ghost', { onclick: () => finish(null) }, 'Cancel'),
          h('button.btn.primary', { onclick: submit }, okLabel)
        ],
        onClose: () => finish(null)
      });
      setTimeout(() => { input.focus(); input.select(); }, 50);
    });
  }

  /* ------------------------------ FORM MODAL ------------------------------ */
  /**
   * fields: [{ key, label, type, value, options, placeholder, required, hint, min, max, step, rows, onchange }]
   * type: text|textarea|number|date|time|datetime|select|multiselect|checkbox|color|tags|password|email|url
   * Returns a Promise<Object|null>
   */
  function form(opts) {
    const { title, subtitle, fields = [], okLabel = 'Save', cancelLabel = 'Cancel', size = '', onSubmit, wide } = opts;
    return new Promise(resolve => {
      const state = {};
      const nodes = [];
      fields.forEach(f => { state[f.key] = f.value !== undefined ? f.value : (f.type === 'checkbox' ? false : ''); });

      fields.forEach(f => {
        let ctl;
        const id = 'f_' + f.key;
        switch (f.type) {
          case 'textarea':
            ctl = h('textarea.textarea', { id, rows: f.rows || 4, placeholder: f.placeholder || '' });
            ctl.value = state[f.key] || ''; break;
          case 'select':
            ctl = h('select.select', { id },
              (f.options || []).map(o => {
                const opt = typeof o === 'string' ? { value: o, label: o } : o;
                return h('option', { value: opt.value, selected: String(opt.value) === String(state[f.key]) }, opt.label);
              }));
            break;
          case 'checkbox':
            ctl = h('label.switch', [h('input', { type: 'checkbox', id, checked: !!state[f.key] }), h('span.track')]);
            break;
          case 'color':
            ctl = h('div.row-wrap', (f.options || NX.ui.COLORS).map(c =>
              h('span.color-dot' + (c === state[f.key] ? '.on' : ''), {
                style: { background: c }, title: c,
                onclick: e => {
                  state[f.key] = c;
                  e.target.parentNode.querySelectorAll('.color-dot').forEach(d => d.classList.remove('on'));
                  e.target.classList.add('on');
                }
              })));
            break;
          case 'tags': {
            const wrap = h('div.row-wrap', { style: { gap: '5px' } });
            const render = () => {
              clear(wrap);
              (state[f.key] || []).forEach(t => {
                const name = typeof t === 'string' ? t : NX.sel.tagName(t);
                const idv = typeof t === 'string' ? t : t;
                wrap.appendChild(h('span.chip.x', [
                  h('span', name),
                  h('button.chip-x', { html: iconHTML('x', 10), onclick: () => { state[f.key] = state[f.key].filter(x => x !== idv); render(); } })
                ]));
              });
              wrap.appendChild(h('button.btn.xs.subtle', { html: '+ tag', onclick: () => pickTag(v => { if (v) { state[f.key] = (state[f.key] || []).concat([v]); render(); } }) }));
            };
            render(); ctl = wrap; break;
          }
          case 'datetime':
            ctl = h('input.input', { id, type: 'datetime-local' });
            ctl.value = state[f.key] ? String(state[f.key]).slice(0, 16) : ''; break;
          default:
            ctl = h('input.input', { id, type: f.type || 'text', placeholder: f.placeholder || '' });
            if (f.min !== undefined) ctl.min = f.min;
            if (f.max !== undefined) ctl.max = f.max;
            if (f.step !== undefined) ctl.step = f.step;
            if (f.type !== 'color') ctl.value = state[f.key] === null || state[f.key] === undefined ? '' : state[f.key];
        }
        if (f.onchange) ctl.addEventListener('change', e => f.onchange(e, state));
        if (f.oninput) ctl.addEventListener('input', e => f.oninput(e, state));

        const row = f.type === 'checkbox'
          ? h('div.setting-row', [h('div.sr-text', [h('b', f.label), f.hint ? h('span', f.hint) : null]), h('div.sr-ctl', ctl)])
          : h('div.field', [
              h('label', { for: id }, f.label + (f.required ? ' *' : '')),
              ctl,
              f.hint ? h('div.hint', f.hint) : null
            ]);
        if (f.full) row.style.gridColumn = '1 / -1';
        nodes.push(row);
      });

      const readState = () => {
        fields.forEach(f => {
          const el = document.getElementById('f_' + f.key);
          if (!el) return;
          if (f.type === 'checkbox') state[f.key] = el.checked;
          else if (f.type === 'color' || f.type === 'tags') { /* managed directly */ }
          else state[f.key] = el.value;
        });
        return state;
      };

      const submit = () => {
        const s = readState();
        const missing = fields.filter(f => f.required && !String(s[f.key] || '').trim());
        if (missing.length) {
          toast({ type: 'warn', title: 'Missing field', message: missing.map(m => m.label).join(', ') });
          const el = document.getElementById('f_' + missing[0].key); if (el) el.focus();
          return;
        }
        if (onSubmit) { if (onSubmit(s, m) === false) return; }
        finish(s);
      };

      let done = false;
      const finish = v => { if (done) return; done = true; m.close(); resolve(v); };

      const m = modal({
        title, subtitle, size: size || (wide ? 'wide' : ''),
        body: h('div', { style: { display: 'grid', gap: 'var(--sp-3)', gridTemplateColumns: wide ? 'repeat(auto-fit,minmax(230px,1fr))' : '1fr' } }, nodes),
        footer: [
          h('button.btn.ghost', { onclick: () => finish(null) }, cancelLabel),
          h('button.btn.primary', { onclick: submit }, okLabel)
        ],
        onClose: () => finish(null)
      });

      m.el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
      });
    });
  }

  /* ------------------------------ CONTEXT MENU ------------------------------ */
  let openMenu = null;
  function contextMenu(x, y, items) {
    closeMenu();
    const menu = h('div.ctx-menu');
    items.forEach(it => {
      if (it === '-') { menu.appendChild(h('div.ctx-sep')); return; }
      if (it.header) { menu.appendChild(h('div.ctx-head', it.header)); return; }
      menu.appendChild(h('button.ctx-item' + (it.danger ? '.danger' : ''), {
        onclick: () => { closeMenu(); it.onClick && it.onClick(); },
        disabled: it.disabled
      }, [
        it.icon ? h('span.ctx-ico', { html: iconHTML(it.icon, 15) }) : h('span.ctx-ico', it.emoji || ''),
        h('span.ctx-lbl', it.label),
        it.key ? h('span.ctx-key', it.key) : null
      ]));
    });
    document.body.appendChild(menu);
    // keep inside viewport
    const r = menu.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = innerWidth - r.width - 8;
    if (y + r.height > innerHeight - 8) y = Math.max(8, innerHeight - r.height - 8);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    openMenu = menu;
    setTimeout(() => {
      document.addEventListener('mousedown', onDocDown, { once: true });
      document.addEventListener('keydown', onKey, { once: true });
    }, 0);
  }
  function onDocDown(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); else document.addEventListener('mousedown', onDocDown, { once: true }); }
  function onKey(e) { if (e.key === 'Escape') closeMenu(); }
  function closeMenu() {
    if (openMenu) { openMenu.remove(); openMenu = null; }
    document.removeEventListener('mousedown', onDocDown);
  }

  /** Attach a right-click / more-button menu to an element */
  function bindMenu(el, itemsFn) {
    el.addEventListener('contextmenu', e => {
      e.preventDefault(); e.stopPropagation();
      contextMenu(e.clientX, e.clientY, typeof itemsFn === 'function' ? itemsFn() : itemsFn);
    });
  }

  /* ------------------------------ DROPDOWN ------------------------------ */
  function dropdown(anchor, items, opts) {
    opts = opts || {};
    closeMenu();
    const menu = h('div.dropdown-menu' + (opts.right ? '.right' : '') + (opts.up ? '.up' : ''));
    menu.style.position = 'fixed';
    items.forEach(it => {
      if (it === '-') { menu.appendChild(h('div.ctx-sep')); return; }
      if (it.header) { menu.appendChild(h('div.ctx-head', it.header)); return; }
      const node = h('button.ctx-item' + (it.danger ? '.danger' : '') + (it.checked ? '.on' : ''), {
        onclick: () => { if (!it.keepOpen) closeMenu(); it.onClick && it.onClick(); }
      }, [
        it.icon ? h('span.ctx-ico', { html: iconHTML(it.icon, 15) }) : h('span.ctx-ico', it.emoji || ''),
        h('span.ctx-lbl', it.label),
        it.checked ? h('span.ctx-ico', { html: iconHTML('check', 14) }) : (it.key ? h('span.ctx-key', it.key) : null)
      ]);
      if (it.checked) node.style.color = 'var(--brand-1)';
      menu.appendChild(node);
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect(), mr = menu.getBoundingClientRect();
    let x = opts.right ? r.right - mr.width : r.left;
    let y = opts.up ? r.top - mr.height - 5 : r.bottom + 5;
    if (x + mr.width > innerWidth - 8) x = innerWidth - mr.width - 8;
    if (x < 8) x = 8;
    if (y + mr.height > innerHeight - 8) y = Math.max(8, r.top - mr.height - 5);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    openMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', onDocDown, { once: true }), 0);
    return menu;
  }

  /* ------------------------------ TOOLTIP ------------------------------ */
  const tipEl = () => document.getElementById('tooltip');
  let tipTimer = null;
  function showTip(target, text) {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => {
      const t = tipEl(); if (!t || !text) return;
      t.textContent = text; t.hidden = false;
      const r = target.getBoundingClientRect(), tr = t.getBoundingClientRect();
      let x = r.left + r.width / 2 - tr.width / 2;
      let y = r.bottom + 7;
      if (y + tr.height > innerHeight - 6) y = r.top - tr.height - 7;
      t.style.left = Math.max(6, Math.min(x, innerWidth - tr.width - 6)) + 'px';
      t.style.top = y + 'px';
    }, 520);
  }
  function hideTip() { clearTimeout(tipTimer); const t = tipEl(); if (t) t.hidden = true; }

  /** Auto-tooltips for every [title] element */
  function initTooltips() {
    document.addEventListener('mouseover', e => {
      const t = e.target.closest('[title]');
      if (t && t.getAttribute('title')) showTip(t, t.getAttribute('title'));
    });
    document.addEventListener('mouseout', e => { if (e.target.closest('[title]')) hideTip(); });
    document.addEventListener('mousedown', hideTip);
    window.addEventListener('scroll', hideTip, true);
  }

  /* ------------------------------ EMOJI PICKER ------------------------------ */
  const EMOJI_GROUPS = {
    'Frequently used': ['📝','✅','🔥','🚀','💡','📌','⭐','🎯','⏰','📅','🧠','💬','📚','🏠','💰','🌱','⚡','🎉','👀','🙏'],
    'Faces': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐'],
    'Gestures': ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💪'],
    'Nature': ['🌱','🌿','☘️','🍀','🌾','🌺','🌻','🌹','🥀','🌷','🌼','🌸','💐','🍄','🌰','🐚','🌎','🌍','🌏','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌚','🌛','⭐','🌟','✨','⚡','☄️','💥','🔥','🌈','☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','❄️','☃️','💧','💦','🌊'],
    'Food': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🥔','🥕','🌽','🌶️','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀','🍖','🍗','🥩','🥓','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🫔','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧈','🧂','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦀','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','☕','🍵','🧉','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧃','🧋','🥤'],
    'Activity': ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒','🥅','⛳','🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤸','⛹️','🤺','🤼','🤽','🚣','🧗','🚴','🚵','🏇','🎯','🎮','🎲','🧩','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🪕','🎻'],
    'Travel': ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🛴','🚲','🛵','🏍️','🛺','🚨','🚔','🚍','🚘','🚖','🚡','🚠','🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','✈️','🛫','🛬','🛩️','💺','🛰️','🚀','🛸','🚁','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','⚓','🗺️','🗿','🗽','🗼','🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️','🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🏠','🏡','🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦','🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕','🕋','⛩️'],
    'Objects': ['⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳','💎','⚖️','🧰','🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🧱','⛓️','🧲','🔫','💣','🧨','🪓','🔪','🗡️','⚔️','🛡️','🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊','💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣','🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸','🖼️','🛍️','🛒','🎁','🎈','🎏','🎀','🪄','🪅','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨','📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬','📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈','📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️','📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️','📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓'],
    'Symbols': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆','〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾','♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅','🚹','🚺','🚼','⚧','🚻','🚮','🎦','📶','🈁','🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕','🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️','⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽','➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️','↪️','↩️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵','🎶','➕','➖','➗','✖️','♾️','💲','💱','™️','©️','®️','👁️‍🗨️','🔚','🔙','🔛','🔝','🔜','〰️','➰','➿','✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲','▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩','🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔','🔕','📣','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️','🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕','🕖','🕗','🕘','🕙','🕚','🕛']
  };
  let recentEmoji = NX.localStore.get('nexadesk.recentEmoji', []);

  function emojiPicker(anchor, onPick) {
    closeMenu();
    const pop = h('div.emoji-picker');
    const search = h('input.input.ep-search', { placeholder: 'Search emoji…' });
    const cats = h('div.ep-cats');
    const grid = h('div.ep-grid');
    const recentWrap = h('div.ep-recent');
    let activeCat = 'Frequently used';

    function renderRecent() {
      clear(recentWrap);
      if (!recentEmoji.length) { recentWrap.style.display = 'none'; return; }
      recentWrap.style.display = 'flex';
      recentEmoji.slice(0, 16).forEach(e => recentWrap.appendChild(
        h('button', { style: { fontSize: '19px' }, onclick: () => pick(e) }, e)));
    }
    function renderGrid(q) {
      clear(grid);
      let list;
      if (q) {
        list = [];
        // simple name search against a compact unicode name table is heavy; fall back to substring on the emoji's own char
        Object.entries(EMOJI_GROUPS).forEach(([cat, arr]) => arr.forEach(e => {
          if (cat.toLowerCase().includes(q) || e.includes(q)) list.push(e);
        }));
        list = NX.unique(list);
      } else {
        list = EMOJI_GROUPS[activeCat] || [];
      }
      list.slice(0, 900).forEach(e => grid.appendChild(h('button', { title: e, onclick: () => pick(e) }, e)));
      if (!list.length) grid.appendChild(h('div.muted.small', { style: { padding: '12px', gridColumn: '1/-1' } }, 'No matches'));
    }
    function renderCats() {
      clear(cats);
      Object.keys(EMOJI_GROUPS).forEach(c => cats.appendChild(
        h('button' + (c === activeCat ? '.on' : ''), {
          title: c,
          onclick: () => { activeCat = c; search.value = ''; renderCats(); renderGrid(''); }
        }, EMOJI_GROUPS[c][0])));
    }
    function pick(e) {
      recentEmoji = NX.unique([e].concat(recentEmoji)).slice(0, 24);
      NX.localStore.set('nexadesk.recentEmoji', recentEmoji);
      closeMenu();
      onPick(e);
    }

    pop.append(search, recentWrap, cats, grid);
    renderRecent(); renderCats(); renderGrid('');
    search.addEventListener('input', () => renderGrid(search.value.trim().toLowerCase()));
    document.body.appendChild(pop);

    const r = anchor.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    let x = opts_x(r, pr), y = r.bottom + 6;
    if (y + pr.height > innerHeight - 8) y = Math.max(8, r.top - pr.height - 6);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
    openMenu = pop;
    setTimeout(() => { document.addEventListener('mousedown', onDocDown, { once: true }); search.focus(); }, 0);
    return pop;
  }
  function opts_x(r, pr) {
    let x = r.left;
    if (x + pr.width > innerWidth - 8) x = innerWidth - pr.width - 8;
    return Math.max(8, x);
  }

  /* ------------------------------ TAG PICKER ------------------------------ */
  function pickTag(onPick) {
    const store = NX.store;
    const list = store.tags.all().slice().sort((a, b) => a.name.localeCompare(b.name));
    const items = list.map(t => ({
      emoji: '', label: t.name,
      onClick: () => onPick(t.id)
    }));
    items.push('-');
    items.push({ icon: 'plus', label: 'Create new tag…', onClick: async () => {
      const name = await prompt({ title: 'New tag', message: 'Tag name', placeholder: 'e.g. research' });
      if (!name) return;
      const t = store.tags.create({ name: name.trim().toLowerCase(), color: NX.colorFromString(name) });
      onPick(t.id);
    }});
    modal({ title: 'Choose a tag', size: 'narrow', hideFooter: true, body: h('div.list', items.map(it =>
      it === '-' ? h('div.divider') :
      h('button.list-row.selectable', { onclick: () => { closeAllModals(); it.onClick(); } }, [
        it.icon ? h('span', { html: iconHTML(it.icon, 15) }) : null,
        h('span.lr-title', it.label)
      ]))) });
  }

  /* ------------------------------ COLORS ------------------------------ */
  const COLORS = ['#7c6cff','#33b8a3','#4aa8e8','#e86cb0','#f2994a','#4caf7d','#9b6cf0','#eb5757','#e3c14a','#8b8f98','#2f80ed','#56ccf2','#bb6bd9','#27ae60','#f2c94c','#eb5757'];

  /* ------------------------------ IMAGE VIEWER ------------------------------ */
  function viewImage(src, caption) {
    modal({
      title: caption || 'Image', size: 'xwide', hideFooter: true,
      body: h('div', { style: { textAlign: 'center' } }, [h('img', { src, style: { maxWidth: '100%', maxHeight: '72vh', borderRadius: '8px' } })])
    });
  }

  /* ------------------------------ KEYBOARD HINTS ------------------------------ */
  const keyHints = [];
  function registerKey(scope, keys, handler, description) {
    keyHints.push({ scope, keys, handler, description });
  }
  function listKeys(scope) { return keyHints.filter(k => !scope || k.scope === scope || k.scope === 'global'); }

  /* ------------------------------ EXPORT ------------------------------ */
  NX.ui = {
    toast, modal, confirm, confirmDelete, prompt, form,
    contextMenu, bindMenu, dropdown, closeMenu,
    showTip, hideTip, initTooltips,
    emojiPicker, pickTag, viewImage,
    closeAllModals, closeTopModal, isModalOpen: () => modalStack.length > 0,
    COLORS, EMOJI_GROUPS,
    registerKey, listKeys,
    /** Render a small labelled key row */
    kv(label, value, valueClass) {
      return h('div.row', { style: { justifyContent: 'space-between', padding: '3px 0', fontSize: '12.5px' } }, [
        h('span.muted', label), h('span' + (valueClass ? '.' + valueClass : ''), { style: { fontWeight: '550' } }, value)
      ]);
    },
    /** A ring progress indicator */
    ring(pct, size, stroke, color) {
      size = size || 68; stroke = stroke || 7;
      const r = (size - stroke) / 2, c = 2 * Math.PI * r;
      const off = c * (1 - NX.clamp(pct, 0, 100) / 100);
      return h('div.ring', { style: { width: size + 'px', height: size + 'px' } }, [
        h('div', { html: `<svg width="${size}" height="${size}">
          <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg-active)" stroke-width="${stroke}"/>
          <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color || 'var(--brand-1)'}" stroke-width="${stroke}"
            stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
            style="transition:stroke-dashoffset .5s cubic-bezier(.4,0,.2,1)"/></svg>` }),
        h('span.ring-val', { style: { fontSize: (size / 4.6) + 'px' } }, Math.round(pct) + '%')
      ]);
    },
    /** Simple SVG bar chart */
    barChart(points, opts) {
      opts = opts || {};
      const max = Math.max(1, ...points.map(p => Math.abs(p.value)));
      const wrap = h('div.bar-chart', { style: opts.height ? { height: opts.height + 'px' } : null });
      points.forEach(p => {
        const hgt = Math.max(2, Math.abs(p.value) / max * 100);
        wrap.appendChild(h('div.bc-col', [
          h('div.bc-bar' + (p.value < 0 ? '.neg' : ''), {
            style: { height: hgt + '%', background: p.color || undefined },
            title: `${p.label}: ${opts.format ? opts.format(p.value) : p.value}`
          }),
          opts.hideLabels ? null : h('div.bc-label', p.label)
        ]));
      });
      return wrap;
    },
    /** Simple SVG donut */
    donut(slices, size) {
      size = size || 140;
      const total = NX.sum(slices.map(s => s.value)) || 1;
      const stroke = 20, r = (size - stroke) / 2, c = 2 * Math.PI * r;
      let acc = 0;
      const circles = slices.map(s => {
        const len = s.value / total * c;
        const el = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${size/2} ${size/2})"
          style="transition:stroke-dasharray .5s"><title>${NX.esc(s.label)}: ${s.value}</title></circle>`;
        acc += len; return el;
      }).join('');
      return h('div', { html: `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${circles}</svg>` });
    },
    /** Sparkline */
    sparkline(values, w, hgt, color) {
      w = w || 120; hgt = hgt || 30;
      const vals = values.filter(v => v !== null && v !== undefined);
      if (!vals.length) return h('div', { style: { width: w + 'px', height: hgt + 'px' } });
      const min = Math.min(...vals), max = Math.max(...vals), range = (max - min) || 1;
      const pts = values.map((v, i) => {
        if (v === null || v === undefined) return null;
        const x = i / Math.max(1, values.length - 1) * w;
        const y = hgt - ((v - min) / range) * (hgt - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).filter(Boolean);
      return h('div', { html: `<svg width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}">
        <polyline points="${pts.join(' ')}" fill="none" stroke="${color || 'var(--brand-1)'}" stroke-width="1.8"
          stroke-linejoin="round" stroke-linecap="round"/></svg>` });
    },
    avatar(name, color, size, presence) {
      return h('div.avatar' + (size ? '.' + size : ''), {
        style: { background: color || NX.colorFromString(name || '?') },
        title: name
      }, [
        NX.initials(name),
        presence ? h('span.presence.' + presence) : null
      ]);
    },
    emptyState(iconName, title, msg, actionLabel, actionFn) {
      return h('div.empty', [
        h('div.em-ico', { html: iconHTML(iconName || 'inbox', 46) }),
        h('h4', title),
        msg ? h('p', msg) : null,
        actionLabel ? h('button.btn.primary', { onclick: actionFn }, actionLabel) : null
      ]);
    }
  };
})(window.NX);
