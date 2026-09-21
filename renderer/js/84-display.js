/* ============================================================
   Pebble — 84-display.js : retro-future display engine
   • 7-segment SVG numerals (Nothing / fitness-watch look)
   • 5×7 dot-matrix SVG text (Nothing OS look)
   • dot-matrix grids, analog clock, pill toggles
   • DiceBear avatar integration with offline fallback
   • theme registry (nothing / bubblegum / wexa + classics)
   ============================================================ */
(function (NX) {
  'use strict';

  /* ================= 7-SEGMENT ================= */
  // segments: a b c d e f g  (bit 6..0)
  const SEG = {
    '0': 126, '1': 48, '2': 109, '3': 123, '4': 55, '5': 91, '6': 95, '7': 112, '8': 127, '9': 125,
    ' ': 0, '-': 64, '_': 8,
    'A': 119, 'b': 31, 'C': 78, 'c': 13, 'd': 61, 'E': 75, 'F': 71, 'G': 95, 'H': 55, 'h': 24,
    'i': 16, 'J': 60, 'L': 14, 'n': 21, 'O': 126, 'o': 29, 'P': 103, 'r': 5, 'S': 91, 't': 15,
    'U': 62, 'u': 29, 'Y': 51, 'M': 118, 'm': 85, 'K': 119, 'W': 62, 'N': 118, 'g': 91,
    'l': 14, 's': 91, 'z': 109, 'D': 61, 'T': 71, 'I': 48, 'V': 62, 'x': 91, 'v': 29,
    'e': 79, 'a': 87, 'f': 71, 'j': 12, 'k': 119, 'p': 103, 'q': 127, 'w': 29, 'y': 51,
    ':': 0, '.': 0, ',': 0, '°': 0, '/': 0, '+': 0, '%': 0
  };

  function segPaths(w, h, t) {
    // returns the 7 segment polygons for a digit cell of width w height h, stroke t
    const hw = w, hh = h, m = t * 0.7;
    const px = (x, y) => `${x.toFixed(2)},${y.toFixed(2)}`;
    const segs = {
      a: [px(m, 0), px(hw - m, 0), px(hw - m * 2, t / 2), px(hw - m, t), px(m, t), px(m * 2, t / 2)],
      b: [px(hw, m), px(hw, hh / 2 - m), px(hw - t / 2, hh / 2 - m * 2), px(hw - t, hh / 2 - m), px(hw - t, m * 2), px(hw - t / 2, m)],
      c: [px(hw, hh / 2 + m), px(hw, hh - m), px(hw - t / 2, hh - m * 2), px(hw - t, hh - m * 2), px(hw - t, hh / 2 + m * 2), px(hw - t / 2, hh / 2 + m)],
      d: [px(m, hh), px(hw - m, hh), px(hw - m * 2, hh - t / 2), px(hw - m, hh - t), px(m, hh - t), px(m * 2, hh - t / 2)],
      e: [px(0, hh / 2 + m), px(0, hh - m), px(t / 2, hh - m * 2), px(t, hh - m * 2), px(t, hh / 2 + m * 2), px(t / 2, hh / 2 + m)],
      f: [px(0, m), px(0, hh / 2 - m), px(t / 2, hh / 2 - m * 2), px(t, hh / 2 - m), px(t, m * 2), px(t / 2, m)],
      g: [px(m * 1.4, hh / 2 - t / 2), px(hw - m * 1.4, hh / 2 - t / 2), px(hw - m * 2.2, hh / 2), px(hw - m * 1.4, hh / 2 + t / 2), px(m * 1.4, hh / 2 + t / 2), px(m * 2.2, hh / 2)]
    };
    return segs;
  }

  /**
   * Render text as 7-segment SVG.
   * NX.seg("10,00 KM", 34) -> svg string
   */
  function seg(text, size, opts) {
    opts = opts || {};
    const color = opts.color || 'currentColor';
    const dim = opts.dim || 'rgba(127,127,127,.16)';
    size = size || 34;
    const H = size, W = size * 0.62, T = Math.max(2, size * 0.13), GAP = size * 0.22;
    const chars = String(text).split('');
    let x = 0;
    let out = '';
    const polys = segPaths(W, H, T);
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    chars.forEach(ch => {
      if (ch === ':') {
        out += `<circle cx="${x + T}" cy="${H * 0.32}" r="${T * 0.62}" fill="${color}"/><circle cx="${x + T}" cy="${H * 0.68}" r="${T * 0.62}" fill="${color}"/>`;
        x += GAP + T * 2;
        return;
      }
      if (ch === '.') {
        out += `<circle cx="${x + T}" cy="${H - T * 0.6}" r="${T * 0.62}" fill="${color}"/>`;
        x += T * 2.4;
        return;
      }
      if (ch === ',') { x += T * 2; return; }
      if (ch === '°') {
        out += `<circle cx="${x + W / 2}" cy="${T * 1.4}" r="${T * 0.9}" fill="none" stroke="${color}" stroke-width="${T * 0.5}"/>`;
        x += W + GAP * 0.6;
        return;
      }
      const bits = SEG[ch] !== undefined ? SEG[ch] : SEG[(ch || '').toUpperCase()] || 0;
      const isSpace = ch === ' ';
      order.forEach((sname, i) => {
        const on = !isSpace && (bits & (1 << (6 - i)));
        out += `<polygon points="${polys[sname].join(' ')}" fill="${on ? color : dim}" transform="translate(${x.toFixed(2)},0)"/>`;
      });
      x += W + GAP;
    });
    const total = Math.max(1, x - GAP + T);
    return `<svg class="seg" viewBox="0 0 ${total.toFixed(2)} ${H}" width="${(total * (opts.scale || 1)).toFixed(0)}" height="${(H * (opts.scale || 1)).toFixed(0)}" style="display:block;${opts.style || ''}" aria-label="${NX.esc(text)}">${out}</svg>`;
  }

  /* ================= 5×7 DOT MATRIX ================= */
  const D = {
    ' ': [0,0,0,0,0,0,0],
    '0': [14,17,19,21,25,17,14], '1': [4,12,4,4,4,4,14], '2': [14,17,1,2,4,8,31], '3': [31,2,4,2,1,17,14],
    '4': [2,6,10,18,31,2,2], '5': [31,16,30,1,1,17,14], '6': [6,8,16,30,17,17,14], '7': [31,1,2,4,8,8,8],
    '8': [14,17,17,14,17,17,14], '9': [14,17,17,15,1,2,12],
    'A': [14,17,17,31,17,17,17], 'B': [30,17,17,30,17,17,30], 'C': [14,17,16,16,16,17,14],
    'D': [30,17,17,17,17,17,30], 'E': [31,16,16,30,16,16,31], 'F': [31,16,16,30,16,16,16],
    'G': [14,17,16,23,17,17,14], 'H': [17,17,17,31,17,17,17], 'I': [14,4,4,4,4,4,14],
    'J': [7,2,2,2,2,18,12], 'K': [17,18,20,24,20,18,17], 'L': [16,16,16,16,16,16,31],
    'M': [17,27,21,21,17,17,17], 'N': [17,25,21,19,17,17,17], 'O': [14,17,17,17,17,17,14],
    'P': [30,17,17,30,16,16,16], 'Q': [14,17,17,17,21,18,13], 'R': [30,17,17,30,20,18,17],
    'S': [15,16,16,14,1,1,30], 'T': [31,4,4,4,4,4,4], 'U': [17,17,17,17,17,17,14],
    'V': [17,17,17,17,17,10,4], 'W': [17,17,17,21,21,27,17], 'X': [17,17,10,4,10,17,17],
    'Y': [17,17,10,4,4,4,4], 'Z': [31,1,2,4,8,16,31],
    ':': [0,4,4,0,4,4,0], '-': [0,0,0,31,0,0,0], '.': [0,0,0,0,0,12,12],
    '/': [1,1,2,4,8,16,16], '+': [0,4,4,31,4,4,0], '%': [25,26,2,4,8,11,19],
    '!': [4,4,4,4,4,0,4], '?': [14,17,1,2,4,0,4], '°': [12,18,12,0,0,0,0],
    '*': [0,10,4,31,4,10,0], '=': [0,0,31,0,31,0,0], '>': [16,8,4,2,4,8,16], '<': [1,2,4,8,4,2,1],
    '(': [2,4,8,8,8,4,2], ')': [8,4,2,2,2,4,8]
  };

  /** dot-matrix text as SVG (Nothing OS style) */
  function dotText(text, px, opts) {
    opts = opts || {};
    const color = opts.color || 'currentColor';
    px = px || 3;                     // dot diameter
    const gap = opts.gap !== undefined ? opts.gap : px * 0.65;
    const step = px + gap;
    const chars = String(text).toUpperCase().split('');
    let x = 0; let out = '';
    const H = 7 * step;
    chars.forEach(ch => {
      const col = D[ch] !== undefined ? D[ch] : D['?'];
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 5; c++) {
          if (col[r] & (16 >> c)) {
            out += `<circle cx="${(x + c * step + px / 2).toFixed(2)}" cy="${(r * step + px / 2).toFixed(2)}" r="${(px / 2).toFixed(2)}" fill="${color}"/>`;
          }
        }
      }
      x += 5 * step + step;           // char spacing
    });
    const total = Math.max(1, x - step + px);
    return `<svg class="dottext" viewBox="0 0 ${total.toFixed(2)} ${H.toFixed(2)}" style="height:${opts.height || (H * (opts.scale || 1))}px;display:block;${opts.style || ''}" aria-label="${NX.esc(text)}">${out}</svg>`;
  }

  /** dot-matrix activity grid (like the pink Progress widget) */
  function dotGrid(rows, cols, fillFn, opts) {
    opts = opts || {};
    const px = opts.px || 13, gap = opts.gap || 5;
    const step = px + gap;
    let out = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const on = fillFn(r, c);
        out += `<circle cx="${c * step + px / 2}" cy="${r * step + px / 2}" r="${px / 2}" fill="${on === true ? (opts.on || 'currentColor') : on ? on : (opts.off || 'rgba(127,127,127,.18)')}"/>`;
      }
    }
    const W = cols * step - gap, H = rows * step - gap;
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img">${out}</svg>`;
  }

  /** Nothing-style analog clock */
  function analogClock(size, opts) {
    opts = opts || {};
    const now = opts.date || new Date();
    const s = now.getSeconds(), m = now.getMinutes() + s / 60, hh = (now.getHours() % 12) + m / 60;
    const R = 50, C = 55;
    let ticks = '';
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2;
      const big = i % 5 === 0;
      const r1 = big ? 42 : 45, r2 = 47;
      ticks += `<line x1="${C + Math.sin(a) * r1}" y1="${C - Math.cos(a) * r1}" x2="${C + Math.sin(a) * r2}" y2="${C - Math.cos(a) * r2}" stroke="currentColor" stroke-width="${big ? 2 : 1}" opacity="${big ? .9 : .35}"/>`;
    }
    const hand = (v, len, w, col) => {
      const a = v / (v === s ? 60 : v === m ? 60 : 12) * Math.PI * 2;
      return `<line x1="${C}" y1="${C}" x2="${C + Math.sin(a) * len}" y2="${C - Math.cos(a) * len}" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
    };
    return `<svg viewBox="0 0 110 110" width="${size}" height="${size}" style="display:block;color:${opts.color || 'currentColor'}">${ticks}
      ${hand(hh, 24, 4, 'currentColor')}${hand(m, 36, 2.6, 'currentColor')}${hand(s, 40, 1.4, opts.accent || '#e32726')}
      <circle cx="${C}" cy="${C}" r="3.4" fill="${opts.accent || '#e32726'}"/></svg>`;
  }

  /* ================= DiceBear avatars ================= */
  const DICE_STYLES = ['bottts-neutral', 'lorelei', 'shapes', 'thumbs', 'pixel-art', 'fun-emoji', 'identicon', 'micah', 'adventurer-neutral', 'glass', 'initials'];
  function dicebearURL(seed, style, size) {
    style = style || NX.store.getSetting('avatarStyle', 'bottts-neutral');
    size = size || 96;
    return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(String(seed || 'pebble'))}&size=${size}&backgroundColor=transparent`;
  }
  /** <img> with automatic offline fallback to the local geometric avatar */
  function dicebearIMG(seed, size, cls) {
    const fallback = NX.avatarSVG(seed, size || 40);
    const url = dicebearURL(seed, null, Math.max(64, (size || 40) * 2));
    return `<img class="dbav ${cls || ''}" src="${url}" width="${size || 40}" height="${size || 40}" alt="" loading="lazy"
      style="border-radius:${(size || 40) * 0.3}px;background:transparent"
      onerror="this.outerHTML=decodeURIComponent('${encodeURIComponent(fallback).replace(/'/g, '%27')}')">`;
  }

  /* ================= theme registry ================= */
  const THEMES = [
    { id: 'nothing', name: 'Nothing OS', desc: 'paper grey · mono widgets · signal red', bg: '#e6e7e9', fg: '#111', accent: '#e32726',
      vars: { '--bg': '#e6e7e9', '--bg-elev': '#f4f4f5', '--bg-sunken': '#dcdde0', '--bg-hover': '#ececee', '--bg-active': '#d3d4d8', '--bg-rail': '#ececee', '--bg-sidebar': '#f0f1f2', '--bg-card': '#ffffff', '--bg-input': '#ffffff', '--bg-code': '#eef0f1', '--tx': '#101112', '--tx-2': '#3c3e42', '--tx-3': '#6b6e74', '--tx-4': '#979aa1', '--bd': '#d4d6da', '--bd-2': '#c2c5ca', '--bd-strong': '#a9adb4', '--brand-1': '#e32726', '--brand-2': '#111111' } },
    { id: 'bubblegum', name: 'Bubblegum Wall', desc: 'charcoal tiles · pink + lime · seg digits', bg: '#2a2a30', fg: '#fff', accent: '#f8c1d9',
      vars: { '--bg': '#2a2a30', '--bg-elev': '#17171b', '--bg-sunken': '#101014', '--bg-hover': '#232329', '--bg-active': '#2e2e36', '--bg-rail': '#101014', '--bg-sidebar': '#141418', '--bg-card': '#17171b', '--bg-input': '#1d1d22', '--bg-code': '#101014', '--tx': '#f4eef1', '--tx-2': '#d3c8ce', '--tx-3': '#9d949b', '--tx-4': '#6f6870', '--bd': '#26262c', '--bd-2': '#33333a', '--bd-strong': '#44444c', '--brand-1': '#f8c1d9', '--brand-2': '#d4f04a' } },
    { id: 'wexa', name: 'Wexa Neon', desc: 'near-black · neon lime / orange / lavender', bg: '#0d0b10', fg: '#fff', accent: '#c8f031',
      vars: { '--bg': '#0d0b10', '--bg-elev': '#15121a', '--bg-sunken': '#0a080d', '--bg-hover': '#1d1826', '--bg-active': '#272032', '--bg-rail': '#0a080d', '--bg-sidebar': '#120f17', '--bg-card': '#15121a', '--bg-input': '#1a1622', '--bg-code': '#0d0a10', '--tx': '#f2eef7', '--tx-2': '#cfc7da', '--tx-3': '#9a91a8', '--tx-4': '#6b6377', '--bd': '#221c2c', '--bd-2': '#2f2739', '--bd-strong': '#3f354c', '--brand-1': '#c8f031', '--brand-2': '#c9a1f2' } },
    { id: 'dark', name: 'Dark', desc: 'the classic', bg: '#191919', fg: '#eee', accent: '#7c6cff', vars: null },
    { id: 'light', name: 'Light', desc: 'clean & bright', bg: '#ffffff', fg: '#222', accent: '#7c6cff', vars: null },
    { id: 'sepia', name: 'Sepia', desc: 'warm paper', bg: '#f6f1e7', fg: '#333', accent: '#b9822e', vars: null },
    { id: 'midnight', name: 'Midnight', desc: 'deep blue-black', bg: '#0d1117', fg: '#ddd', accent: '#58a6ff', vars: null }
  ];
  function applyThemeVars(id) {
    const t = THEMES.find(x => x.id === id);
    // clear previous custom vars
    THEMES.forEach(th => Object.keys(th.vars || {}).forEach(k => document.documentElement.style.removeProperty(k)));
    // shop custom themes
    const shop = (NX.game && NX.game.SHOP || []).filter(s => s.kind === 'theme' && s.data);
    const custom = shop.find(s => s.id === 'theme_custom_' + id || s.id === id);
    if (custom) { Object.entries(custom.data).forEach(([k, v]) => document.documentElement.style.setProperty(k, v)); return; }
    if (t && t.vars) Object.entries(t.vars).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  }

  NX.seg = seg;
  NX.dotText = dotText;
  NX.dotGrid = dotGrid;
  NX.analogClock = analogClock;
  NX.dicebearURL = dicebearURL;
  NX.dicebearIMG = dicebearIMG;
  NX.DICE_STYLES = DICE_STYLES;
  NX.THEMES = THEMES;
  NX.applyThemeVars = applyThemeVars;

  // hook: theme setting changes also apply token overrides
  const origSet = NX.store.setSetting;
  NX.store.setSetting = function (k, v) {
    origSet.call(NX.store, k, v);
    if (k === 'theme') applyThemeVars(v);
  };
})(window.NX);
