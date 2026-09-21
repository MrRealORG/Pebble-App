/* ============================================================
   Pebble — utils.js  (DOM helpers, formatting, date math)
   ============================================================ */
window.NX = window.NX || {};

(function (NX) {
  'use strict';

  /* ------------------------------ DOM ------------------------------ */
  const SVGNS = 'http://www.w3.org/2000/svg';

  /**
   * h('div.card#id', {onclick, style}, [children]) -> Element
   * Tag syntax: tag#id.classA.classB
   */
  function h(tag, props, children) {
    let name = 'div', id = null, classes = [];
    if (typeof tag === 'string') {
      const m = tag.match(/^([a-zA-Z0-9-]+)?((?:[.#][^.#]+)*)$/);
      if (m) {
        name = m[1] || 'div';
        (m[2] || '').split(/(?=[.#])/).forEach(t => {
          if (!t) return;
          if (t[0] === '#') id = t.slice(1);
          else classes.push(t.slice(1));
        });
      } else name = tag;
    }
    const el = document.createElement(name);
    if (id) el.id = id;
    if (classes.length) el.className = classes.join(' ');

    if (props && (Array.isArray(props) || typeof props !== 'object' || props instanceof Node)) {
      children = props; props = null;
    }
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = (el.className ? el.className + ' ' : '') + v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }

  function append(parent, children) {
    if (children === null || children === undefined || children === false || children === true) return parent;
    if (Array.isArray(children)) { children.forEach(c => append(parent, c)); return parent; }
    if (children instanceof Node) { parent.appendChild(children); return parent; }
    parent.appendChild(document.createTextNode(String(children)));
    return parent;
  }

  /** Parse an HTML string into a DocumentFragment */
  function frag(html) {
    const t = document.createElement('template');
    t.innerHTML = html == null ? '' : String(html);
    return t.content;
  }

  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  /** Build an SVG element from a path string (24x24 viewBox) */
  function ico(d, size, extra) {
    size = size || 16;
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size); s.setAttribute('height', size);
    s.setAttribute('aria-hidden', 'true');
    if (extra) for (const k in extra) s.setAttribute(k, extra[k]);
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('fill', 'currentColor'); p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }

  /* ------------------------- icon registry ------------------------- */
  const ICONS = {
    dashboard:'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z',
    note:'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm2 16H6V4h7v5h5z',
    notes:'M4 4h11v2H4zm0 5h16v2H4zm0 5h16v2H4zm0 5h11v2H4z',
    task:'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8z',
    kanban:'M4 4h4v16H4zm6 0h4v11h-4zm6 0h4v7h-4z',
    calendar:'M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m0 16H5V10h14zm0-12H5V6h14z',
    clock:'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8m.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
    bell:'M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22m8-5v-1l-1.7-1.9V9.9c0-3-2-5.6-4.8-6.3V3a1.5 1.5 0 0 0-3 0v.6C7.7 4.3 5.7 6.9 5.7 9.9v4.2L4 16v1z',
    timer:'M15 1H9v2h6zm-4 13h2V8h-2zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.96 8.96 0 0 0 12 4a9 9 0 1 0 9 9 8.96 8.96 0 0 0-1.97-5.61M12 20a7 7 0 1 1 7-7 7 7 0 0 1-7 7',
    habit:'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z',
    goal:'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8m0-14a6 6 0 1 0 6 6 6 6 0 0 0-6-6m0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4m0-6a2 2 0 1 0 2 2 2 2 0 0 0-2-2',
    journal:'M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2M8 4h2v5l-1-.75L8 9zm10 16H6V4h1v8l2.5-1.9L12 12V4h6z',
    bookmark:'M17 3H7a2 2 0 0 0-2 2v16l7-3 7 3V5a2 2 0 0 0-2-2',
    contact:'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4m0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4',
    money:'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4',
    chat:'M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2M7 9h10v2H7zm6-3H7V4h6zm4 8H7v-2h10z',
    wiki:'M12 3L1 9l11 6 9-4.91V17h2V9zM5 13.18v4L12 21l7-3.82v-4L12 17z',
    inbox:'M19 3H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3l2 3h4l2-3h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2m-7 9a4 4 0 1 1 4-4 4 4 0 0 1-4 4',
    ai:'M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9zm6.5 11l.95 2.55L22 16.5l-2.55.95L18.5 20l-.95-2.55L15 16.5l2.55-.95zM6 15l.8 2.2L9 18l-2.2.8L6 21l-.8-2.2L3 18l2.2-.8z',
    search:'M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14',
    settings:'M19.14 12.94a7.07 7.07 0 0 0 .06-.94 7.07 7.07 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7 7 0 0 0-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.65 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .61.22l2.39-.96a7 7 0 0 0 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54a7 7 0 0 0 1.62-.94l2.39.96a.5.5 0 0 0 .61-.22l1.92-3.32a.5.5 0 0 0-.12-.64zM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5',
    plus:'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z',
    check:'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
    x:'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
    trash:'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z',
    edit:'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75z',
    copy:'M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m0 16H8V7h11z',
    star:'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
    starO:'M22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28z',
    more:'M12 8a2 2 0 1 0-2-2 2 2 0 0 0 2 2m0 2a2 2 0 1 0 2 2 2 2 0 0 0-2-2m0 6a2 2 0 1 0 2 2 2 2 0 0 0-2-2',
    chevR:'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
    chevD:'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z',
    chevL:'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
    chevU:'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z',
    folder:'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8z',
    folderO:'M20 6h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2m0 12H4V8h16z',
    tag:'M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .59 1.42l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0 0-2.84M7 9A2 2 0 1 1 9 7 2 2 0 0 1 7 9',
    filter:'M10 18h4v-2h-4zM3 6v2h18V6zm3 7h12v-2H6z',
    sort:'M3 18h6v-2H3zm0-5h12v-2H3zm0-7v2h18V6zm15 6.59L16.59 14 18 15.41 20.91 12.5 18 9.59 16.59 11z',
    grid:'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z',
    list:'M3 13h2v-2H3zm0 4h2v-2H3zM3 9h2V7H3zm4 4h14v-2H7zm0 4h14v-2H7zM7 7v2h14V7z',
    table:'M3 3h18v18H3zm8 16v-4H5v4zm0-6V9H5v4zm6 6v-4h-4v4zm0-6V9h-4v4zm2 0h4V9h-4zm4 6v-4h-4v4z',
    drag:'M9 5a1.5 1.5 0 1 1-1.5-1.5A1.5 1.5 0 0 1 9 5m0 7A1.5 1.5 0 1 1 7.5 10.5 1.5 1.5 0 0 1 9 12m0 5.5A1.5 1.5 0 1 1 7.5 16 1.5 1.5 0 0 1 9 17.5M16.5 3.5A1.5 1.5 0 1 0 18 5a1.5 1.5 0 0 0-1.5-1.5m0 7A1.5 1.5 0 1 0 18 12a1.5 1.5 0 0 0-1.5-1.5m0 5.5A1.5 1.5 0 1 0 18 17.5 1.5 1.5 0 0 0 16.5 16',
    sun:'M12 7a5 5 0 1 0 5 5 5 5 0 0 0-5-5m0-5a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1m0 18a1 1 0 0 1 1 1v2a1 1 0 0 1-2 0v-2a1 1 0 0 1 1-1M3 11a1 1 0 0 1 1 1 1 1 0 0 1-1 1H1a1 1 0 0 1 0-2zm18 0h2a1 1 0 0 1 0 2h-2a1 1 0 0 1 0-2M5.6 4.2l1.4 1.4a1 1 0 0 1-1.4 1.4L4.2 5.6a1 1 0 0 1 1.4-1.4m11.4 11.4l1.4 1.4a1 1 0 0 1-1.4 1.4l-1.4-1.4a1 1 0 0 1 1.4-1.4M4.2 18.4l1.4-1.4a1 1 0 0 1 1.4 1.4l-1.4 1.4a1 1 0 0 1-1.4-1.4M17 5.6l1.4-1.4a1 1 0 0 1 1.4 1.4L18.4 7a1 1 0 0 1-1.4-1.4',
    moon:'M12.3 4.9a7.5 7.5 0 0 0 6.8 11.8 8 8 0 1 1-6.8-11.8M12 2a10 10 0 0 0 8.4 15.4A10 10 0 0 0 12.3 3 10.3 10.3 0 0 0 12 2',
    download:'M5 20h14v-2H5zm7-18v12.17l4.59-4.58L18 11l-6 6-6-6 1.41-1.41L12 14.17V2z',
    upload:'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
    save:'M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7zm-5 16a3 3 0 1 1 3-3 3 3 0 0 1-3 3m3-10H5V5h10z',
    refresh:'M17.65 6.35A8 8 0 1 0 19.73 14h-2.08A6 6 0 1 1 12 6a5.94 5.94 0 0 1 4.22 1.78L13 11h7V4z',
    play:'M8 5v14l11-7z',
    pause:'M6 19h4V5H6zm8-14v14h4V5z',
    stop:'M6 6h12v12H6z',
    skipF:'M6 18l8.5-6L6 6zM16 6v12h2V6z',
    skipB:'M6 6h2v12H6zm3.5 6l8.5 6V6z',
    send:'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z',
    link:'M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12M8 13h8v-2H8zm2-6H6v1.9h4A3.1 3.1 0 0 1 13.1 12h1.8A5 5 0 0 0 10 7m4.1 0v1.9h4A3.1 3.1 0 0 1 21.2 12h-1.8a5 5 0 0 0-5-5',
    hash:'M20 10V8h-4V4h-2v4h-4V4H8v4H4v2h4v4H4v2h4v4h2v-4h4v4h2v-4h4v-2h-4v-4zm-6 4h-4v-4h4z',
    at:'M12 2a10 10 0 0 0 0 20 4 4 0 0 0 4-4 6 6 0 1 0-4-10.9V12a1 1 0 0 1-2 0V8H8v4a3 3 0 0 0 6 0v-.3A4 4 0 0 0 16 15a8 8 0 1 1-8-13 8 8 0 0 1 8 8h2A10 10 0 0 0 12 2m0 8a2 2 0 1 1-2 2 2 2 0 0 1 2-2',
    users:'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3m-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3m0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13m8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5',
    lock:'M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2M12 17a2 2 0 1 1 2-2 2 2 0 0 1-2 2m3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0z',
    eye:'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5m0 12.5a5 5 0 1 1 5-5 5 5 0 0 1-5 5m0-8a3 3 0 1 0 3 3 3 3 0 0 0-3-3',
    image:'M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2M8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z',
    code:'M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6z',
    chart:'M5 9.2h3V19H5zm5.6-5h3v14.8h-3zM16.2 13h3v6h-3z',
    pie:'M11 2v9.5A7.5 7.5 0 1 0 21.5 12 7.5 7.5 0 0 0 14 4.5H11M13 2v7h7a7 7 0 0 0-7-7',
    flame:'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14a8 8 0 0 0 16 0C20 8.61 17.41 3.8 13.5.67M11.71 19a3.3 3.3 0 0 1-3.24-3.28c0-1.68 1.28-3.4 3.24-5.28 1.96 1.88 3.24 3.6 3.24 5.28A3.3 3.3 0 0 1 11.71 19',
    zap:'M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21',
    target:'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 4a6 6 0 1 0 6 6 6 6 0 0 0-6-6m0 3a3 3 0 1 0 3 3 3 3 0 0 0-3-3',
    book:'M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2M6 4h5v8l-2.5-1.5L6 12z',
    archive:'M20.54 5.23l-1.39-1.68A1.4 1.4 0 0 0 18.07 3H5.93a1.4 1.4 0 0 0-1.08.55L3.46 5.23A2 2 0 0 0 3 6.55V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.55a2 2 0 0 0-.46-1.32M5.93 5l1.39-1.68h9.36L18.07 5zM12 17.5L6.5 12H10v-2h4v2h3.5z',
    database:'M12 3C7.58 3 4 4.79 4 7v10c0 2.21 3.58 4 8 4s8-1.79 8-4V7c0-2.21-3.58-4-8-4m6 14c0 .5-2.13 2-6 2s-6-1.5-6-2v-2.23c1.61.78 3.72 1.23 6 1.23s4.39-.45 6-1.23zm0-4.5c0 .5-2.13 2-6 2s-6-1.5-6-2V10.77c1.61.78 3.72 1.23 6 1.23s4.39-.45 6-1.23zM12 9c-3.87 0-6-1.5-6-2s2.13-2 6-2 6 1.5 6 2-2.13 2-6 2',
    rocket:'M12 2.5s4.5 2.05 6.5 6.5c.72 1.6.98 3.4.98 3.4L22 15l-3 1-1.5 3.5-2.35-2.05S13.6 19 12 19s-3.15-1.55-3.15-1.55L6.5 19.5 5 16l-3-1 2.52-2.6s.26-1.8.98-3.4C7.5 4.55 12 2.5 12 2.5M12 12a2.5 2.5 0 1 0-2.5-2.5A2.5 2.5 0 0 0 12 12',
    globe:'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m-1 17.93a8 8 0 0 1-4.9-4.06A12.6 12.6 0 0 0 11 17v2.93M4.26 14a7.8 7.8 0 0 1 0-4h3.38a16.6 16.6 0 0 0 0 4zm2.82 5.5A8 8 0 0 1 4.6 16h2.6a11 11 0 0 0 .9 2.63zM7.08 8A8 8 0 0 1 11 4.07V7a13 13 0 0 0-2.48.42zm9.84 6a12.6 12.6 0 0 0 0-4H19.74a7.8 7.8 0 0 1 0 4zM13 4.07A8 8 0 0 1 16.92 8l-1.44-.24A13 13 0 0 0 13 7zm0 15.86V17a12.6 12.6 0 0 1 2.48-.42A8 8 0 0 1 13 19.93M14.34 14a16.6 16.6 0 0 0 0-4h2.58a16.6 16.6 0 0 1 0 4z',
    bolt:'M7 2v11h3v9l7-12h-4l4-8z',
    shield:'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5z',
    key:'M12.65 10A6 6 0 1 0 6 16a5.94 5.94 0 0 0 4-.15V19h3v3h4v-4h4v-4h-6.35M6 14a4 4 0 1 1 4-4 4 4 0 0 1-4 4',
    palette:'M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01a1.49 1.49 0 0 1 1.1-2.49H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8m-5.5 9a1.5 1.5 0 1 1 1.5-1.5A1.5 1.5 0 0 1 6.5 12m3-4A1.5 1.5 0 1 1 11 6.5 1.5 1.5 0 0 1 9.5 8m5 0A1.5 1.5 0 1 1 16 6.5 1.5 1.5 0 0 1 14.5 8m3 4A1.5 1.5 0 1 1 19 10.5 1.5 1.5 0 0 1 17.5 12',
    layers:'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    smile:'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8M8.5 11A1.5 1.5 0 1 0 10 9.5 1.5 1.5 0 0 0 8.5 11m5.5 0A1.5 1.5 0 1 0 15.5 9.5 1.5 1.5 0 0 0 14 11m-2 6.5c1.75 0 3.27-1.07 3.91-2.59H8.09c.64 1.52 2.16 2.59 3.91 2.59',
    paperclip:'M16.5 6v11.5a4.5 4.5 0 0 1-9 0V5a3 3 0 0 1 6 0v10.5a1.5 1.5 0 0 1-3 0V6H9v9.5a3 3 0 0 0 6 0V5a4.5 4.5 0 0 0-9 0v12.5a6 6 0 0 0 12 0V6z',
    history:'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7 6.96 6.96 0 0 1-4.95-2.05l-1.41 1.41A9 9 0 1 0 13 3m-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z',
    sparkle:'M12 2l1.6 4.7L18 8.3l-4.4 1.6L12 14.6l-1.6-4.7L6 8.3l4.4-1.6zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8zM5 15l.7 1.8L7.5 17.5l-1.8.7L5 20l-.7-1.8L2.5 17.5l1.8-.7z',
    brain:'M13 3a3 3 0 0 0-3 3v1a3 3 0 0 0-2 5.24V13a3 3 0 0 0 2 2.83V17a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3m6 8a3 3 0 0 1-1 5.83V17a2 2 0 0 1-4 0V6a2 2 0 0 1 2-2 3 3 0 0 1 3 3v1a3 3 0 0 1 1 3',
    pin:'M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5a3 3 0 0 1-3 3v2h5.97v7l1 1 1-1v-7H19v-2a3 3 0 0 1-3-3',
    flag:'M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z',
    repeat:'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
    minus:'M19 13H5v-2h14z',
    info:'M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 10 10A10 10 0 0 0 12 2m0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8',
    warn:'M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z',
    logout:'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4z',
    columns:'M3 5v14h18V5zm5 12H5V7h3zm6 0H9.5V7H14zm6 0h-3.5V7H20z',
    wand:'M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.5L17 16.5l1.4 2.5L17 21.5l2.5-1.4 2.5 1.4-1.4-2.5 1.4-2.5zM20.6 3.4L19 2l-1.4 2.5L19 7l1.6-2.5zm-2.2 8.2L4.5 3.5 3 5l13.9 13.9z',
    eyeOff:'M12 7a5 5 0 0 1 5 5 4.9 4.9 0 0 1-.58 2.3l2.91 2.91A11.8 11.8 0 0 0 23 12c-1.73-4.39-6-7.5-11-7.5a11 11 0 0 0-3.62.61l2.17 2.17A4.9 4.9 0 0 1 12 7M2.71 3.16L1.29 4.58l2.19 2.19C1.73 8.11.5 9.94 1 12c1.73 4.39 6 7.5 11 7.5a11.4 11.4 0 0 0 4.16-.79l2.94 2.94 1.41-1.41zM12 17a5 5 0 0 1-5-5 4.9 4.9 0 0 1 .73-2.62l6.89 6.89A4.9 4.9 0 0 1 12 17',
    trophy:'M18 4V2H6v2H2v5a5 5 0 0 0 5 5h.1a5 5 0 0 0 3.9 3.87V19H8v3h8v-3h-3v-2.13A5 5 0 0 0 16.9 14h.1a5 5 0 0 0 5-5V4zM4 9V6h2v6a3 3 0 0 1-3-3zm16 0a3 3 0 0 1-3 3V6h2z',
    mic:'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3m5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z',
    volume:'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77',
    island:'M8 5h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 5m0 2a3 3 0 0 0 0 6h8a3 3 0 0 0 0-6z',
    game:'M7 8h10a5 5 0 0 1 5 5v3a3 3 0 0 1-5.6 1.5L15.5 16h-7l-.9 1.5A3 3 0 0 1 2 16v-3a5 5 0 0 1 5-5m0 3v2H5v2h2v2h2v-2h2v-2H9v-2zm9 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m-3-2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3'
  };

  /** icon('note', 18) -> svg element ; icon('note') -> svg ; iconHTML('note') -> string */
  function icon(name, size) { return ico(ICONS[name] || ICONS.info, size || 16); }
  function iconHTML(name, size) {
    size = size || 16;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path fill="currentColor" d="${ICONS[name] || ICONS.info}"/></svg>`;
  }
  function iconPath(name) { return ICONS[name] || ICONS.info; }

  /* --------------------------- formatting --------------------------- */
  const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return s == null ? '' : String(s).replace(/[&<>"']/g, c => escMap[c]); }
  function unesc(s) {
    const d = document.createElement('textarea'); d.innerHTML = s == null ? '' : String(s); return d.value;
  }
  function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }

  function pad(n, w) { w = w || 2; return String(n).padStart(w, '0'); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
  function round(v, p) { const f = Math.pow(10, p || 0); return Math.round(v * f) / f; }

  function fmtNum(n, dec) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return Number(n).toLocaleString(undefined, {
      minimumFractionDigits: dec || 0, maximumFractionDigits: dec === undefined ? 0 : dec
    });
  }
  function compactNum(n) {
    n = Number(n) || 0;
    const a = Math.abs(n);
    if (a >= 1e9) return round(n / 1e9, 1) + 'B';
    if (a >= 1e6) return round(n / 1e6, 1) + 'M';
    if (a >= 1e3) return round(n / 1e3, 1) + 'k';
    return String(Math.round(n));
  }
  function fmtBytes(b) {
    b = Number(b) || 0;
    if (b < 1024) return b + ' B';
    const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
    do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
    return round(b, b < 10 ? 2 : 1) + ' ' + u[i];
  }

  /* ------------------------------ dates ----------------------------- */
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTHS_S = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_S = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    if (typeof v === 'number') return new Date(v);
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  function ymd(d) { d = toDate(d) || new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function ymdhm(d) { d = toDate(d); if (!d) return ''; return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function todayStr() { return ymd(new Date()); }
  function startOfDay(d) { const x = toDate(d) || new Date(); x.setHours(0, 0, 0, 0); return x; }
  function endOfDay(d) { const x = toDate(d) || new Date(); x.setHours(23, 59, 59, 999); return x; }
  function startOfWeek(d, weekStartsOn) {
    const x = startOfDay(d); const ws = weekStartsOn === undefined ? 1 : weekStartsOn;
    const diff = (x.getDay() - ws + 7) % 7; x.setDate(x.getDate() - diff); return x;
  }
  function startOfMonth(d) { const x = startOfDay(d); x.setDate(1); return x; }
  function addDays(d, n) { const x = toDate(d) || new Date(); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) { const x = toDate(d) || new Date(); const day = x.getDate(); x.setMonth(x.getMonth() + n); if (x.getDate() < day) x.setDate(0); return x; }
  function addMinutes(d, n) { const x = toDate(d) || new Date(); x.setMinutes(x.getMinutes() + n); return x; }
  function diffDays(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); }
  function isSameDay(a, b) { a = toDate(a); b = toDate(b); return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function isToday(d) { return isSameDay(d, new Date()); }
  function isTomorrow(d) { return isSameDay(d, addDays(new Date(), 1)); }
  function isYesterday(d) { return isSameDay(d, addDays(new Date(), -1)); }
  function isPast(d) { return toDate(d) && toDate(d).getTime() < Date.now(); }
  function isWeekend(d) { const x = toDate(d); return x && (x.getDay() === 0 || x.getDay() === 6); }

  function fmtDate(v, style) {
    const d = toDate(v); if (!d) return '';
    style = style || 'medium';
    const opts = {
      short:  { month: 'numeric', day: 'numeric', year: '2-digit' },
      medium: { month: 'short', day: 'numeric', year: 'numeric' },
      long:   { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
      monthDay: { month: 'short', day: 'numeric' },
      weekday: { weekday: 'short' }
    }[style] || {};
    return d.toLocaleDateString(undefined, opts);
  }
  function fmtTime(v, withSeconds) {
    const d = toDate(v); if (!d) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: withSeconds ? '2-digit' : undefined });
  }
  function fmtDateTime(v, style) {
    const d = toDate(v); if (!d) return '';
    const dateOnly = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (dateOnly) return fmtDate(d, style);
    return fmtDate(d, style) + ', ' + fmtTime(d);
  }
  function relTime(v) {
    const d = toDate(v); if (!d) return '';
    const diff = (Date.now() - d.getTime()) / 1000;
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (abs < 60) return diff >= 0 ? 'just now' : 'in a few seconds';
    if (abs < 3600) return rtf.format(Math.round(-diff / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(-diff / 3600), 'hour');
    if (abs < 604800) return rtf.format(Math.round(-diff / 86400), 'day');
    if (abs < 2592000) return rtf.format(Math.round(-diff / 604800), 'week');
    if (abs < 31536000) return rtf.format(Math.round(-diff / 2592000), 'month');
    return rtf.format(Math.round(-diff / 31536000), 'year');
  }
  function dueLabel(v) {
    const d = toDate(v); if (!d) return '';
    const days = diffDays(d, new Date());
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days === -1) return 'Yesterday';
    if (days < -1) return `${Math.abs(days)}d overdue`;
    if (days < 7) return DAYS_S[d.getDay()];
    return fmtDate(d, 'medium');
  }
  function fmtDuration(mins) {
    mins = Math.max(0, Math.round(Number(mins) || 0));
    const h = Math.floor(mins / 60), m = mins % 60;
    if (!h) return `${m}m`;
    if (!m) return `${h}h`;
    return `${h}h ${m}m`;
  }
  function fmtClock(secs) {
    secs = Math.max(0, Math.floor(secs));
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  /* ------------------------------ ids ------------------------------- */
  let _seq = 0;
  function uid(prefix) {
    _seq = (_seq + 1) % 46656;
    return (prefix ? prefix + '_' : '') + Date.now().toString(36) + _seq.toString(36) +
           Math.random().toString(36).slice(2, 6);
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function slug(s) {
    return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }

  /* ---------------------------- misc utils -------------------------- */
  function debounce(fn, ms) {
    let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms || 200); };
  }
  function throttle(fn, ms) {
    let last = 0, t; return function () {
      const a = arguments, c = this, now = Date.now();
      const remain = (ms || 100) - (now - last);
      if (remain <= 0) { clearTimeout(t); last = now; fn.apply(c, a); }
      else clearTimeout(t), t = setTimeout(() => { last = Date.now(); fn.apply(c, a); }, remain);
    };
  }
  function deepClone(o) {
    try { return structuredClone(o); }
    catch (e) { return JSON.parse(JSON.stringify(o)); }
  }
  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {}
      ta.remove(); return ok;
    }
  }
  function hashCode(str) {
    let h = 0; str = String(str || '');
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return h;
  }
  /** Deterministic pleasant colour from any string */
  function colorFromString(str, palette) {
    const PALETTE = palette || ['#7c6cff','#33b8a3','#4aa8e8','#e86cb0','#f2994a','#4caf7d','#9b6cf0','#eb5757','#e3c14a','#5bc0be'];
    const h = Math.abs(hashCode(str));
    return PALETTE[h % PALETTE.length];
  }
  function initials(name) {
    const parts = String(name || '?').trim().split(/[\s._-]+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function groupBy(arr, keyFn) {
    const map = new Map();
    arr.forEach(item => {
      const k = keyFn(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    });
    return map;
  }
  function sortBy(arr, keyFn, desc) {
    return arr.slice().sort((a, b) => {
      const ka = keyFn(a), kb = keyFn(b);
      if (ka === kb) return 0;
      if (ka === null || ka === undefined) return 1;
      if (kb === null || kb === undefined) return -1;
      const r = ka < kb ? -1 : 1;
      return desc ? -r : r;
    });
  }
  function unique(arr) { return Array.from(new Set(arr)); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function randomOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function move(arr, from, to) {
    const a = arr.slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a;
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function qs(name) { return new URLSearchParams(location.search).get(name); }

  /** LocalStorage-backed JSON cache (used when not running in Electron) */
  const localStore = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } },
    remove(key) { try { localStorage.removeItem(key); } catch (e) {} },
    size() {
      let n = 0;
      try { for (const k in localStorage) if (Object.prototype.hasOwnProperty.call(localStorage, k)) n += (localStorage[k] || '').length + k.length; } catch (e) {}
      return n;
    }
  };


  /* ============================================================
     CUSTOM SVG GLYPH LIBRARY — hand-drawn stroke icons.
     Replaces emoji across the entire UI chrome.
     ============================================================ */
  const GLYPHS = {
    pebble:'M4 14c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8-8-3.6-8-8Zm3.5-.6c0-2.5 2-4.4 4.5-4.4',
    stone:'M5 15.5 8 8l5-3 5 4 1 6.5-4.5 4H9Z M9.5 12.5l2-2.5 3 1.5',
    flame:'M12 3c1 3-3 4.5-3 8a3.5 3.5 0 0 0 7 0c0-1.5-.7-2.6-1.5-3.5-.3 1-.8 1.5-1.5 2 .4-2.2-.2-4.6-1-6.5Z',
    trophy:'M7 4h10v4a5 5 0 0 1-10 0Z M7 5H4v2a3 3 0 0 0 3 3 M17 5h3v2a3 3 0 0 1-3 3 M12 13v4 M9 20h6 M10 17h4',
    star:'m12 4 2.3 4.9 5.2.7-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2L4.5 9.6l5.2-.7Z',
    gem:'M8 4h8l4 5-8 11L4 9Z M4 9h16 M12 20 9 9l3-5 3 5Z',
    rocket:'M12 3c3 2 5 5.5 5 9l-2.5 2.5h-5L7 12c0-3.5 2-7 5-9Z M9.5 14.5 8 19l2.5-1.5h3L16 19l-1.5-4.5 M12 9.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z',
    leaf:'M19 5C10 5 5 10 5 19c9 0 14-5 14-14Z M5 19C9 15 13 11 17 7',
    wave:'M3 9c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 3-2 M3 15c2.5 0 2.5 2 5 2s2.5-2 5-2 2.5 2 5 2 2.5-2 3-2',
    moon:'M19 14.5A7.5 7.5 0 0 1 9.5 5 7.5 7.5 0 1 0 19 14.5Z',
    sun:'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M18.4 5.6 17 7 M7 17l-1.4 1.4',
    bolt:'M13 3 6 13h5l-1 8 7-10h-5Z',
    heart:'M12 20s-7-4.5-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.5 12 20 12 20Z',
    target:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z',
    clock:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M12 8v4.5l3 1.8',
    cal:'M5 6h14v13H5Z M5 10h14 M9 4v4 M15 4v4',
    note:'M7 3h7l4 4v14H7Z M14 3v4h4 M10 12h5 M10 16h5',
    check:'m5 12.5 4.5 4.5L19 7.5',
    chat:'M4 5h16v11H9l-5 4Z',
    wallet:'M4 7h13a3 3 0 0 1 3 3v7H7a3 3 0 0 1-3-3Z M4 7V6a2 2 0 0 1 2-2h9 M16 13h2',
    spark:'M12 4v5 M12 15v5 M4 12h5 M15 12h5 M7 7l2.5 2.5 M14.5 14.5 17 17 M17 7l-2.5 2.5 M9.5 14.5 7 17',
    lock:'M7 11V8a5 5 0 0 1 10 0v3 M6 11h12v9H6Z M12 15v2',
    mic:'M12 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z M6 11a6 6 0 0 0 12 0 M12 17v3',
    crown:'m4 17 1.5-9L10 12l2-6 2 6 4.5-4L20 17Z',
    ghost:'M6 20V10a6 6 0 0 1 12 0v10l-2-2-2 2-2-2-2 2-2-2Z M10 10h.01 M14 10h.01',
    cat:'M5 10 4 4l4 3h8l4-3-1 6a7 6 0 0 1-14 0Z M9.5 10h.01 M14.5 10h.01 M12 13l-1 .8h2Z',
    bloom:'M12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0 M12 4a3 3 0 0 1 0 6 M12 14a3 3 0 0 1 0 6 M4 12a3 3 0 0 1 6 0 M14 12a3 3 0 0 1 6 0',
    prism:'M12 4 20 19H4Z M12 4v15 M8 12h8',
    tide:'M4 8c2 0 2 1.6 4 1.6S10 8 12 8s2 1.6 4 1.6S18 8 20 8 M4 13c2 0 2 1.6 4 1.6s2-1.6 4-1.6 2 1.6 4 1.6 2-1.6 4-1.6 M4 18c2 0 2 1.6 4 1.6s2-1.6 4-1.6 2 1.6 4 1.6 2-1.6 4-1.6',
    flare:'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.8 2.8 M15.2 15.2 18 18 M18 6l-2.8 2.8 M8.8 15.2 6 18 M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
    orbit:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z M4.5 15.5C3 13 5.5 8.5 10 6s9-2.5 10 0-1.5 7-6 9.5-8 2.5-9.5 0Z',
    mood1:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M9 10h.01 M15 10h.01 M9 15.5c1-.9 2-1.3 3-1.3s2 .4 3 1.3',
    mood2:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M9 10h.01 M15 10h.01 M9 15.2c1-.5 2-.7 3-.7s2 .2 3 .7',
    mood3:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M9 10h.01 M15 10h.01 M9.5 14.5h5',
    mood4:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M9 10h.01 M15 10h.01 M9 14c1 .8 2 1.2 3 1.2s2-.4 3-1.2',
    mood5:'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M9 9.5h.01 M15 9.5h.01 M8.5 13.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2',
    inbox:'M4 13h4l1.5 2.5h5L16 13h4 M4 13V6h16v7 M4 13v6h16v-6',
    graph:'M6 18V9 M12 18V5 M18 18v-6',
    shield:'M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z',
    puzzle:'M10 4h4v3a2 2 0 1 0 4 0h2v5h-3a2 2 0 1 0 0 4v4h-5v-3a2 2 0 1 1-4 0H4v-5h3a2 2 0 1 0 0-4V4Z',
    zen:'M12 5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z M5 20c1-4 3.5-6 7-6s6 2 7 6 M9 12.5 6 14 M15 12.5 18 14',
    sound:'M5 10v4h3l4 4V6l-4 4Z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
    matrix:'M4 4h7v7H4Z M13 4h7v4h-7Z M13 10h7v10h-7Z M4 13h7v7H4Z',
    freeze:'M12 3v18 M12 3l-2 2 M12 3l2 2 M12 21l-2-2 M12 21l2-2 M4 7.5l16 9 M4 7.5 4.7 10 M4 7.5l2.7-.7 M20 16.5l-.7-2.5 M20 16.5l-2.7.7 M20 7.5l-16 9 M20 7.5 19.3 10 M20 7.5l-2.7-.7 M4 16.5l.7-2.5 M4 16.5l2.7.7',
    share:'M8 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M17 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M17 22a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M10.2 10.8 14.8 8 M10.2 13.2l4.6 2.8',
    scratch:'M6 3h9l4 4v14H6Z M9 9h7 M9 13h7 M9 17h4 M15 3v4h4',
    home:'m4 11 8-7 8 7 M6 10v10h12V10 M10 20v-6h4v6'
  };

  /** Render a custom SVG glyph. `key` may be a glyph name; anything else is
   *  returned untouched so user-authored emoji content still works. */
  function glyph(key, size, sw) {
    const d = GLYPHS[key];
    if (!d) return null;
    size = size || 18; sw = sw || 1.7;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      d.split(' M').map((seg, i) => '<path d="' + (i ? 'M' + seg : seg) + '"/>').join('') + '</svg>';
  }
  function glyphEl(key, size, sw) {
    const htmlStr = glyph(key, size, sw);
    if (!htmlStr) return null;
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-flex';
    wrap.innerHTML = htmlStr;
    return wrap.firstChild;
  }
  /** glyph if known, else the raw character (user content) */
  function glyphOrText(key, size) {
    const g = glyph(key, size);
    return g !== null ? g : '<span style="font-size:' + Math.round((size || 18) * 0.95) + 'px;line-height:1">' + esc(key || '') + '</span>';
  }
  function isGlyph(key) { return !!GLYPHS[key]; }

  /** Deterministic geometric SVG avatar (no emoji, no images) */
  function avatarSVG(seed, size) {
    size = size || 40;
    const hsh = Math.abs(hashCode(String(seed || 'you')));
    const hue = hsh % 360, hue2 = (hue + 40 + (hsh >> 3) % 80) % 360;
    const pat = hsh % 5;
    const c1 = 'hsl(' + hue + ' 62% 58%)', c2 = 'hsl(' + hue2 + ' 70% 46%)';
    const id = 'av' + (hsh % 99999);
    let shapes = '';
    if (pat === 0) shapes = '<circle cx="17" cy="17" r="10" fill="' + c2 + '" opacity=".85"/><circle cx="30" cy="26" r="7" fill="#fff" opacity=".28"/>';
    if (pat === 1) shapes = '<path d="M6 34 20 8l14 26Z" fill="' + c2 + '" opacity=".9"/><circle cx="20" cy="24" r="4.5" fill="#fff" opacity=".35"/>';
    if (pat === 2) shapes = '<rect x="8" y="8" width="24" height="24" rx="8" fill="' + c2 + '" transform="rotate(' + (hsh % 40) + ' 20 20)" opacity=".9"/>';
    if (pat === 3) shapes = '<path d="M6 26c5-10 9-10 14 0s9 10 14 0" stroke="' + c2 + '" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="13" cy="13" r="4" fill="#fff" opacity=".35"/>';
    if (pat === 4) shapes = '<path d="M20 6l4.5 9.5L34 20l-9.5 4.5L20 34l-4.5-9.5L6 20l9.5-4.5Z" fill="' + c2 + '" opacity=".92"/>';
    return '<svg viewBox="0 0 40 40" width="' + size + '" height="' + size + '" role="img" aria-label="avatar">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="40" height="40" rx="12" fill="url(#' + id + ')"/>' + shapes + '</svg>';
  }

  /* --------------------------- export --------------------------- */
  /* --------------------------- export --------------------------- */
  Object.assign(NX, {
    h, frag, clear, $, $$, ico, icon, iconHTML, iconPath, ICONS,
    esc, unesc, nl2br, pad, clamp, sum, round,
    fmtNum, compactNum, fmtBytes,
    MONTHS, MONTHS_S, DAYS, DAYS_S,
    toDate, ymd, ymdhm, todayStr, startOfDay, endOfDay, startOfWeek, startOfMonth,
    addDays, addMonths, addMinutes, diffDays, isSameDay, isToday, isTomorrow, isYesterday,
    isPast, isWeekend, fmtDate, fmtTime, fmtDateTime, relTime, dueLabel, fmtDuration, fmtClock,
    uid, uuid, slug, debounce, throttle, deepClone, download, copyText, hashCode,
    colorFromString, initials, groupBy, sortBy, unique, shuffle, move, randomOf, sleep, qs, localStore,
    GLYPHS, glyph, glyphEl, glyphOrText, isGlyph, avatarSVG
  });
})(window.NX);
