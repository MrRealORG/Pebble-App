/* ============================================================
   Animated weather icons.

   The dashboard used a raw emoji glyph for the current conditions, which
   rendered as a flat, inconsistently-sized character that clashed with the
   rest of the UI (and looked wrong next to the real icons). These are drawn
   as inline SVG and animated with CSS: the sun's rays rotate, clouds drift,
   rain and snow fall, lightning flashes, fog slides. They inherit the theme
   colours and honour prefers-reduced-motion / the app's reduce-motion setting.
   ============================================================ */
(function(NX){
'use strict';

const svg = inner => `<svg class="wx-svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${inner}</svg>`;

const CLOUD = '<path class="wx-cloud" d="M20 44h24a10 10 0 0 0 .6-20A14 14 0 0 0 18 26.6 9 9 0 0 0 20 44Z"/>';
const CLOUD_SM = '<path class="wx-cloud wx-cloud-sm" d="M26 46h20a8 8 0 0 0 .4-16A11 11 0 0 0 25 31.6 7 7 0 0 0 26 46Z"/>';
const SUN_CORE = '<circle class="wx-sun-core" cx="32" cy="32" r="11"/>';
const RAYS = '<g class="wx-rays">' +
  [0,45,90,135,180,225,270,315].map(a =>
    `<line x1="32" y1="8" x2="32" y2="14" transform="rotate(${a} 32 32)"/>`).join('') + '</g>';

const DROPS = n => Array.from({ length:n }, (_, i) =>
  `<line class="wx-drop" style="--i:${i}" x1="${18 + i*9}" y1="46" x2="${15 + i*9}" y2="56"/>`).join('');

const FLAKES = n => Array.from({ length:n }, (_, i) =>
  `<circle class="wx-flake" style="--i:${i}" cx="${19 + i*9}" cy="48" r="2"/>`).join('');

const ICONS = {
  'clear':        svg(SUN_CORE + RAYS),
  'mostly-clear': svg(RAYS + CLOUD_SM),
  'partly':       svg(SUN_CORE + '<g class="wx-rays-static">' +
                     [30,90,150,210,270,330].map(a =>
                       `<line x1="32" y1="14" x2="32" y2="18" transform="rotate(${a} 32 32)"/>`).join('') +
                     '</g>' + CLOUD_SM),
  'cloudy':       svg('<g class="wx-drift-a">' + CLOUD + '</g><g class="wx-drift-b">' + CLOUD_SM + '</g>'),
  'fog':          svg('<g class="wx-drift-a">' + CLOUD + '</g>' +
                     '<g class="wx-fog-bars">' +
                     '<line class="wx-fog" style="--i:0" x1="12" y1="48" x2="46" y2="48"/>' +
                     '<line class="wx-fog" style="--i:1" x1="16" y1="54" x2="52" y2="54"/>' +
                     '<line class="wx-fog" style="--i:2" x1="12" y1="60" x2="42" y2="60"/>' +
                     '</g>'),
  'drizzle':      svg(CLOUD + '<g class="wx-fall-slow">' + DROPS(3) + '</g>'),
  'rain':         svg(CLOUD + '<g class="wx-fall">' + DROPS(4) + '</g>'),
  'showers':      svg('<g class="wx-drift-a">' + CLOUD + '</g><g class="wx-fall">' + DROPS(4) + '</g>'),
  'snow':         svg(CLOUD + '<g class="wx-fall-slow">' + FLAKES(4) + '</g>'),
  'storm':        svg('<g class="wx-darken">' + CLOUD + '</g>' +
                     '<g class="wx-fall">' + DROPS(3) + '</g>' +
                     '<path class="wx-bolt" d="M33 44l-7 12h5l-2 9 9-13h-5l3-8Z"/>')
};
ICONS.cloudy = ICONS.cloudy || svg(CLOUD);

/* Build the markup once per kind and cache it. */
const _cache = new Map();
NX.wxIcon = function(kind, cls){
  const k = kind || 'cloudy';
  let inner = _cache.get(k);
  if(inner === undefined){
    inner = ICONS[k] || ICONS.cloudy;
    _cache.set(k, inner);
  }
  return `<span class="wx-icon ${cls || ''}" data-wx="${k}">${inner}</span>`;
};

/* The dashboard used to print the emoji straight into the title text. */
NX.wxLabel = function(w){
  return `${w.temp}°C — ${U.esc(w.city)}`;
};
})(window.NX);