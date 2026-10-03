#!/usr/bin/env node
/**
 * PebbleX — Timeless icon engine tests
 *
 * The favicon/icon code fails SILENTLY: a broken tile just shows a
 * letter, so nothing throws and no test notices. These pin the three
 * bugs that were live:
 *
 *   1. /favicon.ico tried first — many hosts answer with a 200 and an
 *      HTML error page, and <img> "loads" HTML, so the fallback chain
 *      never advanced.
 *   2. The old onerror handler did p.textContent = letter, destroying
 *      the wrapper and its styling.
 *   3. A dead resolved URL was cached for the whole session.
 *
 * Plus: .ar-ic must have base dimensions. It used to be sized only
 * under .app-row, so a site tile elsewhere collapsed to an unstyled
 * inline image.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, d) => {
  if (c) { pass++; console.log('  \x1b[32mok\x1b[0m   ' + n); }
  else { fail++; console.log('  \x1b[31mFAIL\x1b[0m ' + n + (d ? '  (' + d + ')' : '')); }
};

const tl = fs.readFileSync(path.join(ROOT, 'renderer', 'js', '25-timeless.js'), 'utf8');

console.log('\n\x1b[1mTimeless icon engine\x1b[0m');

/* ---- host normalisation ---- */
console.log('\n\x1b[1mHost normalisation\x1b[0m');
ok('cleanHost exists', /function cleanHost\(/.test(tl));
ok('it strips a protocol', /replace\(\/\^https\?:\\\/\\\/\/i/.test(tl));
ok('it strips www.', /replace\(\/\^www\\\.\/i/.test(tl));
/* Execute the real cleanHost rather than regexing its source — the
   escaping of /\d/ in a string pattern is not worth the fragility. */
const cleanHostSrc = tl.slice(tl.indexOf('function cleanHost('), tl.indexOf('function faviconSources('));
let cleanHost = null;
try { cleanHost = new Function(cleanHostSrc + '; return cleanHost;')(); } catch (e) { /* reported below */ }
ok('cleanHost can be evaluated', typeof cleanHost === 'function');
if (typeof cleanHost === 'function') {
  ok('strips a protocol', cleanHost('https://github.com/x') === 'github.com');
  ok('strips www.', cleanHost('www.github.com') === 'github.com');
  ok('strips a path', cleanHost('github.com/a/b?c=1#d') === 'github.com');
  ok('strips a port', cleanHost('example.com:8080') === 'example.com', cleanHost('example.com:8080'));
  ok('lowercases', cleanHost('GitHub.COM') === 'github.com');
  ok('handles a bare host', cleanHost('github.com') === 'github.com');
}
ok('it lowercases', /toLowerCase\(\)/.test(tl));

/* ---- source ordering (bug 1) ---- */
console.log('\n\x1b[1mFavicon source order\x1b[0m');
const srcBlock = tl.slice(tl.indexOf('function faviconSources('), tl.indexOf('function faviconHTML(') || tl.length + 4000);
const ddg = srcBlock.indexOf('icons.duckduckgo.com');
const own = srcBlock.lastIndexOf("/favicon.ico");
ok('a resolver service is used', ddg !== -1);
ok("the site's own /favicon.ico is NOT tried first", own !== -1 && ddg < own,
   'own index ' + own + ', resolver index ' + ddg);
ok('more than one source is offered', (srcBlock.match(/'https:\/\//g) || []).length >= 2);
ok('sources are percent-encoded', /encodeURIComponent/.test(srcBlock));

/* ---- the resolver validates rather than trusting onerror (bugs 1+3) ---- */
console.log('\n\x1b[1mResolver validation\x1b[0m');
ok('resolveFavicon exists', /async function resolveFavicon/.test(tl));
ok('each candidate is probed with new Image()', /new Image\(\)/.test(tl));
ok('a zero-size image counts as failure', /naturalWidth > 0 \|\| naturalHeight > 0/.test(tl));
ok('probes are sequential, not all at once', /for\(const src of sources\)/.test(tl));
ok('there is a timeout so a hung host cannot blank the tile', /setTimeout\(\(\) => finish\(false\)/.test(tl));
ok('a verified hit is cached', /_favCache\.set\(key, hit\)/.test(tl));
ok('a miss is cached too, so it is not retried forever', /_favCache\.set\(key, ''\)/.test(tl));
ok('a resolved icon is upgraded in place', /outerHTML = .*ar-ic real.*data-fav/.test(tl));
ok('referrer policy is set on favicon requests', /referrerPolicy = 'no-referrer'/.test(tl));

/* ---- no destructive DOM tricks (bug 2) ---- */
console.log('\n\x1b[1mNo destructive fallback\x1b[0m');
/* the old fallback is described in a comment; strip comments before
   asserting it is gone, or the test matches its own explanation */
const codeOnly = tl
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
ok('the old p.textContent fallback is gone from the code', !/p\.textContent\s*=/.test(codeOnly));
ok('no inline onerror chain remains', !/this\.onerror=function\(\)\{this\.src/.test(codeOnly));
ok('letter tiles use their own class', /tl-letter/.test(tl));

/* ---- tile sizing ---- */
console.log('\n\x1b[1mTile geometry\x1b[0m');
const mod = fs.readFileSync(path.join(ROOT, 'renderer', 'css', '04-modules.css'), 'utf8');
const baseIc = mod.match(/^\s{2}\.ar-ic\{([^}]*)\}/m);
ok('.ar-ic has base sizing outside .app-row', !!baseIc,
   'a tile with no width/height collapses to an unstyled inline image');
if (baseIc) {
  ok('the base tile has a width', /width:34px/.test(baseIc[1]));
  ok('the base tile has a height', /height:34px/.test(baseIc[1]));
  ok('the base tile cannot shrink', /flex:none/.test(baseIc[1]));
}
ok('a real logo sits on white', /\.ar-ic\.real\{[^}]*background-color:#fff/.test(mod));
ok('favicons are capped so they are not blown up', /max-width:22px/.test(mod));
ok('letter tiles use ink colour, not white', /\.ar-ic\.tl-letter\{[^}]*color:var\(--ink-2\)/.test(mod));

/* ---- no nested tiles ---- */
console.log('\n\x1b[1mNo nested tiles\x1b[0m');
ok('faviconHTML is not double-wrapped in iconHTML',
   !/return `<span class="ar-ic"[^`]*>\$\{faviconHTML/.test(tl));
ok('the live card renders faviconHTML unwrapped',
   /\$\{faviconHTML\(tracker\.live\.iconKey\)\}<\/span>`/.test(tl));

console.log('\n' + '─'.repeat(52));
if (fail) { console.log('\x1b[31m' + fail + ' failed\x1b[0m, ' + pass + ' passed'); process.exitCode = 1; }
else console.log('\x1b[32mAll ' + pass + ' icon tests passed\x1b[0m');